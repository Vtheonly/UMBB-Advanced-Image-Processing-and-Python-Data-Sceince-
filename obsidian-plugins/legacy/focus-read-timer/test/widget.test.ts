import { describe, it, expect, beforeEach, vi } from "vitest";
import { TimerWidget, TIMER_ID } from "../src/widget";
import { DEFAULT_SETTINGS, TimerSettings } from "../src/settings";
import { firePointer, setViewport, mockRect } from "../../shared/test/dom-helpers";

function createHost(overrides: Partial<TimerSettings> = {}) {
  const settings: TimerSettings = { ...DEFAULT_SETTINGS, ...overrides };
  const controlHandler = vi.fn();
  const savePosition = vi.fn();
  const host = {
    getSettings: () => settings,
    onControl: controlHandler,
    registerDomElement: vi.fn((el: any, type: string, cb: any) => el.addEventListener(type, cb)),
    savePosition,
  };
  return { host, settings, controlHandler, savePosition };
}

beforeEach(() => {
  document.body.innerHTML = "";
  setViewport(1200, 800);
});

describe("TimerWidget", () => {
  it("mounts the timer box with all controls, hidden until enabled", () => {
    const { host } = createHost({ timerEnabled: false });
    const widget = new TimerWidget(host);
    widget.mount();

    const el = document.getElementById(TIMER_ID)!;
    expect(el).not.toBeNull();
    expect(el.style.display).toBe("none");
    expect(el.querySelectorAll(".frt-timer-btn").length).toBe(4);
    widget.destroy();
  });

  it("shows when enabled and renders the idle state", () => {
    const { host } = createHost({ timerEnabled: true, timerWorkMinutes: 25 });
    const widget = new TimerWidget(host);
    widget.mount();
    widget.applyVisibility();
    widget.render({ phase: "idle", running: false, remainingMs: 0, totalMs: 0, focusMs: 0 });

    const el = document.getElementById(TIMER_ID)!;
    expect(el.style.display).toBe("block");
    expect(el.querySelector(".frt-timer-time")!.textContent).toBe("25:00");
    widget.destroy();
  });

  it("clamps a desktop-saved off-screen position into a small viewport (mobile bug)", () => {
    setViewport(390, 700);
    const { host } = createHost({ timerEnabled: true, timerPositionX: 1187, timerPositionY: 162 });
    const widget = new TimerWidget(host);
    widget.mount();
    widget.applyVisibility();

    const el = document.getElementById(TIMER_ID)!;
    mockRect(el, { left: 390 - 220, top: 162, width: 220, height: 140 });
    widget.applySavedPosition();

    const left = parseInt(el.style.left, 10);
    const top = parseInt(el.style.top, 10);
    expect(left).toBeLessThanOrEqual(390);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(top).toBeLessThanOrEqual(700);
    expect(top).toBeGreaterThanOrEqual(0);
    widget.destroy();
  });

  it("uses the top-right corner anchor when no position is saved", () => {
    const { host } = createHost({ timerEnabled: true });
    const widget = new TimerWidget(host);
    widget.mount();
    const el = document.getElementById(TIMER_ID)!;
    widget.applySavedPosition();
    expect(el.style.right).toBe("16px");
    expect(el.style.top).toBe("16px");
    widget.destroy();
  });

  it("reflows (re-clamps) after a viewport shrink", () => {
    const { host } = createHost({ timerEnabled: true, timerPositionX: 1100, timerPositionY: 700 });
    const widget = new TimerWidget(host);
    widget.mount();
    const el = document.getElementById(TIMER_ID)!;

    mockRect(el, { left: 1100, top: 700, width: 220, height: 140 });
    widget.applySavedPosition();
    expect(parseInt(el.style.left, 10)).toBeLessThanOrEqual(1200);

    // Rotate to a phone-ish viewport:
    setViewport(400, 700);
    widget.reflow();
    const left = parseInt(el.style.left, 10);
    expect(left).toBeLessThanOrEqual(400);
    expect(left).toBeGreaterThanOrEqual(0);
    widget.destroy();
  });

  it("dragging the header moves the box and saves the position (mouse)", () => {
    const { host, savePosition } = createHost({ timerEnabled: true });
    const widget = new TimerWidget(host);
    widget.mount();
    const el = document.getElementById(TIMER_ID)!;
    const header = el.querySelector<HTMLElement>(".frt-timer-drag-header")!;
    mockRect(el, { left: 984, top: 16, width: 216, height: 150 });

    firePointer(header, "pointerdown", { clientX: 1000, clientY: 30, pointerId: 1, pointerType: "mouse" });
    expect(el.classList.contains("frt-dragging")).toBe(true);
    expect(el.style.left).toBe("984px");

    mockRect(el, { left: 500, top: 300, width: 216, height: 150 });
    firePointer(header, "pointermove", { clientX: 516, clientY: 314, pointerId: 1, pointerType: "mouse" });
    expect(parseInt(el.style.left, 10)).toBe(500);

    firePointer(header, "pointerup", { clientX: 516, clientY: 314, pointerId: 1, pointerType: "mouse" });
    expect(savePosition).toHaveBeenCalledTimes(1);
    widget.destroy();
  });

  it("touch drags work identically (pointer events)", () => {
    const { host, savePosition } = createHost({ timerEnabled: true });
    const widget = new TimerWidget(host);
    widget.mount();
    const el = document.getElementById(TIMER_ID)!;
    const header = el.querySelector<HTMLElement>(".frt-timer-drag-header")!;
    mockRect(el, { left: 100, top: 100, width: 216, height: 150 });

    firePointer(header, "pointerdown", { clientX: 150, clientY: 110, pointerId: 5, pointerType: "touch" });
    mockRect(el, { left: 100, top: 100, width: 216, height: 150 });
    firePointer(header, "pointermove", { clientX: 150, clientY: 450, pointerId: 5, pointerType: "touch" });
    // offsetY = 110 - 100 = 10; y = 450 - 10 = 440
    expect(parseInt(el.style.top, 10)).toBe(440);

    firePointer(header, "pointercancel", { clientX: 150, clientY: 450, pointerId: 5, pointerType: "touch" });
    expect(savePosition).toHaveBeenCalled();
    expect(el.classList.contains("frt-dragging")).toBe(false);
    widget.destroy();
  });

  it("drag positions are clamped to keep the box visible", () => {
    const { host } = createHost({ timerEnabled: true });
    const widget = new TimerWidget(host);
    widget.mount();
    const el = document.getElementById(TIMER_ID)!;
    const header = el.querySelector<HTMLElement>(".frt-timer-drag-header")!;
    mockRect(el, { left: 0, top: 0, width: 216, height: 150 });

    firePointer(header, "pointerdown", { clientX: 100, clientY: 50, pointerId: 2, pointerType: "mouse" });
    mockRect(el, { left: 0, top: 0, width: 216, height: 150 });
    firePointer(header, "pointermove", { clientX: 10_000, clientY: -10_000, pointerId: 2, pointerType: "mouse" });
    expect(parseInt(el.style.left, 10)).toBe(1200 - 216);
    expect(parseInt(el.style.top, 10)).toBe(0);
    firePointer(header, "pointerup", { clientX: 10_000, clientY: -10_000, pointerId: 2, pointerType: "mouse" });
    widget.destroy();
  });

  it("control clicks dispatch actions and do not start drags", () => {
    const { host, controlHandler } = createHost({ timerEnabled: true });
    const widget = new TimerWidget(host);
    widget.mount();
    const el = document.getElementById(TIMER_ID)!;
    const controls = el.querySelector<HTMLElement>(".frt-timer-controls")!;

    const startBtn = controls.querySelector<HTMLButtonElement>('[data-action="start"]')!;
    startBtn.click();
    expect(controlHandler).toHaveBeenCalledWith("start");

    widget.destroy();
  });

  it("renders running/paused/break states with correct labels", () => {
    const { host } = createHost({ timerEnabled: true });
    const widget = new TimerWidget(host);
    widget.mount();
    const el = document.getElementById(TIMER_ID)!;

    widget.render({ phase: "work", running: true, remainingMs: 90_000, totalMs: 300_000, focusMs: 60_000 });
    expect(el.querySelector(".frt-timer-time")!.textContent).toBe("01:30");
    expect(el.querySelector(".frt-drag-label-text")!.textContent).toBe("Reading");
    expect(el.querySelector('[data-action="pause"]')!.textContent).toBe("Pause");
    expect((el.querySelector('[data-action="pause"]') as HTMLButtonElement).disabled).toBe(false);

    widget.render({ phase: "work", running: false, remainingMs: 90_000, totalMs: 300_000, focusMs: 60_000 });
    expect(el.querySelector(".frt-drag-label-text")!.textContent).toBe("Paused");
    expect(el.querySelector('[data-action="pause"]')!.textContent).toBe("Resume");

    widget.render({ phase: "break", running: true, remainingMs: 60_000, totalMs: 300_000, focusMs: 0 });
    expect(el.querySelector(".frt-drag-label-text")!.textContent).toBe("Break");
    expect(el.querySelector('[data-action="start"]')!.textContent).toBe("Skip Break");

    widget.render({ phase: "idle", running: false, remainingMs: 0, totalMs: 0, focusMs: 0 });
    expect(el.querySelector(".frt-timer-xp")!.textContent).toBe("Click Start to begin");
    expect((el.querySelector('[data-action="stop"]') as HTMLButtonElement).disabled).toBe(true);
    widget.destroy();
  });

  it("auto-hide dims after the configured seconds and poke() restores", () => {
    vi.useFakeTimers();
    try {
      const { host } = createHost({ timerEnabled: true, timerAutoHide: true, timerAutoHideSeconds: 2 });
      const widget = new TimerWidget(host);
      widget.mount();
      widget.applyVisibility();
      const el = document.getElementById(TIMER_ID)!;

      widget.poke();
      expect(el.style.opacity).toBe("1");

      vi.advanceTimersByTime(2_100);
      expect(el.style.opacity).toBe("0.55");

      widget.poke();
      expect(el.style.opacity).toBe("1");
      widget.cancelAutoHide();
      widget.destroy();
    } finally {
      vi.useRealTimers();
    }
  });
});
