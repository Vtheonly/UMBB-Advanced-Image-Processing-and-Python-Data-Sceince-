/**
 * Focus Read Suite — the focus timer state machine (pure logic, no DOM).
 *
 * Design notes (unchanged in spirit from the audited legacy implementation,
 * which itself fixed the original bundle):
 * - Ticks run on a 250 ms interval with timestamp math — time stays correct
 *   in background windows and the DOM is only touched when the displayed
 *   second changes (~1 Hz), never 60x/s.
 * - (phase: idle|work|break, running) — pausing a break works.
 * - Fully unit-testable; the clock is injectable.
 */

import { TimerSettings } from "../../core/settings-schema";

export type TimerPhase = "idle" | "work" | "break";

export type TimerControlAction = "start" | "pause" | "addtime" | "stop";

export interface TimerSnapshot {
  phase: TimerPhase;
  running: boolean;
  remainingMs: number;
  totalMs: number;
  focusMs: number;
}

export interface TimerHost {
  getSettings(): TimerSettings;
  /** True while the user counts as "focused" (for focus accumulation). */
  isUserFocused(): boolean;
  onSnapshot(snap: TimerSnapshot): void;
  onWorkComplete(focusMs: number): void;
  onBreakComplete(): void;
}

export class FocusTimer {
  private host: TimerHost;
  private intervalId: number | null = null;
  private nowMs: () => number;

  phase: TimerPhase = "idle";
  running = false;
  remainingMs = 0;
  totalMs = 0;
  focusMs = 0;

  private lastTickAt = 0;
  private lastRenderedSecond = -1;

  constructor(host: TimerHost, nowMs: () => number = () => performance.now()) {
    this.host = host;
    this.nowMs = nowMs;
  }

  get snapshot(): TimerSnapshot {
    return {
      phase: this.phase,
      running: this.running,
      remainingMs: this.remainingMs,
      totalMs: this.totalMs,
      focusMs: this.focusMs,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Control                                                             */
  /* ------------------------------------------------------------------ */

  startWork(): void {
    const s = this.host.getSettings();
    this.phase = "work";
    this.running = true;
    this.totalMs = Math.max(60_000 / 60, s.workMinutes * 60_000);
    this.remainingMs = this.totalMs;
    this.focusMs = 0;
    this.lastTickAt = this.nowMs();
    this.lastRenderedSecond = -1;
    this.ensureTicking();
    this.emit();
  }

  startBreak(): void {
    const s = this.host.getSettings();
    this.phase = "break";
    this.running = true;
    this.totalMs = s.breakMinutes * 60_000;
    this.remainingMs = this.totalMs;
    this.focusMs = 0;
    this.lastTickAt = this.nowMs();
    this.lastRenderedSecond = -1;
    this.ensureTicking();
    this.emit();
  }

  pause(): void {
    if (this.running) {
      this.running = false;
      this.emit();
    }
  }

  resume(): void {
    if (!this.running && this.phase !== "idle") {
      this.running = true;
      this.lastTickAt = this.nowMs();
      this.ensureTicking();
      this.emit();
    }
  }

  togglePauseResume(): void {
    if (this.running) this.pause();
    else this.resume();
  }

  stop(): void {
    this.phase = "idle";
    this.running = false;
    this.remainingMs = 0;
    this.totalMs = 0;
    this.focusMs = 0;
    this.lastRenderedSecond = -1;
    this.emit();
  }

  addTime(ms: number): boolean {
    if (this.phase === "idle") return false;
    this.remainingMs += ms;
    this.totalMs += ms;
    this.emit();
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Ticking                                                             */
  /* ------------------------------------------------------------------ */

  tick(): void {
    if (this.phase === "idle" || !this.running) return;

    const now = this.nowMs();
    const elapsed = Math.max(0, now - this.lastTickAt);
    this.lastTickAt = now;
    this.remainingMs = Math.max(0, this.remainingMs - elapsed);

    if (this.phase === "work" && this.host.isUserFocused()) {
      this.focusMs += elapsed;
    }

    const shownSecond = Math.ceil(this.remainingMs / 1000);
    if (shownSecond !== this.lastRenderedSecond) {
      this.lastRenderedSecond = shownSecond;
      this.emit();
    }

    if (this.remainingMs <= 0) {
      const finishedPhase = this.phase;
      const focusMs = this.focusMs;
      this.stop();
      if (finishedPhase === "work") this.host.onWorkComplete(focusMs);
      else this.host.onBreakComplete();
    }
  }

  private ensureTicking(): void {
    if (this.intervalId !== null) return;
    this.intervalId = window.setInterval(() => this.tick(), 250);
  }

  /** Stops the internal interval (unload, or when fully idle). */
  shutdown(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private emit(): void {
    this.host.onSnapshot(this.snapshot);
  }
}
