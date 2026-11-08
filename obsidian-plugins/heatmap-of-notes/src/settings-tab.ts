/**
 * Heatmap of Notes — settings tab (with analytics dashboard and tools).
 *
 * Fixes vs. the original:
 * - The dashboard uses read-only record lookups (opening settings used to
 *   mint an empty record for the active note).
 * - "Reset database" uses a proper confirmation Modal instead of the raw
 *   `confirm()` (which is unavailable/blocked in some Obsidian contexts,
 *   especially on mobile).
 * - New "Prune records for deleted notes" maintenance action.
 */

import { App, Modal, Notice, PluginSettingTab, Setting, MarkdownView, ButtonComponent } from "obsidian";
import { HeatmapDatabase } from "./storage";
import HeatmapPlugin from "./main";

class ConfirmModal extends Modal {
  constructor(
    app: App,
    private title: string,
    private body: string,
    private confirmLabel: string,
    private onConfirm: () => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.title);
    this.contentEl.empty();
    this.contentEl.createEl("p", { text: this.body });
    const buttonRow = this.contentEl.createDiv({ cls: "frh-modal-button-row" });
    new ButtonComponent(buttonRow)
      .setButtonText(this.confirmLabel)
      .setWarning()
      .onClick(() => {
        this.close();
        this.onConfirm();
      });
    new ButtonComponent(buttonRow).setButtonText("Cancel").onClick(() => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class HeatmapSettingTab extends PluginSettingTab {
  private plugin: HeatmapPlugin;

  constructor(app: App, plugin: HeatmapPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  private get db(): HeatmapDatabase {
    return this.plugin.database;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Heatmap of Notes Settings" });

    new Setting(containerEl)
      .setName("Activity idle threshold (seconds)")
      .setDesc("Reading data accumulation pauses after this period of inactivity.")
      .addSlider((slider) =>
        slider
          .setLimits(10, 300, 5)
          .setValue(this.db.settings.idleSeconds)
          .setDynamicTooltip()
          .onChange(async (val) => {
            this.db.settings.idleSeconds = val;
            this.plugin.activityMonitor.setIdleThreshold(val);
            await this.db.save(true);
          })
      );

    new Setting(containerEl)
      .setName("Heatmap resolution (buckets)")
      .setDesc("Density of the vertical bands. Existing data is resampled.")
      .addSlider((slider) =>
        slider
          .setLimits(20, 200, 10)
          .setValue(this.db.settings.bucketCount)
          .setDynamicTooltip()
          .onChange(async (val) => {
            this.db.settings.bucketCount = val;
            this.db.resizeAllRecords(val);
            await this.db.save(true);
            this.plugin.engine.rebuildRenderers();
          })
      );

    new Setting(containerEl)
      .setName("Visual bar width (pixels)")
      .setDesc("Screen width of the vertical colored track.")
      .addSlider((slider) =>
        slider
          .setLimits(8, 48, 2)
          .setValue(this.db.settings.heatmapWidth)
          .setDynamicTooltip()
          .onChange(async (val) => {
            this.db.settings.heatmapWidth = val;
            await this.db.save(true);
            this.plugin.engine.applySettingsToRenderers();
          })
      );

    new Setting(containerEl)
      .setName("Sidebar edge offset (pixels)")
      .setDesc("Spacing from the right pane border.")
      .addSlider((slider) =>
        slider
          .setLimits(0, 50, 2)
          .setValue(this.db.settings.heatmapOffsetRight)
          .setDynamicTooltip()
          .onChange(async (val) => {
            this.db.settings.heatmapOffsetRight = val;
            await this.db.save(true);
            this.plugin.engine.applySettingsToRenderers();
          })
      );

    new Setting(containerEl)
      .setName("Track transparency")
      .setDesc("Opacity of the heatmap strip.")
      .addSlider((slider) =>
        slider
          .setLimits(0.1, 1.0, 0.05)
          .setValue(this.db.settings.heatmapOpacity)
          .setDynamicTooltip()
          .onChange(async (val) => {
            this.db.settings.heatmapOpacity = val;
            await this.db.save(true);
            this.plugin.engine.applySettingsToRenderers();
          })
      );

    new Setting(containerEl)
      .setName("Debug mode")
      .setDesc("Verbose tracing in the developer console.")
      .addToggle((toggle) =>
        toggle.setValue(this.db.settings.debugMode).onChange(async (val) => {
          this.db.settings.debugMode = val;
          this.plugin.setDebugLogging(val);
          await this.db.save(true);
        })
      );

    containerEl.createEl("p", {
      cls: "frh-setting-hint",
      text: "Tip: on desktop, hover the pointer over the vertical heatmap strip to see time spent, visit counts and read lengths for each part of the note. On touch devices the strip never intercepts your scroll gestures.",
    });

    this.renderTimelineTools(containerEl);
  }

  private renderTimelineTools(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "Timeline Tools" });
    const toolsContainer = containerEl.createDiv({ cls: "frh-tools-container" });

    /* ---- Analytics dashboard ---- */
    toolsContainer.createEl("h4", { text: "Analytics Dashboard", cls: "frh-subsection-title" });
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const activeFile = activeView?.file ?? null;
    const db = this.db;

    if (activeFile) {
      // Read-only: opening the settings tab must not create records.
      const rec = db.getRecord(activeFile.path);
      const dashDiv = toolsContainer.createDiv({ cls: "frh-dashboard-panel" });

      const createStat = (label: string, val: string) => {
        const row = dashDiv.createDiv({ cls: "frh-dashboard-stat" });
        row.createSpan({ text: label, cls: "frh-stat-label" });
        row.createSpan({ text: val, cls: "frh-stat-value" });
      };

      if (rec) {
        const totalSec = Math.round(rec.totalTimeMs / 1000);
        const minStr = Math.floor(totalSec / 60);
        const secStr = String(totalSec % 60).padStart(2, "0");
        createStat("Active note name", activeFile.name);
        createStat("Total time spent", `${minStr}m ${secStr}s`);
        createStat("Total section visits", `${rec.visits || 0}`);
        createStat("Last accessed", rec.lastAccessed ? new Date(rec.lastAccessed).toLocaleString() : "Unknown");
      } else {
        createStat("Active note name", activeFile.name);
        createStat("Total time spent", "No data yet");
      }
      createStat("Indexed notes count", `${Object.keys(db.records).length} files`);
    } else {
      toolsContainer.createEl("p", {
        cls: "frh-setting-hint",
        text: "Please open a markdown file in the editor to view active note analytics.",
      });
    }

    /* ---- Reset operations ---- */
    toolsContainer.createEl("h4", { text: "Reset Operations", cls: "frh-subsection-title" });

    new Setting(toolsContainer)
      .setName("Reset current note analytics")
      .setDesc("Permanently discard collected reading metrics for the active note.")
      .addButton((button) =>
        button
          .setButtonText("Reset Current Note")
          .setWarning()
          .onClick(async () => {
            if (activeFile) {
              db.clearRecord(activeFile.path);
              new Notice(`Cleared reading analytics for: ${activeFile.name}`);
              this.plugin.engine.rebuildRenderers();
              this.display();
            } else {
              new Notice("No active note found to reset.");
            }
          })
      );

    new Setting(toolsContainer)
      .setName("Reset all heatmaps")
      .setDesc("Delete all historical engagement records across the entire vault database.")
      .addButton((button) =>
        button.setButtonText("Reset Database").setWarning().onClick(() => {
          new ConfirmModal(
            this.app,
            "Reset all reading analytics?",
            "This permanently deletes all reading engagement history for every note. This action cannot be undone.",
            "Delete everything",
            async () => {
              db.clearAll();
              new Notice("All vault reading metrics have been cleared.");
              this.plugin.engine.rebuildRenderers();
              this.display();
            }
          ).open();
        })
      );

    new Setting(toolsContainer)
      .setName("Prune records for deleted notes")
      .setDesc("Remove analytics entries whose notes no longer exist in the vault.")
      .addButton((button) =>
        button.setButtonText("Prune Deleted").onClick(() => {
          const removed = db.pruneDeleted(
            (path) => this.app.vault.getAbstractFileByPath(path) !== null
          );
          new Notice(removed.length > 0 ? `Pruned ${removed.length} record(s).` : "Nothing to prune.");
          this.display();
        })
      );

    /* ---- Diagnostics ---- */
    const diagSection = toolsContainer.createDiv({ cls: "frh-diagnostic-section" });
    diagSection.createEl("h4", { text: "Diagnostics & System Health" });

    const isUserActive = this.plugin.activityMonitor.isUserActive();
    const recordsCount = Object.keys(db.records).length;

    new Setting(diagSection)
      .setName("Tracking status")
      .setDesc("Verifies if the activity monitor is actively tracking runtime engagement.")
      .addText((text) =>
        text
          .setValue(isUserActive ? "Active & Monitoring" : "Suspended (Idle/Inactive)")
          .setDisabled(true)
      );

    new Setting(diagSection)
      .setName("Storage database state")
      .setDesc("Indexed registry nodes and system health check.")
      .addText((text) => text.setValue(`Healthy (${recordsCount} tracked files)`).setDisabled(true));
  }
}
