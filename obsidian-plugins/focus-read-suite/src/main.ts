/**
 * Focus Read Suite — plugin entry point.
 *
 * One plugin containing the three former products as integrated modules:
 *
 *   • Focus Read Timer        (modules/timer)
 *   • Notch & Reading Focus   (modules/focus) — the yellow ruler + notch
 *   • Typography              (modules/typography)
 *   • Heat Map of Notes       (modules/heatmap)
 *
 * The entry point stays deliberately thin: it owns the settings manager,
 * the migration service, the lifecycle hub and the module registry, then
 * delegates all behavior to the modules. Settings changes are dispatched
 * to the owning module immediately, so every setting is live.
 */

import { Notice, normalizePath, Plugin } from "obsidian";
import { logger } from "./core/logger";
import { SettingsManager, PersistedPayload } from "./core/settings-manager";
import { MigrationService, MigrationInfo } from "./core/migration";
import { LifecycleHub } from "./core/lifecycle";
import { SectionId } from "./core/settings-schema";
import { ModuleContext, FocusSuiteModule } from "./modules/module";
import { TimerModule } from "./modules/timer/TimerModule";
import { ReadingFocusModule } from "./modules/focus/ReadingFocusModule";
import { TypographyModule } from "./modules/typography/TypographyModule";
import { HeatmapModule } from "./modules/heatmap/HeatmapModule";
import { FocusSuiteSettingTab } from "./ui/settings-tab";

/** Legacy plugin ids this suite replaces. */
const LEGACY_PLUGIN_IDS = ["focus-read-timer", "focus-read-typography", "heatmap-of-notes"];

export default class FocusReadSuitePlugin extends Plugin {
  settings!: SettingsManager;
  private lifecycle!: LifecycleHub;
  private migration!: MigrationService;

  readonly modules: {
    timer: TimerModule;
    focus: ReadingFocusModule;
    typography: TypographyModule;
    heatmap: HeatmapModule;
  };

  private unsubscribeSettings: (() => void) | null = null;

  constructor(app: any, manifest: any) {
    super(app, manifest);
    this.modules = {
      timer: new TimerModule(),
      focus: new ReadingFocusModule(),
      typography: new TypographyModule(),
      heatmap: new HeatmapModule(),
    };
  }

  /* ------------------------------------------------------------------ */
  /* Lifecycle                                                           */
  /* ------------------------------------------------------------------ */

  async onload(): Promise<void> {
    logger.info("Loading Focus Read Suite…");

    this.settings = new SettingsManager({
      loadData: () => this.loadData(),
      saveData: (data) => this.saveData(data),
    });

    this.migration = new MigrationService({
      readJson: (path) => this.readLegacyJson(path),
    });

    // Load → migrate (once) → normalize → keep extras (stats, records).
    await this.settings.load(async (raw) => {
      const wasSettled =
        raw?.migration?.state === "done" || raw?.migration?.state === "skipped";
      const migrated = await this.migration.migrate(raw as PersistedPayload | null);
      // Announce only when the migration actually ran NOW (not on re-boots).
      if (!wasSettled && migrated.migration?.state === "done") {
        const sources = migrated.migration.sources ?? [];
        new Notice(
          `Focus Read Suite: migrated your settings from ${sources.length} plugin${sources.length === 1 ? "" : "s"} (${sources.join(", ")}).`
        );
      }
      return migrated;
    });

    logger.setDebug(this.settings.settings.advanced.debugMode);

    this.lifecycle = new LifecycleHub({
      registerDomEvent: (el, type, cb, options) =>
        (this.registerDomEvent as any)(el, type, cb, options),
      registerInterval: (id) => this.registerInterval(id),
      registerEvent: (ref) => this.registerEvent(ref),
      register: (cb) => this.register(cb),
    });

    /* ----- Shared appearance (accent, widget scale) ----- */

    this.applyAppearance();
    this.lifecycle.onUnload(() => this.clearAppearance());

    /* ----- Modules ----- */

    const ctx: ModuleContext = {
      app: this.app,
      settings: this.settings,
      lifecycle: this.lifecycle,
      isMobile: (this.app as any).isMobile === true,
      addCommand: (command) => this.addCommand(command as any),
    };

    for (const module of this.moduleList()) {
      try {
        await module.load(ctx);
      } catch (err) {
        logger.error(`Module "${module.name}" failed to load.`, err);
        new Notice(`Focus Read Suite: the ${module.name} module failed to load (see console).`);
      }
    }

    /* ----- Settings change dispatch ----- */

    this.unsubscribeSettings = this.settings.subscribe((changed) => {
      this.dispatchSettingsChange(changed);
    });

    /* ----- Suite-level commands + settings tab ----- */

    this.addCommand({
      id: "open-settings",
      name: "Open Focus Read Suite settings",
      callback: () => this.openSettings(),
    });
    this.addCommand({
      id: "disable-legacy-plugins",
      name: "Disable the legacy Focus Read / Heatmap plugins",
      callback: () => void this.disableLegacyPlugins(),
    });

    this.addSettingTab(new FocusSuiteSettingTab(this.app, this));

    logger.info("Focus Read Suite loaded.");
  }

  async onunload(): Promise<void> {
    logger.info("Unloading Focus Read Suite…");

    this.unsubscribeSettings?.();
    this.unsubscribeSettings = null;

    // Unload modules in reverse order.
    const list = this.moduleList();
    for (const module of [...list].reverse()) {
      try {
        await module.unload();
      } catch (err) {
        logger.error(`Module "${module.name}" failed to unload cleanly.`, err);
      }
    }

    this.clearAppearance();
    await this.settings.persist(true);
    logger.info("Focus Read Suite unloaded.");
  }

  private moduleList(): FocusSuiteModule[] {
    return [this.modules.timer, this.modules.focus, this.modules.typography, this.modules.heatmap];
  }

  /* ------------------------------------------------------------------ */
  /* Settings dispatch                                                   */
  /* ------------------------------------------------------------------ */

  private dispatchSettingsChange(changed: SectionId[]): void {
    for (const module of this.moduleList()) {
      if (changed.some((section) => module.sections().includes(section))) {
        try {
          module.onSettingsChanged(changed);
        } catch (err) {
          logger.error(`Module "${module.name}" failed to apply settings change.`, err);
        }
      }
    }

    if (changed.includes("appearance")) this.applyAppearance();
    if (changed.includes("advanced")) {
      logger.setDebug(this.settings.settings.advanced.debugMode);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Appearance                                                          */
  /* ------------------------------------------------------------------ */

  /** Writes the shared accent + widget scale into CSS variables. */
  private applyAppearance(): void {
    const { appearance } = this.settings.settings;
    const rootStyle = document.documentElement.style;
    if (appearance.accentMode === "custom") {
      rootStyle.setProperty("--frs-accent", appearance.customAccent);
    } else {
      rootStyle.removeProperty("--frs-accent");
    }
    rootStyle.setProperty("--frs-widget-scale", String(appearance.widgetScale));
  }

  private clearAppearance(): void {
    const rootStyle = document.documentElement.style;
    rootStyle.removeProperty("--frs-accent");
    rootStyle.removeProperty("--frs-widget-scale");
  }

  /* ------------------------------------------------------------------ */
  /* Legacy plugin interop                                               */
  /* ------------------------------------------------------------------ */

  /** Reads a legacy plugin's data.json (vault-relative), or null. */
  private async readLegacyJson(path: string): Promise<any | null> {
    try {
      const adapter = (this.app as any).vault?.adapter;
      if (!adapter?.exists || !adapter?.read) return null;
      const normalized = normalizePath(path);
      if (!(await adapter.exists(normalized))) return null;
      const text = await adapter.read(normalized);
      return JSON.parse(text);
    } catch (err) {
      logger.warn(`Could not read legacy data at ${path}.`, err);
      return null;
    }
  }

  /** Legacy plugins that are currently enabled (empty when none). */
  detectLegacyPlugins(): string[] {
    try {
      const plugins = (this.app as any).plugins;
      const enabled: Set<string> | undefined = plugins?.enabledPlugins;
      if (enabled instanceof Set) {
        return LEGACY_PLUGIN_IDS.filter((id) => enabled.has(id));
      }
    } catch {
      /* internal API unavailable */
    }
    return [];
  }

  /** Disables the legacy plugins through Obsidian's plugin manager. */
  async disableLegacyPlugins(): Promise<boolean> {
    const detected = this.detectLegacyPlugins();
    if (detected.length === 0) {
      new Notice("No legacy plugins are enabled.");
      return true;
    }
    try {
      const plugins = (this.app as any).plugins;
      if (typeof plugins?.disablePlugin === "function") {
        for (const id of detected) {
          await plugins.disablePlugin(id);
        }
        new Notice(`Disabled: ${detected.join(", ")}`);
        return true;
      }
      const commands = (this.app as any).commands;
      if (typeof commands?.executeCommandById === "function") {
        for (const id of detected) {
          commands.executeCommandById(`app:disable-plugin:${id}`);
        }
        new Notice(`Disabled: ${detected.join(", ")}`);
        return true;
      }
    } catch (err) {
      logger.warn("Automatic disable failed.", err);
    }
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* Migration re-run (Advanced settings)                                */
  /* ------------------------------------------------------------------ */

  /**
   * Re-runs the legacy mapping and merges it UNDER the current settings
   * (keys the user has changed in the suite win; only missing keys are
   * filled from legacy data). Stats/records are never overwritten.
   */
  async rerunMigration(): Promise<MigrationInfo | undefined> {
    const raw = this.settings.raw as PersistedPayload;
    // Clear the marker so migrate() actually runs.
    const reset: PersistedPayload = { ...raw, migration: { state: "pending" as const } };
    const migrated = await this.migration.migrate(reset, true);

    // Merge: existing suite settings win over legacy re-reads.
    const mergedSettings = { ...(migrated.settings ?? {}) };
    for (const key of Object.keys(this.settings.settings) as SectionId[]) {
      (mergedSettings as Record<string, any>)[key] = (this.settings.settings as any)[key];
    }

    const info = migrated.migration as MigrationInfo;
    await this.settings.setExtra("migration", info, true);
    await this.settings.replaceAllSettings(mergedSettings);
    return info;
  }

  /* ------------------------------------------------------------------ */
  /* Misc                                                                */
  /* ------------------------------------------------------------------ */

  private openSettings(): void {
    try {
      const setting = (this.app as any).setting;
      setting?.open?.();
      setting?.openTabById?.(this.manifest.id);
    } catch {
      new Notice("Open Settings → Community plugins → Focus Read Suite.");
    }
  }
}
