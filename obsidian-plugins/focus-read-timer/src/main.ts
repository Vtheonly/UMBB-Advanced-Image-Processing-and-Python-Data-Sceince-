/**
 * Focus Read (main plugin) — entry point.
 *
 * The all-in-one Focus Read suite. It began as "Focus Read: Timer & Nudge"
 * (a single 890-line class mixing timer state, DOM rendering, drag handling,
 * stats persistence and the nudge system) and now also integrates the
 * complete "Typography & Ruler" functionality that previously lived in a
 * separate standalone plugin (recovered from the vault's git history,
 * commit 1f79343). One plugin, one settings screen, one data file:
 *
 *   - Floating focus timer (Pomodoro) with pause-on-blur and auto-hide
 *   - Focus detection & reading-time stats (streaks, per-day history)
 *   - ADHD idle nudge with snooze
 *   - Daily goal (dopamine) bar
 *   - Reading typography (font, size, line height, max width)
 *   - The yellow reading ruler (pointer follow on desktop, drag on mobile)
 *
 * The plugin id stays `focus-read-timer` so existing vaults keep their
 * enabled-state and data.json. On first load after the merge, the
 * typography/ruler settings are migrated from the legacy standalone
 * plugin's data file (see loadTypographySettings).
 *
 * Lifecycle management is strictly done through Obsidian's
 * registerInterval / registerDomEvent / registerEvent APIs; every module
 * cleans up after itself in onunload().
 */

import { Notice, Plugin } from "obsidian";
import { TimerSettings, normalizeSettings } from "./settings";
import { FocusTimer, TimerSnapshot } from "./timer";
import { ReadingStats, normalizeStats, ReadingStatsTracker } from "./stats";
import { TimerWidget, TimerControlAction } from "./widget";
import { NudgeController } from "./nudge";
import { DopamineBar } from "./dopamine";
import { FocusReadSettingTab } from "./settings-tab";
import {
  TypographySettings,
  normalizeTypographySettings,
} from "./typography-settings";
import { TypographyController } from "./typography";
import { ReadingRuler, RULER_BODY_CLASS } from "./ruler";

interface PersistedData {
  settings?: Partial<TimerSettings>;
  stats?: Partial<ReadingStats>;
  /** Typography & ruler section (merged in from the legacy plugin). */
  typography?: Partial<TypographySettings>;
}

/** Where the legacy standalone plugin stored its settings. */
const LEGACY_TYPOGRAPHY_PLUGIN_DIR = "focus-read-typography";

export default class FocusReadTimerPlugin extends Plugin {
  settings!: TimerSettings;
  stats!: ReadingStats;
  typographySettings!: TypographySettings;

  private timer!: FocusTimer;
  private widget!: TimerWidget;
  private statsTracker!: ReadingStatsTracker;
  private nudge!: NudgeController;
  private dopamine!: DopamineBar;
  private typography!: TypographyController;
  private ruler!: ReadingRuler;

  /* Activity tracking */
  private lastActivityAt = 0;
  private lastInputActivityAt = 0;
  private windowFocused = true;

  async onload(): Promise<void> {
    const data: PersistedData = (await this.loadData()) ?? {};
    this.settings = normalizeSettings(data.settings);
    this.stats = normalizeStats(data.stats);
    const migratedTypography = await this.loadTypographySettings(data);

    this.lastActivityAt = Date.now();
    this.lastInputActivityAt = Date.now();

    /* ----- Subsystems ----- */

    this.statsTracker = new ReadingStatsTracker({
      getStats: () => this.stats,
      persist: () => void this.persist(),
    });
    this.statsTracker.rollOver();

    this.widget = new TimerWidget({
      getSettings: () => this.settings,
      onControl: (action) => this.handleControl(action),
      registerDomElement: (el, type, cb, options) =>
        (this.registerDomEvent as any)(el, type, cb, options),
      savePosition: (x, y) => {
        this.settings.timerPositionX = x;
        this.settings.timerPositionY = y;
        void this.persist();
      },
    });

    this.timer = new FocusTimer({
      getSettings: () => this.settings,
      isUserFocused: () => this.isUserFocused(),
      onSnapshot: (snap) => this.onTimerSnapshot(snap),
      onWorkComplete: (focusMs) => this.onWorkComplete(focusMs),
      onBreakComplete: () => {
        new Notice("Break over. Ready for another session?");
      },
    });

    this.nudge = new NudgeController(
      {
        registerDomElement: (el, type, cb, options) =>
          (this.registerDomEvent as any)(el, type, cb, options),
        getWorkRemainingMs: () =>
          this.timer.phase === "work" && this.timer.running ? this.timer.remainingMs : null,
        onContinue: () => this.widget.poke(),
      },
      () => this.settings.nudgeIdleSeconds * 1000
    );

    this.dopamine = new DopamineBar();

    this.typography = new TypographyController(() => this.typographySettings);
    // The ruler's host object holds a live reference to typographySettings;
    // it is never reassigned after this point, so the ruler always sees the
    // current values.
    this.ruler = new ReadingRuler({
      settings: this.typographySettings,
      saveSettings: () => this.persist(),
      registerDomEvent: (el, type, cb, options) =>
        (this.registerDomEvent as any)(el, type, cb, options),
    });

    /* ----- DOM ----- */

    this.widget.mount();
    this.dopamine.mount();
    this.widget.render(this.timer.snapshot);
    this.dopamine.applyVisibility(this.settings.dopamineEnabled);
    if (this.settings.dopamineEnabled) {
      this.dopamine.render(this.statsTracker.todayMinutes(), this.settings.dopamineDailyGoalMinutes);
    }

    this.typography.apply();
    this.typography.applyGoogleFonts();
    if (this.typographySettings.readingRulerEnabled) {
      this.ruler.mount();
    }

    /* ----- Global listeners (all auto-cleaned by Obsidian on unload) ----- */

    // Activity detection: pointerdown/pointermove cover mouse + touch + pen.
    this.registerDomEvent(window, "pointermove", () => this.onActivity(false), { passive: true });
    this.registerDomEvent(window, "keydown", () => this.onActivity(true), { passive: true });
    this.registerDomEvent(window, "scroll", () => this.onActivity(!this.settings.nudgeIgnoreScroll), { passive: true });
    this.registerDomEvent(window, "pointerdown", () => this.onActivity(true), { passive: true });

    this.registerDomEvent(window, "blur", () => {
      this.windowFocused = false;
      if (this.settings.timerPauseOnBlur && this.timer.running) {
        this.timer.pause();
        new Notice("Paused: window lost focus");
      }
    });
    this.registerDomEvent(window, "focus", () => {
      this.windowFocused = true;
      this.onActivity(true);
    });
    // NOTE: registered via registerDomEvent — the original used a raw
    // document.addEventListener that was never removed (memory leak).
    this.registerDomEvent(document, "visibilitychange", () => {
      if (document.hidden) {
        if (this.settings.timerPauseOnBlur && this.timer.running) {
          this.timer.pause();
          new Notice("Paused: tab hidden");
        }
      } else {
        this.windowFocused = true;
        this.onActivity(true);
      }
    });

    // Keep the widget inside the viewport across resizes/orientation flips.
    const reflowWidget = () => this.widget.reflow();
    this.registerDomEvent(window, "resize", reflowWidget);
    this.registerDomEvent(window, "orientationchange", reflowWidget);
    if (window.visualViewport) {
      (this.registerDomEvent as any)(window.visualViewport, "resize", reflowWidget);
    }

    /* ----- Periodic work ----- */

    this.registerInterval(window.setInterval(() => this.nudge.checkIdle(), 5000));
    this.registerInterval(window.setInterval(() => this.flushReadingTime(), 30_000));
    this.registerInterval(window.setInterval(() => {
      if (this.settings.dopamineEnabled) {
        this.dopamine.render(this.statsTracker.todayMinutes(), this.settings.dopamineDailyGoalMinutes);
      }
    }, 5000));

    this.addSettingTab(new FocusReadSettingTab(this.app, this));
    this.registerCommands();

    // Persist right away when the typography section was just migrated, so
    // the migration runs exactly once even if Obsidian is killed before the
    // next save.
    if (migratedTypography) {
      await this.persist();
    }
  }

  async onunload(): Promise<void> {
    this.timer?.shutdown();
    this.widget?.cancelAutoHide();
    this.widget?.destroy();
    this.nudge?.destroy();
    this.dopamine?.destroy();
    this.ruler?.destroy();
    this.typography?.destroy();
    document.body.classList.remove(RULER_BODY_CLASS);
    this.flushReadingTime();
    await this.persist();
  }

  /* ------------------------------------------------------------------ */
  /* Persistence                                                         */
  /* ------------------------------------------------------------------ */

  async persist(): Promise<void> {
    await this.saveData({
      settings: this.settings,
      stats: this.stats,
      typography: this.typographySettings,
    });
  }

  /**
   * Loads the typography & ruler settings.
   *
   * Precedence:
   *   1. The `typography` section of this plugin's own data.json.
   *   2. The legacy standalone plugin's data.json (one-time migration —
   *      preserves every setting the user made in the old plugin).
   *   3. Defaults.
   *
   * Returns true when a legacy migration happened (so onload can persist
   * immediately and make it a one-time event).
   */
  private async loadTypographySettings(data: PersistedData): Promise<boolean> {
    if (data.typography) {
      this.typographySettings = normalizeTypographySettings(data.typography);
      return false;
    }

    const legacy = await this.readLegacyTypographyData();
    this.typographySettings = normalizeTypographySettings(legacy ?? undefined);
    if (legacy) {
      new Notice(
        "Focus Read: your typography & reading ruler settings were imported from the old plugin."
      );
    }
    return true;
  }

  /** Reads the legacy standalone plugin's data.json through the vault adapter. */
  private async readLegacyTypographyData(): Promise<Partial<TypographySettings> | null> {
    try {
      const adapter = (this.app as any).vault?.adapter;
      if (!adapter || typeof adapter.read !== "function") return null;
      const path = `.obsidian/plugins/${LEGACY_TYPOGRAPHY_PLUGIN_DIR}/data.json`;
      if (typeof adapter.exists === "function") {
        if (!(await adapter.exists(path))) return null;
      }
      const raw = await adapter.read(path);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed !== null ? parsed : null;
    } catch {
      // Missing file, read error or parse error — fall back to defaults.
      return null;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Focus / activity                                                    */
  /* ------------------------------------------------------------------ */

  private isUserFocused(): boolean {
    if (!this.settings.focusDetectionEnabled) return this.windowFocused;
    return this.windowFocused && Date.now() - this.lastActivityAt < this.settings.focusDetectionIdleSeconds * 1000;
  }

  /**
   * @param countsAsInput true for keyboard/touch (resets the nudge idle
   *                      timer); false for scroll/pointer-move.
   */
  private onActivity(countsAsInput: boolean): void {
    this.lastActivityAt = Date.now();
    if (countsAsInput || !this.settings.nudgeIgnoreScroll) {
      this.lastInputActivityAt = Date.now();
      this.nudge.noteInputActivity(this.lastInputActivityAt);
    }
    this.widget.poke();
  }

  private flushReadingTime(): void {
    this.statsTracker.accrue(
      this.windowFocused && !document.hidden,
      !this.settings.focusDetectionEnabled ||
        Date.now() - this.lastActivityAt < this.settings.focusDetectionIdleSeconds * 1000
    );
    if (this.settings.dopamineEnabled) {
      this.dopamine.render(this.statsTracker.todayMinutes(), this.settings.dopamineDailyGoalMinutes);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Timer flow                                                          */
  /* ------------------------------------------------------------------ */

  private handleControl(action: TimerControlAction): void {
    switch (action) {
      case "start":
        // During a break this is the "Skip Break" button: starting work
        // directly replaces the break (same behavior as the original).
        this.startWork();
        break;
      case "pause":
        this.timer.togglePauseResume();
        break;
      case "addtime":
        if (this.timer.addTime(30_000)) new Notice("Added 30s");
        break;
      case "stop":
        if (this.timer.phase !== "idle") {
          this.timer.stop();
          new Notice("Timer stopped.");
        }
        break;
    }
  }

  startWork(): void {
    if (!this.settings.timerEnabled) {
      new Notice("Enable the Floating Focus Timer module first.");
      return;
    }
    this.timer.startWork();
    new Notice(`Focus session started: ${this.settings.timerWorkMinutes} min`);
  }

  private onTimerSnapshot(snap: TimerSnapshot): void {
    this.widget.render(snap);
  }

  private onWorkComplete(focusMs: number): void {
    this.statsTracker.recordSession(focusMs);
    new Notice("Focus session complete! Take a break.");
    this.timer.startBreak();
  }

  /* ------------------------------------------------------------------ */
  /* Settings helpers (used by the settings tab)                         */
  /* ------------------------------------------------------------------ */

  applyTimerVisibility(): void {
    if (!this.settings.timerEnabled) {
      this.timer.stop();
    }
    this.widget.applyVisibility();
  }

  applyDopamineVisibility(): void {
    this.dopamine.applyVisibility(this.settings.dopamineEnabled);
  }

  async resetTimerPosition(): Promise<void> {
    this.settings.timerPositionX = null;
    this.settings.timerPositionY = null;
    await this.persist();
    this.widget.resetPosition();
    new Notice("Timer moved back to top-right.");
  }

  /* --- Typography & ruler (integrated from the legacy plugin) --- */

  /** Applies typography CSS variables + body class. */
  applyTypography(): void {
    this.typography.apply();
  }

  /** Manages the Google Fonts link (only the selected family). */
  applyGoogleFonts(): void {
    this.typography.applyGoogleFonts();
  }

  /**
   * Shows/hides the ruler. Called by the settings tab and the toggle
   * command. (The legacy plugin's settings toggle never reached the ruler —
   * fixed here: this method really mounts/unmounts the visible band.)
   */
  applyRulerVisibility(): void {
    this.ruler.applyVisibility();
  }

  /** Applies ruler height/color/opacity and re-clamps the position. */
  applyRulerConfig(): void {
    this.ruler.applyConfig();
  }

  /** Re-applies the saved/restored ruler position (clamped to viewport). */
  applyRulerPosition(): void {
    this.ruler.applyPosition();
  }

  async resetRulerPosition(): Promise<void> {
    this.typographySettings.readingRulerPositionRatio = null;
    await this.persist();
    // Actually move the band back (the legacy reset button had no effect).
    this.ruler.applyPosition();
    new Notice("Reading ruler reset to its default height.");
  }

  /* ------------------------------------------------------------------ */
  /* Commands                                                            */
  /* ------------------------------------------------------------------ */

  private registerCommands(): void {
    this.addCommand({
      id: "timer-start",
      name: "Start focus session",
      callback: () => this.startWork(),
    });
    this.addCommand({
      id: "timer-pause",
      name: "Pause/resume focus session",
      callback: () => {
        if (this.timer.phase === "idle") this.startWork();
        else this.timer.togglePauseResume();
      },
    });
    this.addCommand({
      id: "timer-stop",
      name: "Stop focus session",
      callback: () => this.timer.stop(),
    });
    this.addCommand({
      id: "reset-timer-position",
      name: "Reset timer position to top-right",
      callback: () => this.resetTimerPosition(),
    });

    /* --- Typography & ruler commands (ids preserved from the legacy
       plugin so existing hotkeys keep working) --- */

    this.addCommand({
      id: "toggle-typography",
      name: "Toggle typography",
      callback: async () => {
        this.typographySettings.typographyEnabled = !this.typographySettings.typographyEnabled;
        await this.persist();
        this.typography.apply();
      },
    });

    this.addCommand({
      id: "toggle-ruler",
      name: "Toggle reading ruler",
      callback: async () => {
        this.typographySettings.readingRulerEnabled = !this.typographySettings.readingRulerEnabled;
        await this.persist();
        this.ruler.applyVisibility();
        new Notice(`Reading ruler: ${this.typographySettings.readingRulerEnabled ? "ON" : "OFF"}`);
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
    if (!this.typographySettings.readingRulerEnabled) {
      this.typographySettings.readingRulerEnabled = true;
      void this.persist();
    }
    this.ruler.applyVisibility();
  }
}
