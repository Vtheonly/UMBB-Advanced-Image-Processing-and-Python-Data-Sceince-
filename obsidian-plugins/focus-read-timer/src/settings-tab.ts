/**
 * Focus Read: Timer & Nudge — settings tab.
 */

import { PluginSettingTab, Setting } from "obsidian";
import FocusReadTimerPlugin from "./main";
import { TimerSettings } from "./settings";

type SliderKey = {
  [K in keyof TimerSettings]: TimerSettings[K] extends number ? K : never;
}[keyof TimerSettings];

export class TimerSettingTab extends PluginSettingTab {
  private plugin: FocusReadTimerPlugin;

  constructor(app: any, plugin: FocusReadTimerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    this.section("Floating focus timer");

    this.toggle("Enable floating timer", "Show the floating timer box (drag it by its top handle).", "timerEnabled", () => this.plugin.applyTimerVisibility());
    this.slider("Work minutes", 5, 90, 1, "timerWorkMinutes");
    this.slider("Break minutes", 1, 30, 1, "timerBreakMinutes");
    this.toggle("Auto-hide timer", "Dim the timer box when idle.", "timerAutoHide");
    this.slider("Auto-hide after (s)", 1, 30, 1, "timerAutoHideSeconds");
    this.toggle("Pause on window blur", "Pause when Obsidian loses focus or is hidden.", "timerPauseOnBlur");

    this.section("Focus detection");

    this.toggle("Enable focus detection", "Only accumulate focus time while you are actively reading.", "focusDetectionEnabled");
    this.slider("Idle seconds", 10, 300, 5, "focusDetectionIdleSeconds");

    this.section("Idle nudge");

    this.toggle("Enable idle nudge", "Pop a reminder when you stop reading (works even without a running timer).", "nudgeEnabled");
    this.slider("Idle threshold (s)", 10, 300, 5, "nudgeIdleSeconds");
    this.toggle("Don't count scroll as activity", "Recommended ON — scrolling while reading shouldn't reset the idle timer.", "nudgeIgnoreScroll");

    this.section("Daily goal bar");

    this.toggle("Enable daily goal bar", "Bottom bar showing today's reading vs goal (works independently of the timer).", "dopamineEnabled", () => this.plugin.applyDopamineVisibility());
    this.slider("Daily goal (minutes)", 5, 240, 5, "dopamineDailyGoalMinutes", () => this.plugin.applyDopamineVisibility());

    containerEl.createEl("p", {
      cls: "fr-setting-hint",
      text: 'Drag the timer by its top header bar (the strip labeled "Reading Timer" with the ⠿ grip icons). The position is kept inside the screen automatically — including after switching between desktop and mobile. Use the command palette → "Reset timer position" to snap it back to the top-right corner.',
    });
  }

  private section(title: string): void {
    this.containerEl.createEl("h2", { text: title });
  }

  private toggle(name: string, desc: string, key: ToggleKey, after?: () => void): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(desc)
      .addToggle((toggle) =>
        toggle.setValue(Boolean(this.plugin.settings[key])).onChange(async (v) => {
          (this.plugin.settings as any)[key] = v;
          await this.plugin.persist();
          after?.();
        })
      );
  }

  private slider(name: string, min: number, max: number, step: number, key: SliderKey, after?: () => void): void {
    new Setting(this.containerEl)
      .setName(name)
      .addSlider((slider) =>
        slider
          .setLimits(min, max, step)
          .setValue(Number(this.plugin.settings[key]))
          .setDynamicTooltip()
          .onChange(async (v) => {
            (this.plugin.settings as any)[key] = v;
            await this.plugin.persist();
            after?.();
          })
      );
  }
}

type ToggleKey = {
  [K in keyof TimerSettings]: TimerSettings[K] extends boolean ? K : never;
}[keyof TimerSettings];
