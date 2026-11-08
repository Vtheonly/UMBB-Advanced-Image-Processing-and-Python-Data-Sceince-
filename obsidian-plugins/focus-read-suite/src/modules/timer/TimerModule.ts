/**
 * Focus Read Suite — the Timer module.
 *
 * Owns: the floating timer widget, the focus-timer state machine, reading
 * stats (streaks / today / per-day), focus detection, the idle nudge and
 * the daily goal bar.
 *
 * Everything is wired through the shared SettingsManager: flipping any
 * timer setting in the UI takes effect immediately via onSettingsChanged().
 */

import { Notice } from "obsidian";
import { FocusSuiteModule, ModuleContext } from "../module";
import { SectionId } from "../../core/settings-schema";
import { FocusTimer, TimerSnapshot, TimerControlAction } from "./FocusTimer";
import { TimerWidget } from "./TimerWidget";
import { ReadingStats, ReadingStatsTracker, normalizeStats, DEFAULT_STATS } from "./stats";
import { NudgeController } from "./NudgeController";
import { GoalBar } from "./DopamineBar";
import { registerViewportChangeHandlers } from "../../core/viewport";
import { logger } from "../../core/logger";

const STATS_KEY = "stats";

export class TimerModule implements FocusSuiteModule {
  readonly id = "timer" as const;
  readonly name = "Focus Read Timer";

  private ctx!: ModuleContext;
  private timer!: FocusTimer;
  private widget!: TimerWidget;
  private statsTracker!: ReadingStatsTracker;
  private nudge!: NudgeController;
  private goalBar!: GoalBar;

  private stats: ReadingStats = { ...DEFAULT_STATS };

  /* Activity tracking */
  private lastActivityAt = 0;
  private lastInputActivityAt = 0;
  private windowFocused = true;

  /* ------------------------------------------------------------------ */
  /* Lifecycle                                                           */
  /* ------------------------------------------------------------------ */

  async load(ctx: ModuleContext): Promise<void> {
    this.ctx = ctx;
    const { settings, lifecycle } = ctx;

    this.stats = normalizeStats(settings.getExtra<Partial<ReadingStats>>(STATS_KEY));
    this.lastActivityAt = Date.now();
    this.lastInputActivityAt = Date.now();

    /* ----- Subsystems ----- */

    this.statsTracker = new ReadingStatsTracker({
      getStats: () => this.stats,
      persist: () => {
        void settings.setExtra(STATS_KEY, this.stats, false);
      },
    });
    this.statsTracker.rollOver();

    this.widget = new TimerWidget({
      getSettings: () => settings.settings.timer,
      onControl: (action) => this.handleControl(action),
      registerDomEvent: (el, type, cb, options) => lifecycle.domEvent(el, type, cb, options),
      savePosition: (x, y) => {
        void settings.update("timer", (draft) => {
          draft.timer.positionX = x;
          draft.timer.positionY = y;
        }, false);
      },
    });

    this.timer = new FocusTimer({
      getSettings: () => settings.settings.timer,
      isUserFocused: () => this.isUserFocused(),
      onSnapshot: (snap) => this.onTimerSnapshot(snap),
      onWorkComplete: (focusMs) => this.onWorkComplete(focusMs),
      onBreakComplete: () => {
        this.notify("Break over. Ready for another session?");
      },
    });

    this.nudge = new NudgeController(
      {
        registerDomEvent: (el, type, cb, options) => lifecycle.domEvent(el, type, cb, options),
        getWorkRemainingMs: () =>
          this.timer.phase === "work" && this.timer.running ? this.timer.remainingMs : null,
        onContinue: () => this.widget.poke(),
      },
      () => settings.settings.timer.nudgeIdleSeconds * 1000
    );

    this.goalBar = new GoalBar();

    /* ----- DOM ----- */

    this.widget.mount();
    this.goalBar.mount();
    this.widget.render(this.timer.snapshot);
    this.goalBar.applyVisibility(settings.settings.timer.dopamineEnabled);
    if (settings.settings.timer.dopamineEnabled) {
      this.goalBar.render(this.statsTracker.todayMinutes(), settings.settings.timer.dopamineDailyGoalMinutes);
    }

    /* ----- Global listeners (all cleaned up by Obsidian on unload) ----- */

    lifecycle.domEvent(window, "pointermove", () => this.onActivity(false), { passive: true });
    lifecycle.domEvent(window, "keydown", () => this.onActivity(true), { passive: true });
    lifecycle.domEvent(window, "scroll", () => this.onActivity(!settings.settings.timer.nudgeIgnoreScroll), { passive: true });
    lifecycle.domEvent(window, "pointerdown", () => this.onActivity(true), { passive: true });

    lifecycle.domEvent(window, "blur", () => {
      this.windowFocused = false;
      if (settings.settings.timer.pauseOnBlur && this.timer.running) {
        this.timer.pause();
        this.notify("Paused: window lost focus");
      }
    });
    lifecycle.domEvent(window, "focus", () => {
      this.windowFocused = true;
      this.onActivity(true);
    });
    lifecycle.domEvent(document, "visibilitychange", () => {
      if (document.hidden) {
        if (settings.settings.timer.pauseOnBlur && this.timer.running) {
          this.timer.pause();
          this.notify("Paused: tab hidden");
        }
      } else {
        this.windowFocused = true;
        this.onActivity(true);
      }
    });

    registerViewportChangeHandlers(
      (target, type, cb) => lifecycle.domEvent(target, type, cb),
      () => this.widget.reflow()
    );

    /* ----- Periodic work ----- */

    lifecycle.every(5000, () => {
      if (this.ctx.settings.settings.timer.nudgeEnabled) this.nudge.checkIdle();
    });
    lifecycle.every(30_000, () => this.flushReadingTime());
    lifecycle.every(5000, () => {
      if (this.ctx.settings.settings.timer.dopamineEnabled) {
        this.goalBar.render(
          this.statsTracker.todayMinutes(),
          this.ctx.settings.settings.timer.dopamineDailyGoalMinutes
        );
      }
    });

    this.registerCommands(ctx);
    logger.debug("Timer module loaded.");
  }

  async unload(): Promise<void> {
    this.timer?.shutdown();
    // Flush BEFORE tearing down the UI — flushReadingTime may render the
    // goal bar, which would re-mount it after destroy() otherwise.
    this.flushReadingTime();
    this.widget?.destroy();
    this.nudge?.destroy();
    this.goalBar?.destroy();
    await this.ctx.settings.setExtra(STATS_KEY, this.stats, true);
    logger.debug("Timer module unloaded.");
  }

  /* ------------------------------------------------------------------ */
  /* Settings                                                            */
  /* ------------------------------------------------------------------ */

  sections(): SectionId[] {
    return ["timer", "general"];
  }

  onSettingsChanged(sections: SectionId[]): void {
    const s = this.ctx.settings.settings;

    if (sections.includes("timer")) {
      if (!s.timer.enabled) this.timer.stop();
      this.widget.applyVisibility();
      this.widget.render(this.timer.snapshot);
      this.goalBar.applyVisibility(s.timer.dopamineEnabled);
      if (s.timer.dopamineEnabled) {
        this.goalBar.render(this.statsTracker.todayMinutes(), s.timer.dopamineDailyGoalMinutes);
      }
    }

    if (sections.includes("general")) {
      // statsEnabled toggles accrual inside flushReadingTime(); nothing to
      // re-mount, but flush immediately when tracking was just switched on.
      this.flushReadingTime();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Public API (commands)                                               */
  /* ------------------------------------------------------------------ */

  startWork(): void {
    const s = this.ctx.settings.settings.timer;
    if (!s.enabled) {
      new Notice("Enable the Focus Read Timer module first (Settings → Focus Read Timer).");
      return;
    }
    this.timer.startWork();
    this.notify(`Focus session started: ${s.workMinutes} min`);
  }

  togglePause(): void {
    if (this.timer.phase === "idle") this.startWork();
    else this.timer.togglePauseResume();
  }

  stop(): void {
    this.timer.stop();
  }

  async resetPosition(): Promise<void> {
    await this.ctx.settings.update("timer", (draft) => {
      draft.timer.positionX = null;
      draft.timer.positionY = null;
    });
    this.widget.resetPosition();
    this.notify("Timer moved back to the top-right corner.");
  }

  /* ------------------------------------------------------------------ */
  /* Internals                                                           */
  /* ------------------------------------------------------------------ */

  private registerCommands(ctx: ModuleContext): void {
    ctx.addCommand({ id: "start-focus-session", name: "Start focus session", callback: () => this.startWork() });
    ctx.addCommand({
      id: "pause-resume-focus-session",
      name: "Pause/resume focus session",
      callback: () => this.togglePause(),
    });
    ctx.addCommand({ id: "stop-focus-session", name: "Stop focus session", callback: () => this.stop() });
    ctx.addCommand({
      id: "reset-timer-position",
      name: "Reset timer position to top-right",
      callback: () => void this.resetPosition(),
    });
  }

  private notify(message: string): void {
    if (this.ctx?.settings.settings.general.showNotices) new Notice(message);
  }

  private isUserFocused(): boolean {
    const s = this.ctx.settings.settings.timer;
    if (!s.focusDetectionEnabled) return this.windowFocused;
    return (
      this.windowFocused &&
      Date.now() - this.lastActivityAt < s.focusDetectionIdleSeconds * 1000
    );
  }

  /**
   * @param countsAsInput true for keyboard/touch (resets the nudge idle
   *                      timer); false for scroll/pointer-move.
   */
  private onActivity(countsAsInput: boolean): void {
    this.lastActivityAt = Date.now();
    const s = this.ctx.settings.settings.timer;
    if (countsAsInput || !s.nudgeIgnoreScroll) {
      this.lastInputActivityAt = Date.now();
      this.nudge.noteInputActivity(this.lastInputActivityAt);
    }
    this.widget.poke();
  }

  private flushReadingTime(): void {
    if (!this.ctx.settings.settings.general.statsEnabled) {
      // Tracking disabled: reset the accrual window so the disabled period
      // is never back-filled when tracking is re-enabled.
      this.statsTracker.resetWindow();
      return;
    }
    const accrued = this.statsTracker.accrue(
      this.windowFocused && !document.hidden,
      !this.ctx.settings.settings.timer.focusDetectionEnabled ||
        Date.now() - this.lastActivityAt < this.ctx.settings.settings.timer.focusDetectionIdleSeconds * 1000
    );
    if (accrued > 0) {
      void this.ctx.settings.setExtra(STATS_KEY, this.stats, false);
    }
    if (this.ctx.settings.settings.timer.dopamineEnabled) {
      this.goalBar.render(
        this.statsTracker.todayMinutes(),
        this.ctx.settings.settings.timer.dopamineDailyGoalMinutes
      );
    }
  }

  private handleControl(action: TimerControlAction): void {
    switch (action) {
      case "start":
        // During a break this is the "Skip Break" button.
        this.startWork();
        break;
      case "pause":
        this.timer.togglePauseResume();
        break;
      case "addtime":
        if (this.timer.addTime(30_000)) this.notify("Added 30s");
        break;
      case "stop":
        if (this.timer.phase !== "idle") {
          this.timer.stop();
          this.notify("Timer stopped.");
        }
        break;
    }
  }

  private onTimerSnapshot(snap: TimerSnapshot): void {
    this.widget.render(snap);
  }

  private onWorkComplete(focusMs: number): void {
    this.statsTracker.recordSession(focusMs);
    void this.ctx.settings.setExtra(STATS_KEY, this.stats, true);
    this.notify("Focus session complete! Take a break.");
    this.timer.startBreak();
  }

  /** Exposed for the settings dashboard. */
  get todayStats(): ReadingStats {
    return this.stats;
  }

  get statsTrackerRef(): ReadingStatsTracker {
    return this.statsTracker;
  }
}
