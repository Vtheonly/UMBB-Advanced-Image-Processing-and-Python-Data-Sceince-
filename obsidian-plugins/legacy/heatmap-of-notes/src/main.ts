/**
 * Heatmap of Notes — plugin entry point.
 */

import { MarkdownView, Notice, Plugin, TAbstractFile } from "obsidian";
import { logger } from "./logger";
import { HeatmapDatabase } from "./storage";
import { ActivityMonitor } from "./activity";
import { HeatmapEngine } from "./engine";
import { TOUCH_BODY_CLASS } from "./renderer";
import { HeatmapSettingTab } from "./settings-tab";
import { hasHoverPointer } from "../../shared/src/viewport";

export default class HeatmapPlugin extends Plugin {
  database!: HeatmapDatabase;
  activityMonitor!: ActivityMonitor;
  engine!: HeatmapEngine;

  async onload(): Promise<void> {
    logger.info("Initializing Heatmap of Notes plugin...");

    this.database = new HeatmapDatabase({
      loadData: () => this.loadData(),
      saveData: (data) => this.saveData(data),
    });
    await this.database.load();
    logger.setDebug(this.database.settings.debugMode);

    this.activityMonitor = new ActivityMonitor(
      (el, type, cb, options) => (this.registerDomEvent as any)(el, type, cb, options),
      this.database.settings.idleSeconds
    );
    this.activityMonitor.start();

    this.engine = new HeatmapEngine(
      {
        registerInterval: (id) => this.registerInterval(id),
        iterateMarkdownViews: (cb) =>
          this.app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view instanceof MarkdownView) cb(leaf.view);
          }),
        registerDomElement: (el, type, cb, options) =>
          (this.registerDomEvent as any)(el, type, cb, options),
      },
      this.database,
      this.activityMonitor,
      () => this.database.settings
    );

    // Touch devices: mark the body so CSS disables pointer-events on the
    // heatmap strip (a 16px touch-swallowing strip on the right edge of
    // every note was a major mobile annoyance). Hover tooltips are
    // desktop-only anyway.
    if (!hasHoverPointer()) {
      document.body.classList.add(TOUCH_BODY_CLASS);
      this.register(() => document.body.classList.remove(TOUCH_BODY_CLASS));
    }

    this.registerEvent(
      this.app.workspace.on("layout-change", () => this.engine.syncOpenViews())
    );
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => this.engine.syncOpenViews())
    );

    // Handle renames of files AND folders (the original only handled
    // files, so renaming a folder orphaned every record beneath it).
    this.registerEvent(
      this.app.vault.on("rename", (file: TAbstractFile, oldPath: string) => {
        this.database.handleRename(oldPath, file.path);
      })
    );

    if (this.app.workspace.layoutReady) {
      this.engine.start();
      this.engine.syncOpenViews();
    } else {
      this.app.workspace.onLayoutReady(() => {
        this.engine.start();
        this.engine.syncOpenViews();
      });
    }

    this.addSettingTab(new HeatmapSettingTab(this.app, this));

    this.addCommand({
      id: "clear-heatmap-data",
      name: "Clear heatmap analytics for current note",
      callback: () => {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView && activeView.file) {
          this.database.clearRecord(activeView.file.path);
          new Notice(`Cleared reading analytics for ${activeView.file.name}`);
          this.engine.rebuildRenderers();
        } else {
          new Notice("No active note found to clear.");
        }
      },
    });

    logger.info("Load lifecycle completed successfully.");
  }

  setDebugLogging(enabled: boolean): void {
    logger.setDebug(enabled);
  }

  async onunload(): Promise<void> {
    logger.info("Unloading Heatmap of Notes plugin...");
    this.engine?.stop();
    await this.database?.save(true);
    document.getElementById("frh-tooltip-element")?.remove();
    document.body.classList.remove(TOUCH_BODY_CLASS);
    logger.info("Cleanup successfully completed.");
  }
}
