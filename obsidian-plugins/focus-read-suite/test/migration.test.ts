/**
 * Legacy migration: pure mapping + the runner (idempotence, missing files,
 * corrupt data, forced re-run).
 */
import { describe, it, expect, vi } from "vitest";
import {
  mapLegacyData,
  MigrationService,
  LEGACY_PLUGIN_PATHS,
} from "../src/core/migration";
import { normalizeSettings } from "../src/core/settings-schema";

const TIMER_DATA = {
  settings: {
    timerEnabled: true,
    timerWorkMinutes: 30,
    timerBreakMinutes: 7,
    timerAutoHide: false,
    timerAutoHideSeconds: 8,
    timerPauseOnBlur: false,
    timerPositionX: 1187,
    timerPositionY: 162,
    focusDetectionEnabled: false,
    focusDetectionIdleSeconds: 45,
    nudgeEnabled: true,
    nudgeIdleSeconds: 25,
    nudgeIgnoreScroll: false,
    dopamineEnabled: true,
    dopamineDailyGoalMinutes: 90,
  },
  stats: {
    totalReadingMs: 6365749,
    todayMs: 30005,
    todayDate: "2026-09-17",
    streak: 1,
    lastReadDate: "2026-09-17",
    longestStreak: 3,
    perDayMs: { "2026-07-08": 3278903, "2026-09-17": 30005 },
    longestFocusMs: 1464168,
    sessionsToday: 2,
  },
};

const TYPOGRAPHY_DATA = {
  typographyEnabled: false,
  fontFamily: "lexend",
  customFontFamily: "",
  loadGoogleFonts: true,
  fontSize: 19,
  lineHeight: 1.8,
  maxWidthChars: 72,
  paragraphSpacing: 1.6,
  readingRulerEnabled: true,
  readingRulerHeight: 47,
  readingRulerColor: "#ffc400",
  readingRulerOpacity: 0.6,
  readingRulerMode: "manual",
  readingRulerPositionRatio: 0.66,
};

const HEATMAP_DATA = {
  settings: {
    idleSeconds: 10,
    bucketCount: 200,
    heatmapWidth: 20,
    heatmapOffsetRight: 16,
    heatmapOpacity: 1,
    refreshIntervalMs: 500,
    debugMode: true,
  },
  records: {
    "test/note.md": {
      totalTimeMs: 275000,
      visits: 3,
      lastAccessed: "2026-09-17T01:22:03.206Z",
      buckets: Array(200).fill(1000),
      bucketVisits: Array(200).fill(1),
    },
  },
};

describe("mapLegacyData (pure)", () => {
  it("maps all three plugins' settings onto the unified schema", () => {
    const result = mapLegacyData(TIMER_DATA, TYPOGRAPHY_DATA, HEATMAP_DATA, null);

    expect(result.info.sources).toEqual(["focus-read-timer", "focus-read-typography", "heatmap-of-notes"]);
    expect(result.info.state).toBe("done");

    // Timer section:
    expect(result.settings.timer.workMinutes).toBe(30);
    expect(result.settings.timer.breakMinutes).toBe(7);
    expect(result.settings.timer.autoHide).toBe(false);
    expect(result.settings.timer.autoHideSeconds).toBe(8);
    expect(result.settings.timer.pauseOnBlur).toBe(false);
    expect(result.settings.timer.positionX).toBe(1187);
    expect(result.settings.timer.positionY).toBe(162);
    expect(result.settings.timer.focusDetectionEnabled).toBe(false);
    expect(result.settings.timer.focusDetectionIdleSeconds).toBe(45);
    expect(result.settings.timer.nudgeEnabled).toBe(true);
    expect(result.settings.timer.nudgeIdleSeconds).toBe(25);
    expect(result.settings.timer.nudgeIgnoreScroll).toBe(false);
    expect(result.settings.timer.dopamineEnabled).toBe(true);
    expect(result.settings.timer.dopamineDailyGoalMinutes).toBe(90);

    // Typography section:
    expect(result.settings.typography.enabled).toBe(false);
    expect(result.settings.typography.fontFamily).toBe("lexend");
    expect(result.settings.typography.loadGoogleFonts).toBe(true);
    expect(result.settings.typography.fontSize).toBe(19);
    expect(result.settings.typography.lineHeight).toBe(1.8);
    expect(result.settings.typography.maxWidthChars).toBe(72);
    expect(result.settings.typography.paragraphSpacing).toBe(1.6);

    // Focus + ruler sections (from the typography plugin's ruler settings):
    expect(result.settings.focus.enabled).toBe(true);
    expect(result.settings.ruler.height).toBe(47);
    expect(result.settings.ruler.color).toBe("#ffc400");
    expect(result.settings.ruler.opacity).toBe(0.6);
    expect(result.settings.ruler.mode).toBe("manual");
    expect(result.settings.ruler.positionRatio).toBe(0.66);

    // Heatmap + advanced sections:
    expect(result.settings.heatmap.idleSeconds).toBe(10);
    expect(result.settings.heatmap.bucketCount).toBe(200);
    expect(result.settings.heatmap.width).toBe(20);
    expect(result.settings.heatmap.offsetRight).toBe(16);
    expect(result.settings.heatmap.opacity).toBe(1);
    expect(result.settings.advanced.refreshIntervalMs).toBe(500);
    expect(result.settings.advanced.debugMode).toBe(true);

    // Data payloads preserved verbatim:
    expect(result.stats).toEqual(TIMER_DATA.stats);
    expect(result.heatmapRecords).toEqual(HEATMAP_DATA.records);
  });

  it("produces settings that survive normalization without change", () => {
    const result = mapLegacyData(TIMER_DATA, TYPOGRAPHY_DATA, HEATMAP_DATA, null);
    const normalized = normalizeSettings(result.settings);
    expect(normalized.timer.workMinutes).toBe(30);
    expect(normalized.ruler.height).toBe(47);
    expect(normalized.heatmap.bucketCount).toBe(200);
    expect(normalized.typography.lineHeight).toBe(1.8);
  });

  it("handles flat (very old) timer data without nested settings", () => {
    const flat = { ...TIMER_DATA.settings, stats: undefined };
    const result = mapLegacyData(flat as any, null, null, null);
    expect(result.settings.timer.workMinutes).toBe(30);
    expect(result.settings.timer.nudgeEnabled).toBe(true);
    expect(result.info.sources).toEqual(["focus-read-timer"]);
  });

  it("skips absent plugins and reports them", () => {
    const result = mapLegacyData(null, null, null, null);
    expect(result.info.sources).toEqual([]);
    expect(result.info.state).toBe("skipped");
    expect(result.settings).toEqual({});
  });

  it("handles partial legacy data (missing keys fall back later)", () => {
    const result = mapLegacyData({ settings: { timerWorkMinutes: 50 } }, { readingRulerEnabled: true }, { settings: {} }, null);
    expect(result.settings.timer.workMinutes).toBe(50);
    expect(result.settings.focus.enabled).toBe(true);
    // Keys the legacy plugins didn't have stay absent → defaults at normalize:
    const normalized = normalizeSettings(result.settings);
    expect(normalized.focus.showNotch).toBe(true); // suite default
    expect(normalized.timer.breakMinutes).toBe(5); // suite default
  });

  it("keeps existing suite settings for keys the legacy data lacks", () => {
    const current = {
      settings: {
        general: { statsEnabled: false, showNotices: false },
        focus: { enabled: true, focusLine: true, notchSize: 52 },
        appearance: { accentMode: "custom" as const, customAccent: "#112233", widgetScale: 1.1 },
      },
    };
    const result = mapLegacyData(TIMER_DATA, TYPOGRAPHY_DATA, HEATMAP_DATA, current as any);
    expect(result.settings.general.statsEnabled).toBe(false);
    expect(result.settings.focus.focusLine).toBe(true);
    expect(result.settings.focus.notchSize).toBe(52);
    expect(result.settings.appearance.accentMode).toBe("custom");
    // Legacy ruler values merge over current ruler section:
    expect(result.settings.ruler.height).toBe(47);
    // Legacy focus.enabled merges over current:
    expect(result.settings.focus.enabled).toBe(true);
  });

  it("keeps current stats/records when legacy files are gone", () => {
    const current = { stats: { todayMs: 5 }, heatmapRecords: { "z.md": { visits: 9 } } };
    const result = mapLegacyData(null, null, null, current as any);
    expect(result.stats).toEqual({ todayMs: 5 });
    expect(result.heatmapRecords).toEqual({ "z.md": { visits: 9 } });
  });

  it("maps null positions to null (default anchor)", () => {
    const result = mapLegacyData({ settings: { timerPositionX: null, timerPositionY: null } }, null, null, null);
    expect(result.settings.timer.positionX).toBeNull();
    expect(result.settings.timer.positionY).toBeNull();
  });
});

describe("MigrationService (runner)", () => {
  function makeReader(files: Record<string, any>) {
    return {
      readJson: async (path: string) => {
        const data = files[path];
        return data === undefined ? null : JSON.parse(JSON.stringify(data));
      },
    };
  }

  it("reads the legacy files from their canonical vault paths", async () => {
    const paths = Object.values(LEGACY_PLUGIN_PATHS);
    expect(paths).toContain(".obsidian/plugins/focus-read-timer/data.json");
    expect(paths).toContain(".obsidian/plugins/focus-read-typography/data.json");
    expect(paths).toContain(".obsidian/plugins/heatmap/data.json"); // folder name quirk!
  });

  it("migrates when no marker exists and writes the marker", async () => {
    const svc = new MigrationService(
      makeReader({
        ".obsidian/plugins/focus-read-timer/data.json": TIMER_DATA,
        ".obsidian/plugins/focus-read-typography/data.json": TYPOGRAPHY_DATA,
        ".obsidian/plugins/heatmap/data.json": HEATMAP_DATA,
      })
    );
    const result = await svc.migrate(null);
    expect(result.migration.state).toBe("done");
    expect(result.migration.sources.length).toBe(3);
    expect(result.settings.timer.workMinutes).toBe(30);
    expect(result.heatmapRecords).toBeDefined();
  });

  it("skips when no legacy files exist (fresh install)", async () => {
    const svc = new MigrationService(makeReader({}));
    const result = await svc.migrate(null);
    expect(result.migration.state).toBe("skipped");
    expect(result.migration.sources).toEqual([]);
  });

  it("is idempotent — does not re-run once marked done", async () => {
    const readJson = vi.fn(async () => TIMER_DATA);
    const svc = new MigrationService({ readJson });
    const first = await svc.migrate(null);
    expect(readJson).toHaveBeenCalledTimes(3);
    const second = await svc.migrate(first);
    expect(readJson).toHaveBeenCalledTimes(3); // no re-read
    expect(second).toBe(first);
  });

  it("force re-runs even when marked done", async () => {
    const readJson = vi.fn(async () => TIMER_DATA);
    const svc = new MigrationService({ readJson });
    const first = await svc.migrate(null);
    const again = await svc.migrate(first, true);
    expect(readJson).toHaveBeenCalledTimes(6);
    expect(again.migration.state).toBe("done");
  });

  it("treats unreadable legacy files as absent", async () => {
    // The production reader wraps adapter errors into null; emulate that:
    const svc = new MigrationService({
      readJson: async () => null,
    });
    const result = await svc.migrate(null);
    expect(result.migration.state).toBe("skipped");
    expect(result.settings ?? {}).toEqual({});
  });
});
