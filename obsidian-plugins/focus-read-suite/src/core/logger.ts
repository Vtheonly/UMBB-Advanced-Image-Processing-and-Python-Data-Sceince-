/**
 * Focus Read Suite — leveled logger.
 *
 * A single logger for the whole plugin (debug output can be toggled from
 * Settings → Advanced). Replaces the three per-plugin loggers of the legacy
 * plugins.
 */

class LeveledLogger {
  private debugEnabled = false;
  private prefix = "[Focus Read Suite]";

  setDebug(enabled: boolean): void {
    this.debugEnabled = Boolean(enabled);
  }

  get isDebug(): boolean {
    return this.debugEnabled;
  }

  debug(...args: unknown[]): void {
    if (this.debugEnabled) console.debug(this.prefix, ...args);
  }

  info(...args: unknown[]): void {
    console.info(this.prefix, ...args);
  }

  warn(...args: unknown[]): void {
    console.warn(this.prefix, ...args);
  }

  error(...args: unknown[]): void {
    console.error(this.prefix, ...args);
  }
}

export const logger = new LeveledLogger();
export type { LeveledLogger };
