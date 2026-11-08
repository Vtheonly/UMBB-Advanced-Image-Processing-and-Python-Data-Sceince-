/**
 * Focus Read: Timer & Nudge — settings model.
 */

export interface TimerSettings {
  timerEnabled: boolean;
  timerWorkMinutes: number;
  timerBreakMinutes: number;
  timerAutoHide: boolean;
  timerAutoHideSeconds: number;
  timerPauseOnBlur: boolean;
  /** null = default top-right corner; otherwise last dragged position (px). */
  timerPositionX: number | null;
  timerPositionY: number | null;
  focusDetectionEnabled: boolean;
  focusDetectionIdleSeconds: number;
  nudgeEnabled: boolean;
  nudgeIdleSeconds: number;
  /** scrolling while reading should not reset the idle (nudge) timer */
  nudgeIgnoreScroll: boolean;
  dopamineEnabled: boolean;
  dopamineDailyGoalMinutes: number;
}

export const DEFAULT_SETTINGS: TimerSettings = {
  timerEnabled: true,
  timerWorkMinutes: 25,
  timerBreakMinutes: 5,
  timerAutoHide: true,
  timerAutoHideSeconds: 4,
  timerPauseOnBlur: true,
  timerPositionX: null,
  timerPositionY: null,
  focusDetectionEnabled: true,
  focusDetectionIdleSeconds: 30,
  nudgeEnabled: false,
  nudgeIdleSeconds: 60,
  nudgeIgnoreScroll: true,
  dopamineEnabled: false,
  dopamineDailyGoalMinutes: 60,
};

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.round(Math.min(Math.max(value, min), max));
}

/** Normalizes persisted settings (handles missing keys / bad values). */
export function normalizeSettings(raw: Partial<TimerSettings> | null | undefined): TimerSettings {
  const merged: TimerSettings = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
  merged.timerWorkMinutes = clampInt(merged.timerWorkMinutes, 1, 180, DEFAULT_SETTINGS.timerWorkMinutes);
  merged.timerBreakMinutes = clampInt(merged.timerBreakMinutes, 1, 60, DEFAULT_SETTINGS.timerBreakMinutes);
  merged.timerAutoHideSeconds = clampInt(merged.timerAutoHideSeconds, 1, 120, DEFAULT_SETTINGS.timerAutoHideSeconds);
  merged.focusDetectionIdleSeconds = clampInt(merged.focusDetectionIdleSeconds, 5, 600, DEFAULT_SETTINGS.focusDetectionIdleSeconds);
  merged.nudgeIdleSeconds = clampInt(merged.nudgeIdleSeconds, 5, 600, DEFAULT_SETTINGS.nudgeIdleSeconds);
  merged.dopamineDailyGoalMinutes = clampInt(merged.dopamineDailyGoalMinutes, 1, 720, DEFAULT_SETTINGS.dopamineDailyGoalMinutes);
  for (const key of ["timerPositionX", "timerPositionY"] as const) {
    const v = merged[key];
    if (v !== null && (typeof v !== "number" || !Number.isFinite(v))) {
      merged[key] = null;
    }
  }
  return merged;
}

/** Formats milliseconds as mm:ss (ceil'ed to the next second). */
export function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
