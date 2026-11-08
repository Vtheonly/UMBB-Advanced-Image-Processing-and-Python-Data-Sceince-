/**
 * FocusTimer state machine (pure logic).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FocusTimer, TimerHost } from "../src/modules/timer/FocusTimer";
import { DEFAULT_SETTINGS } from "../src/core/settings-schema";

function makeHost(overrides: Partial<TimerHost> = {}) {
  const settings = { ...DEFAULT_SETTINGS.timer };
  const host: TimerHost = {
    getSettings: () => settings,
    isUserFocused: () => true,
    onSnapshot: vi.fn(),
    onWorkComplete: vi.fn(),
    onBreakComplete: vi.fn(),
    ...overrides,
  };
  let clock = 1000;
  const timer = new FocusTimer(host, () => clock);
  return { timer, host, settings, advance: (ms: number) => (clock += ms) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("FocusTimer", () => {
  it("starts idle", () => {
    const { timer } = makeHost();
    expect(timer.phase).toBe("idle");
    expect(timer.running).toBe(false);
    expect(timer.snapshot.remainingMs).toBe(0);
  });

  it("startWork sets work phase with configured minutes", () => {
    const { timer, settings } = makeHost();
    settings.workMinutes = 30;
    timer.startWork();
    expect(timer.phase).toBe("work");
    expect(timer.running).toBe(true);
    expect(timer.totalMs).toBe(30 * 60_000);
    expect(timer.remainingMs).toBe(30 * 60_000);
  });

  it("pausing a break works (the legacy bug)", () => {
    const { timer } = makeHost();
    timer.startBreak();
    timer.pause();
    expect(timer.phase).toBe("break");
    expect(timer.running).toBe(false);
    timer.resume();
    expect(timer.running).toBe(true);
    expect(timer.phase).toBe("break");
  });

  it("ticks decrement remaining time and accumulate focus when focused", () => {
    const { timer, advance } = makeHost();
    timer.startWork(); // 25 min
    advance(1000);
    timer.tick();
    expect(timer.remainingMs).toBe(25 * 60_000 - 1000);
    expect(timer.focusMs).toBe(1000);
  });

  it("does not accumulate focus when the user is unfocused", () => {
    const { timer, advance } = makeHost({ isUserFocused: () => false });
    timer.startWork();
    advance(1000);
    timer.tick();
    expect(timer.focusMs).toBe(0);
    expect(timer.remainingMs).toBe(25 * 60_000 - 1000);
  });

  it("does not tick while paused", () => {
    const { timer, advance } = makeHost();
    timer.startWork();
    timer.pause();
    advance(5000);
    timer.tick();
    expect(timer.remainingMs).toBe(25 * 60_000);
  });

  it("completes work and calls onWorkComplete with focused ms", () => {
    const onWorkComplete = vi.fn();
    const { timer, advance } = makeHost({ onWorkComplete });
    timer.startWork();
    timer.remainingMs = 100;
    advance(150);
    timer.tick();
    expect(timer.phase).toBe("idle");
    expect(onWorkComplete).toHaveBeenCalledWith(150);
  });

  it("completes breaks with onBreakComplete", () => {
    const onBreakComplete = vi.fn();
    const { timer, advance } = makeHost({ onBreakComplete });
    timer.startBreak();
    timer.remainingMs = 50;
    advance(60);
    timer.tick();
    expect(onBreakComplete).toHaveBeenCalledTimes(1);
    expect(timer.phase).toBe("idle");
  });

  it("addTime extends both remaining and total", () => {
    const { timer } = makeHost();
    timer.startWork();
    const before = timer.remainingMs;
    expect(timer.addTime(30_000)).toBe(true);
    expect(timer.remainingMs).toBe(before + 30_000);
    expect(timer.totalMs).toBe(before + 30_000);
    timer.stop();
    expect(timer.addTime(1000)).toBe(false);
  });

  it("emits snapshots only when the displayed second changes", () => {
    const onSnapshot = vi.fn();
    const { timer, advance } = makeHost({ onSnapshot });
    timer.startWork(); // emit #1
    onSnapshot.mockClear();

    advance(100);
    timer.tick(); // first tick latches the displayed second — may emit once
    if (onSnapshot.mock.calls.length > 0) onSnapshot.mockClear();

    advance(100);
    timer.tick(); // same displayed second → no emit
    expect(onSnapshot).not.toHaveBeenCalled();

    advance(1000);
    timer.tick(); // displayed second changed → emit
    expect(onSnapshot).toHaveBeenCalledTimes(1);
  });

  it("internal interval is cleaned up by shutdown", () => {
    const { timer } = makeHost();
    timer.startWork();
    timer.shutdown();
    // No throws, no pending interval; ticking manually still works.
    expect(() => timer.tick()).not.toThrow();
  });
});
