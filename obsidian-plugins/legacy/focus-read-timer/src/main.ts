/**
 * Focus Read: Timer & Nudge — plugin entry point.
 *
 * The original implementation was a single 890-line class mixing timer
 * state, DOM rendering, drag handling, stats persistence and the nudge
 * system. It leaked a `visibilitychange` listener on unload, re-rendered
 * the widget 60x/second, and froze in background windows. This version
 * delegates to focused modules (timer / widget / stats / nudge / dopamine)
 * and keeps lifecycle management strictly to Obsidian's
 * registerInterval / registerDomEvent / registerEvent APIs.
 */

import { Notice, Plugin } from "obsidian";
import { TimerSettings, normalizeSettings } from "./settings";
import { FocusTimer, TimerSnapshot } from "./timer";
import { ReadingStats, normalizeStats, ReadingStatsTracker } from "./stats";
import { TimerWidget, TimerControlAction } from "./widget";
import { NudgeController } from "./nudge";
import { DopamineBar } from "./dopamine";
import { TimerSettingTab } from "./settings-tab";

interface PersistedData {
  settings?: Partial<TimerSettings>;
  stats?: Partial<ReadingStats>;
}

export default class FocusReadTimerPlugin extends Plugin {
  settings!: TimerSettings;
  stats!: ReadingStats;

  private timer!: FocusTimer;
  private widget!: TimerWidget;
  private statsTracker!: ReadingStatsTracker;
  private nudge!: NudgeController;
  private dopamine!: DopamineBar;

  /* Activity tracking */
  private lastActivityAt = 0;
  private lastInputActivityAt = 0;
  private windowFocused = true;

  async onload(): Promise<void> {
    const data: PersistedData = (await this.loadData()) ?? {};
    this.settings = normalizeSettings(data.settings);
    this.stats = normalizeStats(data.stats);

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

    /* ----- DOM ----- */

    this.widget.mount();
    this.dopamine.mount();
    this.widget.render(this.timer.snapshot);
    this.dopamine.applyVisibility(this.settings.dopamineEnabled);
    if (this.settings.dopamineEnabled) {
      this.dopamine.render(this.statsTracker.todayMinutes(), this.settings.dopamineDailyGoalMinutes);
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

    this.addSettingTab(new TimerSettingTab(this.app, this));
    this.registerCommands();
  }

  async onunload(): Promise<void> {
    this.timer?.shutdown();
    this.widget?.cancelAutoHide();
    this.widget?.destroy();
    this.nudge?.destroy();
    this.dopamine?.destroy();
    this.flushReadingTime();
    await this.persist();
  }

  /* ------------------------------------------------------------------ */
  /* Persistence                                                         */
  /* ------------------------------------------------------------------ */

  async persist(): Promise<void> {
    await this.saveData({ settings: this.settings, stats: this.stats });
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
  }
}
