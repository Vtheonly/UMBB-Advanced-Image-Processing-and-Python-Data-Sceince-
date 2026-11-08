import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createAppStub, Plugin, Notice } from "../../shared/test/obsidian-stub";
import { setViewport, firePointer } from "../../shared/test/dom-helpers";
import TYPOGRAPHY_PLUGIN from "../src/main";
import { RULER_ID } from "../src/ruler";
import { TYPOGRAPHY_BODY_CLASS } from "../src/typography";

/**
 * Bootstrap smoke test: runs the real plugin class against the obsidian
 * stub + happy-dom, exercising load → interact → unload exactly like the
 * app would.
 */

const manifest = { id: "focus-read-typography", version: "1.1.0" };

function makePlugin(data: any = null) {
  const app = createAppStub();
  const plugin = new TYPOGRAPHY_PLUGIN(app as any, manifest);
  if (data) (plugin as any).__setData(data);
  return plugin;
}

let originalMatchMedia: typeof window.matchMedia;

beforeEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  setViewport(1200, 800);
  Notice.reset();
  originalMatchMedia = window.matchMedia;
  (window as any).matchMedia = (query: string) => ({
    matches: query.includes("(hover: hover)"),
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
});

describe("Typography & Ruler plugin bootstrap", () => {
  it("loads with default settings and creates no ruler (disabled by default)", async () => {
    const plugin = makePlugin();
    await plugin.onload();

    expect((plugin as any).settings.typographyEnabled).toBe(true);
    expect(document.body.classList.contains(TYPOGRAPHY_BODY_CLASS)).toBe(true);
    // CSS variables are set on :root
    expect(document.documentElement.style.getPropertyValue("--frt-font-size")).toBe("17px");
    expect(document.getElementById(RULER_ID)).toBeNull(); // ruler off by default

    await plugin.onunload();
    (plugin as any).__obsidianTeardown();

    expect(document.getElementById(RULER_ID)).toBeNull();
    expect(document.body.classList.contains(TYPOGRAPHY_BODY_CLASS)).toBe(false);
    expect(document.documentElement.style.getPropertyValue("--frt-font-size")).toBe("");
  });

  it("loads the user's real saved settings and mounts the ruler", async () => {
    // The exact data.json from the user's vault.
    const plugin = makePlugin({
      typographyEnabled: false,
      fontFamily: "lexend",
      customFontFamily: "",
      loadGoogleFonts: false,
      fontSize: 17,
      lineHeight: 1.7,
      maxWidthChars: 66,
      paragraphSpacing: 1.4,
      readingRulerEnabled: true,
      readingRulerHeight: 47,
      readingRulerColor: "#ffc400",
      readingRulerOpacity: 0.6,
    });
    await plugin.onload();

    const ruler = document.getElementById(RULER_ID)!;
    expect(ruler).not.toBeNull();
    expect(ruler.style.getPropertyValue("--frt-ruler-height")).toBe("47px");
    expect(ruler.style.getPropertyValue("--frt-ruler-color")).toBe("#ffc400");
    expect(ruler.style.getPropertyValue("--frt-ruler-opacity")).toBe("0.6");
    // Typography disabled per settings:
    expect(document.body.classList.contains(TYPOGRAPHY_BODY_CLASS)).toBe(false);

    await plugin.onunload();
    (plugin as any).__obsidianTeardown();
    expect(document.getElementById(RULER_ID)).toBeNull();
  });

  it("registers the documented commands", async () => {
    const plugin = makePlugin();
    await plugin.onload();

    const ids = (plugin as any).commands.map((c: any) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "toggle-typography",
        "toggle-ruler",
        "center-ruler",
        "ruler-up",
        "ruler-down",
      ])
    );

    await plugin.onunload();
  });

  it("toggle-ruler command flips visibility with a Notice", async () => {
    const plugin = makePlugin({ readingRulerEnabled: false });
    await plugin.onload();

    const cmd = (plugin as any).commands.find((c: any) => c.id === "toggle-ruler");
    await cmd.callback();
    expect(document.getElementById(RULER_ID)).not.toBeNull();
    expect(Notice.messages.some((m) => m.includes("ON"))).toBe(true);

    await cmd.callback();
    expect(document.body.classList.contains("frt-ruler-on")).toBe(false);

    await plugin.onunload();
  });

  it("persists the ruler position after a drag end", async () => {
    const plugin = makePlugin({ readingRulerEnabled: true, readingRulerHeight: 40 });
    await plugin.onload();

    const ruler = document.getElementById(RULER_ID)!;
    const handle = ruler.querySelector<HTMLElement>(".frt-ruler-handle")!;
    firePointer(handle, "pointerdown", { clientY: 300, pointerId: 1, pointerType: "touch" });
    firePointer(handle, "pointermove", { clientY: 550, pointerId: 1, pointerType: "touch" });
    firePointer(handle, "pointerup", { clientY: 550, pointerId: 1, pointerType: "touch" });

    const saved = (plugin as any).__getData() as any;
    expect(saved.readingRulerPositionRatio).toBeCloseTo((0.4 * 760 + 250) / 760, 2);

    await plugin.onunload();
  });

  it("cleans up every DOM listener it registered on unload (no leaks)", async () => {
    const plugin = makePlugin({ readingRulerEnabled: true });
    await plugin.onload();

    const registered = (plugin as any).registeredDomEvents as Array<{ el: any; type: string }>;
    expect(registered.length).toBeGreaterThan(0);

    const windowListeners = registered.filter((r) => r.el === window).map((r) => r.type);
    expect(windowListeners).toEqual(
      expect.arrayContaining(["pointermove", "resize", "orientationchange"])
    );

    await plugin.onunload();
    (plugin as any).__obsidianTeardown();

    // After teardown, pointer events must not reach the (removed) ruler.
    expect(document.getElementById(RULER_ID)).toBeNull();
    expect((plugin as any).registeredDomEvents.length).toBe(0);
  });

  it("Google Fonts link is only injected when enabled AND a google font is selected", async () => {
    const plugin = makePlugin({ fontFamily: "lexend", loadGoogleFonts: true });
    await plugin.onload();

    let link = document.getElementById("frt-google-fonts-link") as HTMLLinkElement | null;
    expect(link).not.toBeNull();
    expect(link?.href).toContain("family=Lexend");
    expect(link?.href).not.toContain("IBM"); // only the selected family!

    // Turn it off:
    (plugin as any).settings.loadGoogleFonts = false;
    (plugin as any).typography.applyGoogleFonts();
    expect(document.getElementById("frt-google-fonts-link")).toBeNull();

    // System font never loads a link:
    const plugin2 = makePlugin({ fontFamily: "system", loadGoogleFonts: true });
    await plugin2.onload();
    expect(document.getElementById("frt-google-fonts-link")).toBeNull();

    await plugin.onunload();
    await plugin2.onunload();
  });
});
