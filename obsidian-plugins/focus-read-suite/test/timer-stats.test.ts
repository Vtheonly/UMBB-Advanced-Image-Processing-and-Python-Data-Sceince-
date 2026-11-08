/**
 * Reading stats: rollover, streaks, accrual caps, session recording.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ReadingStatsTracker,
  normalizeStats,
  formatDate,
  dayDiff,
  DEFAULT_STATS,
  ReadingStats,
} from "../src/modules/timer/stats";

function makeTracker(initial?: Partial<ReadingStats>) {
  const stats = normalizeStats(initial);
  const persist = vi.fn();
  const tracker = new ReadingStatsTracker(
    { getStats: () => stats, persist },
    () => 0, // nowMs overridden per-test
    () => "2026-09-17" // dateFn overridden per-test
  );
  return { stats, persist, tracker };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("stats helpers", () => {
  it("formats local dates as YYYY-MM-DD", () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(formatDate(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("dayDiff computes whole-day differences", () => {
    expect(dayDiff("2026-09-16", "2026-09-17")).toBe(1);
    expect(dayDiff("2026-09-17", "2026-09-17")).toBe(0);
    expect(dayDiff("2026-09-10", "2026-09-17")).toBe(7);
    expect(dayDiff("", "2026-09-17")).toBe(0);
  });

  it("normalizeStats repairs corrupt payloads", () => {
    const s = normalizeStats({
      streak: -4,
      longestStreak: "many" as any,
      perDayMs: { ok: 1000, bad: -5, worse: "x" as any },
    } as any);
    expect(s.streak).toBe(0);
    expect(s.longestStreak).toBe(0);
    expect(s.perDayMs).toEqual({ ok: 1000 });
    expect(normalizeStats(null)).toEqual(DEFAULT_STATS);
  });
});

describe("ReadingStatsTracker", () => {
  it("rollOver resets today's counters and increments the streak", () => {
    const { stats, tracker } = makeTracker({
      todayDate: "2026-09-16",
      lastReadDate: "2026-09-16",
      streak: 3,
      todayMs: 5000,
      sessionsToday: 2,
    });
    (tracker as any).dateFn = () => "2026-09-17";
    tracker.rollOver();
    expect(stats.streak).toBe(4);
    expect(stats.longestStreak).toBe(4);
    expect(stats.todayMs).toBe(0);
    expect(stats.sessionsToday).toBe(0);
    expect(stats.todayDate).toBe("2026-09-17");
  });

  it("rollOver restarts the streak after a gap", () => {
    const { stats, tracker } = makeTracker({
      todayDate: "2026-09-10",
      lastReadDate: "2026-09-10",
      streak: 5,
      longestStreak: 5,
    });
    (tracker as any).dateFn = () => "2026-09-17";
    tracker.rollOver();
    expect(stats.streak).toBe(1);
    expect(stats.longestStreak).toBe(5);
  });

  it("accrue records time when focused+active", () => {
    const { stats, tracker } = makeTracker();
    let clock = 10_000;
    (tracker as any).nowMs = () => clock;
    (tracker as any).dateFn = () => "2026-09-17";
    (tracker as any).lastAccrualAt = clock;

    clock += 5000;
    expect(tracker.accrue(true, true)).toBe(5000);
    expect(stats.totalReadingMs).toBe(5000);
    expect(stats.todayMs).toBe(5000);
    expect(stats.perDayMs["2026-09-17"]).toBe(5000);
    expect(stats.lastReadDate).toBe("2026-09-17");
  });

  it("accrue records nothing when unfocused or inactive", () => {
    const { stats, tracker } = makeTracker();
    let clock = 10_000;
    (tracker as any).nowMs = () => clock;
    (tracker as any).lastAccrualAt = clock;
    clock += 5000;
    expect(tracker.accrue(false, true)).toBe(0);
    expect(tracker.accrue(true, false)).toBe(0);
    expect(stats.totalReadingMs).toBe(0);
  });

  it("caps single accrual chunks (sleep/resume protection)", () => {
    const { stats, tracker } = makeTracker();
    let clock = 10_000;
    (tracker as any).nowMs = () => clock;
    (tracker as any).lastAccrualAt = clock;
    clock += 10 * 60_000 * 60; // 10 hours
    const recorded = tracker.accrue(true, true);
    expect(recorded).toBe(ReadingStatsTracker.MAX_CHUNK_MS);
    expect(stats.totalReadingMs).toBe(ReadingStatsTracker.MAX_CHUNK_MS);
  });

  it("ignores sub-second chunks", () => {
    const { tracker } = makeTracker();
    let clock = 10_000;
    (tracker as any).nowMs = () => clock;
    (tracker as any).lastAccrualAt = clock;
    clock += 500;
    expect(tracker.accrue(true, true)).toBe(0);
  });

  it("recordSession tracks sessions and longest focus", () => {
    const { stats, persist, tracker } = makeTracker();
    tracker.recordSession(60_000);
    tracker.recordSession(120_000);
    expect(stats.sessionsToday).toBe(2);
    expect(stats.longestFocusMs).toBe(120_000);
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it("todayMinutes rounds to whole minutes", () => {
    const { tracker } = makeTracker({ todayMs: 90_000 });
    expect(tracker.todayMinutes()).toBe(2); // 1.5 → 2
  });
});
