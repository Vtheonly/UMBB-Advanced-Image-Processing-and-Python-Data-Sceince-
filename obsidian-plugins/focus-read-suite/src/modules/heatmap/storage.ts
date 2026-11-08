/**
 * Focus Read Suite — heatmap persistent storage (the "database").
 *
 * Kept fixes from the audited rewrite:
 * - folder renames remap every record beneath the folder;
 * - read-only lookups never create records (hovering must not pollute data);
 * - records are normalized (bucket arrays resized/repaired) on load;
 * - saves are throttled (10 s) unless forced.
 *
 * The database itself is settings-less: the HeatmapSettings live in the
 * central SettingsManager and are passed in by the module.
 */

import { logger } from "../../core/logger";
import { NoteRecord } from "./types";
import { HeatmapSettings } from "../../core/settings-schema";

export interface StorageHost {
  loadRecords(): Promise<Record<string, NoteRecord> | undefined>;
  saveRecords(records: Record<string, NoteRecord>): Promise<void>;
}

/** Resamples a bucket array to a new length (linear interpolation). */
export function resizeArray(arr: number[], targetSize: number): number[] {
  if (arr.length === targetSize) return arr;
  const resized = Array(targetSize).fill(0);
  if (arr.length === 0) return resized;

  for (let i = 0; i < targetSize; i++) {
    const srcIndex = (i / targetSize) * arr.length;
    const low = Math.floor(srcIndex);
    const high = Math.min(arr.length - 1, Math.ceil(srcIndex));
    const weight = srcIndex - low;
    resized[i] = Math.round(arr[low] * (1 - weight) + arr[high] * weight);
  }
  return resized;
}

/**
 * Remaps record keys after a rename. Handles a single file rename and a
 * folder rename/move (every record beneath it). Idempotent.
 */
export function remapRecordPaths(
  records: Record<string, NoteRecord>,
  oldPath: string,
  newPath: string
): number {
  if (!oldPath || !newPath || oldPath === newPath) return 0;

  let moved = 0;

  if (oldPath in records) {
    records[newPath] = records[oldPath];
    delete records[oldPath];
    moved++;
  }

  const prefix = `${oldPath}/`;
  for (const key of Object.keys(records)) {
    if (key.startsWith(prefix)) {
      const remapped = `${newPath}/${key.slice(prefix.length)}`;
      if (!(remapped in records)) {
        records[remapped] = records[key];
        moved++;
      }
      delete records[key];
    }
  }

  return moved;
}

/** Removes records whose file no longer exists in the vault. */
export function pruneDeletedRecords(
  records: Record<string, NoteRecord>,
  fileExists: (path: string) => boolean
): string[] {
  const removed: string[] = [];
  for (const key of Object.keys(records)) {
    if (!fileExists(key)) {
      delete records[key];
      removed.push(key);
    }
  }
  return removed;
}

export class HeatmapDatabase {
  private host: StorageHost;
  private getSettings: () => HeatmapSettings;

  records: Record<string, NoteRecord> = {};
  private lastSaveAt = 0;
  private dirty = false;

  /** Minimum interval between throttled saves (ms). */
  static readonly SAVE_THROTTLE_MS = 10_000;

  constructor(host: StorageHost, getSettings: () => HeatmapSettings) {
    this.host = host;
    this.getSettings = getSettings;
  }

  async load(): Promise<void> {
    try {
      const raw = await this.host.loadRecords();
      if (raw) {
        this.records = raw;
        for (const path of Object.keys(this.records)) {
          this.records[path] = this.normalizeRecord(this.records[path], this.getSettings().bucketCount);
        }
        logger.info(`Heatmap database loaded (${Object.keys(this.records).length} notes).`);
      } else {
        logger.info("No heatmap database found — starting fresh.");
      }
    } catch (err) {
      logger.error("Failed to load heatmap database.", err);
    }
  }

  /**
   * Normalizes a record's fields IN PLACE (so callers holding the record
   * reference keep mutating the stored object) and returns it.
   */
  private normalizeRecord(record: NoteRecord, bucketCount: number): NoteRecord {
    if (!Array.isArray(record.buckets) || record.buckets.length !== bucketCount) {
      record.buckets = resizeArray(Array.isArray(record.buckets) ? record.buckets : [], bucketCount);
    }
    if (!Array.isArray(record.bucketVisits) || record.bucketVisits.length !== bucketCount) {
      record.bucketVisits = resizeArray(Array.isArray(record.bucketVisits) ? record.bucketVisits : [], bucketCount);
    }
    record.totalTimeMs = Number(record.totalTimeMs) || 0;
    record.visits = Number(record.visits) || 0;
    return record;
  }

  async save(force = false): Promise<void> {
    const now = Date.now();
    if (!force && !this.dirty) return;
    if (!force && now - this.lastSaveAt < HeatmapDatabase.SAVE_THROTTLE_MS) return;

    try {
      await this.host.saveRecords(this.records);
      this.lastSaveAt = now;
      this.dirty = false;
    } catch (err) {
      logger.error("Failed to save heatmap database.", err);
    }
  }

  /** Read-only lookup — returns undefined when nothing was recorded yet. */
  getRecord(path: string): NoteRecord | undefined {
    return this.records[path];
  }

  /** Gets or creates the record for a path. Write-intent only. */
  getOrCreateRecord(path: string): NoteRecord {
    if (!this.records[path]) {
      this.records[path] = {
        totalTimeMs: 0,
        visits: 0,
        lastAccessed: new Date().toISOString(),
        buckets: Array(this.getSettings().bucketCount).fill(0),
        bucketVisits: Array(this.getSettings().bucketCount).fill(0),
      };
    } else {
      this.records[path] = this.normalizeRecord(this.records[path], this.getSettings().bucketCount);
    }
    return this.records[path];
  }

  /** Resizes all records after a bucket-count change. */
  resizeAllRecords(bucketCount: number): void {
    for (const path of Object.keys(this.records)) {
      this.records[path] = this.normalizeRecord(this.records[path], bucketCount);
    }
  }

  recordReadingTime(
    path: string,
    startBucket: number,
    endBucket: number,
    incrementMs: number,
    newlyVisibleBuckets: number[]
  ): void {
    const rec = this.getOrCreateRecord(path);
    rec.totalTimeMs += incrementMs;
    rec.lastAccessed = new Date().toISOString();

    for (let i = startBucket; i <= endBucket; i++) {
      if (i >= 0 && i < rec.buckets.length) rec.buckets[i] += incrementMs;
    }
    for (const bucketIdx of newlyVisibleBuckets) {
      if (bucketIdx >= 0 && bucketIdx < rec.bucketVisits.length) rec.bucketVisits[bucketIdx] += 1;
    }
    this.dirty = true;
    void this.save();
  }

  incrementVisit(path: string): void {
    const rec = this.getOrCreateRecord(path);
    rec.visits += 1;
    this.dirty = true;
    void this.save();
  }

  /** Handles file AND folder renames (see remapRecordPaths). */
  handleRename(oldPath: string, newPath: string): void {
    const moved = remapRecordPaths(this.records, oldPath, newPath);
    if (moved > 0) {
      this.dirty = true;
      void this.save(true);
      logger.info(`Renamed ${moved} record(s): ${oldPath} -> ${newPath}`);
    }
  }

  /** Drops records for files that no longer exist. Returns removed paths. */
  pruneDeleted(fileExists: (path: string) => boolean): string[] {
    const removed = pruneDeletedRecords(this.records, fileExists);
    if (removed.length > 0) {
      this.dirty = true;
      void this.save(true);
      logger.info(`Pruned ${removed.length} record(s) for deleted files.`);
    }
    return removed;
  }

  clearRecord(path: string): boolean {
    if (this.records[path]) {
      delete this.records[path];
      void this.save(true);
      logger.info(`Cleared heatmap data for: ${path}`);
      return true;
    }
    return false;
  }

  clearAll(): void {
    this.records = {};
    void this.save(true);
  }
}
