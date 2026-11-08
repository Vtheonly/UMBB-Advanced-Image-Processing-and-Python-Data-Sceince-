/**
 * Focus Read — unified settings tab.
 *
 * One screen controls every module of the plugin:
 *   1. Floating focus timer
 *   2. Focus detection
 *   3. Idle nudge
 *   4. Daily goal bar
 *   5. Typography (integrated from the legacy plugin)
 *   6. Reading ruler (integrated from the legacy plugin)
 *
 * Every control is wired to the plugin's apply* methods so changing it has
 * an immediate, visible effect — including the ruler enable toggle and the
 * ruler position reset, which in the legacy plugin saved the value but never
 * reached the ruler itself.
 */

import { PluginSettingTab, Setting } from "obsidian";
import FocusReadTimerPlugin from "./main";
import { TimerSettings } from "./settings";
import {
  TypographySettings,
  FONT_OPTIONS,
  RulerMode,
  sanitizeFontStack,
} from "./typography-settings";

const RULER_MODE_OPTIONS: Record<RulerMode, string> = {
  auto: "Auto (follow on desktop, drag on touch)",
  follow: "Follow pointer (desktop)",
  manual: "Manual — drag the handle",
};

type SliderKey = {
  [K in keyof TimerSettings]: TimerSettings[K] extends number ? K : never;
}[keyof TimerSettings];

type ToggleKey = {
  [K in keyof TimerSettings]: TimerSettings[K] extends boolean ? K : never;
}[keyof TimerSettings];

type TypographySliderKey = {
  [K in keyof TypographySettings]: TypographySettings[K] extends number ? K : never;
}[keyof TypographySettings];

type TypographyToggleKey = {
  [K in keyof TypographySettings]: TypographySettings[K] extends boolean ? K : never;
}[keyof TypographySettings];

export class FocusReadSettingTab extends PluginSettingTab {
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

    /* ---------------- Typography (legacy plugin, integrated) ---------------- */

    this.section("Typography");

    this.typographyToggle("Enable typography", "Apply font, size, line height and max width to reading and editing views.", "typographyEnabled", () => this.plugin.applyTypography());

    new Setting(containerEl)
      .setName("Reading font")
      .setDesc("Applied on top of your theme when typography is enabled.")
      .addDropdown((dropdown) => {
        for (const option of FONT_OPTIONS) {
          dropdown.addOption(option.id, option.label);
        }
        dropdown
          .setValue(this.plugin.typographySettings.fontFamily)
          .onChange(async (v) => {
            this.plugin.typographySettings.fontFamily = v;
            await this.plugin.persist();
            this.plugin.applyGoogleFonts();
            this.plugin.applyTypography();
            this.display(); // show/hide the custom font stack field
          });
      });

    if (this.plugin.typographySettings.fontFamily === "custom") {
      new Setting(containerEl)
        .setName("Custom font stack")
        .setDesc("CSS font-family value, e.g. Georgia, 'Times New Roman', serif")
        .addText((text) =>
          text
            .setValue(this.plugin.typographySettings.customFontFamily)
            .onChange(async (v) => {
              // Sanitize at write time: the stored value must always be a
              // valid font stack (no CSS rule-breaking characters).
              this.plugin.typographySettings.customFontFamily = sanitizeFontStack(v);
              await this.plugin.persist();
              this.plugin.applyTypography();
            })
        );
    }

    this.typographyToggle("Load Google Fonts", "Download the selected font from Google Fonts (requires internet). Only the selected family is loaded.", "loadGoogleFonts", () => this.plugin.applyGoogleFonts());

    this.typographySlider("Font size (px)", 13, 26, 1, "fontSize", () => this.plugin.applyTypography());
    this.typographySlider("Line height", 1.2, 2.2, 0.05, "lineHeight", () => this.plugin.applyTypography());
    this.typographySlider("Paragraph spacing", 1, 2.5, 0.1, "paragraphSpacing", () => this.plugin.applyTypography());
    this.typographySlider("Max line width (chars)", 40, 120, 1, "maxWidthChars", () => this.plugin.applyTypography());

    /* ---------------- Reading ruler (legacy plugin, integrated) ---------------- */

    this.section("Reading ruler");

    this.typographyToggle("Enable reading ruler", "A horizontal highlight band over the note. Drag the round handle on its right edge to position it (works with mouse and touch).", "readingRulerEnabled", () => this.plugin.applyRulerVisibility());

    new Setting(containerEl)
      .setName("Ruler interaction mode")
      .setDesc(
        "Follow: the band tracks your mouse. Manual: the band stays where you drag it — recommended on touch devices."
      )
      .addDropdown((dropdown) => {
        for (const [mode, label] of Object.entries(RULER_MODE_OPTIONS)) {
          dropdown.addOption(mode, label);
        }
        dropdown
          .setValue(this.plugin.typographySettings.readingRulerMode)
          .onChange(async (v) => {
            this.plugin.typographySettings.readingRulerMode = v as RulerMode;
            await this.plugin.persist();
            this.plugin.applyRulerPosition();
          });
      });

    this.typographySlider("Ruler height (px)", 10, 80, 1, "readingRulerHeight", () => this.plugin.applyRulerConfig());
    this.typographySlider("Ruler opacity", 0.05, 0.9, 0.01, "readingRulerOpacity", () => this.plugin.applyRulerConfig());

    new Setting(containerEl)
      .setName("Ruler color")
      .addColorPicker((picker) =>
        picker.setValue(this.plugin.typographySettings.readingRulerColor).onChange(async (v) => {
          this.plugin.typographySettings.readingRulerColor = v;
          await this.plugin.persist();
          this.plugin.applyRulerConfig();
        })
      );

    new Setting(containerEl)
      .setName("Reset ruler position")
      .setDesc("Put the ruler back at its default height (slightly above the middle).")
      .addButton((button) =>
        button.setButtonText("Reset position").onClick(async () => {
          await this.plugin.resetRulerPosition();
        })
      );

    containerEl.createEl("p", {
      cls: "frt-setting-hint",
      text: 'Tip: double-tap (or double-click) the ruler\'s handle to center it. The position is remembered per screen size, and the "Move reading ruler up/down" commands work from the command palette.',
    });
  }

  private section(title: string): void {
    this.containerEl.createEl("h2", { text: title });
  }

  /* ---------- Timer-module controls ---------- */

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

  /* ---------- Typography & ruler controls ---------- */

  private typographyToggle(name: string, desc: string, key: TypographyToggleKey, after?: () => void): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(desc)
      .addToggle((toggle) =>
        toggle.setValue(Boolean(this.plugin.typographySettings[key])).onChange(async (v) => {
          (this.plugin.typographySettings as any)[key] = v;
          await this.plugin.persist();
          after?.();
        })
      );
  }

  private typographySlider(name: string, min: number, max: number, step: number, key: TypographySliderKey, after?: () => void): void {
    new Setting(this.containerEl)
      .setName(name)
      .addSlider((slider) =>
        slider
          .setLimits(min, max, step)
          .setValue(Number(this.plugin.typographySettings[key]))
          .setDynamicTooltip()
          .onChange(async (v) => {
            (this.plugin.typographySettings as any)[key] = v;
            await this.plugin.persist();
            after?.();
          })
      );
  }
}
