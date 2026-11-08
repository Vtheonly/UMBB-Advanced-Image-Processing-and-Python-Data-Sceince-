/**
 * Focus Read Suite — heatmap data types.
 */

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

export const DEFAULT_NOTE_RECORD = (): NoteRecord => ({
  totalTimeMs: 0,
  visits: 0,
  lastAccessed: new Date().toISOString(),
  buckets: [],
  bucketVisits: [],
});
