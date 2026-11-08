import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FocusTimer, TimerSnapshot } from "../src/timer";
import { TimerSettings, DEFAULT_SETTINGS, formatClock } from "../src/settings";

describe("formatClock", () => {
  it("formats with zero padding and ceil", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(1000)).toBe("00:01");
    expect(formatClock(59_999)).toBe("01:00");
    expect(formatClock(90_000)).toBe("01:30");
    expect(formatClock(3_600_000)).toBe("60:00");
    expect(formatClock(-5)).toBe("00:00");
  });
});

describe("FocusTimer state machine", () => {
  let events: TimerSnapshot[];
  let workComplete: number[];
  let breakComplete: number[];
  let focused: boolean;
  let timer: FocusTimer;

  beforeEach(() => {
    vi.useFakeTimers();
    events = [];
    workComplete = [];
    breakComplete = [];
    focused = true;
    const settings: TimerSettings = { ...DEFAULT_SETTINGS, timerWorkMinutes: 1, timerBreakMinutes: 1 };
    timer = new FocusTimer({
      getSettings: () => settings,
      isUserFocused: () => focused,
      onSnapshot: (snap) => events.push(snap),
      // Mirrors the real plugin wiring: completing work starts the break.
      onWorkComplete: (ms) => {
        workComplete.push(ms);
        timer.startBreak();
      },
      onBreakComplete: () => breakComplete.push(true),
    });
  });

  afterEach(() => {
    timer?.shutdown();
    vi.useRealTimers();
  });

  it("starts a work session with correct totals", () => {
    timer.startWork();
    expect(timer.phase).toBe("work");
    expect(timer.running).toBe(true);
    expect(timer.totalMs).toBe(60_000);
    expect(timer.remainingMs).toBe(60_000);
    expect(events.length).toBe(1);
  });

  it("counts down correctly over time (interval + timestamp math)", () => {
    timer.startWork();
    vi.advanceTimersByTime(10_000);
    expect(timer.remainingMs).toBeLessThanOrEqual(50_100);
    expect(timer.remainingMs).toBeGreaterThanOrEqual(49_000);
  });

  it("pauses and resumes without losing time", () => {
    timer.startWork();
    vi.advanceTimersByTime(10_000);
    timer.pause();
    expect(timer.running).toBe(false);

    const frozen = timer.remainingMs;
    vi.advanceTimersByTime(30_000); // paused: nothing changes
    expect(timer.remainingMs).toBe(frozen);

    timer.resume();
    expect(timer.running).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(timer.remainingMs).toBeLessThan(frozen);
  });

  it("accumulates focus time only while the user is focused", () => {
    timer.startWork();
    vi.advanceTimersByTime(10_000);
    expect(timer.focusMs).toBeGreaterThanOrEqual(9_000);

    focused = false;
    vi.advanceTimersByTime(10_000);
    const afterIdle = timer.focusMs;
    expect(afterIdle).toBeLessThan(20_000); // idle time not counted as focus
    expect(timer.remainingMs).toBeLessThanOrEqual(40_100); // ...but still counts down
  });

  it("completes work, reports focus ms, then runs the break", () => {
    timer.startWork();
    vi.advanceTimersByTime(61_000);

    expect(workComplete.length).toBe(1);
    expect(workComplete[0]).toBeGreaterThanOrEqual(59_000);
    expect(timer.phase).toBe("break");
    expect(timer.totalMs).toBe(60_000);
  });

  it("completes the break and returns to idle", () => {
    timer.startWork();
    vi.advanceTimersByTime(61_000); // work done -> break starts
    vi.advanceTimersByTime(61_000); // break done
    expect(breakComplete.length).toBe(1);
    expect(timer.phase).toBe("idle");
    expect(timer.running).toBe(false);
  });

  it("supports pausing a break (original could not)", () => {
    timer.startWork();
    vi.advanceTimersByTime(61_000);
    expect(timer.phase).toBe("break");

    timer.pause();
    const frozen = timer.remainingMs;
    vi.advanceTimersByTime(20_000);
    expect(timer.remainingMs).toBe(frozen);

    timer.resume();
    expect(timer.running).toBe(true);
  });

  it("starting work during a break replaces it (the Skip Break flow)", () => {
    timer.startWork();
    vi.advanceTimersByTime(61_000);
    expect(timer.phase).toBe("break");
    breakComplete.length = 0;

    timer.startWork(); // user pressed "Skip Break"
    expect(breakComplete.length).toBe(0); // no redundant notice flow
    expect(timer.phase).toBe("work");
    expect(timer.totalMs).toBe(60_000);
  });

  it("addTime extends the running session", () => {
    timer.startWork();
    expect(timer.addTime(30_000)).toBe(true);
    expect(timer.remainingMs).toBe(90_000);
    expect(timer.totalMs).toBe(90_000);
  });

  it("addTime is rejected while idle", () => {
    expect(timer.addTime(30_000)).toBe(false);
  });

  it("stop resets everything", () => {
    timer.startWork();
    vi.advanceTimersByTime(5_000);
    timer.stop();
    expect(timer.phase).toBe("idle");
    expect(timer.remainingMs).toBe(0);
    expect(timer.focusMs).toBe(0);
  });

  it("renders at most ~4 times/second, not 60 (perf regression guard)", () => {
    timer.startWork();
    events = [];
    vi.advanceTimersByTime(5_000); // 20 ticks of the 250ms interval
    // One snapshot per *displayed second* change + start.
    expect(events.length).toBeLessThanOrEqual(6);
    expect(events.length).toBeGreaterThanOrEqual(4);
  });

  it("shutdown stops the internal interval", () => {
    timer.startWork();
    timer.shutdown();
    const frozen = timer.remainingMs;
    vi.advanceTimersByTime(5_000);
    expect(timer.remainingMs).toBe(frozen);
  });
});
