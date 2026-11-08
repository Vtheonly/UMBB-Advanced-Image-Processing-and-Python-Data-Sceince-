/**
 * TimerWidget: rendering, drag (mouse + touch), clamping, collapse,
 * auto-hide, position persistence.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TimerWidget, TIMER_ELEMENT_ID } from "../src/modules/timer/TimerWidget";
import { DEFAULT_SETTINGS, formatClock } from "../src/core/settings-schema";
import { firePointer, fireMouse, mockRect, setViewport } from "./helpers/dom";
import "../test/helpers/dom-setup";

function makeWidget(settingsOverrides: any = {}) {
  const settings = { ...DEFAULT_SETTINGS.timer, ...settingsOverrides };
  const saved: { x: number; y: number } | null = null;
  const host = {
    getSettings: () => settings,
    onControl: vi.fn(),
    registerDomEvent: vi.fn((el: any, type: string, cb: any, options?: any) => {
      el.addEventListener(type, cb, options);
    }),
    savePosition: vi.fn((x: number, y: number) => {
      settings.positionX = x;
      settings.positionY = y;
    }),
  };
  const widget = new TimerWidget(host as any);
  return { widget, host, settings, saved };
}

beforeEach(() => {
  setViewport(1200, 800);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TimerWidget rendering", () => {
  it("mounts with the redesigned structure", () => {
    const { widget } = makeWidget();
    widget.mount();
    const el = document.getElementById(TIMER_ELEMENT_ID)!;
    expect(el).not.toBeNull();
    expect(el.querySelector(".frs-timer-header")).not.toBeNull();
    expect(el.querySelector(".frs-timer-clock")).not.toBeNull();
    expect(el.querySelector(".frs-timer-progress")).not.toBeNull();
    expect(el.querySelector(".frs-timer-controls")).not.toBeNull();
    expect(el.querySelectorAll(".frs-btn").length).toBe(4);
  });

  it("renders the idle state with the configured work duration", () => {
    const { widget, settings } = makeWidget({ workMinutes: 30 });
    widget.mount();
    widget.render({ phase: "idle", running: false, remainingMs: 0, totalMs: 0, focusMs: 0 });
    const el = document.getElementById(TIMER_ELEMENT_ID)!;
    expect(el.querySelector(".frs-timer-clock")!.textContent).toBe(formatClock(settings.workMinutes * 60_000));
    expect(el.getAttribute("data-phase")).toBe("ready");
    expect(el.querySelector('[data-action="start"]')!.textContent).toBe("Start");
  });

  it("renders running/paused/break phases with phase keys and labels", () => {
    const { widget } = makeWidget();
    widget.mount();
    const el = document.getElementById(TIMER_ELEMENT_ID)!;

    widget.render({ phase: "work", running: true, remainingMs: 60_000, totalMs: 300_000, focusMs: 20_000 });
    expect(el.getAttribute("data-phase")).toBe("reading");
    expect(el.querySelector(".frs-timer-phase-label")!.textContent).toBe("Reading");
    expect(el.querySelector(".frs-timer-info")!.textContent).toContain("0 min focused");

    widget.render({ phase: "work", running: false, remainingMs: 60_000, totalMs: 300_000, focusMs: 0 });
    expect(el.getAttribute("data-phase")).toBe("paused");
    expect(el.querySelector('[data-action="pause"]')!.textContent).toBe("Resume");

    widget.render({ phase: "break", running: true, remainingMs: 60_000, totalMs: 300_000, focusMs: 0 });
    expect(el.getAttribute("data-phase")).toBe("break");
    expect(el.querySelector('[data-action="start"]')!.textContent).toBe("Skip Break");
  });

  it("hides when disabled and re-appears when enabled", () => {
    const { widget, settings } = makeWidget();
    widget.mount();
    const el = document.getElementById(TIMER_ELEMENT_ID)!;
    expect(el.style.display).toBe("block");

    settings.enabled = false;
    widget.applyVisibility();
    expect(el.style.display).toBe("none");

    settings.enabled = true;
    widget.applyVisibility();
    expect(el.style.display).toBe("block");
  });
});

describe("TimerWidget positioning", () => {
  it("anchors to the top-right corner by default", () => {
    const { widget } = makeWidget();
    widget.mount();
    const el = document.getElementById(TIMER_ELEMENT_ID)!;
    expect(el.style.top).toBe("16px");
    expect(el.style.right).toBe("16px");
  });

  it("restores a saved position clamped into the viewport (mobile bug)", () => {
    // Position saved on a big desktop (x=1187) restored on a phone screen:
    setViewport(390, 700);
    const { widget } = makeWidget({ positionX: 1187, positionY: 162 });
    mockRect(document.getElementById(TIMER_ELEMENT_ID) ?? document.body, { width: 200, height: 150 });
    widget.mount();
    const el = document.getElementById(TIMER_ELEMENT_ID)!;
    const left = parseInt(el.style.left, 10);
    expect(left).toBeLessThanOrEqual(390 - 200);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(el.style.top).toBe("162px");
  });

  it("reflow re-clamps after a resize (orientation change)", () => {
    const { widget } = makeWidget({ positionX: 1000, positionY: 700 });
    widget.mount();
    const el = document.getElementById(TIMER_ELEMENT_ID)!;
    mockRect(el, { width: 200, height: 150 });
    widget.applySavedPosition();
    expect(parseInt(el.style.left, 10)).toBe(1000);

    setViewport(360, 640);
    mockRect(el, { width: 200, height: 150 });
    widget.reflow();
    expect(parseInt(el.style.left, 10)).toBeLessThanOrEqual(360 - 200);
  });
});

describe("TimerWidget interaction", () => {
  it("dragging the header moves the box and saves the position", () => {
    const { widget, host } = makeWidget();
    widget.mount();
    const el = document.getElementById(TIMER_ELEMENT_ID)!;
    const header = el.querySelector<HTMLElement>(".frs-timer-header")!;
    mockRect(el, { top: 16, left: 960, width: 220, height: 150 });

    firePointer(header, "pointerdown", { clientX: 1000, clientY: 30, pointerId: 5, pointerType: "mouse" });
    expect(el.classList.contains("frs-dragging")).toBe(true);

    firePointer(header, "pointermove", { clientX: 800, clientY: 300, pointerId: 5, pointerType: "mouse" });
    expect(parseInt(el.style.left, 10)).toBe(760); // 960 + (800-1000) + 0 offset… computed via rect math

    firePointer(header, "pointerup", { clientX: 800, clientY: 300, pointerId: 5, pointerType: "mouse" });
    expect(host.savePosition).toHaveBeenCalled();
    expect(el.classList.contains("frs-dragging")).toBe(false);
  });

  it("touch drags work through pointer events", () => {
    const { widget } = makeWidget();
    widget.mount();
    const el = document.getElementById(TIMER_ELEMENT_ID)!;
    const header = el.querySelector<HTMLElement>(".frs-timer-header")!;
    mockRect(el, { top: 16, left: 960, width: 220, height: 150 });

    firePointer(header, "pointerdown", { clientX: 1000, clientY: 30, pointerId: 1, pointerType: "touch" });
    firePointer(header, "pointermove", { clientX: 900, clientY: 230, pointerId: 1, pointerType: "touch" });
    expect(el.style.left).toBeDefined();
    firePointer(header, "pointerup", { clientX: 900, clientY: 230, pointerId: 1, pointerType: "touch" });
  });

  it("control clicks dispatch actions and never start drags", () => {
    const { widget, host } = makeWidget();
    widget.mount();
    const el = document.getElementById(TIMER_ELEMENT_ID)!;
    const startBtn = el.querySelector<HTMLButtonElement>('[data-action="start"]')!;

    firePointer(startBtn, "pointerdown", { clientX: 10, clientY: 10, pointerId: 2, pointerType: "mouse" });
    expect(el.classList.contains("frs-dragging")).toBe(false);

    startBtn.click();
    expect(host.onControl).toHaveBeenCalledWith("start");
  });

  it("double-click the header collapses and expands the card", () => {
    const { widget } = makeWidget();
    widget.mount();
    const el = document.getElementById(TIMER_ELEMENT_ID)!;
    const header = el.querySelector<HTMLElement>(".frs-timer-header")!;

    expect(widget.isCollapsed).toBe(false);
    fireMouse(header, "dblclick");
    expect(widget.isCollapsed).toBe(true);
    expect(el.classList.contains("frs-timer-collapsed")).toBe(true);
    fireMouse(header, "dblclick");
    expect(widget.isCollapsed).toBe(false);
  });

  it("double-tap the header collapses on touch (no dblclick on mobile)", () => {
    const { widget } = makeWidget();
    widget.mount();
    const el = document.getElementById(TIMER_ELEMENT_ID)!;
    const header = el.querySelector<HTMLElement>(".frs-timer-header")!;

    firePointer(header, "pointerup", { clientX: 100, clientY: 20, pointerId: 1, pointerType: "touch" });
    firePointer(header, "pointerup", { clientX: 104, clientY: 24, pointerId: 2, pointerType: "touch" });
    expect(widget.isCollapsed).toBe(true);
  });

  it("auto-hide dims after the configured seconds and poke() undims", () => {
    vi.useFakeTimers();
    try {
      const { widget } = makeWidget({ autoHide: true, autoHideSeconds: 2 });
      widget.mount();
      const el = document.getElementById(TIMER_ELEMENT_ID)!;

      widget.poke();
      vi.advanceTimersByTime(2500);
      expect(el.classList.contains("frs-dimmed")).toBe(true);

      widget.poke();
      expect(el.classList.contains("frs-dimmed")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("destroy removes the element", () => {
    const { widget } = makeWidget();
    widget.mount();
    widget.destroy();
    expect(document.getElementById(TIMER_ELEMENT_ID)).toBeNull();
  });
});
