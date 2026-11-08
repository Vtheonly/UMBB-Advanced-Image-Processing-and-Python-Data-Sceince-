/**
 * Focus Read Suite — settings/data migration from the three legacy plugins.
 *
 * On first launch the suite reads the legacy plugins' `data.json` files:
 *
 *   .obsidian/plugins/focus-read-timer/data.json       ({ settings, stats })
 *   .obsidian/plugins/focus-read-typography/data.json  (flat settings object)
 *   .obsidian/plugins/heatmap/data.json                ({ settings, records })
 *
 * …maps every compatible key into the unified schema, and writes the merged
 * result into the suite's own `data.json` together with a migration marker
 * (`migration: { state: "done", … }`), so it runs exactly once and can be
 * reported in Settings → Advanced.
 *
 * The legacy files themselves are NEVER modified or deleted — the user keeps
 * the old plugins as a rollback safety net until they choose to remove them.
 *
 * The mapping itself is a pure function (`mapLegacyData`) and is covered by
 * dedicated unit tests, including edge cases: missing plugins, corrupt JSON,
 * unknown values and already-migrated data.
 */

import { logger } from "./logger";
import { PersistedPayload } from "./settings-manager";

/* ------------------------------------------------------------------ */
/* Legacy schemas (documenting what the old plugins wrote)             */
/* ------------------------------------------------------------------ */

export interface LegacyTimerData {
  settings?: Record<string, any>;
  stats?: Record<string, any>;
}

export interface LegacyTypographyData {
  [key: string]: any;
}

export interface LegacyHeatmapData {
  settings?: Record<string, any>;
  records?: Record<string, any>;
}

/** Where each legacy plugin lived inside the vault (folder names matter!). */
export const LEGACY_PLUGIN_PATHS = {
  timer: ".obsidian/plugins/focus-read-timer/data.json",
  typography: ".obsidian/plugins/focus-read-typography/data.json",
  heatmap: ".obsidian/plugins/heatmap/data.json",
} as const;

export interface MigrationInfo {
  state: "pending" | "done" | "skipped";
  at?: string;
  sources?: string[];
  notes?: string[];
}

export interface MigrationResult {
  settings: Record<string, any>;
  stats: any;
  heatmapRecords: any;
  info: MigrationInfo;
}

/** IO surface needed to read the legacy files (implemented by main.ts). */
export interface LegacyDataReader {
  /** Returns parsed JSON, or null when the file is missing/unreadable. */
  readJson(path: string): Promise<any | null>;
}

/* ------------------------------------------------------------------ */
/* Pure mapping                                                        */
/* ------------------------------------------------------------------ */

function numOr(source: Record<string, any> | undefined, key: string, fallback: number): number {
  const v = source?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function boolOr(source: Record<string, any> | undefined, key: string, fallback: boolean): boolean {
  const v = source?.[key];
  return typeof v === "boolean" ? v : fallback;
}

/**
 * Maps the three legacy payloads onto the unified settings shape.
 * Deliberately permissive: anything absent simply falls back to the schema
 * defaults (applied later by normalizeSettings), and nothing is invented.
 */
export function mapLegacyData(
  timerRaw: LegacyTimerData | null,
  typographyRaw: LegacyTypographyData | null,
  heatmapRaw: LegacyHeatmapData | null,
  current: PersistedPayload | null
): MigrationResult {
  const sources: string[] = [];
  const notes: string[] = [];

  /* ---------------- Focus Read Timer ---------------- */

  // The legacy plugin stored { settings: {...}, stats: {...} }; some very old
  // builds stored the settings flat instead of nested — read both.
  const t = timerRaw?.settings ?? (timerRaw ? (timerRaw as Record<string, any>) : undefined);
  const timer: Record<string, any> = {};

  if (timerRaw && t) {
    sources.push("focus-read-timer");

    timer.enabled = boolOr(t, "timerEnabled", true);
    timer.workMinutes = numOr(t, "timerWorkMinutes", 25);
    timer.breakMinutes = numOr(t, "timerBreakMinutes", 5);
    timer.autoHide = boolOr(t, "timerAutoHide", true);
    timer.autoHideSeconds = numOr(t, "timerAutoHideSeconds", 4);
    timer.pauseOnBlur = boolOr(t, "timerPauseOnBlur", true);
    timer.positionX = typeof t.timerPositionX === "number" ? t.timerPositionX : null;
    timer.positionY = typeof t.timerPositionY === "number" ? t.timerPositionY : null;
    timer.focusDetectionEnabled = boolOr(t, "focusDetectionEnabled", true);
    timer.focusDetectionIdleSeconds = numOr(t, "focusDetectionIdleSeconds", 30);
    timer.nudgeEnabled = boolOr(t, "nudgeEnabled", false);
    timer.nudgeIdleSeconds = numOr(t, "nudgeIdleSeconds", 60);
    timer.nudgeIgnoreScroll = boolOr(t, "nudgeIgnoreScroll", true);
    timer.dopamineEnabled = boolOr(t, "dopamineEnabled", false);
    timer.dopamineDailyGoalMinutes = numOr(t, "dopamineDailyGoalMinutes", 60);
  }

  /* ---------------- Focus Read Typography & Ruler ---------------- */

  const ty = typographyRaw ?? {};
  const typography: Record<string, any> = {};
  const focus: Record<string, any> = {};
  const ruler: Record<string, any> = {};

  if (typographyRaw) {
    sources.push("focus-read-typography");

    typography.enabled = typeof ty.typographyEnabled === "boolean" ? ty.typographyEnabled : true;
    typography.fontFamily = typeof ty.fontFamily === "string" ? ty.fontFamily : "system";
    typography.customFontFamily = typeof ty.customFontFamily === "string" ? ty.customFontFamily : "";
    typography.loadGoogleFonts = typeof ty.loadGoogleFonts === "boolean" ? ty.loadGoogleFonts : false;
    typography.fontSize = ty.fontSize;
    typography.lineHeight = ty.lineHeight;
    typography.maxWidthChars = ty.maxWidthChars;
    typography.paragraphSpacing = ty.paragraphSpacing;

    focus.enabled = typeof ty.readingRulerEnabled === "boolean" ? ty.readingRulerEnabled : false;

    ruler.height = ty.readingRulerHeight;
    ruler.color = typeof ty.readingRulerColor === "string" ? ty.readingRulerColor : undefined;
    ruler.opacity = ty.readingRulerOpacity;
    ruler.mode = ty.readingRulerMode;
    ruler.positionRatio = ty.readingRulerPositionRatio ?? null;
  }

  /* ---------------- Heatmap of Notes ---------------- */

  const h = heatmapRaw?.settings ?? {};
  const heatmap: Record<string, any> = {};
  const advanced: Record<string, any> = {};

  if (heatmapRaw) {
    sources.push("heatmap-of-notes");

    heatmap.idleSeconds = h.idleSeconds;
    heatmap.bucketCount = h.bucketCount;
    heatmap.width = h.heatmapWidth;
    heatmap.offsetRight = h.heatmapOffsetRight;
    heatmap.opacity = h.heatmapOpacity;
    advanced.refreshIntervalMs = h.refreshIntervalMs;
    advanced.debugMode = h.debugMode;
  }

  /* ---------------- Merge with current payload ---------------- */

  const mergedSettings: Record<string, any> = {
    ...(current?.settings ?? {}),
  };
  // Legacy data wins over previously-persisted suite defaults only for keys
  // that actually existed there; the suite's own newer keys (general,
  // appearance, focus extras like the notch) are preserved when present.
  const setSection = (name: string, patch: Record<string, any>) => {
    if (Object.keys(patch).length === 0) return;
    mergedSettings[name] = { ...(mergedSettings[name] ?? {}), ...patch };
  };
  setSection("timer", timer);
  setSection("typography", typography);
  setSection("focus", focus);
  setSection("ruler", ruler);
  setSection("heatmap", heatmap);
  setSection("advanced", advanced);

  const stats = timerRaw?.stats ?? current?.stats ?? undefined;
  const heatmapRecords = heatmapRaw?.records ?? current?.heatmapRecords ?? undefined;

  if (sources.length > 0) {
    notes.push(
      `Migrated settings from: ${sources.join(", ")}. ` +
        "The legacy plugin files were left untouched — disable the old plugins after verifying."
    );
  }

  return {
    settings: mergedSettings,
    stats,
    heatmapRecords,
    info: {
      state: sources.length > 0 ? "done" : "skipped",
      at: new Date().toISOString(),
      sources,
      notes,
    },
  };
}

/* ------------------------------------------------------------------ */
/* The migration runner                                                */
/* ------------------------------------------------------------------ */

export class MigrationService {
  constructor(private reader: LegacyDataReader) {}

  /**
   * Returns the payload to persist. Runs the legacy mapping exactly once
   * (guarded by the `migration` marker); a re-run can be forced from
   * Settings → Advanced.
   */
  async migrate(current: PersistedPayload | null, force = false): Promise<PersistedPayload> {
    const alreadyDone =
      current?.migration?.state === "done" || current?.migration?.state === "skipped";

    if (current && alreadyDone && !force) {
      logger.debug("Migration already completed — skipping.");
      return current;
    }

    const [timerRaw, typographyRaw, heatmapRaw] = await Promise.all([
      this.reader.readJson(LEGACY_PLUGIN_PATHS.timer),
      this.reader.readJson(LEGACY_PLUGIN_PATHS.typography),
      this.reader.readJson(LEGACY_PLUGIN_PATHS.heatmap),
    ]);

    // Keep the user's existing suite stats/records when legacy files are
    // absent (e.g. fresh installs, or re-running migration after the legacy
    // plugins were removed).
    const result = mapLegacyData(timerRaw, typographyRaw, heatmapRaw, current);

    if ((result.info.sources ?? []).length === 0) {
      logger.info("No legacy plugin data found — starting with defaults.");
      if (force) {
        return {
          ...(current ?? {}),
          migration: { state: "skipped", at: new Date().toISOString(), sources: [], notes: ["No legacy plugin data was found."] },
        };
      }
      return {
        ...(current ?? {}),
        migration: { state: "skipped", at: new Date().toISOString(), sources: [] },
      };
    }

    const sources = result.info.sources ?? [];
    logger.info(`Migrating settings from: ${sources.join(", ")}`);

    return {
      version: 2,
      settings: result.settings,
      stats: result.stats,
      heatmapRecords: result.heatmapRecords,
      migration: result.info,
    };
  }
}
