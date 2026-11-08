/**
 * ReadingRuler + notch interaction tests.
 *
 * These reproduce the exact scenarios that were broken on mobile — tapping,
 * dragging with a finger, OS gesture interruption (pointercancel), scroll
 * conflicts — through the pointer-event pipeline browsers actually deliver.
 * Plus the new features: focus line, notch sizing, drag badge, keyboard
 * support, smooth follow.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ReadingRuler, RULER_ID, RULER_BODY_CLASS } from "../src/modules/focus/ReadingRuler";
import { FocusSettings, RulerSettings, DEFAULT_SETTINGS } from "../src/core/settings-schema";
import { firePointer, fireKey, setViewport } from "./helpers/dom";
import "../test/helpers/dom-setup";

function createHost(
  focusOverrides: Partial<FocusSettings> = {},
  rulerOverrides: Partial<RulerSettings> = {}
) {
  const focus: FocusSettings = { ...DEFAULT_SETTINGS.focus, enabled: true, ...focusOverrides };
  const ruler: RulerSettings = { ...DEFAULT_SETTINGS.ruler, height: 40, ...rulerOverrides };
  const saved: { focus: FocusSettings; ruler: RulerSettings } = { focus, ruler };
  const registered: Array<{ el: any; type: string }> = [];
  const host = {
    getFocusSettings: () => saved.focus,
    getRulerSettings: () => saved.ruler,
    saveRulerSettings: vi.fn(async (mutate: (draft: typeof saved) => void) => {
      mutate(saved);
    }),
    registerDomEvent: vi.fn((el: any, type: string, cb: any) => {
      el.addEventListener(type, cb);
      registered.push({ el, type });
    }),
  };
  return { host, saved, registered };
}

function flushRaf(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 40));
}

/** Extracts the ruler's current Y offset from its transform. */
function rulerTop(el: HTMLElement): number {
  const match = el.style.transform.match(/translate3d\(0,\s*([\d.]+)px/);
  return match ? parseFloat(match[1]) : NaN;
}

let originalMatchMedia: typeof window.matchMedia;

function setHoverCapabilities(hover: boolean): void {
  (window as any).matchMedia = (query: string) => ({
    matches: hover && query.includes("(hover: hover)"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}

beforeEach(() => {
  setViewport(400, 800);
  originalMatchMedia = window.matchMedia;
  // Desktop-like by default: hover-capable pointer.
  setHoverCapabilities(true);
});

afterEach(() => {
  (window as any).matchMedia = originalMatchMedia;
  vi.restoreAllMocks();
});

describe("structure & visibility", () => {
  it("creates the ruler with band, notch, focus line and badge", () => {
    const { host } = createHost();
    const ruler = new ReadingRuler(host);
    ruler.mount();

    const el = document.getElementById(RULER_ID);
    expect(el).not.toBeNull();
    expect(el?.querySelector(".frs-ruler-band")).not.toBeNull();
    expect(el?.querySelector(".frs-notch")).not.toBeNull();
    expect(el?.querySelector(".frs-ruler-focus-line")).not.toBeNull();
    expect(el?.querySelector(".frs-ruler-badge")).not.toBeNull();
    expect(el?.querySelector(".frs-notch")?.getAttribute("role")).toBe("slider");
    expect(el?.querySelector(".frs-notch")?.getAttribute("aria-orientation")).toBe("vertical");
  });

  it("toggles the body class for visibility", () => {
    const { host, saved } = createHost({ enabled: false });
    const ruler = new ReadingRuler(host);
    ruler.mount();
    expect(document.body.classList.contains(RULER_BODY_CLASS)).toBe(false);

    saved.focus.enabled = true;
    ruler.applyVisibility();
    expect(document.body.classList.contains(RULER_BODY_CLASS)).toBe(true);
  });

  it("shows at a sane default position immediately (old bug: started off-screen)", () => {
    const { host } = createHost();
    const ruler = new ReadingRuler(host);
    ruler.mount();

    const el = document.getElementById(RULER_ID)!;
    // Default ratio 0.4 of movable range (800 - 40 = 760) -> 304px.
    expect(el.style.transform).toBe("translate3d(0, 304px, 0)");
  });

  it("applies config CSS variables: height, color, opacity, notch size, focus line", () => {
    const { host } = createHost({ notchSize: 52, focusLine: true }, { height: 50, color: "#ffc400", opacity: 0.55 });
    const ruler = new ReadingRuler(host);
    ruler.mount();

    const el = document.getElementById(RULER_ID)!;
    expect(el.style.getPropertyValue("--frs-ruler-height")).toBe("50px");
    expect(el.style.getPropertyValue("--frs-ruler-color")).toBe("#ffc400");
    expect(el.style.getPropertyValue("--frs-ruler-opacity")).toBe("0.55");
    expect(el.style.getPropertyValue("--frs-notch-size")).toBe("52px");
    expect(el.classList.contains("frs-ruler-with-focus-line")).toBe(true);
  });

  it("hides the notch when showNotch is off", () => {
    const { host, saved } = createHost({ showNotch: false });
    const ruler = new ReadingRuler(host);
    ruler.mount();
    const notch = document.getElementById(RULER_ID)!.querySelector<HTMLElement>(".frs-notch")!;
    expect(notch.style.display).toBe("none");

    saved.focus.showNotch = true;
    ruler.applyConfig();
    expect(notch.style.display).toBe("");
  });

  it("destroy removes the element", () => {
    const { host } = createHost();
    const ruler = new ReadingRuler(host);
    ruler.mount();
    ruler.destroy();
    expect(document.getElementById(RULER_ID)).toBeNull();
  });
});

describe("drag (mouse)", () => {
  it("dragging the notch moves the ruler and persists a ratio", async () => {
    const { host, saved } = createHost();
    const ruler = new ReadingRuler(host);
    ruler.mount();

    const el = document.getElementById(RULER_ID)!;
    const notch = el.querySelector<HTMLElement>(".frs-notch")!;

    firePointer(notch, "pointerdown", { clientY: 300, pointerId: 7, pointerType: "mouse" });
    expect(el.classList.contains("frs-ruler-dragging")).toBe(true);

    firePointer(notch, "pointermove", { clientY: 500, pointerId: 7, pointerType: "mouse" });
    // Started at 304 (default), dragged +200 -> 504.
    expect(el.style.transform).toBe("translate3d(0, 504px, 0)");

    firePointer(notch, "pointerup", { clientY: 500, pointerId: 7, pointerType: "mouse" });
    expect(el.classList.contains("frs-ruler-dragging")).toBe(false);
    expect(host.saveRulerSettings).toHaveBeenCalled();
    expect(saved.ruler.positionRatio).toBeCloseTo(504 / 760, 2);
  });

  it("clamps drags to the viewport", () => {
    const { host } = createHost();
    const ruler = new ReadingRuler(host);
    ruler.mount();

    const el = document.getElementById(RULER_ID)!;
    const notch = el.querySelector<HTMLElement>(".frs-notch")!;

    firePointer(notch, "pointerdown", { clientY: 300, pointerId: 1, pointerType: "mouse" });
    firePointer(notch, "pointermove", { clientY: 5000, pointerId: 1, pointerType: "mouse" });
    // Max top = 800 - 40 = 760.
    expect(el.style.transform).toBe("translate3d(0, 760px, 0)");

    firePointer(notch, "pointermove", { clientY: -3000, pointerId: 1, pointerType: "mouse" });
    expect(el.style.transform).toBe("translate3d(0, 0px, 0)");

    firePointer(notch, "pointerup", { clientY: -3000, pointerId: 1, pointerType: "mouse" });
  });

  it("ignores secondary-button pointerdowns", () => {
    const { host } = createHost();
    const ruler = new ReadingRuler(host);
    ruler.mount();

    const el = document.getElementById(RULER_ID)!;
    const notch = el.querySelector<HTMLElement>(".frs-notch")!;
    firePointer(notch, "pointerdown", { clientY: 300, pointerId: 2, button: 2, pointerType: "mouse" });
    expect(el.classList.contains("frs-ruler-dragging")).toBe(false);
  });

  it("shows the live position badge while dragging and hides it after", () => {
    const { host } = createHost();
    const ruler = new ReadingRuler(host);
    ruler.mount();

    const el = document.getElementById(RULER_ID)!;
    const notch = el.querySelector<HTMLElement>(".frs-notch")!;
    const badge = el.querySelector<HTMLElement>(".frs-ruler-badge")!;

    firePointer(notch, "pointerdown", { clientY: 300, pointerId: 1, pointerType: "mouse" });
    firePointer(notch, "pointermove", { clientY: 500, pointerId: 1, pointerType: "mouse" });
    expect(badge.classList.contains("frs-visible")).toBe(true);
    expect(badge.textContent).toBe("66%"); // 504/760

    firePointer(notch, "pointerup", { clientY: 500, pointerId: 1, pointerType: "mouse" });
    expect(badge.classList.contains("frs-visible")).toBe(false);
  });
});

describe("drag (touch) — the scenarios that were broken on mobile", () => {
  it("a finger drag on the notch moves the ruler (pointer events, not mouse)", async () => {
    const { host, saved } = createHost({ smoothFollow: false }, { mode: "manual" });
    const ruler = new ReadingRuler(host);
    ruler.mount();

    const el = document.getElementById(RULER_ID)!;
    const notch = el.querySelector<HTMLElement>(".frs-notch")!;

    firePointer(notch, "pointerdown", { clientY: 200, pointerId: 3, pointerType: "touch" });
    firePointer(notch, "pointermove", { clientY: 620, pointerId: 3, pointerType: "touch" });
    expect(el.style.transform).toBe("translate3d(0, 724px, 0)"); // 304 + 420

    firePointer(notch, "pointerup", { clientY: 620, pointerId: 3, pointerType: "touch" });
    expect(saved.ruler.positionRatio).toBeCloseTo(724 / 760, 2);
  });

  it("pointercancel (OS gesture takeover) ends the drag cleanly and persists", async () => {
    const { host, saved } = createHost();
    const ruler = new ReadingRuler(host);
    ruler.mount();

    const el = document.getElementById(RULER_ID)!;
    const notch = el.querySelector<HTMLElement>(".frs-notch")!;

    firePointer(notch, "pointerdown", { clientY: 200, pointerId: 9, pointerType: "touch" });
    firePointer(notch, "pointermove", { clientY: 400, pointerId: 9, pointerType: "touch" });
    firePointer(notch, "pointercancel", { clientY: 400, pointerId: 9, pointerType: "touch" });

    expect(el.classList.contains("frs-ruler-dragging")).toBe(false);
    expect(document.body.classList.contains("frs-ruler-drag-global")).toBe(false);
    expect(saved.ruler.positionRatio).toBeCloseTo(504 / 760, 2); // 304 + 200
  });

  it("lostpointercapture ends the drag too (finger stuck bug)", async () => {
    const { host } = createHost();
    const ruler = new ReadingRuler(host);
    ruler.mount();

    const el = document.getElementById(RULER_ID)!;
    const notch = el.querySelector<HTMLElement>(".frs-notch")!;

    firePointer(notch, "pointerdown", { clientY: 100, pointerId: 4, pointerType: "touch" });
    firePointer(notch, "lostpointercapture", { clientY: 100, pointerId: 4, pointerType: "touch" });
    expect(el.classList.contains("frs-ruler-dragging")).toBe(false);
  });

  it("a TAP anywhere on the page never moves the ruler (the teleport bug)", async () => {
    const { host } = createHost({ smoothFollow: false }, { mode: "auto" });
    const ruler = new ReadingRuler(host);
    ruler.mount();

    const el = document.getElementById(RULER_ID)!;
    // Touch tap on the window (scroll gesture / tap on content):
    firePointer(window, "pointermove", { clientY: 600, pointerId: 1, pointerType: "touch" });
    await flushRaf();
    expect(el.style.transform).toBe("translate3d(0, 304px, 0)"); // unmoved
  });

  it("double-tap the notch centers the ruler", async () => {
    const { host, saved } = createHost();
    const ruler = new ReadingRuler(host);
    ruler.mount();

    const el = document.getElementById(RULER_ID)!;
    const notch = el.querySelector<HTMLElement>(".frs-notch")!;

    firePointer(notch, "pointerup", { clientY: 300, clientX: 380, pointerId: 1, pointerType: "touch" });
    firePointer(notch, "pointerup", { clientY: 305, clientX: 382, pointerId: 2, pointerType: "touch" });

    expect(el.style.transform).toBe("translate3d(0, 380px, 0)"); // centered: 760/2
    expect(saved.ruler.positionRatio).toBeCloseTo(0.5, 2);
  });

  it("a drag followed by a single tap is not a double-tap", async () => {
    const { host } = createHost();
    const ruler = new ReadingRuler(host);
    ruler.mount();

    const el = document.getElementById(RULER_ID)!;
    const notch = el.querySelector<HTMLElement>(".frs-notch")!;

    firePointer(notch, "pointerdown", { clientY: 200, pointerId: 1, pointerType: "touch" });
    firePointer(notch, "pointermove", { clientY: 300, pointerId: 1, pointerType: "touch" });
    firePointer(notch, "pointerup", { clientY: 300, pointerId: 1, pointerType: "touch" });
    firePointer(notch, "pointerup", { clientY: 302, pointerId: 2, pointerType: "touch" });

    expect(el.style.transform).toBe("translate3d(0, 404px, 0)"); // 304+100, not centered
  });
});

describe("follow mode", () => {
  it("follows a mouse pointer in auto mode on hover-capable devices", async () => {
    const { host } = createHost({ smoothFollow: false }, { mode: "auto" });
    const ruler = new ReadingRuler(host);
    ruler.mount();

    const el = document.getElementById(RULER_ID)!;
    firePointer(window, "pointermove", { clientY: 500, pointerId: 1, pointerType: "mouse" });
    await flushRaf();
    // Band centered on the pointer: 500 - 40/2 = 480.
    expect(el.style.transform).toBe("translate3d(0, 480px, 0)");
  });

  it("resolves auto → manual on touch-only devices", async () => {
    setHoverCapabilities(false);
    const { host } = createHost({ smoothFollow: false }, { mode: "auto" });
    const ruler = new ReadingRuler(host);
    ruler.mount();

    expect(ruler.effectiveMode).toBe("manual");

    const el = document.getElementById(RULER_ID)!;
    // Touch pointermove never drives follow:
    firePointer(window, "pointermove", { clientY: 500, pointerId: 1, pointerType: "touch" });
    await flushRaf();
    expect(el.style.transform).toBe("translate3d(0, 304px, 0)");
  });

  it("explicit manual mode never follows even with a mouse", async () => {
    const { host } = createHost({ smoothFollow: false }, { mode: "manual" });
    const ruler = new ReadingRuler(host);
    ruler.mount();

    const el = document.getElementById(RULER_ID)!;
    firePointer(window, "pointermove", { clientY: 500, pointerId: 1, pointerType: "mouse" });
    await flushRaf();
    expect(el.style.transform).toBe("translate3d(0, 304px, 0)");
  });

  it("smooth follow converges to the pointer instead of jumping", async () => {
    const { host } = createHost({ smoothFollow: true }, { mode: "follow" });
    const ruler = new ReadingRuler(host);
    ruler.mount();

    const el = document.getElementById(RULER_ID)!;
    firePointer(window, "pointermove", { clientY: 500, pointerId: 1, pointerType: "mouse" });
    await flushRaf();

    const top = rulerTop(el);
    // Should have moved toward 480 (never past it):
    expect(top).toBeGreaterThanOrEqual(304);
    expect(top).toBeLessThanOrEqual(480);

    // Continue flushing frames — it converges exactly:
    for (let i = 0; i < 30; i++) await flushRaf();
    expect(rulerTop(el)).toBeCloseTo(480, 0);
  });
});

describe("viewport changes", () => {
  it("re-clamps the saved ratio after a resize (orientation flip)", () => {
    const { host } = createHost({}, { positionRatio: 0.9 });
    const ruler = new ReadingRuler(host);
    ruler.mount();

    const el = document.getElementById(RULER_ID)!;
    // 0.9 * (800 - 40) = 684
    expect(el.style.transform).toBe("translate3d(0, 684px, 0)");

    // Rotate to a short landscape screen:
    setViewport(800, 400);
    window.dispatchEvent(new Event("resize"));
    // 0.9 * (400 - 40) = 324 — stays proportional, stays on screen.
    expect(el.style.transform).toBe("translate3d(0, 324px, 0)");
  });
});

describe("keyboard support", () => {
  it("arrow keys nudge the ruler; Enter centers it", async () => {
    const { host, saved } = createHost({ keyboardStepPercent: 5 });
    const ruler = new ReadingRuler(host);
    ruler.mount();

    const el = document.getElementById(RULER_ID)!;
    const notch = el.querySelector<HTMLElement>(".frs-notch")!;

    fireKey(notch, "ArrowDown");
    expect(el.style.transform).toBe("translate3d(0, 342px, 0)"); // 304 + 5% * 760
    fireKey(notch, "ArrowUp");
    expect(el.style.transform).toBe("translate3d(0, 304px, 0)");

    fireKey(notch, "Enter");
    expect(el.style.transform).toBe("translate3d(0, 380px, 0)");
    expect(saved.ruler.positionRatio).toBeCloseTo(0.5, 2);
  });

  it("center()/nudge() persist the position", async () => {
    const { host, saved } = createHost();
    const ruler = new ReadingRuler(host);
    ruler.mount();
    ruler.center();
    expect(saved.ruler.positionRatio).toBeCloseTo(0.5, 2);
  });
});
