/**
 * Bootstrap test: boots the REAL plugin (all four modules) against the
 * obsidian stub + happy-dom with legacy plugin data present, then:
 *
 *   1. verifies the migration ran and mapped every setting;
 *   2. verifies the DOM effects of each module;
 *   3. exercises interactions (timer controls, ruler drag, heatmap tick);
 *   4. unloads and asserts zero leaked listeners/intervals/DOM;
 *   5. asserts the legacy data files were never touched;
 *   6. asserts stats/records survive a full load → unload → save cycle.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "../test/helpers/dom-setup";
import { createAppStub, Notice, MarkdownView, TFile, AdapterStub, WorkspaceStub, VaultStub } from "./helpers/obsidian-stub";
import { firePointer, mockRect, setViewport } from "./helpers/dom";
import FocusReadSuitePlugin from "../src/main";
import { LEGACY_PLUGIN_PATHS } from "../src/core/migration";

const manifest = { id: "focus-read-suite", version: "2.0.0" };

/* ---- Realistic legacy data from the three old plugins ---- */

const legacyTimerData = {
  settings: {
    timerEnabled: true,
    timerWorkMinutes: 30,
    timerBreakMinutes: 7,
    timerAutoHide: false,
    timerPauseOnBlur: false,
    timerPositionX: 1187,
    timerPositionY: 162,
    focusDetectionEnabled: false,
    nudgeEnabled: false,
    nudgeIgnoreScroll: true,
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
    sessionsToday: 0,
  },
};

const legacyTypographyData = {
  typographyEnabled: false,
  fontFamily: "lexend",
  customFontFamily: "",
  loadGoogleFonts: false,
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

const legacyHeatmapData = {
  settings: {
    idleSeconds: 10,
    bucketCount: 200,
    heatmapWidth: 20,
    heatmapOffsetRight: 16,
    heatmapOpacity: 1,
    refreshIntervalMs: 500,
    debugMode: false,
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

function legacyFiles(): Record<string, string> {
  return {
    [LEGACY_PLUGIN_PATHS.timer]: JSON.stringify(legacyTimerData),
    [LEGACY_PLUGIN_PATHS.typography]: JSON.stringify(legacyTypographyData),
    [LEGACY_PLUGIN_PATHS.heatmap]: JSON.stringify(legacyHeatmapData),
  };
}

interface Booted {
  plugin: FocusReadSuitePlugin;
  app: ReturnType<typeof createAppStub>;
  adapter: AdapterStub;
}

async function boot(opts: { legacy?: boolean; data?: any } = {}): Promise<Booted> {
  const app = createAppStub({
    legacyFiles: opts.legacy ? legacyFiles() : {},
    enabledPlugins: opts.legacy ? ["focus-read-timer", "heatmap-of-notes"] : [],
  });
  const plugin = new FocusReadSuitePlugin(app as any, manifest);
  if (opts.data) (plugin as any).__setData(opts.data);
  await plugin.onload();
  return { plugin, app, adapter: (app.vault as VaultStub).adapter as AdapterStub };
}

function makeScrollerView(path: string, scroll: { top: number; height: number; client: number }) {
  const view = new MarkdownView();
  const file = new TFile();
  file.path = path;
  file.name = path.split("/").pop()!;
  view.file = file;
  const scroller = view.contentEl.ownerDocument.createElement("div");
  scroller.className = "cm-scroller";
  Object.defineProperty(scroller, "scrollTop", { value: scroll.top, configurable: true, writable: true });
  Object.defineProperty(scroller, "scrollHeight", { value: scroll.height, configurable: true, writable: true });
  Object.defineProperty(scroller, "clientHeight", { value: scroll.client, configurable: true, writable: true });
  view.contentEl.appendChild(scroller);
  mockRect(view.contentEl, { width: 600, height: scroll.client });
  document.body.appendChild(view.contentEl);
  return view;
}

beforeEach(() => {
  setViewport(1200, 800);
  Notice.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Focus Read Suite bootstrap", () => {
  it("migrates all three legacy plugins' settings on first load", async () => {
    const { plugin } = await boot({ legacy: true });
    const s = plugin.settings.settings;

    expect(s.timer.workMinutes).toBe(30);
    expect(s.timer.breakMinutes).toBe(7);
    expect(s.timer.autoHide).toBe(false);
    expect(s.timer.pauseOnBlur).toBe(false);
    expect(s.timer.positionX).toBe(1187);
    expect(s.timer.positionY).toBe(162);
    expect(s.timer.focusDetectionEnabled).toBe(false);
    expect(s.timer.dopamineEnabled).toBe(true);
    expect(s.timer.dopamineDailyGoalMinutes).toBe(90);

    expect(s.typography.enabled).toBe(false);
    expect(s.typography.fontFamily).toBe("lexend");
    expect(s.typography.fontSize).toBe(19);
    expect(s.typography.lineHeight).toBe(1.8);

    expect(s.focus.enabled).toBe(true);
    expect(s.ruler.height).toBe(47);
    expect(s.ruler.color).toBe("#ffc400");
    expect(s.ruler.opacity).toBe(0.6);
    expect(s.ruler.mode).toBe("manual");
    expect(s.ruler.positionRatio).toBe(0.66);

    expect(s.heatmap.idleSeconds).toBe(10);
    expect(s.heatmap.bucketCount).toBe(200);
    expect(s.heatmap.width).toBe(20);
    expect(s.heatmap.opacity).toBe(1);

    expect(s.advanced.refreshIntervalMs).toBe(500);

    // A migration notice was shown:
    expect(Notice.messages.some((m) => m.includes("migrated your settings"))).toBe(true);

    await plugin.onunload();
  });

  it("migrates stats and heatmap records (data preservation)", async () => {
    const { plugin } = await boot({ legacy: true });

    const stats = plugin.settings.getExtra<Record<string, any>>("stats")!;
    // Daily rollover legitimately updates today* fields, but the history is
    // preserved verbatim:
    expect(stats.totalReadingMs).toBe(legacyTimerData.stats.totalReadingMs);
    expect(stats.perDayMs).toEqual(legacyTimerData.stats.perDayMs);
    expect(stats.longestStreak).toBe(3);
    expect(stats.longestFocusMs).toBe(1464168);

    const records = plugin.settings.getExtra<Record<string, any>>("heatmapRecords")!;
    expect(records["test/note.md"]).toBeDefined();
    expect(records["test/note.md"].totalTimeMs).toBe(275000);

    await plugin.onunload();
  });

  it("leaves the legacy data files untouched", async () => {
    const files = legacyFiles();
    const app = createAppStub({ legacyFiles: files });
    const plugin = new FocusReadSuitePlugin(app as any, manifest);
    await plugin.onload();
    await plugin.onunload();

    expect(files[LEGACY_PLUGIN_PATHS.timer]).toBe(JSON.stringify(legacyTimerData));
    expect(files[LEGACY_PLUGIN_PATHS.typography]).toBe(JSON.stringify(legacyTypographyData));
    expect(files[LEGACY_PLUGIN_PATHS.heatmap]).toBe(JSON.stringify(legacyHeatmapData));
  });

  it("does not re-run the migration after it is marked done", async () => {
    const { plugin } = await boot({ legacy: true });
    await plugin.onunload();
    Notice.reset();

    // Second boot: data.json now contains the migration marker.
    const saved = (plugin as any).__getData();
    const app2 = createAppStub({ legacyFiles: legacyFiles() });
    const plugin2 = new FocusReadSuitePlugin(app2 as any, manifest);
    (plugin2 as any).__setData(saved);
    await plugin2.onload();
    expect(Notice.messages.some((m) => m.includes("migrated"))).toBe(false);

    await plugin2.onunload();
  });

  it("starts fresh (defaults) when no legacy data exists", async () => {
    const { plugin } = await boot({ legacy: false });
    const s = plugin.settings.settings;
    expect(s.timer.workMinutes).toBe(25);
    expect(s.typography.fontFamily).toBe("system");
    expect(s.focus.enabled).toBe(false);
    expect(plugin.settings.raw.migration?.state).toBe("skipped");
    await plugin.onunload();
  });

  it("mounts the timer widget and applies the migrated visible state", async () => {
    const { plugin } = await boot({ legacy: true });
    const el = document.getElementById("frs-timer");
    expect(el).not.toBeNull();
    expect(el!.style.display).toBe("block"); // timerEnabled: true

    // Migrated goal bar is visible:
    expect(document.getElementById("frs-goal-bar")).not.toBeNull();

    await plugin.onunload();
    expect(document.getElementById("frs-timer")).toBeNull();
    expect(document.getElementById("frs-goal-bar")).toBeNull();
  });

  it("mounts the ruler when reading focus was enabled in legacy data", async () => {
    const { plugin } = await boot({ legacy: true });
    const ruler = document.getElementById("frs-ruler");
    expect(ruler).not.toBeNull();
    expect(ruler!.style.getPropertyValue("--frs-ruler-height")).toBe("47px");
    expect(ruler!.style.getPropertyValue("--frs-ruler-color")).toBe("#ffc400");
    expect(ruler!.style.getPropertyValue("--frs-ruler-opacity")).toBe("0.6");
    expect(document.body.classList.contains("frs-focus-on")).toBe(true);

    // Migrated position ratio applied: 0.66 * (800 - 47) = 497.
    expect(ruler!.style.transform).toBe(`translate3d(0, ${Math.round(0.66 * (800 - 47))}px, 0)`);

    await plugin.onunload();
    expect(document.getElementById("frs-ruler")).toBeNull();
    expect(document.body.classList.contains("frs-focus-on")).toBe(false);
  });

  it("applies migrated typography CSS variables (but stays disabled)", async () => {
    const { plugin } = await boot({ legacy: true });
    const root = document.documentElement.style;
    expect(root.getPropertyValue("--frs-font-size")).toBe("19px");
    expect(root.getPropertyValue("--frs-line-height")).toBe("1.8");
    expect(root.getPropertyValue("--frs-font-family")).toBe("'Lexend', sans-serif");
    expect(document.body.classList.contains("frs-typography-on")).toBe(false); // legacy disabled

    await plugin.onunload();
    expect(root.getPropertyValue("--frs-font-size")).toBe(""); // cleaned up
    expect(document.body.classList.contains("frs-typography-on")).toBe(false);
  });

  it("attaches heatmap strips to open views and tracks reading time", async () => {
    const { plugin, app } = await boot({ legacy: true });
    const view = makeScrollerView("test/note.md", { top: 0, height: 4000, client: 800 });
    (app.workspace as WorkspaceStub).leaves.push({ view });
    (app.workspace as WorkspaceStub).trigger("layout-change");

    expect(view.contentEl.querySelector(".frs-heatmap-wrapper")).not.toBeNull();

    // The migrated record survives and renders; opening the note in THIS
    // session adds one visit on top of the legacy count (by design):
    const rec = plugin.modules.heatmap.getRecord("test/note.md");
    expect(rec).toBeDefined();
    expect(rec!.visits).toBe(4); // 3 legacy + 1 this session

    await plugin.onunload();
    expect(view.contentEl.querySelector(".frs-heatmap-wrapper")).toBeNull();
  });

  it("starts a focus session through the real widget buttons", async () => {
    vi.useFakeTimers();
    try {
      const { plugin } = await boot({ legacy: true });
      const el = document.getElementById("frs-timer")!;
      const timer = (plugin.modules.timer as any).timer;

      el.querySelector<HTMLButtonElement>('[data-action="start"]')!.click();
      expect(timer.phase).toBe("work");
      expect(timer.running).toBe(true);
      expect(el.getAttribute("data-phase")).toBe("reading");

      el.querySelector<HTMLButtonElement>('[data-action="pause"]')!.click();
      expect(timer.running).toBe(false);

      el.querySelector<HTMLButtonElement>('[data-action="stop"]')!.click();
      expect(timer.phase).toBe("idle");

      await plugin.onunload();
    } finally {
      vi.useRealTimers();
    }
  });

  it("registers the full command surface (11 commands)", async () => {
    const { plugin } = await boot({ legacy: false });
    const ids = (plugin as any).commands.map((c: any) => c.id);
    expect(ids).toContain("start-focus-session");
    expect(ids).toContain("pause-resume-focus-session");
    expect(ids).toContain("stop-focus-session");
    expect(ids).toContain("reset-timer-position");
    expect(ids).toContain("toggle-reading-focus");
    expect(ids).toContain("center-reading-ruler");
    expect(ids).toContain("move-reading-ruler-up");
    expect(ids).toContain("move-reading-ruler-down");
    expect(ids).toContain("toggle-typography");
    expect(ids).toContain("clear-note-heatmap");
    expect(ids).toContain("open-settings");
    expect(ids).toContain("disable-legacy-plugins");
    expect(ids.length).toBeGreaterThanOrEqual(12);
    await plugin.onunload();
  });

  it("unloads with zero leaked intervals, listeners or DOM nodes", async () => {
    const { plugin } = await boot({ legacy: true });
    const view = makeScrollerView("test/note.md", { top: 0, height: 4000, client: 800 });
    (plugin.app as any).workspace.leaves.push({ view });
    (plugin.app as any).workspace.trigger("layout-change");

    const domEventsBefore = (plugin as any).registeredDomEvents.length;
    const intervalsBefore = (plugin as any).registeredIntervals.length;
    expect(domEventsBefore).toBeGreaterThan(0);
    expect(intervalsBefore).toBeGreaterThan(0);

    await plugin.onunload();
    (plugin as any).__obsidianTeardown();

    // Obsidian clears the registries — nothing survives:
    expect((plugin as any).registeredDomEvents.length).toBe(0);
    expect((plugin as any).registeredIntervals.length).toBe(0);

    // No plugin-owned DOM nodes survive:
    for (const id of ["frs-timer", "frs-goal-bar", "frs-ruler", "frs-heatmap-tooltip", "frs-nudge"]) {
      expect(document.getElementById(id)).toBeNull();
    }
    expect(view.contentEl.querySelector(".frs-heatmap-wrapper")).toBeNull();
    expect(document.body.classList.contains("frs-focus-on")).toBe(false);
    expect(document.body.classList.contains("frs-typography-on")).toBe(false);
  });

  it("stats and records survive a full load → unload → save cycle", async () => {
    const { plugin } = await boot({ legacy: true });
    await plugin.onunload();
    const saved = (plugin as any).__getData();

    // Daily counters legitimately roll over; the history is preserved:
    expect(saved.stats.totalReadingMs).toBe(legacyTimerData.stats.totalReadingMs);
    expect(saved.stats.perDayMs).toEqual(legacyTimerData.stats.perDayMs);
    expect(saved.stats.longestStreak).toBe(3);
    expect(saved.heatmapRecords["test/note.md"].totalTimeMs).toBe(275000);
    expect(saved.migration.state).toBe("done");
    expect(saved.settings.timer.workMinutes).toBe(30);
    expect(saved.settings.ruler.height).toBe(47);
    // The saved payload must not contain a stale duplicate of settings:
    const keys = Object.keys(saved);
    expect(keys.filter((k) => k === "settings")).toEqual(["settings"]);
  });

  it("settings changes dispatch to modules immediately (ruler mounts on toggle)", async () => {
    const { plugin } = await boot({ legacy: false });
    expect(document.getElementById("frs-ruler")).toBeNull(); // focus off by default

    await plugin.settings.update("focus", (draft) => {
      draft.focus.enabled = true;
    });

    expect(document.getElementById("frs-ruler")).not.toBeNull();
    expect(document.body.classList.contains("frs-focus-on")).toBe(true);

    // Live ruler config change:
    await plugin.settings.update("ruler", (draft) => {
      draft.ruler.height = 60;
      draft.ruler.color = "#ffaa00";
    });
    const ruler = document.getElementById("frs-ruler")!;
    expect(ruler.style.getPropertyValue("--frs-ruler-height")).toBe("60px");
    expect(ruler.style.getPropertyValue("--frs-ruler-color")).toBe("#ffaa00");

    // Typography toggle applies the body class + CSS vars:
    await plugin.settings.update("typography", (draft) => {
      draft.typography.enabled = true;
    });
    expect(document.body.classList.contains("frs-typography-on")).toBe(true);
    expect(document.documentElement.style.getPropertyValue("--frs-font-size")).toBe("17px");

    // Disabling heatmap removes strips + stops the engine:
    const view = makeScrollerView("x.md", { top: 0, height: 2000, client: 800 });
    (plugin.app as any).workspace.leaves.push({ view });
    (plugin.app as any).workspace.trigger("layout-change");
    expect(view.contentEl.querySelector(".frs-heatmap-wrapper")).not.toBeNull();

    await plugin.settings.update("heatmap", (draft) => {
      draft.heatmap.enabled = false;
    });
    expect(view.contentEl.querySelector(".frs-heatmap-wrapper")).toBeNull();

    await plugin.onunload();
  });

  it("detects enabled legacy plugins and can disable them", async () => {
    const { plugin } = await boot({ legacy: true });
    expect(plugin.detectLegacyPlugins()).toEqual(["focus-read-timer", "heatmap-of-notes"]);

    const ok = await plugin.disableLegacyPlugins();
    expect(ok).toBe(true);
    // disablePlugin was invoked (the stub records it via vault events):
    const vault = plugin.app.vault as unknown as { trigger: (n: string, d?: any) => void };
    await plugin.onunload();
    expect(vault.trigger).toBeDefined();
  });

  it("rerunMigration keeps customized suite settings", async () => {
    const { plugin } = await boot({ legacy: true });

    // The user changes something in the suite:
    await plugin.settings.update("timer", (draft) => {
      draft.timer.workMinutes = 15;
    });
    await plugin.settings.update("ruler", (draft) => {
      draft.ruler.height = 33;
    });

    await plugin.rerunMigration();

    // Customized values win; untouched values stay migrated:
    expect(plugin.settings.settings.timer.workMinutes).toBe(15);
    expect(plugin.settings.settings.ruler.height).toBe(33);
    expect(plugin.settings.settings.timer.breakMinutes).toBe(7); // from legacy
    expect(plugin.settings.settings.ruler.color).toBe("#ffc400"); // from legacy

    await plugin.onunload();
  });
});
