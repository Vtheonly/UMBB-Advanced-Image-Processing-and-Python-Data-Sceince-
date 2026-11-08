/**
 * Heatmap of Notes — persistent storage (the "database").
 *
 * Fixes vs. the original:
 * - Folder renames now remap every record beneath the folder (the original
 *   only handled single-file renames, orphaning all data when a folder was
 *   renamed/moved).
 * - Read-only lookups never create records anymore — the original created a
 *   fresh record (with 2 x bucketCount zeros) merely because the pointer
 *   hovered the heatmap strip, polluting data.json.
 * - Settings are normalized on load (bad values repaired instead of
 *   producing a canvas with 0 buckets etc.).
 */

import { logger } from "./logger";
import {
  HeatmapSettings,
  DEFAULT_HEATMAP_SETTINGS,
  NoteRecord,
  HeatmapData,
} from "./types";

export interface StorageHost {
  loadData(): Promise<any>;
  saveData(data: any): Promise<void>;
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
 * Remaps record keys after a rename.
 * Handles both a single file rename ("a/b.md" -> "a/c.md") and a folder
 * rename/move ("a" -> "x/y": every record under "a/" moves to "x/y/").
 * Idempotent: keys that no longer exist are simply skipped.
 */
export function remapRecordPaths(
  records: Record<string, NoteRecord>,
  oldPath: string,
  newPath: string
): number {
  if (!oldPath || !newPath || oldPath === newPath) return 0;

  let moved = 0;

  // Direct file rename.
  if (oldPath in records) {
    records[newPath] = records[oldPath];
    delete records[oldPath];
    moved++;
  }

  // Folder rename: remap everything beneath it.
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

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.round(Math.min(Math.max(value, min), max));
}

export function normalizeHeatmapSettings(raw: Partial<HeatmapSettings> | null | undefined): HeatmapSettings {
  const merged: HeatmapSettings = { ...DEFAULT_HEATMAP_SETTINGS, ...(raw ?? {}) };
  merged.idleSeconds = clampInt(merged.idleSeconds, 5, 600, DEFAULT_HEATMAP_SETTINGS.idleSeconds);
  merged.bucketCount = clampInt(merged.bucketCount, 10, 400, DEFAULT_HEATMAP_SETTINGS.bucketCount);
  merged.heatmapWidth = clampInt(merged.heatmapWidth, 8, 48, DEFAULT_HEATMAP_SETTINGS.heatmapWidth);
  merged.heatmapOffsetRight = clampInt(merged.heatmapOffsetRight, 0, 80, DEFAULT_HEATMAP_SETTINGS.heatmapOffsetRight);
  merged.heatmapOpacity = Math.min(Math.max(Number(merged.heatmapOpacity) || DEFAULT_HEATMAP_SETTINGS.heatmapOpacity, 0.1), 1);
  merged.refreshIntervalMs = clampInt(merged.refreshIntervalMs, 250, 5000, DEFAULT_HEATMAP_SETTINGS.refreshIntervalMs);
  merged.debugMode = Boolean(merged.debugMode);
  return merged;
}

export class HeatmapDatabase {
  private plugin: StorageHost;
  settings: HeatmapSettings = { ...DEFAULT_HEATMAP_SETTINGS };
  records: Record<string, NoteRecord> = {};
  private lastSaveAt = 0;
  private dirty = false;

  /** Minimum interval between throttled saves (ms). */
  static readonly SAVE_THROTTLE_MS = 10_000;

  constructor(plugin: StorageHost) {
    this.plugin = plugin;
  }

  async load(): Promise<void> {
    try {
      const raw = (await this.plugin.loadData()) as Partial<HeatmapData> | null;
      if (raw) {
        this.settings = normalizeHeatmapSettings(raw.settings);
        this.records = raw.records ?? {};
        // Repair records whose bucket arrays are missing or the wrong size.
        for (const path of Object.keys(this.records)) {
          this.records[path] = this.normalizeRecord(this.records[path], this.settings.bucketCount);
        }
        logger.info("Database loaded successfully.");
      } else {
        logger.info("No existing database found. Creating a fresh copy.");
      }
    } catch (err) {
      logger.error("Failed to load database from disk. Using defaults.", err);
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
      await this.plugin.saveData({ settings: this.settings, records: this.records });
      this.lastSaveAt = now;
      this.dirty = false;
    } catch (err) {
      logger.error("Failed to save database to disk.", err);
    }
  }

  /**
   * Read-only lookup — returns undefined when nothing was recorded yet.
   * (Creating records on read was a bug: hover tooltips used to mint empty
   * records for never-opened notes.)
   */
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
        buckets: Array(this.settings.bucketCount).fill(0),
        bucketVisits: Array(this.settings.bucketCount).fill(0),
      };
    } else {
      this.records[path] = this.normalizeRecord(this.records[path], this.settings.bucketCount);
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
      logger.info(`Cleared storage data for: ${path}`);
      return true;
    }
    return false;
  }

  clearAll(): void {
    this.records = {};
    void this.save(true);
  }
}
