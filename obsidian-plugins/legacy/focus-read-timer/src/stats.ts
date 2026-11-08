/**
 * Focus Read: Timer & Nudge — reading-time statistics.
 *
 * Tracks total/today/per-day reading time, streaks and longest focus.
 * Pure logic + persistence through an injected storage function, so it is
 * fully unit-testable.
 */

export interface ReadingStats {
  totalReadingMs: number;
  todayMs: number;
  todayDate: string;
  streak: number;
  lastReadDate: string;
  longestStreak: number;
  perDayMs: Record<string, number>;
  longestFocusMs: number;
  sessionsToday: number;
}

export const DEFAULT_STATS: ReadingStats = {
  totalReadingMs: 0,
  todayMs: 0,
  todayDate: "",
  streak: 0,
  lastReadDate: "",
  longestStreak: 0,
  perDayMs: {},
  longestFocusMs: 0,
  sessionsToday: 0,
};

/** Local-time YYYY-MM-DD (same format the original plugin used). */
export function formatDate(date?: Date): string {
  const d = date ?? new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Whole-day difference between two YYYY-MM-DD strings. */
export function dayDiff(a: string, b: string): number {
  if (!a || !b) return 0;
  return Math.round(
    (new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86_400_000
  );
}

/** Merges persisted stats over defaults, repairing missing fields. */
export function normalizeStats(raw: Partial<ReadingStats> | null | undefined): ReadingStats {
  const merged: ReadingStats = { ...DEFAULT_STATS, ...(raw ?? {}) };
  if (!merged.perDayMs || typeof merged.perDayMs !== "object") merged.perDayMs = {};
  for (const key of Object.keys(merged.perDayMs)) {
    const v = merged.perDayMs[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) delete merged.perDayMs[key];
  }
  if (typeof merged.streak !== "number" || merged.streak < 0) merged.streak = 0;
  if (typeof merged.longestStreak !== "number" || merged.longestStreak < 0) merged.longestStreak = 0;
  if (typeof merged.longestFocusMs !== "number" || merged.longestFocusMs < 0) merged.longestFocusMs = 0;
  return merged;
}

export interface StatsHost {
  getStats(): ReadingStats;
  persist(): void;
}

/**
 * Rollover + accrual logic, extracted from the original plugin so it can be
 * tested deterministically with an injected clock.
 */
export class ReadingStatsTracker {
  private host: StatsHost;
  private nowMs: () => number;
  private dateFn: () => string;

  /** Cap on a single accrual chunk — avoids huge jumps after sleep/resume. */
  static readonly MAX_CHUNK_MS = 300_000;
  /** Minimum chunk worth recording. */
  static readonly MIN_CHUNK_MS = 1_000;
  /** Persist at most every 10 s (matches original behaviour). */
  static readonly SAVE_INTERVAL_MS = 10_000;

  private lastAccrualAt: number;
  private lastPersistAt = 0;

  constructor(
    host: StatsHost,
    nowMs: () => number = () => Date.now(),
    dateFn: () => string = () => formatDate()
  ) {
    this.host = host;
    this.nowMs = nowMs;
    this.dateFn = dateFn;
    this.lastAccrualAt = nowMs();
  }

  /** Explicitly restarts the accrual window (e.g. after focus loss). */
  resetWindow(): void {
    this.lastAccrualAt = this.nowMs();
  }

  /**
   * Rolls the daily counters over if the date changed since the last write.
   * Updates streaks. Must be called before reading/writing today's numbers.
   */
  rollOver(): void {
    const stats = this.host.getStats();
    const today = this.dateFn();
    if (stats.todayDate === today) return;

    if (stats.lastReadDate) {
      const diff = dayDiff(stats.lastReadDate, today);
      if (diff === 1) stats.streak = (stats.streak || 0) + 1;
      else if (diff > 1) stats.streak = 1;
    } else {
      stats.streak = 1;
    }
    stats.longestStreak = Math.max(stats.longestStreak || 0, stats.streak);
    stats.todayMs = 0;
    stats.sessionsToday = 0;
    stats.todayDate = today;
    this.host.persist();
  }

  /**
   * Accrues elapsed wall-clock time since the last successful accrual.
   * Returns the number of ms actually recorded (0 when nothing counted).
   *
   * `windowFocused` — the Obsidian window must be focused.
   * `userActive`    — when focus detection is enabled, the user must have
   *                    been active recently (fixes the original behaviour of
   *                    counting time while the user had walked away with the
   *                    window focused).
   */
  accrue(windowFocused: boolean, userActive: boolean): number {
    const now = this.nowMs();
    let delta = now - this.lastAccrualAt;
    this.lastAccrualAt = now;

    if (!windowFocused || !userActive) return 0;
    if (delta > ReadingStatsTracker.MAX_CHUNK_MS) delta = ReadingStatsTracker.MAX_CHUNK_MS;
    if (delta < ReadingStatsTracker.MIN_CHUNK_MS) return 0;

    this.rollOver();
    const stats = this.host.getStats();
    const today = this.dateFn();
    stats.totalReadingMs += delta;
    stats.todayMs += delta;
    stats.lastReadDate = today;
    stats.perDayMs[today] = (stats.perDayMs[today] || 0) + delta;

    if (now - this.lastPersistAt > ReadingStatsTracker.SAVE_INTERVAL_MS) {
      this.lastPersistAt = now;
      this.host.persist();
    }
    return delta;
  }

  /** Records a completed focus session (longest-focus tracking). */
  recordSession(focusMs: number): void {
    const stats = this.host.getStats();
    stats.sessionsToday = (stats.sessionsToday || 0) + 1;
    if (focusMs > stats.longestFocusMs) stats.longestFocusMs = focusMs;
    this.host.persist();
  }

  /** Today's reading in whole minutes. */
  todayMinutes(): number {
    return Math.round(this.host.getStats().todayMs / 60_000);
  }
}
