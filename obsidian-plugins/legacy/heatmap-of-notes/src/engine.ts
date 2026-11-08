/**
 * Heatmap of Notes — engine: viewport tracking + renderer orchestration.
 *
 * Fixes vs. the original:
 * - Visit counting is session-scoped per note path. The original recounted
 *   a "visit" every time renderers were rebuilt (e.g. after changing the
 *   bucket-resolution setting), inflating the numbers.
 * - The per-path "last visible buckets" state is pruned when the last view
 *   for a path closes (the original kept growing it forever).
 * - Visible-bucket computation is a pure, unit-tested function.
 */

import { MarkdownView } from "obsidian";
import { logger } from "./logger";
import { HeatmapDatabase } from "./storage";
import { ActivityMonitor } from "./activity";
import { HeatmapRenderer } from "./renderer";
import { HeatmapSettings } from "./types";

/** Pure: which buckets the current viewport covers. */
export function computeVisibleBuckets(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  bucketCount: number
): { start: number; end: number } {
  if (bucketCount <= 0) return { start: 0, end: -1 };
  if (scrollHeight <= 0) return { start: 0, end: -1 };
  if (scrollHeight <= clientHeight) {
    // Whole note visible.
    return { start: 0, end: bucketCount - 1 };
  }
  const startPct = scrollTop / scrollHeight;
  const endPct = (scrollTop + clientHeight) / scrollHeight;
  const start = Math.max(0, Math.floor(startPct * bucketCount));
  const end = Math.min(bucketCount - 1, Math.floor(endPct * bucketCount));
  return { start, end };
}

/** Pure: which of the currently visible buckets were not visible before. */
export function diffVisibleBuckets(
  current: Set<number>,
  previous: Set<number>
): number[] {
  const newlyVisible: number[] = [];
  for (const b of current) {
    if (!previous.has(b)) newlyVisible.push(b);
  }
  return newlyVisible;
}

export interface EngineHost {
  registerInterval(id: number): number;
  iterateMarkdownViews(cb: (view: MarkdownView) => void): void;
  registerDomElement(el: any, type: string, cb: (e: any) => void, options?: any): void;
}

export class HeatmapEngine {
  private database: HeatmapDatabase;
  private activityMonitor: ActivityMonitor;
  private getSettings: () => HeatmapSettings;
  private host: EngineHost;

  private renderers = new Map<MarkdownView, HeatmapRenderer>();
  private intervalId: number | null = null;
  private lastVisibleBuckets = new Map<string, Set<number>>();
  /** Paths already visited in this session (visit counted once per session). */
  private sessionVisitedPaths = new Set<string>();

  constructor(
    host: EngineHost,
    database: HeatmapDatabase,
    activityMonitor: ActivityMonitor,
    getSettings: () => HeatmapSettings
  ) {
    this.host = host;
    this.database = database;
    this.activityMonitor = activityMonitor;
    this.getSettings = getSettings;
  }

  /* ------------------------------------------------------------------ */
  /* Lifecycle                                                           */
  /* ------------------------------------------------------------------ */

  start(): void {
    if (this.intervalId !== null) return;
    const intervalMs = this.getSettings().refreshIntervalMs;
    this.intervalId = this.host.registerInterval(window.setInterval(() => this.tick(), intervalMs));
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.clearAllRenderers();
  }

  /* ------------------------------------------------------------------ */
  /* View management                                                     */
  /* ------------------------------------------------------------------ */

  registerView(view: MarkdownView): void {
    if (this.renderers.has(view)) return;

    logger.debug(`Registering view: ${view.file ? view.file.name : "unknown"}`);

    const renderer = new HeatmapRenderer(
      view,
      this.database,
      this.getSettings,
      (el, type, cb, options) => this.host.registerDomElement(el, type, cb, options)
    );
    this.renderers.set(view, renderer);

    const path = view.file?.path;
    if (path && !this.sessionVisitedPaths.has(path)) {
      this.sessionVisitedPaths.add(path);
      this.database.incrementVisit(path);
    }
  }

  deregisterView(view: MarkdownView): void {
    const renderer = this.renderers.get(view);
    if (!renderer) return;
    renderer.destroy();
    this.renderers.delete(view);

    // Prune per-path viewport state once no open view shows that path.
    const path = view.file?.path;
    if (path && !this.hasOpenViewForPath(path)) {
      this.lastVisibleBuckets.delete(path);
    }
  }

  private hasOpenViewForPath(path: string): boolean {
    for (const view of this.renderers.keys()) {
      if (view.file?.path === path) return true;
    }
    return false;
  }

  clearAllRenderers(): void {
    for (const renderer of this.renderers.values()) renderer.destroy();
    this.renderers.clear();
    this.lastVisibleBuckets.clear();
  }

  /** Rebuilds renderers after a settings change WITHOUT recounting visits. */
  rebuildRenderers(): void {
    this.clearAllRenderers();
    this.syncOpenViews();
  }

  syncOpenViews(): void {
    const activeViews: MarkdownView[] = [];
    this.host.iterateMarkdownViews((view) => activeViews.push(view));

    for (const view of [...this.renderers.keys()]) {
      if (!activeViews.includes(view)) this.deregisterView(view);
    }

    for (const view of activeViews) {
      if (!this.renderers.has(view)) {
        this.registerView(view);
      } else {
        this.renderers.get(view)?.checkAndRebindScroller();
      }
    }
  }

  applySettingsToRenderers(): void {
    for (const renderer of this.renderers.values()) renderer.applySettings();
  }

  /* ------------------------------------------------------------------ */
  /* Tracking loop                                                       */
  /* ------------------------------------------------------------------ */

  tick(): void {
    if (!this.activityMonitor.isUserActive()) return;

    for (const [view, renderer] of this.renderers.entries()) {
      const contentEl = view.contentEl;
      if (!contentEl || !contentEl.isConnected) continue;
      if (contentEl.getBoundingClientRect().height <= 0) continue;
      this.refreshViewPort(view, renderer);
    }
  }

  private refreshViewPort(view: MarkdownView, renderer: HeatmapRenderer): void {
    const path = view.file ? view.file.path : null;
    if (!path) return;

    renderer.checkAndRebindScroller();
    const scroller = renderer.scrollerElement;
    if (!scroller) return;

    const scrollTop = scroller.scrollTop;
    const scrollHeight = scroller.scrollHeight;
    const clientHeight = scroller.clientHeight;
    if (scrollHeight <= 0) return;

    const bucketCount = this.getSettings().bucketCount;
    const { start, end } = computeVisibleBuckets(scrollTop, scrollHeight, clientHeight, bucketCount);

    const currentlyVisible = new Set<number>();
    for (let i = start; i <= end; i++) currentlyVisible.add(i);

    const previouslyVisible = this.lastVisibleBuckets.get(path) ?? new Set<number>();
    const newlyVisible = diffVisibleBuckets(currentlyVisible, previouslyVisible);
    this.lastVisibleBuckets.set(path, currentlyVisible);

    const incrementMs = this.getSettings().refreshIntervalMs;
    this.database.recordReadingTime(path, start, end, incrementMs, newlyVisible);

    renderer.draw();
  }
}
