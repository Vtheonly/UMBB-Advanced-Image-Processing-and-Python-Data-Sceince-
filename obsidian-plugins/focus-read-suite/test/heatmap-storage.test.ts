/**
 * Heatmap storage: record normalization, resampling, rename remapping,
 * pruning, throttled saves.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  HeatmapDatabase,
  resizeArray,
  remapRecordPaths,
  pruneDeletedRecords,
} from "../src/modules/heatmap/storage";
import { DEFAULT_SETTINGS } from "../src/core/settings-schema";
import "../test/helpers/dom-setup";

function makeDb(records: Record<string, any> = {}, bucketCount = 4) {
  let stored: any = null;
  const saveHost = vi.fn(async (recs: any) => {
    stored = JSON.parse(JSON.stringify(recs));
  });
  const db = new HeatmapDatabase(
    { loadRecords: async () => records, saveRecords: saveHost },
    () => ({ ...DEFAULT_SETTINGS.heatmap, bucketCount })
  );
  return { db, saveHost, get stored() { return stored; } };
}

describe("resizeArray", () => {
  it("returns the same array when the size matches", () => {
    const arr = [1, 2, 3];
    expect(resizeArray(arr, 3)).toBe(arr);
  });

  it("upscales with linear interpolation", () => {
    expect(resizeArray([0, 10], 4)).toEqual([0, 5, 10, 10]);
  });

  it("downscales", () => {
    const out = resizeArray([0, 10, 20, 30], 2);
    expect(out.length).toBe(2);
    expect(out[0]).toBeLessThan(out[1]);
  });

  it("handles empty input", () => {
    expect(resizeArray([], 5)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe("remapRecordPaths", () => {
  const records = () => ({
    "a/lesson.md": { totalTimeMs: 1, visits: 1, lastAccessed: "", buckets: [], bucketVisits: [] },
    "a/deep/nested.md": { totalTimeMs: 2, visits: 1, lastAccessed: "", buckets: [], bucketVisits: [] },
    "b/other.md": { totalTimeMs: 3, visits: 1, lastAccessed: "", buckets: [], bucketVisits: [] },
  });

  it("remaps a single file rename", () => {
    const recs = records();
    expect(remapRecordPaths(recs, "a/lesson.md", "a/lesson-renamed.md")).toBe(1);
    expect(recs["a/lesson-renamed.md"]).toBeDefined();
    expect(recs["a/lesson.md"]).toBeUndefined();
  });

  it("remaps every record under a renamed folder (old bug: orphaned)", () => {
    const recs = records();
    const moved = remapRecordPaths(recs, "a", "x/y");
    expect(moved).toBe(2);
    expect(recs["x/y/lesson.md"]).toBeDefined();
    expect(recs["x/y/deep/nested.md"]).toBeDefined();
    expect(recs["a/deep/nested.md"]).toBeUndefined();
    expect(recs["b/other.md"]).toBeDefined();
  });

  it("is a no-op for identical paths", () => {
    const recs = records();
    expect(remapRecordPaths(recs, "a/lesson.md", "a/lesson.md")).toBe(0);
  });
});

describe("pruneDeletedRecords", () => {
  it("removes records whose file no longer exists", () => {
    const recs: any = {
      "gone.md": { totalTimeMs: 1 },
      "here.md": { totalTimeMs: 2 },
    };
    const removed = pruneDeletedRecords(recs, (p) => p === "here.md");
    expect(removed).toEqual(["gone.md"]);
    expect(Object.keys(recs)).toEqual(["here.md"]);
  });
});

describe("HeatmapDatabase", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("loads and normalizes records to the bucket count", async () => {
    const { db } = makeDb(
      {
        "a.md": { totalTimeMs: 100, visits: 2, lastAccessed: "x", buckets: [1, 2], bucketVisits: [1, 1] },
      },
      4
    );
    await db.load();
    const rec = db.getRecord("a.md")!;
    expect(rec.buckets.length).toBe(4);
    expect(rec.bucketVisits.length).toBe(4);
  });

  it("read-only lookups never create records (old hover bug)", () => {
    const { db } = makeDb();
    expect(db.getRecord("nope.md")).toBeUndefined();
    expect(Object.keys(db.records)).toHaveLength(0);
  });

  it("getOrCreateRecord creates zero-filled records", () => {
    const { db } = makeDb({}, 6);
    const rec = db.getOrCreateRecord("new.md");
    expect(rec.buckets).toEqual([0, 0, 0, 0, 0, 0]);
    expect(db.getRecord("new.md")).toBe(rec);
  });

  it("recordReadingTime accumulates per-bucket time and visits", () => {
    const { db } = makeDb({}, 10);
    db.recordReadingTime("a.md", 0, 2, 1000, [0, 5]);
    const rec = db.getRecord("a.md")!;
    expect(rec.totalTimeMs).toBe(1000);
    expect(rec.buckets[0]).toBe(1000);
    expect(rec.buckets[2]).toBe(1000);
    expect(rec.buckets[3]).toBe(0);
    expect(rec.bucketVisits[0]).toBe(1);
    expect(rec.bucketVisits[5]).toBe(1);
  });

  it("resizeAllRecords resamples everything", async () => {
    const { db } = makeDb({ "a.md": { totalTimeMs: 1, buckets: [10, 10], bucketVisits: [1, 1] } }, 2);
    await db.load();
    db.resizeAllRecords(4);
    expect(db.getRecord("a.md")!.buckets.length).toBe(4);
  });

  it("handleRename remaps and force-saves", async () => {
    const { db, saveHost } = makeDb({ "a.md": { totalTimeMs: 5 } });
    await db.load();
    db.handleRename("a.md", "b.md");
    expect(db.getRecord("b.md")).toBeDefined();
    await vi.advanceTimersByTimeAsync(0);
    expect(saveHost).toHaveBeenCalled();
  });

  it("clearRecord / clearAll", async () => {
    const { db } = makeDb({ "a.md": { totalTimeMs: 5 }, "b.md": { totalTimeMs: 1 } });
    await db.load();
    expect(db.clearRecord("a.md")).toBe(true);
    expect(db.getRecord("a.md")).toBeUndefined();
    expect(db.clearRecord("missing.md")).toBe(false);
    db.clearAll();
    expect(Object.keys(db.records)).toHaveLength(0);
  });

  it("pruneDeleted delegates and force-saves", async () => {
    const { db } = makeDb({ "gone.md": { totalTimeMs: 1 }, "kept.md": { totalTimeMs: 1 } });
    await db.load();
    const removed = db.pruneDeleted((p) => p === "kept.md");
    expect(removed).toEqual(["gone.md"]);
  });
});
