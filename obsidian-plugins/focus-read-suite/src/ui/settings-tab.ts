/**
 * Focus Read Suite — the unified settings tab.
 *
 * Eight sections behind a sticky tab navigation (horizontal scroll on
 * phones):
 *
 *   General · Timer · Reading Focus · Typography · Ruler · Heatmap ·
 *   Appearance · Advanced
 *
 * Every control writes through the central SettingsManager, which notifies
 * the owning module — so changes take effect immediately. Each section has
 * a Reset action; Advanced has the migration card, the legacy-plugin
 * helper and the full-settings reset.
 */

import { App, Modal, Notice, PluginSettingTab, Setting, MarkdownView, ButtonComponent } from "obsidian";
import type FocusReadSuitePlugin from "../main";
import { SettingsManager } from "../core/settings-manager";
import { SectionId, RulerMode, AccentMode, FONT_OPTIONS } from "../core/settings-schema";
import { labeledSlider, sectionHeader, statusPill, callout } from "./components";
import { MigrationInfo, LEGACY_PLUGIN_PATHS } from "../core/migration";

const RULER_MODE_OPTIONS: Record<RulerMode, string> = {
  auto: "Auto — follow on desktop, drag on touch",
  follow: "Follow pointer (desktop)",
  manual: "Manual — drag the notch",
};

const ACCENT_MODE_OPTIONS: Record<AccentMode, string> = {
  native: "Native — use Obsidian's accent color",
  custom: "Custom accent color",
};

interface TabDef {
  id: SectionId;
  label: string;
  render: (el: HTMLElement) => void;
}

class ConfirmModal extends Modal {
  constructor(
    app: App,
    private title: string,
    private body: string,
    private confirmLabel: string,
    private onConfirm: () => void | Promise<void>
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.title);
    this.contentEl.empty();
    this.contentEl.createEl("p", { text: this.body });
    const buttonRow = this.contentEl.createDiv({ cls: "frs-modal-button-row" });
    new ButtonComponent(buttonRow)
      .setButtonText(this.confirmLabel)
      .setWarning()
      .onClick(() => {
        this.close();
        void this.onConfirm();
      });
    new ButtonComponent(buttonRow).setButtonText("Cancel").onClick(() => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class FocusSuiteSettingTab extends PluginSettingTab {
  private plugin: FocusReadSuitePlugin;
  private activeTab: SectionId = "general";

  private get settings(): SettingsManager {
    return this.plugin.settings;
  }

  constructor(app: App, plugin: FocusReadSuitePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    this.renderHeader(containerEl);

    const tabs: TabDef[] = [
      { id: "general", label: "General", render: (el) => this.renderGeneral(el) },
      { id: "timer", label: "Timer", render: (el) => this.renderTimer(el) },
      { id: "focus", label: "Reading Focus", render: (el) => this.renderFocus(el) },
      { id: "typography", label: "Typography", render: (el) => this.renderTypography(el) },
      { id: "ruler", label: "Ruler", render: (el) => this.renderRuler(el) },
      { id: "heatmap", label: "Heatmap", render: (el) => this.renderHeatmap(el) },
      { id: "appearance", label: "Appearance", render: (el) => this.renderAppearance(el) },
      { id: "advanced", label: "Advanced", render: (el) => this.renderAdvanced(el) },
    ];

    const active = tabs.find((t) => t.id === this.activeTab) ?? tabs[0];
    this.activeTab = active.id;

    /* ---- Sticky tab navigation ---- */
    const nav = containerEl.createDiv({ cls: "frs-settings-nav" });
    nav.setAttribute("role", "tablist");
    for (const tab of tabs) {
      const btn = nav.createEl("button", {
        cls: `frs-settings-tab ${tab.id === active.id ? "frs-settings-tab-active" : ""}`,
        text: tab.label,
      });
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", String(tab.id === active.id));
      btn.addEventListener("click", () => {
        this.activeTab = tab.id;
        this.display();
      });
    }

    /* ---- Active section ---- */
    const section = containerEl.createDiv({ cls: "frs-settings-section" });
    section.setAttribute("role", "tabpanel");
    active.render(section);
  }

  /* ------------------------------------------------------------------ */
  /* Header                                                              */
  /* ------------------------------------------------------------------ */

  private renderHeader(el: HTMLElement): void {
    const head = el.createDiv({ cls: "frs-settings-head" });
    const title = head.createDiv({ cls: "frs-settings-head-titles" });
    title.createEl("h2", { text: "Focus Read Suite" });
    title.createEl("p", {
      text: "Timer, reading focus, typography and heatmap — one plugin.",
      cls: "frs-settings-head-sub",
    });

    const pills = head.createDiv({ cls: "frs-settings-head-pills" });
    const s = this.settings.settings;
    statusPill(pills, "Timer", s.timer.enabled);
    statusPill(pills, "Reading Focus", s.focus.enabled);
    statusPill(pills, "Typography", s.typography.enabled);
    statusPill(pills, "Heatmap", s.heatmap.enabled);
  }

  /* ------------------------------------------------------------------ */
  /* 1. General                                                          */
  /* ------------------------------------------------------------------ */

  private renderGeneral(el: HTMLElement): void {
    sectionHeader(el, "General", "Plugin-wide behavior.");
    const s = this.settings.settings.general;

    new Setting(el)
      .setName("Track reading-time statistics")
      .setDesc("Accumulate today/total reading time, streaks and per-day history. Turn off for zero tracking.")
      .addToggle((toggle) =>
        toggle.setValue(s.statsEnabled).onChange(async (v) => {
          await this.settings.update("general", (draft) => {
            draft.general.statsEnabled = v;
          });
        })
      );

    new Setting(el)
      .setName("Show feedback notices")
      .setDesc("Informational toasts (session started, ruler toggled…). Errors are always shown.")
      .addToggle((toggle) =>
        toggle.setValue(s.showNotices).onChange(async (v) => {
          await this.settings.update("general", (draft) => {
            draft.general.showNotices = v;
          });
        })
      );

    const modulesCard = el.createDiv({ cls: "frs-card" });
    modulesCard.createEl("h4", { text: "Modules" });
    modulesCard
      .createEl("p", { cls: "frs-card-note", text: "Enable or disable each feature set in its own settings tab:" });

    const rows = modulesCard.createDiv({ cls: "frs-module-rows" });
    const moduleRow = (name: string, desc: string, section: SectionId, enabled: boolean) => {
      const row = rows.createDiv({ cls: "frs-module-row" });
      const titles = row.createDiv({ cls: "frs-module-row-titles" });
      titles.createEl("strong", { text: name });
      titles.createEl("span", { text: desc });
      const toggleSetting = new Setting(row).setClass("frs-module-row-toggle");
      toggleSetting.addToggle((t) =>
        t.setValue(enabled).onChange(async (v) => {
          await this.settings.update(section, (draft) => {
            (draft as any)[section].enabled = v;
          });
          this.display();
        })
      );
    };
    moduleRow("Focus Read Timer", "Floating timer, sessions, focus detection, goal bar", "timer", this.settings.settings.timer.enabled);
    moduleRow("Notch & Reading Focus", "The yellow ruler with its draggable notch", "focus", this.settings.settings.focus.enabled);
    moduleRow("Typography", "Reading font, size, line height and width", "typography", this.settings.settings.typography.enabled);
    moduleRow("Heat Map of Notes", "Per-note reading attention heatmap", "heatmap", this.settings.settings.heatmap.enabled);
  }

  /* ------------------------------------------------------------------ */
  /* 2. Focus Read Timer                                                 */
  /* ------------------------------------------------------------------ */

  private renderTimer(el: HTMLElement): void {
    sectionHeader(el, "Focus Read Timer", "Floating timer, focus detection, idle nudge, daily goal.", async () => {
      await this.settings.resetSections(["timer"]);
      this.display();
    });
    const s = this.settings.settings.timer;
    const up = (mutate: (draft: typeof s) => void) =>
      this.settings.update("timer", (draft) => mutate(draft.timer));

    new Setting(el)
      .setName("Enable floating timer")
      .setDesc("Show the floating timer box. Drag it by its header; double-click the header to collapse it.")
      .addToggle((toggle) => toggle.setValue(s.enabled).onChange((v) => void up((d) => { d.enabled = v; })));

    labeledSlider(el, {
      name: "Work minutes", min: 5, max: 90, step: 1, value: s.workMinutes, unit: " min",
      onChange: (v) => up((d) => { d.workMinutes = v; }),
    });
    labeledSlider(el, {
      name: "Break minutes", min: 1, max: 30, step: 1, value: s.breakMinutes, unit: " min",
      onChange: (v) => up((d) => { d.breakMinutes = v; }),
    });

    new Setting(el)
      .setName("Auto-hide timer")
      .setDesc("Dim the timer box when idle.")
      .addToggle((toggle) => toggle.setValue(s.autoHide).onChange((v) => void up((d) => { d.autoHide = v; })));
    labeledSlider(el, {
      name: "Auto-hide after", min: 1, max: 30, step: 1, value: s.autoHideSeconds, unit: " s",
      onChange: (v) => up((d) => { d.autoHideSeconds = v; }),
    });

    new Setting(el)
      .setName("Pause on window blur")
      .setDesc("Pause when Obsidian loses focus or is hidden.")
      .addToggle((toggle) => toggle.setValue(s.pauseOnBlur).onChange((v) => void up((d) => { d.pauseOnBlur = v; })));

    new Setting(el)
      .setName("Reset timer position")
      .setDesc("Snap the timer back to the top-right corner.")
      .addButton((button) =>
        button.setButtonText("Reset position").onClick(async () => {
          await this.settings.update("timer", (draft) => {
            draft.timer.positionX = null;
            draft.timer.positionY = null;
          });
          this.plugin.modules.timer.resetPosition();
        })
      );

    el.createEl("h4", { text: "Focus detection", cls: "frs-subhead" });
    new Setting(el)
      .setName("Enable focus detection")
      .setDesc("Only accumulate focus time while you are actively reading (not just while the window is focused).")
      .addToggle((toggle) => toggle.setValue(s.focusDetectionEnabled).onChange((v) => void up((d) => { d.focusDetectionEnabled = v; })));
    labeledSlider(el, {
      name: "Idle seconds", min: 10, max: 300, step: 5, value: s.focusDetectionIdleSeconds, unit: " s",
      onChange: (v) => up((d) => { d.focusDetectionIdleSeconds = v; }),
    });

    el.createEl("h4", { text: "Idle nudge", cls: "frs-subhead" });
    new Setting(el)
      .setName("Enable idle nudge")
      .setDesc("A reminder card when you stop reading (works even without a running timer).")
      .addToggle((toggle) => toggle.setValue(s.nudgeEnabled).onChange((v) => void up((d) => { d.nudgeEnabled = v; })));
    labeledSlider(el, {
      name: "Idle threshold", min: 10, max: 300, step: 5, value: s.nudgeIdleSeconds, unit: " s",
      onChange: (v) => up((d) => { d.nudgeIdleSeconds = v; }),
    });
    new Setting(el)
      .setName("Don't count scroll as activity")
      .setDesc("Recommended ON — scrolling while reading shouldn't reset the idle timer.")
      .addToggle((toggle) => toggle.setValue(s.nudgeIgnoreScroll).onChange((v) => void up((d) => { d.nudgeIgnoreScroll = v; })));

    el.createEl("h4", { text: "Daily goal bar", cls: "frs-subhead" });
    new Setting(el)
      .setName("Enable daily goal bar")
      .setDesc("Bottom bar showing today's reading vs your goal (works independently of the timer).")
      .addToggle((toggle) => toggle.setValue(s.dopamineEnabled).onChange((v) => void up((d) => { d.dopamineEnabled = v; })));
    labeledSlider(el, {
      name: "Daily goal", min: 5, max: 240, step: 5, value: s.dopamineDailyGoalMinutes, unit: " min",
      onChange: (v) => up((d) => { d.dopamineDailyGoalMinutes = v; }),
    });

    /* ---- Reading stats dashboard ---- */
    const stats = this.plugin.modules.timer.todayStats;
    const statsCard = el.createDiv({ cls: "frs-card" });
    statsCard.createEl("h4", { text: "Reading statistics" });
    const grid = statsCard.createDiv({ cls: "frs-stat-grid" });
    const stat = (label: string, value: string) => {
      const cell = grid.createDiv({ cls: "frs-stat-cell" });
      cell.createSpan({ text: label, cls: "frs-stat-label" });
      cell.createSpan({ text: value, cls: "frs-stat-value" });
    };
    const fmtMin = (ms: number) => {
      const totalMin = Math.floor(ms / 60_000);
      if (totalMin < 60) return `${totalMin} min`;
      return `${Math.floor(totalMin / 60)} h ${totalMin % 60} min`;
    };
    stat("Today", fmtMin(stats.todayMs));
    stat("All time", fmtMin(stats.totalReadingMs));
    stat("Streak", `${stats.streak} day${stats.streak === 1 ? "" : "s"}`);
    stat("Longest streak", `${stats.longestStreak} day${stats.longestStreak === 1 ? "" : "s"}`);
    stat("Sessions today", String(stats.sessionsToday));
    stat("Longest focus", fmtMin(stats.longestFocusMs));
  }

  /* ------------------------------------------------------------------ */
  /* 3. Notch & Reading Focus                                            */
  /* ------------------------------------------------------------------ */

  private renderFocus(el: HTMLElement): void {
    sectionHeader(el, "Notch & Reading Focus", "How the reading-assistance system behaves and interacts.", async () => {
      await this.settings.resetSections(["focus"]);
      this.display();
    });
    const s = this.settings.settings.focus;
    const up = (mutate: (draft: typeof s) => void) =>
      this.settings.update("focus", (draft) => mutate(draft.focus));

    new Setting(el)
      .setName("Enable reading focus")
      .setDesc("A horizontal highlight band (the yellow ruler) over your note, with a draggable notch on its right edge.")
      .addToggle((toggle) => toggle.setValue(s.enabled).onChange((v) => void up((d) => { d.enabled = v; })));

    new Setting(el)
      .setName("Show the notch")
      .setDesc("The notch is the tab you drag to move the ruler (mouse, pen and touch). Hiding it leaves keyboard/command control.")
      .addToggle((toggle) => toggle.setValue(s.showNotch).onChange((v) => void up((d) => { d.showNotch = v; })));

    labeledSlider(el, {
      name: "Notch size", min: 36, max: 56, step: 2, value: s.notchSize, unit: " px",
      desc: "Touch-target diameter. 44 px or more is comfortable on phones.",
      onChange: (v) => up((d) => { d.notchSize = v; }),
    });

    new Setting(el)
      .setName("Focus line")
      .setDesc("Draw a crisp guide line at the band's center — helps the eyes track the current line.")
      .addToggle((toggle) => toggle.setValue(s.focusLine).onChange((v) => void up((d) => { d.focusLine = v; })));

    new Setting(el)
      .setName("Smooth pointer following")
      .setDesc("In follow mode the band glides toward the pointer instead of jumping (desktop only).")
      .addToggle((toggle) => toggle.setValue(s.smoothFollow).onChange((v) => void up((d) => { d.smoothFollow = v; })));

    labeledSlider(el, {
      name: "Keyboard move step", min: 2, max: 25, step: 1, value: s.keyboardStepPercent, unit: " %",
      desc: "Step size for the move-up/move-down commands and the notch's arrow keys.",
      onChange: (v) => up((d) => { d.keyboardStepPercent = v; }),
    });

    callout(
      el,
      "Drag the notch to reposition the ruler. Double-tap (or double-click) the notch to center it. The notch also responds to Arrow keys when focused. On touch devices the band itself never reacts to taps — only the notch is interactive, so scrolling is never intercepted."
    );
  }

  /* ------------------------------------------------------------------ */
  /* 4. Typography                                                       */
  /* ------------------------------------------------------------------ */

  private renderTypography(el: HTMLElement): void {
    sectionHeader(el, "Typography", "Reading font, size, line height, spacing and width.", async () => {
      await this.settings.resetSections(["typography"]);
      this.display();
    });
    const s = this.settings.settings.typography;
    const up = (mutate: (draft: typeof s) => void) =>
      this.settings.update("typography", (draft) => mutate(draft.typography));

    new Setting(el)
      .setName("Enable typography")
      .setDesc("Apply the font and text metrics below to reading and editing views.")
      .addToggle((toggle) => toggle.setValue(s.enabled).onChange((v) => void up((d) => { d.enabled = v; })));

    new Setting(el)
      .setName("Reading font")
      .setDesc("Applied on top of your theme when typography is enabled.")
      .addDropdown((dropdown) => {
        for (const option of FONT_OPTIONS) dropdown.addOption(option.id, option.label);
        dropdown.setValue(s.fontFamily).onChange(async (v) => {
          await up((d) => { d.fontFamily = v; });
          this.display();
        });
      });

    if (s.fontFamily === "custom") {
      new Setting(el)
        .setName("Custom font stack")
        .setDesc("CSS font-family value, e.g. Georgia, 'Times New Roman', serif")
        .addText((text) =>
          text.setValue(s.customFontFamily).onChange(async (v) => {
            await up((d) => { d.customFontFamily = v; });
          })
        );
    }

    new Setting(el)
      .setName("Load Google Fonts")
      .setDesc("Download the selected font from Google Fonts (requires internet). Only the selected family is loaded.")
      .addToggle((toggle) => toggle.setValue(s.loadGoogleFonts).onChange((v) => void up((d) => { d.loadGoogleFonts = v; })));

    labeledSlider(el, { name: "Font size", min: 13, max: 26, step: 1, value: s.fontSize, unit: " px", onChange: (v) => up((d) => { d.fontSize = v; }) });
    labeledSlider(el, { name: "Line height", min: 1.2, max: 2.2, step: 0.05, decimals: 2, value: s.lineHeight, onChange: (v) => up((d) => { d.lineHeight = v; }) });
    labeledSlider(el, { name: "Paragraph spacing", min: 1, max: 2.5, step: 0.1, decimals: 1, value: s.paragraphSpacing, onChange: (v) => up((d) => { d.paragraphSpacing = v; }) });
    labeledSlider(el, { name: "Max line width", min: 40, max: 120, step: 1, value: s.maxWidthChars, unit: " ch", desc: "Measured in characters — keeps lines comfortably readable.", onChange: (v) => up((d) => { d.maxWidthChars = v; }) });
  }

  /* ------------------------------------------------------------------ */
  /* 5. Yellow Ruler                                                     */
  /* ------------------------------------------------------------------ */

  private renderRuler(el: HTMLElement): void {
    sectionHeader(el, "Yellow Ruler", "The highlight band itself — size, color, opacity, positioning.", async () => {
      await this.settings.resetSections(["ruler"]);
      this.display();
    });
    const s = this.settings.settings.ruler;
    const up = (mutate: (draft: typeof s) => void) =>
      this.settings.update("ruler", (draft) => mutate(draft.ruler));

    callout(el, `The ruler is part of the Reading Focus feature — enable it in the "Reading Focus" tab (currently ${this.settings.settings.focus.enabled ? "ON" : "OFF"}).`);

    labeledSlider(el, { name: "Ruler height", min: 10, max: 80, step: 1, value: s.height, unit: " px", onChange: (v) => up((d) => { d.height = v; }) });

    new Setting(el)
      .setName("Ruler color")
      .setDesc("The classic highlighter yellow works in light and dark themes.")
      .addColorPicker((picker) => picker.setValue(s.color).onChange((v) => void up((d) => { d.color = v; })));

    labeledSlider(el, { name: "Ruler opacity", min: 0.05, max: 0.9, step: 0.01, decimals: 2, value: s.opacity, onChange: (v) => up((d) => { d.opacity = v; }) });

    new Setting(el)
      .setName("Interaction mode")
      .setDesc("Follow: the band tracks your mouse. Manual: the band stays where you drag the notch — recommended on touch. Auto picks per device.")
      .addDropdown((dropdown) => {
        for (const [mode, label] of Object.entries(RULER_MODE_OPTIONS)) dropdown.addOption(mode, label);
        dropdown.setValue(s.mode).onChange(async (v) => {
          await up((d) => { d.mode = v as RulerMode; });
        });
      });

    new Setting(el)
      .setName("Reset ruler position")
      .setDesc("Put the ruler back at its default height (slightly above the middle).")
      .addButton((button) =>
        button.setButtonText("Reset position").onClick(async () => {
          await up((d) => { d.positionRatio = null; });
        })
      );

    callout(el, "The position is remembered as a fraction of the screen height, so it stays sensible after rotating the device or switching monitors.");
  }

  /* ------------------------------------------------------------------ */
  /* 6. Heat Map of Notes                                                */
  /* ------------------------------------------------------------------ */

  private renderHeatmap(el: HTMLElement): void {
    sectionHeader(el, "Heat Map of Notes", "Reading-attention tracking and the vertical heatmap strip.", async () => {
      await this.settings.resetSections(["heatmap"]);
      this.display();
    });
    const s = this.settings.settings.heatmap;
    const up = (mutate: (draft: typeof s) => void) =>
      this.settings.update("heatmap", (draft) => mutate(draft.heatmap));

    new Setting(el)
      .setName("Enable heatmap")
      .setDesc("Track which parts of your notes you actually read, and show the vertical attention strip beside each note.")
      .addToggle((toggle) => toggle.setValue(s.enabled).onChange((v) => void up((d) => { d.enabled = v; })));

    labeledSlider(el, {
      name: "Activity idle threshold", min: 10, max: 300, step: 5, value: s.idleSeconds, unit: " s",
      desc: "Tracking pauses after this period of inactivity.",
      onChange: (v) => up((d) => { d.idleSeconds = v; }),
    });

    labeledSlider(el, {
      name: "Resolution", min: 20, max: 200, step: 10, value: s.bucketCount, unit: " bands",
      desc: "Density of the vertical bands. Existing data is resampled, never lost.",
      onChange: (v) => up((d) => { d.bucketCount = v; }),
    });

    labeledSlider(el, { name: "Strip width", min: 8, max: 48, step: 2, value: s.width, unit: " px", onChange: (v) => up((d) => { d.width = v; }) });
    labeledSlider(el, { name: "Edge offset", min: 0, max: 50, step: 2, value: s.offsetRight, unit: " px", desc: "Spacing from the right pane border.", onChange: (v) => up((d) => { d.offsetRight = v; }) });
    labeledSlider(el, { name: "Strip opacity", min: 0.1, max: 1, step: 0.05, decimals: 2, value: s.opacity, onChange: (v) => up((d) => { d.opacity = v; }) });

    callout(el, "Desktop: hover the strip to see time spent, visits and coverage per section. Touch: the strip never intercepts scroll gestures.");

    /* ---- Analytics dashboard ---- */
    const toolsCard = el.createDiv({ cls: "frs-card" });
    toolsCard.createEl("h4", { text: "Analytics dashboard" });

    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const activeFile = activeView?.file ?? null;

    if (activeFile) {
      const rec = this.plugin.modules.heatmap.getRecord(activeFile.path);
      const grid = toolsCard.createDiv({ cls: "frs-stat-grid" });
      const stat = (label: string, value: string) => {
        const cell = grid.createDiv({ cls: "frs-stat-cell" });
        cell.createSpan({ text: label, cls: "frs-stat-label" });
        cell.createSpan({ text: value, cls: "frs-stat-value" });
      };
      if (rec) {
        const totalSec = Math.round(rec.totalTimeMs / 1000);
        stat("Active note", activeFile.name);
        stat("Time spent", `${Math.floor(totalSec / 60)}m ${String(totalSec % 60).padStart(2, "0")}s`);
        stat("Visits", String(rec.visits || 0));
        stat("Last accessed", rec.lastAccessed ? new Date(rec.lastAccessed).toLocaleDateString() : "Unknown");
      } else {
        stat("Active note", activeFile.name);
        stat("Time spent", "No data yet");
      }
      stat("Indexed notes", `${this.plugin.modules.heatmap.recordCount}`);
    } else {
      toolsCard.createEl("p", {
        cls: "frs-card-note",
        text: "Open a note in the editor to see its reading analytics.",
      });
    }

    /* ---- Maintenance ---- */
    toolsCard.createEl("h4", { text: "Maintenance", cls: "frs-subhead" });

    new Setting(toolsCard)
      .setName("Reset current note analytics")
      .setDesc("Permanently discard collected reading metrics for the active note.")
      .addButton((button) =>
        button.setButtonText("Reset note").setWarning().onClick(() => {
          this.plugin.modules.heatmap.clearCurrentNote();
          this.display();
        })
      );

    new Setting(toolsCard)
      .setName("Reset all analytics")
      .setDesc("Delete all historical engagement records across the entire vault.")
      .addButton((button) =>
        button.setButtonText("Reset database").setWarning().onClick(() => {
          new ConfirmModal(
            this.app,
            "Reset all reading analytics?",
            "This permanently deletes all reading engagement history for every note. This action cannot be undone.",
            "Delete everything",
            async () => {
              this.plugin.modules.heatmap.clearAll();
              new Notice("All vault reading metrics have been cleared.");
              this.display();
            }
          ).open();
        })
      );

    new Setting(toolsCard)
      .setName("Prune records for deleted notes")
      .setDesc("Remove analytics entries whose notes no longer exist in the vault.")
      .addButton((button) =>
        button.setButtonText("Prune deleted").onClick(() => {
          const removed = this.plugin.modules.heatmap.pruneDeleted();
          new Notice(removed.length > 0 ? `Pruned ${removed.length} record(s).` : "Nothing to prune.");
          this.display();
        })
      );

    const diag = toolsCard.createDiv({ cls: "frs-diag-row" });
    statusPill(diag, this.plugin.modules.heatmap.isTracking ? "Tracking active" : "Idle — paused", this.plugin.modules.heatmap.isTracking);
  }

  /* ------------------------------------------------------------------ */
  /* 7. Appearance                                                       */
  /* ------------------------------------------------------------------ */

  private renderAppearance(el: HTMLElement): void {
    sectionHeader(el, "Appearance", "One visual identity for every module.", async () => {
      await this.settings.resetSections(["appearance"]);
      this.display();
    });
    const s = this.settings.settings.appearance;
    const up = (mutate: (draft: typeof s) => void) =>
      this.settings.update("appearance", (draft) => mutate(draft.appearance));

    new Setting(el)
      .setName("Accent source")
      .setDesc("Native follows your Obsidian theme accent; custom lets you pick the suite's own accent (notch, progress bars, heatmap).")
      .addDropdown((dropdown) => {
        for (const [mode, label] of Object.entries(ACCENT_MODE_OPTIONS)) dropdown.addOption(mode, label);
        dropdown.setValue(s.accentMode).onChange(async (v) => {
          await up((d) => { d.accentMode = v as AccentMode; });
          this.display();
        });
      });

    if (s.accentMode === "custom") {
      new Setting(el)
        .setName("Custom accent color")
        .addColorPicker((picker) => picker.setValue(s.customAccent).onChange((v) => void up((d) => { d.customAccent = v; })));
    }

    labeledSlider(el, {
      name: "Widget scale", min: 0.8, max: 1.25, step: 0.05, decimals: 2, value: s.widgetScale,
      desc: "Size of the floating timer and the goal bar — handy on small phones.",
      onChange: (v) => up((d) => { d.widgetScale = v; }),
    });

    callout(el, "All modules read Obsidian theme variables (backgrounds, borders, text) so they match your theme automatically; only the accent is customizable.");
  }

  /* ------------------------------------------------------------------ */
  /* 8. Advanced                                                         */
  /* ------------------------------------------------------------------ */

  private renderAdvanced(el: HTMLElement): void {
    sectionHeader(el, "Advanced", "Diagnostics, migration and data management.");
    const adv = this.settings.settings.advanced;
    const up = (mutate: (draft: typeof adv) => void) =>
      this.settings.update("advanced", (draft) => mutate(draft.advanced));

    new Setting(el)
      .setName("Debug mode")
      .setDesc("Verbose tracing in the developer console.")
      .addToggle((toggle) => toggle.setValue(adv.debugMode).onChange((v) => void up((d) => { d.debugMode = v; })));

    labeledSlider(el, {
      name: "Analytics update interval", min: 250, max: 5000, step: 250, value: adv.refreshIntervalMs, unit: " ms",
      desc: "How often the heatmap re-measures the viewport. Lower = more responsive, higher = less work.",
      onChange: (v) => up((d) => { d.refreshIntervalMs = v; }),
    });

    /* ---- Migration card ---- */
    const migration: MigrationInfo | undefined = this.settings.raw.migration;
    const migCard = el.createDiv({ cls: "frs-card" });
    migCard.createEl("h4", { text: "Legacy plugin migration" });
    const state = migration?.state ?? "pending";
    migCard.createEl("p", {
      cls: "frs-card-note",
      text:
        state === "done"
          ? `Settings and data were migrated from: ${(migration?.sources ?? []).join(", ")}.`
          : state === "skipped"
            ? "No legacy plugin data was found (fresh install, or the old plugins never had data)."
            : "Migration has not run yet — it runs on the next plugin load.",
    });
    for (const note of migration?.notes ?? []) {
      migCard.createEl("p", { cls: "frs-card-note", text: note });
    }
    new Setting(migCard)
      .setName("Re-run migration")
      .setDesc(`Reads ${Object.values(LEGACY_PLUGIN_PATHS).map((p) => p.replace(".obsidian/plugins/", "")).join(", ")} and merges any settings found. Existing suite settings win for keys you've changed here.`)
      .addButton((button) =>
        button.setButtonText("Re-run").onClick(async () => {
          await this.plugin.rerunMigration();
          new Notice("Migration re-checked. Existing customized settings were preserved.");
          this.display();
        })
      );

    /* ---- Legacy plugin helper ---- */
    const legacyCard = el.createDiv({ cls: "frs-card" });
    legacyCard.createEl("h4", { text: "Legacy plugins" });
    const detected = this.plugin.detectLegacyPlugins();
    if (detected.length > 0) {
      legacyCard.createEl("p", {
        cls: "frs-card-note",
        text: `These legacy plugins are currently enabled: ${detected.join(", ")}. Running them together with the suite duplicates UI (two floating timers, two rulers). Disable them now?`,
      });
      new Setting(legacyCard)
        .setName("Disable legacy plugins")
        .addButton((button) =>
          button.setButtonText("Disable them").setWarning().onClick(async () => {
            const ok = await this.plugin.disableLegacyPlugins();
            new Notice(ok ? "Legacy plugins disabled." : "Could not disable them automatically — disable them in Settings → Community plugins.");
            this.display();
          })
        );
    } else {
      legacyCard.createEl("p", {
        cls: "frs-card-note",
        text: "No legacy Focus Read / Heatmap plugins are enabled. The old plugin folders and their data files were left untouched — you can remove them from .obsidian/plugins whenever you like.",
      });
    }

    /* ---- Danger zone ---- */
    const dangerCard = el.createDiv({ cls: "frs-card frs-card-danger" });
    dangerCard.createEl("h4", { text: "Reset" });
    new Setting(dangerCard)
      .setName("Reset all settings")
      .setDesc("Every section back to its defaults. Reading statistics and heatmap records are kept.")
      .addButton((button) =>
        button.setButtonText("Reset settings").setWarning().onClick(() => {
          new ConfirmModal(
            this.app,
            "Reset all settings?",
            "Every setting returns to its default value. Your statistics and heatmap records are not touched.",
            "Reset settings",
            async () => {
              await this.settings.resetSections([
                "general", "timer", "focus", "ruler", "typography", "heatmap", "appearance", "advanced",
              ]);
              new Notice("All settings were reset to defaults.");
              this.display();
            }
          ).open();
        })
      );
  }
}
