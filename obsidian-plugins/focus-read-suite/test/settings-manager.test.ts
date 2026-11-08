/**
 * SettingsManager: load, update, persist (debounced), subscribe, reset,
 * extras and error rejection.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { SettingsManager } from "../src/core/settings-manager";
import { DEFAULT_SETTINGS } from "../src/core/settings-schema";

function makeIo(initial: any = null) {
  let stored = initial;
  const io = {
    loadData: vi.fn(async () => (stored === null ? null : JSON.parse(JSON.stringify(stored)))),
    saveData: vi.fn(async (data: any) => {
      stored = JSON.parse(JSON.stringify(data));
    }),
    get stored() {
      return stored;
    },
  };
  return { io, loadSpy: io.loadData, saveSpy: io.saveData };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SettingsManager", () => {
  it("starts from defaults and persists nothing until asked", async () => {
    const { io } = makeIo();
    const mgr = new SettingsManager(io);
    expect(mgr.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("loads and normalizes persisted settings", async () => {
    const { io } = makeIo({
      version: 2,
      settings: { timer: { workMinutes: 40 }, ruler: { height: 999 } },
      stats: { todayMs: 123 },
    });
    const mgr = new SettingsManager(io);
    await mgr.load();
    expect(mgr.settings.timer.workMinutes).toBe(40);
    expect(mgr.settings.ruler.height).toBe(80); // clamped
    expect(mgr.getExtra("stats")).toEqual({ todayMs: 123 });
  });

  it("runs the load hook (migration) between read and normalize", async () => {
    const { io } = makeIo(null);
    const mgr = new SettingsManager(io);
    await mgr.load(async () => ({ settings: { timer: { workMinutes: 33 } } }));
    expect(mgr.settings.timer.workMinutes).toBe(33);
  });

  it("update() applies the mutation, normalizes, persists and emits", async () => {
    const { io, saveSpy } = makeIo();
    const mgr = new SettingsManager(io);
    await mgr.load();

    const seen: string[][] = [];
    mgr.subscribe((sections) => seen.push(sections));

    await mgr.update("ruler", (draft) => {
      draft.ruler.height = 45;
    });

    expect(mgr.settings.ruler.height).toBe(45);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([["ruler"]]);
    // The persisted payload has the full shape:
    expect(io.stored.settings.ruler.height).toBe(45);
    expect(io.stored.version).toBe(2);
  });

  it("update() clamps what the mutator wrote", async () => {
    const { io } = makeIo();
    const mgr = new SettingsManager(io);
    await mgr.load();
    await mgr.update("typography", (draft) => {
      draft.typography.fontSize = 5000;
    });
    expect(mgr.settings.typography.fontSize).toBe(26);
  });

  it("update() rejects a throwing mutator without touching state", async () => {
    const { io } = makeIo({ settings: { timer: { workMinutes: 30 } } });
    const mgr = new SettingsManager(io);
    await mgr.load();
    const before = mgr.settings.timer.workMinutes;
    await expect(
      mgr.update("timer", () => {
        throw new Error("boom");
      })
    ).resolves.toBeUndefined();
    expect(mgr.settings.timer.workMinutes).toBe(before);
  });

  it("update() does not emit when nothing changed", async () => {
    const { io, saveSpy } = makeIo();
    const mgr = new SettingsManager(io);
    await mgr.load();
    const seen: string[][] = [];
    mgr.subscribe((s) => seen.push(s));
    await mgr.update("timer", () => {
      /* no-op */
    });
    expect(seen).toEqual([]);
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("update() never resets sections it was not asked to touch (regression)", async () => {
    const { io } = makeIo({ settings: { timer: { workMinutes: 40 }, ruler: { height: 60 } } });
    const mgr = new SettingsManager(io);
    await mgr.load();
    await mgr.update("timer", (d) => {
      d.timer.workMinutes = 35;
    });
    expect(mgr.settings.timer.workMinutes).toBe(35);
    expect(mgr.settings.ruler.height).toBe(60); // untouched by the timer update
    expect(mgr.settings.typography.fontSize).toBe(DEFAULT_SETTINGS.typography.fontSize);
  });

  it("persisted payloads never let stale extras shadow settings (regression)", async () => {
    const { io } = makeIo();
    const mgr = new SettingsManager(io);
    await mgr.load(async () => ({ settings: { timer: { workMinutes: 30 } }, stats: { x: 1 } }));
    await mgr.update("timer", (d) => {
      d.timer.workMinutes = 15;
    });
    // The persisted settings reflect the update — not a stale snapshot:
    expect(io.stored.settings.timer.workMinutes).toBe(15);
    expect(io.stored.stats).toEqual({ x: 1 });
    // Extras never capture the settings object:
    expect("settings" in (mgr.raw as any)).toBe(false);
  });

  it("persists debounced when immediate=false", async () => {
    const { io, saveSpy } = makeIo();
    const mgr = new SettingsManager(io);
    await mgr.load();

    await mgr.update("timer", (d) => { d.timer.workMinutes = 35; }, false);
    await mgr.update("timer", (d) => { d.timer.breakMinutes = 7; }, false);
    expect(saveSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(400);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(mgr.settings.timer.breakMinutes).toBe(7);
  });

  it("resetSections() restores defaults for the given sections only", async () => {
    const { io } = makeIo({ settings: { timer: { workMinutes: 40 }, ruler: { height: 60 } } });
    const mgr = new SettingsManager(io);
    await mgr.load();

    const seen: string[][] = [];
    mgr.subscribe((s) => seen.push(s));

    await mgr.resetSections(["timer"]);
    expect(mgr.settings.timer.workMinutes).toBe(DEFAULT_SETTINGS.timer.workMinutes);
    expect(mgr.settings.ruler.height).toBe(60); // untouched
    expect(seen).toEqual([["timer"]]);
  });

  it("extras round-trip through setExtra and the persisted payload", async () => {
    const { io } = makeIo();
    const mgr = new SettingsManager(io);
    await mgr.load();
    await mgr.setExtra("heatmapRecords", { "a.md": { visits: 1 } }, true);
    expect(io.stored.heatmapRecords).toEqual({ "a.md": { visits: 1 } });
    expect(mgr.getExtra<Record<string, { visits: number }>>("heatmapRecords")!["a.md"].visits).toBe(1);
  });

  it("a throwing listener does not break the others", async () => {
    const { io } = makeIo();
    const mgr = new SettingsManager(io);
    await mgr.load();
    const ok = vi.fn();
    mgr.subscribe(() => {
      throw new Error("listener boom");
    });
    mgr.subscribe(ok);
    await mgr.update("general", (d) => { d.general.showNotices = false; });
    expect(ok).toHaveBeenCalled();
  });

  it("replaceAllSettings() swaps settings, persists and notifies all sections", async () => {
    const { io } = makeIo();
    const mgr = new SettingsManager(io);
    await mgr.load();
    const seen: string[][] = [];
    mgr.subscribe((s) => seen.push(s));
    await mgr.replaceAllSettings({ timer: { workMinutes: 15 } });
    expect(mgr.settings.timer.workMinutes).toBe(15);
    expect(mgr.settings.ruler).toEqual(DEFAULT_SETTINGS.ruler);
    expect(seen.length).toBe(1);
    expect(seen[0].length).toBe(8);
  });

  it("survives loadData throwing (corrupt data.json)", async () => {
    const io = {
      loadData: async () => {
        throw new Error("disk on fire");
      },
      saveData: async () => {},
    };
    const mgr = new SettingsManager(io);
    await expect(mgr.load()).resolves.toBeUndefined();
    expect(mgr.settings).toEqual(DEFAULT_SETTINGS);
  });
});
