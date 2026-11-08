/**
 * Focus Read Suite — the Heatmap module.
 *
 * Owns: the reading-attention heatmap (per-note vertical strip), the
 * tracking engine, the activity monitor and the analytics database.
 * Registers workspace/vault events, applies settings changes live
 * (bucket resampling, width/offset/opacity, tick interval) and exposes the
 * maintenance commands (clear current note).
 */

import { MarkdownView, Notice, TAbstractFile } from "obsidian";
import { FocusSuiteModule, ModuleContext } from "../module";
import { SectionId, HeatmapSettings } from "../../core/settings-schema";
import { HeatmapDatabase } from "./storage";
import { ActivityMonitor } from "./activity";
import { HeatmapEngine } from "./engine";
import { TOUCH_BODY_CLASS, HEATMAP_TOOLTIP_ID } from "./renderer";
import { hasHoverPointer } from "../../core/viewport";
import { logger } from "../../core/logger";

const RECORDS_KEY = "heatmapRecords";

export class HeatmapModule implements FocusSuiteModule {
  readonly id = "heatmap" as const;
  readonly name = "Heat Map of Notes";

  private ctx!: ModuleContext;
  private database!: HeatmapDatabase;
  private activityMonitor!: ActivityMonitor;
  private engine!: HeatmapEngine;
  /** Last-seen bucket count — detects resample-needing changes. */
  private lastBucketCount = 0;

  async load(ctx: ModuleContext): Promise<void> {
    this.ctx = ctx;
    const { settings, lifecycle } = ctx;

    const getSettings = (): HeatmapSettings => settings.settings.heatmap;

    this.database = new HeatmapDatabase(
      {
        loadRecords: async () => settings.getExtra<Record<string, any>>(RECORDS_KEY),
        saveRecords: async (records) => {
          await settings.setExtra(RECORDS_KEY, records, false);
        },
      },
      getSettings
    );
    await this.database.load();

    this.activityMonitor = new ActivityMonitor(
      (el, type, cb, options) => lifecycle.domEvent(el, type, cb, options),
      getSettings().idleSeconds
    );
    this.activityMonitor.start();

    this.engine = new HeatmapEngine(
      {
        registerInterval: (id) => lifecycle.interval(id),
        iterateMarkdownViews: (cb) =>
          ctx.app.workspace.iterateAllLeaves((leaf: any) => {
            if (leaf.view instanceof MarkdownView) cb(leaf.view);
          }),
        registerDomElement: (el, type, cb, options) => lifecycle.domEvent(el, type, cb, options),
      },
      this.database,
      this.activityMonitor,
      () => ({ ...getSettings(), refreshIntervalMs: ctx.settings.settings.advanced.refreshIntervalMs })
    );

    // Touch devices: the strip must never intercept gestures. A 16px
    // pointer-events:auto strip along the right edge made scrolling from
    // that edge impossible on phones. Hover tooltips are desktop-only.
    if (!hasHoverPointer()) {
      document.body.classList.add(TOUCH_BODY_CLASS);
      lifecycle.onUnload(() => document.body.classList.remove(TOUCH_BODY_CLASS));
    }

    lifecycle.event(
      ctx.app.workspace.on("layout-change", () => {
        if (ctx.settings.settings.heatmap.enabled) this.engine.syncOpenViews();
      })
    );
    lifecycle.event(
      ctx.app.workspace.on("active-leaf-change", () => {
        if (ctx.settings.settings.heatmap.enabled) this.engine.syncOpenViews();
      })
    );

    // Handle renames of files AND folders (single-file renames alone
    // orphaned every record beneath a renamed folder).
    lifecycle.event(
      ctx.app.vault.on("rename", (file: TAbstractFile, oldPath: string) => {
        this.database.handleRename(oldPath, file.path);
      })
    );

    if (ctx.settings.settings.heatmap.enabled) {
      this.startEngine();
    }
    this.lastBucketCount = ctx.settings.settings.heatmap.bucketCount;

    this.registerCommands(ctx);
    logger.debug("Heatmap module loaded.");
  }

  async unload(): Promise<void> {
    this.engine?.stop();
    await this.database?.save(true);
    document.getElementById(HEATMAP_TOOLTIP_ID)?.remove();
    document.body.classList.remove(TOUCH_BODY_CLASS);
    logger.debug("Heatmap module unloaded.");
  }

  sections(): SectionId[] {
    return ["heatmap", "advanced"];
  }

  onSettingsChanged(sections: SectionId[]): void {
    const s = this.ctx.settings.settings;

    if (sections.includes("heatmap")) {
      this.activityMonitor.setIdleThreshold(s.heatmap.idleSeconds);

      // Resolution change: resample every record (never lose data) and
      // rebuild the renderers so the strip reflects the new bucket count.
      if (s.heatmap.bucketCount !== this.lastBucketCount) {
        this.lastBucketCount = s.heatmap.bucketCount;
        this.database.resizeAllRecords(s.heatmap.bucketCount);
        if (s.heatmap.enabled) this.engine.rebuildRenderers();
      }

      if (s.heatmap.enabled) {
        this.startEngine();
        this.engine.applySettingsToRenderers();
      } else {
        this.engine.stop();
      }
    }

    if (sections.includes("advanced")) {
      if (s.heatmap.enabled) this.engine.restart();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Engine control                                                      */
  /* ------------------------------------------------------------------ */

  private startEngine(): void {
    const layoutReady = (this.ctx.app.workspace as any).layoutReady;
    const begin = () => {
      this.engine.start();
      this.engine.syncOpenViews();
    };
    if (layoutReady) begin();
    else this.ctx.app.workspace.onLayoutReady(() => begin());
  }

  /* ------------------------------------------------------------------ */
  /* Public API (commands + settings tools)                              */
  /* ------------------------------------------------------------------ */

  clearCurrentNote(): void {
    const activeView = this.ctx.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView && activeView.file) {
      this.database.clearRecord(activeView.file.path);
      if (this.ctx.settings.settings.heatmap.enabled) this.engine.rebuildRenderers();
      new Notice(`Cleared reading analytics for ${activeView.file.name}`);
    } else {
      new Notice("No active note found to clear.");
    }
  }

  pruneDeleted(): string[] {
    return this.database.pruneDeleted(
      (path) => this.ctx.app.vault.getAbstractFileByPath(path) !== null
    );
  }

  clearAll(): void {
    this.database.clearAll();
    if (this.ctx.settings.settings.heatmap.enabled) this.engine.rebuildRenderers();
  }

  rebuildRenderers(): void {
    if (this.ctx.settings.settings.heatmap.enabled) this.engine.rebuildRenderers();
  }

  get recordCount(): number {
    return Object.keys(this.database.records).length;
  }

  getRecord(path: string) {
    return this.database.getRecord(path);
  }

  get isTracking(): boolean {
    return this.activityMonitor.isUserActive();
  }

  private registerCommands(ctx: ModuleContext): void {
    ctx.addCommand({
      id: "clear-note-heatmap",
      name: "Clear heatmap analytics for current note",
      callback: () => this.clearCurrentNote(),
    });
  }
}
