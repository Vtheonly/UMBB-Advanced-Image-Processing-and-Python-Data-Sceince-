/**
 * Heatmap of Notes — shared types.
 */

export interface HeatmapSettings {
  idleSeconds: number;
  bucketCount: number;
  heatmapWidth: number;
  heatmapOffsetRight: number;
  heatmapOpacity: number;
  refreshIntervalMs: number;
  debugMode: boolean;
}

export const DEFAULT_HEATMAP_SETTINGS: HeatmapSettings = {
  idleSeconds: 30,
  bucketCount: 100,
  heatmapWidth: 16,
  heatmapOffsetRight: 12,
  heatmapOpacity: 0.85,
  refreshIntervalMs: 1000,
  debugMode: false,
};

/** Reading data recorded for one note. */
export interface NoteRecord {
  totalTimeMs: number;
  visits: number;
  lastAccessed: string;
  /** ms of "viewport time" per vertical bucket. */
  buckets: number[];
  /** how many times each bucket entered the viewport. */
  bucketVisits: number[];
}

export interface HeatmapData {
  settings: HeatmapSettings;
  records: Record<string, NoteRecord>;
}
