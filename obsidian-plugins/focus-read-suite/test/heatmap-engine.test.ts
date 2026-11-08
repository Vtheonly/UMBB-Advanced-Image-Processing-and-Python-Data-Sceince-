/**
 * Heatmap engine math + view lifecycle.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeVisibleBuckets, diffVisibleBuckets, HeatmapEngine } from "../src/modules/heatmap/engine";
import { HeatmapDatabase } from "../src/modules/heatmap/storage";
import { ActivityMonitor } from "../src/modules/heatmap/activity";
import { DEFAULT_SETTINGS } from "../src/core/settings-schema";
import { MarkdownView, TFile } from "./helpers/obsidian-stub";
import { mockRect } from "./helpers/dom";
import "../test/helpers/dom-setup";

describe("computeVisibleBuckets", () => {
  it("returns the whole range when the note fits the viewport", () => {
    expect(computeVisibleBuckets(0, 800, 800, 10)).toEqual({ start: 0, end: 9 });
  });

  it("computes the covered fraction of a scrolled note", () => {
    // 4000px note, 800px viewport scrolled to 1600: covers 40%–60%.
    expect(computeVisibleBuckets(1600, 4000, 800, 10)).toEqual({ start: 4, end: 6 });
  });

  it("clamps to the bucket range", () => {
    expect(computeVisibleBuckets(3960, 4000, 800, 10)).toEqual({ start: 9, end: 9 });
    expect(computeVisibleBuckets(0, 4000, 800, 10)).toEqual({ start: 0, end: 2 });
  });

  it("degrades safely for degenerate inputs", () => {
    expect(computeVisibleBuckets(0, 0, 0, 0)).toEqual({ start: 0, end: -1 });
    expect(computeVisibleBuckets(0, 0, 0, 10)).toEqual({ start: 0, end: -1 });
  });
});

describe("diffVisibleBuckets", () => {
  it("returns only newly visible buckets", () => {
    expect(diffVisibleBuckets(new Set([1, 2, 3]), new Set([2]))).toEqual([1, 3]);
    expect(diffVisibleBuckets(new Set([2]), new Set([1, 2, 3]))).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */

function makeScrollerView(path: string, scroll: { top: number; height: number; client: number }) {
  const view = new MarkdownView();
  const file = new TFile();
  file.path = path;
  file.name = path.split("/").pop()!;
  view.file = file;

  const scroller = view.contentEl.ownerDocument.createElement("div");
  scroller.className = "cm-scroller";
  Object.defineProperty(scroller, "scrollTop", { value: scroll.top, configurable: true, writable: true });
  Object.defineProperty(scroller, "scrollHeight", { value: scroll.height, configurable: true, writable: true });
  Object.defineProperty(scroller, "clientHeight", { value: scroll.client, configurable: true, writable: true });
  Object.defineProperty(scroller, "clientWidth", { value: 600, configurable: true, writable: true });
  view.contentEl.appendChild(scroller);
  mockRect(view.contentEl, { width: 600, height: scroll.client });
  document.body.appendChild(view.contentEl);

  return view;
}

function makeEngine(bucketCount = 10, refreshIntervalMs = 1000) {
  const settings = { ...DEFAULT_SETTINGS.heatmap, bucketCount };
  const advanced = { ...DEFAULT_SETTINGS.advanced, refreshIntervalMs };
  const leaves: any[] = [];
  const host = {
    registerInterval: (id: number) => id,
    iterateMarkdownViews: (cb: (view: MarkdownView) => void) => {
      for (const leaf of leaves) cb(leaf.view);
    },
    registerDomElement: (el: any, type: string, cb: any) => el.addEventListener(type, cb),
  };
  let stored: any = null;
  const db = new HeatmapDatabase(
    { loadRecords: async () => undefined, saveRecords: async (r) => (stored = r) },
    () => settings
  );
  const monitor = new ActivityMonitor((el, type, cb) => el.addEventListener(type, cb), 30);
  const engine = new HeatmapEngine(host, db, monitor, () => ({
    ...settings,
    refreshIntervalMs: advanced.refreshIntervalMs,
  }));
  return { engine, db, leaves, get stored() { return stored; } };
}

beforeEach(() => {
  vi.useFakeTimers();
});

describe("HeatmapEngine", () => {
  it("registers views and counts one visit per session (not per rebuild)", () => {
    const { engine, db, leaves } = makeEngine();
    const view = makeScrollerView("notes/a.md", { top: 0, height: 4000, client: 800 });
    leaves.push({ view });

    engine.syncOpenViews();
    expect(db.getRecord("notes/a.md")!.visits).toBe(1);

    engine.rebuildRenderers(); // e.g. settings change
    expect(db.getRecord("notes/a.md")!.visits).toBe(1); // still 1!
  });

  it("tracks reading time into covered buckets", () => {
    const { engine, db, leaves } = makeEngine(10);
    const view = makeScrollerView("notes/a.md", { top: 1600, height: 4000, client: 800 });
    leaves.push({ view });
    engine.syncOpenViews();

    engine.tick();
    const rec = db.getRecord("notes/a.md")!;
    expect(rec.totalTimeMs).toBe(1000);
    expect(rec.buckets[4]).toBe(1000);
    expect(rec.buckets[6]).toBe(1000);
    expect(rec.buckets[7]).toBe(0);
  });

  it("does not track while the user is idle", () => {
    const { engine, db, leaves } = makeEngine();
    const view = makeScrollerView("notes/a.md", { top: 0, height: 4000, client: 800 });
    leaves.push({ view });
    engine.syncOpenViews();

    // Make the monitor idle: simulate long inactivity.
    const monitor = (engine as any).activityMonitor as ActivityMonitor;
    (monitor as any).lastActivityAt = Date.now() - 60_000;
    engine.tick();
    expect(db.getRecord("notes/a.md")!.totalTimeMs).toBe(0);
  });

  it("prunes per-path viewport state when the last view closes", () => {
    const { engine, leaves } = makeEngine();
    const view = makeScrollerView("notes/a.md", { top: 0, height: 4000, client: 800 });
    leaves.push({ view });
    engine.syncOpenViews();
    engine.tick(); // populates the per-path viewport state

    const state = (engine as any).lastVisibleBuckets as Map<string, Set<number>>;
    expect(state.has("notes/a.md")).toBe(true);

    leaves.pop();
    engine.syncOpenViews();
    expect(state.has("notes/a.md")).toBe(false);
  });

  it("restart() clears and re-creates the interval (interval setting change)", () => {
    const { engine } = makeEngine();
    engine.start();
    const first = (engine as any).intervalId;
    engine.restart();
    expect((engine as any).intervalId).not.toBe(first);
    engine.stop();
    expect((engine as any).intervalId).toBeNull();
  });
});
