/**
 * Focus Read: Typography & Ruler — settings tab.
 */

import { PluginSettingTab, Setting } from "obsidian";
import TypographyRulerPlugin from "./main";
import { FONT_OPTIONS, RulerMode } from "./settings";

const RULER_MODE_OPTIONS: Record<RulerMode, string> = {
  auto: "Auto (follow on desktop, drag on touch)",
  follow: "Follow pointer (desktop)",
  manual: "Manual — drag the handle",
};

export class TypographySettingTab extends PluginSettingTab {
  private plugin: TypographyRulerPlugin;

  constructor(app: any, plugin: TypographyRulerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    this.section("Typography");

    new Setting(containerEl)
      .setName("Enable typography")
      .setDesc("Apply font, size, line height and max width to reading and editing views.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.typographyEnabled).onChange(async (v) => {
          this.plugin.settings.typographyEnabled = v;
          await this.plugin.saveSettings();
          this.plugin.refreshAll({ typographyEnabled: v });
        })
      );

    new Setting(containerEl)
      .setName("Reading font")
      .setDesc("Applied on top of your theme when typography is enabled.")
      .addDropdown((dropdown) => {
        for (const option of FONT_OPTIONS) {
          dropdown.addOption(option.id, option.label);
        }
        dropdown
          .setValue(this.plugin.settings.fontFamily)
          .onChange(async (v) => {
            this.plugin.settings.fontFamily = v;
            await this.plugin.saveSettings();
            this.plugin.refreshAll({ fontFamily: v });
            this.display();
          });
      });

    if (this.plugin.settings.fontFamily === "custom") {
      new Setting(containerEl)
        .setName("Custom font stack")
        .setDesc("CSS font-family value, e.g. Georgia, 'Times New Roman', serif")
        .addText((text) =>
          text
            .setValue(this.plugin.settings.customFontFamily)
            .onChange(async (v) => {
              this.plugin.settings.customFontFamily = v;
              await this.plugin.saveSettings();
              this.plugin.refreshAll({ customFontFamily: v });
            })
        );
    }

    new Setting(containerEl)
      .setName("Load Google Fonts")
      .setDesc("Download the selected font from Google Fonts (requires internet). Only the selected family is loaded.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.loadGoogleFonts).onChange(async (v) => {
          this.plugin.settings.loadGoogleFonts = v;
          await this.plugin.saveSettings();
          this.plugin.refreshAll({ loadGoogleFonts: v });
        })
      );

    this.slider("Font size (px)", 13, 26, 1, "fontSize");
    this.slider("Line height", 1.2, 2.2, 0.05, "lineHeight");
    this.slider("Paragraph spacing", 1, 2.5, 0.1, "paragraphSpacing");
    this.slider("Max line width (chars)", 40, 120, 1, "maxWidthChars");

    this.section("Reading ruler");

    new Setting(containerEl)
      .setName("Enable reading ruler")
      .setDesc(
        "A horizontal highlight band over the note. Drag the round handle on its right edge to position it (works with mouse and touch)."
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.readingRulerEnabled).onChange(async (v) => {
          this.plugin.settings.readingRulerEnabled = v;
          await this.plugin.saveSettings();
          this.plugin.refreshAll({ readingRulerEnabled: v });
        })
      );

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
          .setValue(this.plugin.settings.readingRulerMode)
          .onChange(async (v) => {
            this.plugin.settings.readingRulerMode = v as RulerMode;
            await this.plugin.saveSettings();
            this.plugin.refreshAll({ readingRulerMode: v as RulerMode });
          });
      });

    this.slider("Ruler height (px)", 10, 80, 1, "readingRulerHeight");
    this.slider("Ruler opacity", 0.05, 0.9, 0.01, "readingRulerOpacity");

    new Setting(containerEl)
      .setName("Ruler color")
      .addColorPicker((picker) =>
        picker.setValue(this.plugin.settings.readingRulerColor).onChange(async (v) => {
          this.plugin.settings.readingRulerColor = v;
          await this.plugin.saveSettings();
          this.plugin.refreshAll({ readingRulerColor: v });
        })
      );

    new Setting(containerEl)
      .setName("Reset ruler position")
      .setDesc("Put the ruler back at its default height (slightly above the middle).")
      .addButton((button) =>
        button.setButtonText("Reset position").onClick(async () => {
          this.plugin.settings.readingRulerPositionRatio = null;
          await this.plugin.saveSettings();
          this.plugin.refreshAll({ readingRulerPositionRatio: null });
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

  private slider(
    name: string,
    min: number,
    max: number,
    step: number,
    key: keyof TypographySliderKeys
  ): void {
    const value = this.plugin.settings[key];
    new Setting(this.containerEl)
      .setName(name)
      .addSlider((slider) =>
        slider
          .setLimits(min, max, step)
          .setValue(value)
          .setDynamicTooltip()
          .onChange(async (v) => {
            this.plugin.settings[key] = v;
            await this.plugin.saveSettings();
            this.plugin.refreshAll({ [key]: v } as any);
          })
      );
  }
}

type TypographySliderKeys = {
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  maxWidthChars: number;
  readingRulerHeight: number;
  readingRulerOpacity: number;
};
