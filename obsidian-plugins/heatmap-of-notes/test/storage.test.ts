import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  HeatmapDatabase,
  resizeArray,
  remapRecordPaths,
  pruneDeletedRecords,
  normalizeHeatmapSettings,
} from "../src/storage";
import { NoteRecord } from "../src/types";

function makeRecord(overrides: Partial<NoteRecord> = {}): NoteRecord {
  return {
    totalTimeMs: 1000,
    visits: 2,
    lastAccessed: "2026-01-01T00:00:00.000Z",
    buckets: [10, 20, 30, 40],
    bucketVisits: [1, 1, 1, 1],
    ...overrides,
  };
}

function makeDb(records: Record<string, NoteRecord> = {}, settings: any = {}) {
  const plugin = {
    loadData: vi.fn(async () => ({ settings, records })),
    saveData: vi.fn(async () => {}),
  };
  const db = new HeatmapDatabase(plugin);
  return { db, plugin };
}

beforeEach(() => {
  vi.useFakeTimers?.();
});

describe("resizeArray", () => {
  it("resamples to a larger size with interpolation (original algorithm)", () => {
    expect(resizeArray([0, 100], 4)).toEqual([0, 50, 100, 100]);
  });

  it("resamples to a smaller size", () => {
    expect(resizeArray([0, 10, 20, 30], 2)).toEqual([0, 20]);
  });

  it("returns zeros for empty input", () => {
    expect(resizeArray([], 5)).toEqual([0, 0, 0, 0, 0]);
  });

  it("returns the same array when sizes match", () => {
    const arr = [1, 2, 3];
    expect(resizeArray(arr, 3)).toBe(arr);
  });
});

describe("remapRecordPaths", () => {
  it("remaps a single renamed file", () => {
    const records: Record<string, NoteRecord> = {
      "a/b.md": makeRecord(),
      "a/c.md": makeRecord(),
    };
    const moved = remapRecordPaths(records, "a/b.md", "a/b-renamed.md");
    expect(moved).toBe(1);
    expect(records["a/b-renamed.md"]).toBeDefined();
    expect(records["a/b.md"]).toBeUndefined();
    expect(records["a/c.md"]).toBeDefined(); // untouched
  });

  it("remaps every record under a renamed folder (the original lost them all)", () => {
    const records: Record<string, NoteRecord> = {
      "course/note1.md": makeRecord(),
      "course/sub/note2.md": makeRecord(),
      "other/note3.md": makeRecord(),
    };
    const moved = remapRecordPaths(records, "course", "renamed-course");
    expect(moved).toBe(2);
    expect(records["renamed-course/note1.md"]).toBeDefined();
    expect(records["renamed-course/sub/note2.md"]).toBeDefined();
    expect(records["course/note1.md"]).toBeUndefined();
    expect(records["course/sub/note2.md"]).toBeUndefined();
    expect(records["other/note3.md"]).toBeDefined();
  });

  it("moves a record equal to the folder name AND records beneath it", () => {
    const records: Record<string, NoteRecord> = {
      course: makeRecord(), // edge case: a record keyed exactly like the folder
      "course/a.md": makeRecord(),
    };
    remapRecordPaths(records, "course", "x");
    expect(records["x"]).toBeDefined();
    expect(records["x/a.md"]).toBeDefined();
  });

  it("is a no-op for unknown paths (idempotence after double events)", () => {
    const records: Record<string, NoteRecord> = { "a/b.md": makeRecord() };
    expect(remapRecordPaths(records, "missing.md", "new.md")).toBe(0);
    expect(remapRecordPaths(records, "a/b.md", "a/b.md")).toBe(0);
  });
});

describe("pruneDeletedRecords", () => {
  it("removes records whose file no longer exists", () => {
    const records: Record<string, NoteRecord> = {
      "exists.md": makeRecord(),
      "deleted.md": makeRecord(),
    };
    const removed = pruneDeletedRecords(records, (p) => p === "exists.md");
    expect(removed).toEqual(["deleted.md"]);
    expect(Object.keys(records)).toEqual(["exists.md"]);
  });
});

describe("normalizeHeatmapSettings", () => {
  it("repairs bad values", () => {
    const s = normalizeHeatmapSettings({ bucketCount: 0, heatmapOpacity: 42, idleSeconds: -5 } as any);
    expect(s.bucketCount).toBeGreaterThanOrEqual(10);
    expect(s.heatmapOpacity).toBeLessThanOrEqual(1);
    expect(s.idleSeconds).toBeGreaterThanOrEqual(5);
  });
});

describe("HeatmapDatabase", () => {
  it("loads persisted settings + records (user's real schema)", async () => {
    const ten = Array.from({ length: 10 }, (_, i) => i + 1);
    const { db } = makeDb(
      { "note.md": makeRecord({ buckets: ten, bucketVisits: ten.map(() => 1) }) },
      { idleSeconds: 10, bucketCount: 10, debugMode: true }
    );
    await db.load();
    expect(db.settings.bucketCount).toBe(10);
    expect(db.settings.idleSeconds).toBe(10);
    expect(db.getRecord("note.md")?.buckets).toEqual(ten);
  });

  it("repairs records whose bucket arrays mismatch the setting on load", async () => {
    const { db } = makeDb(
      { "note.md": makeRecord({ buckets: [10, 20, 30, 40] }) },
      { bucketCount: 20 }
    );
    await db.load();
    expect(db.getRecord("note.md")?.buckets.length).toBe(20);

    // Now change the setting and resize:
    db.settings.bucketCount = 40;
    db.resizeAllRecords(40);
    expect(db.getRecord("note.md")?.buckets.length).toBe(40);
  });

  it("getRecord never creates; getOrCreateRecord creates once", () => {
    const { db } = makeDb();
    expect(db.getRecord("fresh.md")).toBeUndefined();
    expect(Object.keys(db.records)).toHaveLength(0);

    const rec = db.getOrCreateRecord("fresh.md");
    expect(rec.buckets.length).toBe(db.settings.bucketCount);
    expect(db.getOrCreateRecord("fresh.md")).toBe(rec);
  });

  it("recordReadingTime distributes ms across visible buckets and counts visits", () => {
    const { db } = makeDb({}, { bucketCount: 10, refreshIntervalMs: 1000 });
    db.recordReadingTime("n.md", 2, 4, 1000, [2, 3]);
    const rec = db.getRecord("n.md")!;
    expect(rec.totalTimeMs).toBe(1000);
    expect(rec.buckets[2]).toBe(1000);
    expect(rec.buckets[4]).toBe(1000);
    expect(rec.buckets[1]).toBe(0);
    expect(rec.bucketVisits[2]).toBe(1);
    expect(rec.bucketVisits[3]).toBe(1);
    expect(rec.bucketVisits[4]).toBe(0);
  });

  it("incrementVisit counts once per call", () => {
    const { db } = makeDb();
    db.incrementVisit("n.md");
    db.incrementVisit("n.md");
    expect(db.getRecord("n.md")!.visits).toBe(2);
  });

  it("handleRename remaps file and folder paths", async () => {
    const { db } = makeDb({
      "folder/one.md": makeRecord(),
      "folder/two.md": makeRecord(),
      "solo.md": makeRecord(),
    });
    await db.load();
    db.handleRename("folder", "moved");
    expect(db.getRecord("moved/one.md")).toBeDefined();
    expect(db.getRecord("folder/one.md")).toBeUndefined();

    db.handleRename("solo.md", "renamed-solo.md");
    expect(db.getRecord("renamed-solo.md")).toBeDefined();
  });

  it("clearRecord and clearAll remove data", async () => {
    const { db } = makeDb({ "a.md": makeRecord(), "b.md": makeRecord() });
    await db.load();
    expect(db.clearRecord("a.md")).toBe(true);
    expect(db.getRecord("a.md")).toBeUndefined();
    expect(db.clearRecord("missing.md")).toBe(false);
    db.clearAll();
    expect(Object.keys(db.records)).toHaveLength(0);
  });

  it("throttles saves to at most one per 10s unless forced", async () => {
    vi.useFakeTimers();
    try {
      const { db, plugin } = makeDb({}, { bucketCount: 4 });
      await db.load();

      db.recordReadingTime("n.md", 0, 0, 1000, []);
      await vi.advanceTimersByTimeAsync(0);
      expect(plugin.saveData).toHaveBeenCalledTimes(1);

      // A second write within the throttle window is skipped...
      db.recordReadingTime("n.md", 0, 0, 1000, []);
      await vi.advanceTimersByTimeAsync(0);
      expect(plugin.saveData).toHaveBeenCalledTimes(1);

      // ...but forced saves always go through.
      await db.save(true);
      expect(plugin.saveData).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
