/**
 * Focus Read: Timer & Nudge — the focus timer state machine.
 *
 * Redesign notes (vs. the original):
 * - The original drove ticks with requestAnimationFrame, which (a) rendered
 *   the whole widget 60x/second and (b) completely stalls when the window is
 *   backgrounded — the timer froze until you came back. Ticks now run on a
 *   250ms interval with timestamp math, so time is always correct and the
 *   DOM is only touched when the displayed value actually changes.
 * - The original `state` string ("idle" | "running" | "paused" | "break")
 *   conflated *what* is running (work/break) with *whether* it is running.
 *   It is now (phase, running) — pausing a break also works now.
 * - Pure logic, no DOM: fully unit-testable.
 */

import { TimerSettings } from "./settings";

export type TimerPhase = "idle" | "work" | "break";

export interface TimerSnapshot {
  phase: TimerPhase;
  running: boolean;
  remainingMs: number;
  totalMs: number;
  focusMs: number;
}

export interface TimerHost {
  getSettings(): TimerSettings;
  /** Returns true while the user counts as "focused" (for focus accumulation). */
  isUserFocused(): boolean;
  onSnapshot(snap: TimerSnapshot): void;
  onWorkComplete(focusMs: number): void;
  onBreakComplete(): void;
}

export class FocusTimer {
  private host: TimerHost;
  private intervalId: number | null = null;

  phase: TimerPhase = "idle";
  running = false;
  remainingMs = 0;
  totalMs = 0;
  focusMs = 0;

  private lastTickAt = 0;
  private lastRenderedSecond = -1;

  constructor(host: TimerHost) {
    this.host = host;
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
    this.totalMs = Math.max(60_000 / 60, s.timerWorkMinutes * 60_000);
    this.remainingMs = this.totalMs;
    this.focusMs = 0;
    this.lastTickAt = this.now();
    this.lastRenderedSecond = -1;
    this.ensureTicking();
    this.emit();
  }

  startBreak(): void {
    const s = this.host.getSettings();
    this.phase = "break";
    this.running = true;
    this.totalMs = s.timerBreakMinutes * 60_000;
    this.remainingMs = this.totalMs;
    this.focusMs = 0;
    this.lastTickAt = this.now();
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
      this.lastTickAt = this.now();
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

  /** Called by the host on its interval (also safe to call directly). */
  tick(): void {
    if (this.phase === "idle" || !this.running) return;

    const now = this.now();
    const elapsed = Math.max(0, now - this.lastTickAt);
    this.lastTickAt = now;
    this.remainingMs = Math.max(0, this.remainingMs - elapsed);

    if (this.phase === "work" && this.host.isUserFocused()) {
      this.focusMs += elapsed;
    }

    // Only touch the DOM layer when the displayed second changes.
    const shownSecond = Math.ceil(this.remainingMs / 1000);
    if (shownSecond !== this.lastRenderedSecond) {
      this.lastRenderedSecond = shownSecond;
      this.emit();
    }

    if (this.remainingMs <= 0) {
      const finishedPhase = this.phase;
      const focusMs = this.focusMs;
      this.stop();
      if (finishedPhase === "work") {
        this.host.onWorkComplete(focusMs);
      } else {
        this.host.onBreakComplete();
      }
    }
  }

  private ensureTicking(): void {
    if (this.intervalId !== null) return;
    this.intervalId = window.setInterval(() => this.tick(), 250);
  }

  /** Stops the internal interval (call on unload or when fully idle). */
  shutdown(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private emit(): void {
    this.host.onSnapshot(this.snapshot);
  }

  private now(): number {
    return performance.now();
  }
}
