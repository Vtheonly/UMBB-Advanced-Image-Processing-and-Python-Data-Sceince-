/**
 * Focus Read: Typography & Ruler — plugin entry point.
 *
 * Responsibilities kept deliberately thin: load/normalize settings, own the
 * TypographyController + ReadingRuler subsystems, expose commands and the
 * settings tab, and guarantee full cleanup on unload.
 */

import { Notice, Plugin } from "obsidian";
import {
  TypographySettings,
  DEFAULT_SETTINGS,
  normalizeSettings,
  FONT_OPTIONS,
  RulerMode,
} from "./settings";
import { TypographyController } from "./typography";
import { ReadingRuler, RULER_BODY_CLASS } from "./ruler";
import { TypographySettingTab } from "./settings-tab";

export default class TypographyRulerPlugin extends Plugin {
  settings!: TypographySettings;
  private typography!: TypographyController;
  private ruler!: ReadingRuler;

  async onload(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());

    this.typography = new TypographyController(() => this.settings);
    this.ruler = new ReadingRuler(this.rulerHost());

    this.typography.apply();
    this.typography.applyGoogleFonts();
    if (this.settings.readingRulerEnabled) {
      this.ruler.mount();
    }

    this.addSettingTab(new TypographySettingTab(this.app, this));
    this.registerCommands();
  }

  async onunload(): Promise<void> {
    this.ruler.destroy();
    this.typography.destroy();
    document.body.classList.remove(RULER_BODY_CLASS);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** Wires the ruler to this plugin's lifecycle-managed registrations. */
  private rulerHost() {
    return {
      settings: this.settings,
      saveSettings: () => this.saveSettings(),
      // Delegate to the plugin base class so every listener the ruler
      // registers is cleaned up automatically on unload.
      registerDomEvent: (el: any, type: any, callback: any, options?: any) =>
        (this.registerDomEvent as any)(el, type, callback, options),
    };
  }

  private registerCommands(): void {
    this.addCommand({
      id: "toggle-typography",
      name: "Toggle typography",
      callback: async () => {
        this.settings.typographyEnabled = !this.settings.typographyEnabled;
        await this.saveSettings();
        this.typography.apply();
      },
    });

    this.addCommand({
      id: "toggle-ruler",
      name: "Toggle reading ruler",
      callback: async () => {
        this.settings.readingRulerEnabled = !this.settings.readingRulerEnabled;
        await this.saveSettings();
        this.ruler.applyVisibility();
        new Notice(`Reading ruler: ${this.settings.readingRulerEnabled ? "ON" : "OFF"}`);
      },
    });

    this.addCommand({
      id: "center-ruler",
      name: "Center reading ruler",
      callback: () => {
        this.ensureRulerVisible();
        this.ruler.center();
      },
    });

    this.addCommand({
      id: "ruler-up",
      name: "Move reading ruler up",
      callback: () => {
        this.ensureRulerVisible();
        this.ruler.nudge(-1);
      },
    });

    this.addCommand({
      id: "ruler-down",
      name: "Move reading ruler down",
      callback: () => {
        this.ensureRulerVisible();
        this.ruler.nudge(1);
      },
    });
  }

  private ensureRulerVisible(): void {
    if (!this.settings.readingRulerEnabled) {
      this.settings.readingRulerEnabled = true;
      void this.saveSettings();
    }
    this.ruler.applyVisibility();
  }

  /** Called by the settings tab after any relevant setting changed. */
  refreshAll(changed: Partial<TypographySettings>): void {
    if (
      changed.readingRulerHeight !== undefined ||
      changed.readingRulerColor !== undefined ||
      changed.readingRulerOpacity !== undefined
    ) {
      this.ruler.applyConfig();
    }
    if (changed.readingRulerMode !== undefined) {
      this.ruler.applyPosition();
    }
    if (
      changed.fontFamily !== undefined ||
      changed.customFontFamily !== undefined ||
      changed.loadGoogleFonts !== undefined
    ) {
      this.typography.applyGoogleFonts();
    }
    this.typography.apply();
  }
}

export { DEFAULT_SETTINGS, FONT_OPTIONS };
export type { RulerMode };
