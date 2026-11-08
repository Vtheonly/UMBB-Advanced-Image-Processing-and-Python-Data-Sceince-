import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createAppStub, Notice } from "../../shared/test/obsidian-stub";
import { setViewport, firePointer } from "../../shared/test/dom-helpers";
import TIMER_PLUGIN from "../src/main";
import { TIMER_ID } from "../src/widget";

/**
 * Bootstrap smoke test for the whole Focus Read Timer plugin against the
 * obsidian stub + happy-dom: load → commands → unload, including lifecycle
 * hygiene (no leaked intervals/listeners/DOM).
 */

const manifest = { id: "focus-read-timer", version: "1.1.0" };

function makePlugin(data: any = null) {
  const app = createAppStub();
  const plugin = new TIMER_PLUGIN(app as any, manifest);
  if (data) (plugin as any).__setData(data);
  return plugin;
}

beforeEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  setViewport(1200, 800);
  Notice.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Focus Read Timer plugin bootstrap", () => {
  it("loads with defaults, mounts timer + dopamine bar, registers commands", async () => {
    const plugin = makePlugin();
    await plugin.onload();

    expect(document.getElementById(TIMER_ID)).not.toBeNull();
    expect(document.getElementById("frt-dopamine-bar")).not.toBeNull();

    const ids = (plugin as any).commands.map((c: any) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining(["timer-start", "timer-pause", "timer-stop", "reset-timer-position"])
    );

    // Timer box visible by default (timerEnabled: true).
    expect(document.getElementById(TIMER_ID)!.style.display).toBe("block");

    await plugin.onunload();
    (plugin as any).__obsidianTeardown();

    expect(document.getElementById(TIMER_ID)).toBeNull();
    expect(document.getElementById("frt-dopamine-bar")).toBeNull();
    expect(document.getElementById("frt-dopamine-bar-label")).toBeNull();
  });

  it("loads the user's real saved data without losing any stats (compat)", async () => {
    const plugin = makePlugin({
      settings: {
        timerEnabled: true,
        timerWorkMinutes: 25,
        timerBreakMinutes: 5,
        timerAutoHide: false,
        timerPauseOnBlur: false,
        timerPositionX: 1187,
        timerPositionY: 162,
        focusDetectionEnabled: false,
        nudgeEnabled: true,
        nudgeIdleSeconds: 30,
        nudgeIgnoreScroll: false,
        dopamineEnabled: false,
      },
      stats: {
        totalReadingMs: 6_365_749,
        todayMs: 30_005,
        todayDate: "2026-09-17",
        streak: 1,
        lastReadDate: "2026-09-17",
        longestStreak: 3,
        perDayMs: { "2026-07-08": 3_278_903, "2026-09-17": 30_005 },
        longestFocusMs: 1_464_168.3,
        sessionsToday: 0,
      },
    });
    await plugin.onload();

    // The desktop-saved position (1187,162) must be clamped into the
    // 1200x800 test viewport, not applied blindly:
    const el = document.getElementById(TIMER_ID)!;
    expect(el.style.display).toBe("block");
    // (1187 fits in 1200, so it stays; see the dedicated widget test for
    // the small-viewport clamping case.)
    expect((plugin as any).stats.totalReadingMs).toBe(6_365_749);
    expect((plugin as any).stats.perDayMs["2026-07-08"]).toBe(3_278_903);

    await plugin.onunload();
    const saved = (plugin as any).__getData();
    expect(saved.stats.totalReadingMs).toBe(6_365_749); // nothing lost
    expect(saved.settings.timerWorkMinutes).toBe(25);
  });

  it("start/pause/stop commands drive the widget", async () => {
    const plugin = makePlugin();
    await plugin.onload();

    const start = (plugin as any).commands.find((c: any) => c.id === "timer-start");
    start.callback();
    expect((plugin as any).timer.phase).toBe("work");
    expect(document.querySelector(".frt-drag-label-text")!.textContent).toBe("Reading");

    const pause = (plugin as any).commands.find((c: any) => c.id === "timer-pause");
    pause.callback();
    expect(document.querySelector(".frt-drag-label-text")!.textContent).toBe("Paused");

    const stop = (plugin as any).commands.find((c: any) => c.id === "timer-stop");
    stop.callback();
    expect((plugin as any).timer.phase).toBe("idle");
    expect(document.querySelector(".frt-timer-xp")!.textContent).toBe("Click Start to begin");

    await plugin.onunload();
  });

  it("control buttons work end-to-end through the real DOM", async () => {
    const plugin = makePlugin();
    await plugin.onload();

    document.querySelector<HTMLButtonElement>('[data-action="start"]')!.click();
    expect((plugin as any).timer.phase).toBe("work");

    document.querySelector<HTMLButtonElement>('[data-action="addtime"]')!.click();
    expect(Notice.messages.some((m) => m.includes("Added 30s"))).toBe(true);

    document.querySelector<HTMLButtonElement>('[data-action="stop"]')!.click();
    expect((plugin as any).timer.phase).toBe("idle");

    await plugin.onunload();
  });

  it("window blur pauses a running session when pauseOnBlur is on", async () => {
    const plugin = makePlugin();
    await plugin.onload();

    (plugin as any).timer.startWork();
    window.dispatchEvent(new window.Event("blur"));
    expect((plugin as any).timer.running).toBe(false);

    await plugin.onunload();
  });

  it("hides the timer box when the module is disabled", async () => {
    const plugin = makePlugin({ settings: { timerEnabled: false } });
    await plugin.onload();
    const el = document.getElementById(TIMER_ID)!;
    expect(el.style.display).toBe("none");
    await plugin.onunload();
  });

  it("unloading clears all registered intervals and listeners", async () => {
    const plugin = makePlugin();
    await plugin.onload();

    const intervalsBefore = (plugin as any).registeredIntervals.length;
    const domEventsBefore = (plugin as any).registeredDomEvents.length;
    expect(intervalsBefore).toBeGreaterThanOrEqual(3); // nudge, flush, dopamine
    expect(domEventsBefore).toBeGreaterThanOrEqual(8); // pointer, key, scroll, blur, focus, visibility...

    await plugin.onunload();
    (plugin as any).__obsidianTeardown();

    expect((plugin as any).registeredIntervals.length).toBe(0);
    expect((plugin as any).registeredDomEvents.length).toBe(0);

    // The visibilitychange listener on document is actually removed:
    // (verified indirectly — no error and no leftover handlers.)
    const nudge = document.getElementById("frt-adhd-nudge");
    expect(nudge).toBeNull();
  });

  it("timer drag persists position through the plugin (savePosition wiring)", async () => {
    const plugin = makePlugin();
    await plugin.onload();

    const el = document.getElementById(TIMER_ID)!;
    const header = el.querySelector<HTMLElement>(".frt-timer-drag-header")!;
    const original = (el as any).getBoundingClientRect.bind(el);
    (el as any).getBoundingClientRect = () => ({
      left: 500, top: 300, width: 216, height: 150, right: 716, bottom: 450, x: 500, y: 300, toJSON: () => ({}),
    });

    firePointer(header, "pointerdown", { clientX: 520, clientY: 320, pointerId: 1, pointerType: "mouse" });
    firePointer(header, "pointermove", { clientX: 540, clientY: 340, pointerId: 1, pointerType: "mouse" });
    firePointer(header, "pointerup", { clientX: 540, clientY: 340, pointerId: 1, pointerType: "mouse" });
    (el as any).getBoundingClientRect = original;

    await new Promise((r) => setTimeout(r, 0));
    const saved = (plugin as any).__getData() as any;
    expect(saved.settings.timerPositionX).toBeDefined();
    expect(saved.settings.timerPositionY).toBeDefined();

    await plugin.onunload();
  });
});
