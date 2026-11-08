/**
 * Heatmap of Notes — tiny leveled logger.
 */

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export class HeatmapLogger {
  private debugEnabled = false;

  constructor(private pluginId: string) {}

  setDebug(enabled: boolean): void {
    this.debugEnabled = enabled;
  }

  log(level: LogLevel, ...args: unknown[]): void {
    if (level === "DEBUG" && !this.debugEnabled) return;
    const prefix = `[${this.pluginId}] [${level}]`;
    switch (level) {
      case "WARN":
        console.warn(prefix, ...args);
        break;
      case "ERROR":
        console.error(prefix, ...args);
        break;
      default:
        console.log(prefix, ...args);
    }
  }

  debug(...args: unknown[]): void {
    this.log("DEBUG", ...args);
  }
  info(...args: unknown[]): void {
    this.log("INFO", ...args);
  }
  warn(...args: unknown[]): void {
    this.log("WARN", ...args);
  }
  error(...args: unknown[]): void {
    this.log("ERROR", ...args);
  }
}

export const logger = new HeatmapLogger("HeatmapOfNotes");
