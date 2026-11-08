import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ReadingRuler, RULER_ID, RULER_BODY_CLASS } from "../src/ruler";
import { TypographySettings, DEFAULT_SETTINGS } from "../src/settings";
import { firePointer, fireMouse, setViewport, mockRect } from "../../shared/test/dom-helpers";

/**
 * These tests reproduce the exact interaction scenarios that were broken on
 * mobile: tapping, dragging, scrolling over the ruler, and following with a
 * mouse — through the *pointer* event pipeline that mobile and desktop
 * browsers actually deliver to the plugin.
 */

function createHost(overrides: Partial<TypographySettings> = {}) {
  const settings: TypographySettings = {
    ...DEFAULT_SETTINGS,
    readingRulerEnabled: true,
    readingRulerHeight: 40,
    ...overrides,
  };
  const registered: Array<{ el: any; type: string }> = [];
  const host = {
    settings,
    saveSettings: vi.fn(async () => {}),
    registerDomEvent: vi.fn((el: any, type: string, cb: any) => {
      el.addEventListener(type, cb);
      registered.push({ el, type });
    }),
  };
  return { host, registered };
}

function flushRaf(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 30));
}

let originalMatchMedia: typeof window.matchMedia;

beforeEach(() => {
  document.body.innerHTML = "";
  setViewport(400, 800);
  originalMatchMedia = window.matchMedia;
  // Desktop-like by default: hover-capable pointer.
  (window as any).matchMedia = (query: string) => ({
    matches: !query.includes("(hover: hover) and (pointer: fine)") ? false : true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
});

afterEach(() => {
  (window as any).matchMedia = originalMatchMedia;
  vi.restoreAllMocks();
});

describe("ReadingRuler structure & visibility", () => {
  it("creates the ruler with a band and a drag handle", () => {
    const { host } = createHost();
    const ruler = new ReadingRuler(host);
    ruler.mount();

    const el = document.getElementById(RULER_ID);
    expect(el).not.toBeNull();
    expect(el?.querySelector(".frt-ruler-band")).not.toBeNull();
    const handle = el?.querySelector(".frt-ruler-handle");
    expect(handle).not.toBeNull();
    // 44px touch target per accessibility guidelines.
    expect(handle?.getAttribute("role")).toBe("button");
  });

  it("toggles the body class for visibility", () => {
    const { host } = createHost({ readingRulerEnabled: false });
    const ruler = new ReadingRuler(host);
    ruler.mount();
    expect(document.body.classList.contains(RULER_BODY_CLASS)).toBe(false);

    host.settings.readingRulerEnabled = true;
    ruler.applyVisibility();
    expect(document.body.classList.contains(RULER_BODY_CLASS)).toBe(true);
  });

  it("shows at a sane default position immediately (old bug: started off-screen at -9999px until a mouse event)", () => {
    const { host } = createHost(); // no saved ratio
    const ruler = new ReadingRuler(host);
    ruler.mount();

    const el = document.getElementById(RULER_ID)!;
    // Default ratio 0.4 of movable range (800 - 40 = 760) -> 304px.
    expect(el.style.transform).toBe("translate3d(0, 304px, 0)");
  });

  it("destroy removes the element", () => {
    const { host } = createHost();
    const ruler = new ReadingRuler(host);
    ruler.mount();
    ruler.destroy();
    expect(document.getElementById(RULER_ID)).toBeNull();
  });
});

describe("ReadingRuler drag (mouse)", () => {
  it("dragging the handle moves the ruler and persists a ratio", async () => {
    const { host } = createHost();
    const ruler = new ReadingRuler(host);
    ruler.mount();

    const el = document.getElementById(RULER_ID)!;
    const handle = el.querySelector<HTMLElement>(".frt-ruler-handle")!;

    firePointer(handle, "pointerdown", { clientY: 300, pointerId: 7, pointerType: "mouse" });
    expect(el.classList.contains("frt-ruler-dragging")).toBe(true);

    firePointer(handle, "pointermove", { clientY: 500, pointerId: 7, pointerType: "mouse" });
    // Started at 304 (default), dragged +200 -> 504.
    expect(el.style.transform).toBe("translate3d(0, 504px, 0)");

    firePointer(handle, "pointerup", { clientY: 500, pointerId: 7, pointerType: "mouse" });
    expect(el.classList.contains("frt-ruler-dragging")).toBe(false);
    expect(host.saveSettings).toHaveBeenCalledTimes(1);
    // 504 / (800-40) = 0.6631...
    expect(host.settings.readingRulerPositionRatio).toBeCloseTo(504 / 760, 3);
  });

  it("clamps drags that would leave the viewport", async () => {
    const { host } = createHost();
    const ruler = new ReadingRuler(host);
    ruler.mount();
    const el = document.getElementById(RULER_ID)!;
    const handle = el.querySelector<HTMLElement>(".frt-ruler-handle")!;

    firePointer(handle, "pointerdown", { clientY: 300, pointerId: 1, pointerType: "mouse" });
    firePointer(handle, "pointermove", { clientY: 5000, pointerId: 1, pointerType: "mouse" });
    // Movable range max = 800 - 40 = 760.
    expect(el.style.transform).toBe("translate3d(0, 760px, 0)");
    firePointer(handle, "pointermove", { clientY: -5000, pointerId: 1, pointerType: "mouse" });
    expect(el.style.transform).toBe("translate3d(0, 0px, 0)");
    firePointer(handle, "pointerup", { clientY: -5000, pointerId: 1, pointerType: "mouse" });
  });

  it("ignores secondary-button pointerdowns", () => {
    const { host } = createHost();
    const ruler = new ReadingRuler(host);
    ruler.mount();
    const el = document.getElementById(RULER_ID)!;
    const handle = el.querySelector<HTMLElement>(".frt-ruler-handle")!;

    firePointer(handle, "pointerdown", { clientY: 300, pointerId: 2, pointerType: "mouse", button: 2 });
    expect(el.classList.contains("frt-ruler-dragging")).toBe(false);
  });
});

describe("ReadingRuler drag (touch — the reported mobile bug)", () => {
  it("touch drags on the handle move the ruler exactly like mouse drags", async () => {
    const { host } = createHost();
    const ruler = new ReadingRuler(host);
    ruler.mount();
    const el = document.getElementById(RULER_ID)!;
    const handle = el.querySelector<HTMLElement>(".frt-ruler-handle")!;

    firePointer(handle, "pointerdown", { clientY: 100, pointerId: 3, pointerType: "touch" });
    firePointer(handle, "pointermove", { clientY: 600, pointerId: 3, pointerType: "touch" });
    // 304 + 500 = 804 -> clamped to 760.
    expect(el.style.transform).toBe("translate3d(0, 760px, 0)");

    firePointer(handle, "pointercancel", { clientY: 600, pointerId: 3, pointerType: "touch" });
    expect(el.classList.contains("frt-ruler-dragging")).toBe(false);
    expect(host.saveSettings).toHaveBeenCalled();
  });

  it("a plain tap elsewhere on the page does NOT teleport the ruler (old bug: synthesized mousemove jumped it)", async () => {
    const { host } = createHost();
    const ruler = new ReadingRuler(host);
    ruler.mount();
    const el = document.getElementById(RULER_ID)!;
    const before = el.style.transform;

    // Tap somewhere in the document (browsers synthesize pointer events).
    firePointer(document.body, "pointerdown", { clientY: 10, pointerType: "touch" });
    firePointer(document.body, "pointerup", { clientY: 10, pointerType: "touch" });
    // Compatibility mouse events may also fire after the tap:
    fireMouse(window, "mousemove", { clientX: 20, clientY: 10 });
    fireMouse(document.body, "click", { clientX: 20, clientY: 10 });

    await flushRaf();
    expect(el.style.transform).toBe(before); // unmoved
  });

  it("touch pointermove on the page never drives follow mode", async () => {
    const { host } = createHost({ readingRulerMode: "follow" });
    const ruler = new ReadingRuler(host);
    ruler.mount();
    const el = document.getElementById(RULER_ID)!;
    const before = el.style.transform;

    // A finger scrolling the note (pointermove of type touch on window).
    firePointer(window, "pointermove", { clientY: 700, pointerType: "touch" });
    await flushRaf();
    expect(el.style.transform).toBe(before); // not following the finger
  });

  it("pointercancel during a touch drag ends the drag cleanly (system gesture interruption)", () => {
    const { host } = createHost();
    const ruler = new ReadingRuler(host);
    ruler.mount();
    const el = document.getElementById(RULER_ID)!;
    const handle = el.querySelector<HTMLElement>(".frt-ruler-handle")!;

    firePointer(handle, "pointerdown", { clientY: 100, pointerId: 9, pointerType: "touch" });
    firePointer(handle, "pointermove", { clientY: 300, pointerId: 9, pointerType: "touch" });
    const midDrag = el.style.transform;
    expect(midDrag).toBe("translate3d(0, 504px, 0)");

    // OS steals the gesture (notification shade, gesture nav).
    firePointer(handle, "pointercancel", { clientY: 300, pointerId: 9, pointerType: "touch" });
    expect(el.classList.contains("frt-ruler-dragging")).toBe(false);

    // Subsequent stray pointermove does nothing.
    firePointer(window, "pointermove", { clientY: 5, pointerType: "touch" });
    expect(el.style.transform).toBe(midDrag);
  });
});

describe("ReadingRuler follow mode (desktop)", () => {
  it("mouse pointermove moves the band under the cursor (rAF-coalesced)", async () => {
    const { host } = createHost({ readingRulerMode: "follow" });
    const ruler = new ReadingRuler(host);
    ruler.mount();
    const el = document.getElementById(RULER_ID)!;

    firePointer(window, "pointermove", { clientY: 400, pointerType: "mouse" });
    await flushRaf();
    // Centered on cursor: 400 - 40/2 = 380.
    expect(el.style.transform).toBe("translate3d(0, 380px, 0)");
  });

  it("after a manual drag, follow resumes on the NEXT mouse move (no jump from the release event)", async () => {
    const { host } = createHost({ readingRulerMode: "follow" });
    const ruler = new ReadingRuler(host);
    ruler.mount();
    const el = document.getElementById(RULER_ID)!;
    const handle = el.querySelector<HTMLElement>(".frt-ruler-handle")!;

    firePointer(handle, "pointerdown", { clientY: 100, pointerId: 4, pointerType: "mouse" });
    firePointer(handle, "pointermove", { clientY: 300, pointerId: 4, pointerType: "mouse" });
    firePointer(handle, "pointerup", { clientY: 300, pointerId: 4, pointerType: "mouse" });

    // The pointerup itself must not re-center the ruler (old code jumped).
    await flushRaf();
    expect(el.style.transform).toBe("translate3d(0, 504px, 0)");

    // Next genuine mouse move resumes follow.
    firePointer(window, "pointermove", { clientY: 100, pointerType: "mouse" });
    await flushRaf();
    expect(el.style.transform).toBe("translate3d(0, 80px, 0)");
  });

  it("auto mode resolves to manual on touch-only devices", async () => {
    // Simulate a phone: no hover pointer.
    (window as any).matchMedia = (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    });
    const { host } = createHost({ readingRulerMode: "auto" });
    const ruler = new ReadingRuler(host);
    ruler.mount();
    const el = document.getElementById(RULER_ID)!;

    firePointer(window, "pointermove", { clientY: 500, pointerType: "mouse" });
    await flushRaf();
    // Even a mouse-type pointer must not follow: device is touch-only.
    expect(ruler.effectiveMode).toBe("manual");
  });

  it("auto mode resolves to follow on desktop-grade pointers", () => {
    const { host } = createHost({ readingRulerMode: "auto" });
    const ruler = new ReadingRuler(host);
    ruler.mount();
    expect(ruler.effectiveMode).toBe("follow");
  });
});

describe("ReadingRuler viewport changes", () => {
  it("re-clamps the restored position after a resize (rotate / smaller window)", async () => {
    const { host } = createHost({ readingRulerPositionRatio: 0.9 });
    const ruler = new ReadingRuler(host);
    ruler.mount();
    const el = document.getElementById(RULER_ID)!;

    // 0.9 * (800-40) = 684
    expect(el.style.transform).toBe("translate3d(0, 684px, 0)");

    // Shrink to phone-landscape height.
    setViewport(700, 300);
    window.dispatchEvent(new window.Event("resize"));

    // 0.9 * (300-40) = 234 — still fully visible.
    expect(el.style.transform).toBe("translate3d(0, 234px, 0)");
  });

  it("changing ruler height re-clamps and applies config", () => {
    const { host } = createHost({ readingRulerPositionRatio: 1 });
    const ruler = new ReadingRuler(host);
    ruler.mount();
    const el = document.getElementById(RULER_ID)!;
    expect(el.style.transform).toBe("translate3d(0, 760px, 0)");

    host.settings.readingRulerHeight = 80;
    ruler.applyConfig();
    expect(el.style.transform).toBe("translate3d(0, 720px, 0)");
    expect(el.style.getPropertyValue("--frt-ruler-height")).toBe("80px");
    expect(el.style.getPropertyValue("--frt-ruler-color")).toBe(DEFAULT_SETTINGS.readingRulerColor);
  });

  it("double-click on the handle centers the ruler", async () => {
    const { host } = createHost({ readingRulerPositionRatio: 0 });
    const ruler = new ReadingRuler(host);
    ruler.mount();
    const el = document.getElementById(RULER_ID)!;
    const handle = el.querySelector<HTMLElement>(".frt-ruler-handle")!;

    expect(el.style.transform).toBe("translate3d(0, 0px, 0)");
    fireMouse(handle, "dblclick", { clientX: 380, clientY: 300 });
    expect(el.style.transform).toBe("translate3d(0, 380px, 0)"); // 760/2
    expect(host.settings.readingRulerPositionRatio).toBeCloseTo(0.5, 3);
  });

  it("keyboard nudges move by 5% of the range", async () => {
    const { host } = createHost({ readingRulerPositionRatio: 0.5 });
    const ruler = new ReadingRuler(host);
    ruler.mount();

    ruler.nudge(1);
    expect(ruler.topPx).toBeCloseTo(0.55 * 760, 0);
    ruler.nudge(-1);
    expect(ruler.topPx).toBeCloseTo(0.5 * 760, 0);
  });
});
