import { describe, it, expect, vi } from "vitest";
import {
  formatDate,
  dayDiff,
  normalizeStats,
  ReadingStatsTracker,
  DEFAULT_STATS,
} from "../src/stats";

function makeTracker(initialStats: any, nowMs: () => number = () => 1_000_000, dateFn?: () => string) {
  const stats = normalizeStats(initialStats);
  const persist = vi.fn();
  const tracker = new ReadingStatsTracker(
    { getStats: () => stats, persist },
    nowMs,
    dateFn ?? (() => formatDate(new Date(nowMs())))
  );
  return { tracker, stats, persist };
}

describe("formatDate / dayDiff", () => {
  it("formats local dates zero-padded", () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(formatDate(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("computes whole-day differences", () => {
    expect(dayDiff("2026-01-01", "2026-01-02")).toBe(1);
    expect(dayDiff("2026-01-01", "2026-01-10")).toBe(9);
    expect(dayDiff("2026-01-10", "2026-01-01")).toBe(-9);
    expect(dayDiff("", "2026-01-01")).toBe(0);
  });
});

describe("normalizeStats", () => {
  it("repairs malformed persisted stats", () => {
    const s = normalizeStats({
      perDayMs: { "2026-01-01": 100, bad: "x", "2026-01-02": -5 } as any,
      streak: -3,
      longestFocusMs: "abc" as any,
    });
    expect(Object.keys(s.perDayMs)).toEqual(["2026-01-01"]);
    expect(s.streak).toBe(0);
    expect(s.longestFocusMs).toBe(0);
  });
});

describe("ReadingStatsTracker rollover & streaks", () => {
  it("increments streak when the last read was yesterday", () => {
    let date = "2026-01-09";
    const { tracker, stats } = makeTracker({
      todayDate: "2026-01-09",
      lastReadDate: "2026-01-09",
      streak: 3,
      todayMs: 50_000,
      perDayMs: { "2026-01-09": 50_000 },
    });
    // Next day starts:
    const t2 = makeTracker(stats, () => 2_000_000, () => "2026-01-10");
    t2.tracker.rollOver();
    expect(t2.stats.streak).toBe(4);
    expect(t2.stats.todayMs).toBe(0);
    expect(t2.stats.longestStreak).toBe(4);
    expect(t2.stats.todayDate).toBe("2026-01-10");
    void tracker;
    void date;
  });

  it("resets streak to 1 after a gap of more than one day", () => {
    const { stats } = makeTracker({
      todayDate: "2026-01-01",
      lastReadDate: "2026-01-01",
      streak: 10,
      longestStreak: 12,
    });
    const t2 = makeTracker(stats, () => 2_000_000, () => "2026-01-08");
    t2.tracker.rollOver();
    expect(t2.stats.streak).toBe(1);
    expect(t2.stats.longestStreak).toBe(12); // preserved
  });

  it("does nothing when the date has not changed", () => {
    const { tracker, persist } = makeTracker(
      { todayDate: "2026-01-09", streak: 5 },
      () => 1_000_000,
      () => "2026-01-09"
    );
    tracker.rollOver();
    expect(persist).not.toHaveBeenCalled();
  });
});

describe("ReadingStatsTracker accrual", () => {
  it("accrues focused, active time into total/today/per-day", () => {
    let now = 1_000_000;
    const { tracker, stats } = makeTracker({ todayDate: "2026-01-09", todayMs: 0 }, () => now, () => "2026-01-09");
    now += 30_000;
    const recorded = tracker.accrue(true, true);
    expect(recorded).toBe(30_000);
    expect(stats.totalReadingMs).toBe(30_000);
    expect(stats.todayMs).toBe(30_000);
    expect(stats.perDayMs["2026-01-09"]).toBe(30_000);
    expect(stats.lastReadDate).toBe("2026-01-09");
  });

  it("records nothing while the window is unfocused", () => {
    let now = 1_000_000;
    const { tracker, stats } = makeTracker({}, () => now, () => "2026-01-09");
    now += 30_000;
    expect(tracker.accrue(false, true)).toBe(0);
    expect(stats.totalReadingMs).toBe(0);
    // The window is reset, so the next focused chunk starts fresh:
    now += 30_000;
    expect(tracker.accrue(true, true)).toBe(30_000);
  });

  it("records nothing while the user is idle (fixed: no more counting while away)", () => {
    let now = 1_000_000;
    const { tracker, stats } = makeTracker({}, () => now, () => "2026-01-09");
    now += 30_000;
    expect(tracker.accrue(true, false)).toBe(0);
    expect(stats.totalReadingMs).toBe(0);
  });

  it("caps a single chunk at 5 minutes (sleep/resume protection)", () => {
    let now = 1_000_000;
    const { tracker, stats } = makeTracker({}, () => now, () => "2026-01-09");
    now += 3_600_000; // laptop slept for an hour
    expect(tracker.accrue(true, true)).toBe(300_000);
    expect(stats.totalReadingMs).toBe(300_000);
  });

  it("ignores sub-second chunks", () => {
    let now = 1_000_000;
    const { tracker } = makeTracker({}, () => now, () => "2026-01-09");
    now += 400;
    expect(tracker.accrue(true, true)).toBe(0);
  });

  it("persists at most every 10 seconds", () => {
    let now = 1_000_000;
    const { tracker, persist } = makeTracker(
      { todayDate: "1970-01-01" },
      () => now,
      () => "1970-01-01"
    );
    now += 6_000;
    tracker.accrue(true, true); // first accrual ever -> persisted (#1)
    expect(persist).toHaveBeenCalledTimes(1);

    now += 6_000;
    tracker.accrue(true, true); // only 6s since last persist -> throttled
    expect(persist).toHaveBeenCalledTimes(1);

    now += 6_000;
    tracker.accrue(true, true); // 12s since last persist -> persisted (#2)
    expect(persist).toHaveBeenCalledTimes(2);
  });
});

describe("ReadingStatsTracker sessions", () => {
  it("counts sessions and tracks the longest focus", () => {
    const { tracker, stats } = makeTracker({ longestFocusMs: 100_000, sessionsToday: 2 });
    tracker.recordSession(150_000);
    expect(stats.longestFocusMs).toBe(150_000);
    expect(stats.sessionsToday).toBe(3);
    tracker.recordSession(50_000);
    expect(stats.longestFocusMs).toBe(150_000);
    expect(stats.sessionsToday).toBe(4);
  });
});
