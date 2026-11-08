import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createAppStub, Notice, Setting } from "../../shared/test/obsidian-stub";
import {
  ToggleStub,
  SliderStub,
  DropdownStub,
  ColorPickerStub,
  ButtonStub,
  TextStub,
} from "../../shared/test/obsidian-stub";
import { setViewport, firePointer } from "../../shared/test/dom-helpers";
import FOCUS_READ from "../src/main";
import { FocusReadSettingTab } from "../src/settings-tab";
import { RULER_ID, RULER_BODY_CLASS } from "../src/ruler";
import { TYPOGRAPHY_BODY_CLASS } from "../src/typography";
import { DEFAULT_TYPOGRAPHY_SETTINGS } from "../src/typography-settings";

/**
 * Integration tests for the Yellow Ruler / Typography functionality inside
 * the main Focus Read plugin (merged from the legacy standalone plugin).
 *
 * Covers:
 *  - one-time settings migration from the legacy plugin's data.json
 *  - the complete settings UI wiring (every control really reaches the
 *    ruler/typography — including the two controls that were dead in the
 *    legacy plugin: the enable toggle and the position reset button)
 *  - persistence across restarts
 *  - lifecycle hygiene (no leaks)
 */

const manifest = { id: "focus-read-timer", version: "2.0.0" };

/**
 * Settings listeners are async (persist first, then apply). This yields one
 * macrotask so the apply-step has run before assertions.
 */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** The user's real legacy data.json (from the vault, commit 1f79343). */
const REAL_LEGACY_DATA = {
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
};

function makePlugin(data: any = null, legacyFile: object | null = null) {
  const app = createAppStub();
  if (legacyFile !== null) {
    (app.vault as any).adapter = {
      exists: async (p: string) =>
        p === ".obsidian/plugins/focus-read-typography/data.json",
      read: async (p: string) => (p === ".obsidian/plugins/focus-read-typography/data.json"
        ? JSON.stringify(legacyFile)
        : ""),
    };
  }
  const plugin = new FOCUS_READ(app as any, manifest);
  if (data) (plugin as any).__setData(data);
  return plugin;
}

/** Opens the real settings tab and returns its rendered Setting stubs. */
function openSettingsTab(plugin: any): Setting[] {
  Setting.resetInstances();
  const tab = new FocusReadSettingTab((plugin as any).app, plugin);
  tab.display();
  return Setting.instances;
}

function findSetting(settings: Setting[], name: string): Setting {
  const s = settings.find((x) => x.name === name);
  expect(s, `setting "${name}" must exist in the tab`).toBeDefined();
  return s!;
}

function firstComponent<T>(setting: Setting): T {
  expect(setting.components.length).toBeGreaterThan(0);
  return setting.components[0] as T;
}

let originalMatchMedia: typeof window.matchMedia;

beforeEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  setViewport(1200, 800);
  Notice.reset();
  Setting.resetInstances();
  originalMatchMedia = window.matchMedia;
  // Desktop-like by default: hover-capable pointer.
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
  vi.restoreAllMocks();
});

describe("legacy migration (standalone plugin -> main plugin)", () => {
  it("imports the user's real legacy settings on first load and persists them immediately", async () => {
    // Timer-plugin data WITHOUT a typography section (pre-merge state).
    const plugin = makePlugin(
      { settings: { timerEnabled: true }, stats: {} },
      REAL_LEGACY_DATA
    );
    await plugin.onload();

    const t = (plugin as any).typographySettings;
    expect(t.readingRulerEnabled).toBe(true);
    expect(t.readingRulerHeight).toBe(47);
    expect(t.readingRulerColor).toBe("#ffc400");
    expect(t.readingRulerOpacity).toBe(0.6);
    expect(t.typographyEnabled).toBe(false);
    expect(t.fontFamily).toBe("lexend");

    // The ruler is up immediately with the user's yellow (#ffc400).
    const ruler = document.getElementById(RULER_ID)!;
    expect(ruler).not.toBeNull();
    expect(ruler.style.getPropertyValue("--frt-ruler-height")).toBe("47px");
    expect(ruler.style.getPropertyValue("--frt-ruler-color")).toBe("#ffc400");
    expect(ruler.style.getPropertyValue("--frt-ruler-opacity")).toBe("0.6");
    expect(document.body.classList.contains(RULER_BODY_CLASS)).toBe(true);

    // Migration is persisted right away (runs exactly once).
    const saved = (plugin as any).__getData();
    expect(saved.typography.readingRulerColor).toBe("#ffc400");
    expect(saved.typography.readingRulerHeight).toBe(47);

    // A notice tells the user their settings were imported.
    expect(Notice.messages.some((m) => m.includes("imported"))).toBe(true);

    await plugin.onunload();
  });

  it("falls back to defaults when no legacy file exists (fresh install)", async () => {
    const plugin = makePlugin({ settings: {}, stats: {} }); // no adapter
    await plugin.onload();

    const t = (plugin as any).typographySettings;
    expect(t).toMatchObject({
      readingRulerEnabled: DEFAULT_TYPOGRAPHY_SETTINGS.readingRulerEnabled,
      readingRulerHeight: DEFAULT_TYPOGRAPHY_SETTINGS.readingRulerHeight,
      readingRulerColor: DEFAULT_TYPOGRAPHY_SETTINGS.readingRulerColor,
    });
    expect(document.getElementById(RULER_ID)).toBeNull(); // off by default

    await plugin.onunload();
  });

  it("does not re-run the migration once the typography section exists", async () => {
    const plugin = makePlugin(
      {
        settings: {},
        stats: {},
        typography: { readingRulerEnabled: true, readingRulerColor: "#00ff00" },
      },
      REAL_LEGACY_DATA // legacy file still present, must be ignored
    );
    await plugin.onload();

    expect((plugin as any).typographySettings.readingRulerColor).toBe("#00ff00");
    expect(Notice.messages.some((m) => m.includes("imported"))).toBe(false);

    await plugin.onunload();
  });

  it("survives a corrupted legacy data.json without crashing", async () => {
    const app = createAppStub();
    (app.vault as any).adapter = {
      exists: async () => true,
      read: async () => "{ this is not json",
    };
    const plugin = new FOCUS_READ(app as any, manifest);
    (plugin as any).__setData({ settings: {}, stats: {} });
    await plugin.onload(); // must not throw

    expect((plugin as any).typographySettings.readingRulerColor)
      .toBe(DEFAULT_TYPOGRAPHY_SETTINGS.readingRulerColor);

    await plugin.onunload();
  });
});

describe("merged plugin bootstrap", () => {
  it("registers all timer AND typography/ruler commands", async () => {
    const plugin = makePlugin();
    await plugin.onload();

    const ids = (plugin as any).commands.map((c: any) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "timer-start",
        "timer-pause",
        "timer-stop",
        "reset-timer-position",
        "toggle-typography",
        "toggle-ruler",
        "center-ruler",
        "ruler-up",
        "ruler-down",
      ])
    );

    await plugin.onunload();
  });

  it("timer and ruler coexist: both mount, both clean up", async () => {
    const plugin = makePlugin({
      settings: { timerEnabled: true },
      stats: {},
      typography: { readingRulerEnabled: true },
    });
    await plugin.onload();

    expect(document.getElementById("frt-floating-timer")).not.toBeNull();
    expect(document.getElementById(RULER_ID)).not.toBeNull();
    expect(document.body.classList.contains(TYPOGRAPHY_BODY_CLASS)).toBe(true); // default on

    await plugin.onunload();
    (plugin as any).__obsidianTeardown();

    expect(document.getElementById("frt-floating-timer")).toBeNull();
    expect(document.getElementById(RULER_ID)).toBeNull();
    expect(document.getElementById("frt-dopamine-bar")).toBeNull();
    expect(document.body.classList.contains(RULER_BODY_CLASS)).toBe(false);
    expect(document.body.classList.contains(TYPOGRAPHY_BODY_CLASS)).toBe(false);
    expect(document.documentElement.style.getPropertyValue("--frt-font-size")).toBe("");
    expect((plugin as any).registeredDomEvents.length).toBe(0);
    expect((plugin as any).registeredIntervals.length).toBe(0);
  });

  it("toggle-ruler command flips visibility with a Notice", async () => {
    const plugin = makePlugin({ typography: { readingRulerEnabled: false } });
    await plugin.onload();

    const cmd = (plugin as any).commands.find((c: any) => c.id === "toggle-ruler");
    await cmd.callback();
    expect(document.getElementById(RULER_ID)).not.toBeNull();
    expect(Notice.messages.some((m) => m.includes("ON"))).toBe(true);

    await cmd.callback();
    expect(document.body.classList.contains(RULER_BODY_CLASS)).toBe(false);

    await plugin.onunload();
  });

  it("a touch drag on the handle persists the position through the plugin's persist()", async () => {
    const plugin = makePlugin({ typography: { readingRulerEnabled: true, readingRulerHeight: 40 } });
    await plugin.onload();

    const ruler = document.getElementById(RULER_ID)!;
    const handle = ruler.querySelector<HTMLElement>(".frt-ruler-handle")!;
    firePointer(handle, "pointerdown", { clientY: 300, pointerId: 1, pointerType: "touch" });
    firePointer(handle, "pointermove", { clientY: 550, pointerId: 1, pointerType: "touch" });
    firePointer(handle, "pointerup", { clientY: 550, pointerId: 1, pointerType: "touch" });

    const saved = (plugin as any).__getData() as any;
    expect(saved.typography.readingRulerPositionRatio).toBeCloseTo((0.4 * 760 + 250) / 760, 2);

    await plugin.onunload();
  });

  it("settings changes survive a plugin restart (persistence)", async () => {
    const plugin = makePlugin({ typography: { readingRulerEnabled: true, readingRulerHeight: 40 } });
    await plugin.onload();

    (plugin as any).typographySettings.readingRulerHeight = 66;
    (plugin as any).typographySettings.readingRulerColor = "#123456";
    (plugin as any).typographySettings.readingRulerPositionRatio = 0.25;
    await plugin.onunload();

    // "Restart": boot a fresh plugin from the saved data.
    const saved = (plugin as any).__getData();
    const plugin2 = makePlugin(saved);
    await plugin2.onload();

    const ruler = document.getElementById(RULER_ID)!;
    expect(ruler.style.getPropertyValue("--frt-ruler-height")).toBe("66px");
    expect(ruler.style.getPropertyValue("--frt-ruler-color")).toBe("#123456");
    // 0.25 * (800 - 66) = 183.5 -> 184
    expect(ruler.style.transform).toBe("translate3d(0, 184px, 0)");

    await plugin2.onunload();
  });
});

describe("settings tab wiring — every control really works", () => {
  it("Enable reading ruler toggle mounts/unmounts the ruler immediately (legacy bug: dead control)", async () => {
    const plugin = makePlugin({ typography: { readingRulerEnabled: false } });
    await plugin.onload();
    expect(document.getElementById(RULER_ID)).toBeNull();

    const settings = openSettingsTab(plugin);
    const toggle = firstComponent<ToggleStub>(findSetting(settings, "Enable reading ruler"));

    toggle.simulateChange(true);
    await flush();
    expect(document.getElementById(RULER_ID)).not.toBeNull();
    expect(document.body.classList.contains(RULER_BODY_CLASS)).toBe(true);

    toggle.simulateChange(false);
    await flush();
    expect(document.body.classList.contains(RULER_BODY_CLASS)).toBe(false);

    // And it persisted:
    expect((plugin as any).__getData().typography.readingRulerEnabled).toBe(false);

    await plugin.onunload();
  });

  it("Ruler height/opacity sliders and color picker update the live ruler", async () => {
    const plugin = makePlugin({ typography: { readingRulerEnabled: true } });
    await plugin.onload();
    const ruler = document.getElementById(RULER_ID)!;

    const settings = openSettingsTab(plugin);
    firstComponent<SliderStub>(findSetting(settings, "Ruler height (px)")).simulateChange(60);
    await flush();
    expect(ruler.style.getPropertyValue("--frt-ruler-height")).toBe("60px");

    firstComponent<SliderStub>(findSetting(settings, "Ruler opacity")).simulateChange(0.42);
    await flush();
    expect(ruler.style.getPropertyValue("--frt-ruler-opacity")).toBe("0.42");

    firstComponent<ColorPickerStub>(findSetting(settings, "Ruler color")).simulateChange("#00ffff");
    await flush();
    expect(ruler.style.getPropertyValue("--frt-ruler-color")).toBe("#00ffff");

    // Persisted with the plugin's own save path:
    const saved = (plugin as any).__getData().typography;
    expect(saved.readingRulerHeight).toBe(60);
    expect(saved.readingRulerOpacity).toBe(0.42);
    expect(saved.readingRulerColor).toBe("#00ffff");

    await plugin.onunload();
  });

  it("Reset ruler position button actually moves the band back (legacy bug: dead control)", async () => {
    const plugin = makePlugin({ typography: { readingRulerEnabled: true, readingRulerHeight: 40 } });
    await plugin.onload();
    const ruler = document.getElementById(RULER_ID)!;

    // Drag far down first.
    const handle = ruler.querySelector<HTMLElement>(".frt-ruler-handle")!;
    firePointer(handle, "pointerdown", { clientY: 100, pointerId: 1, pointerType: "mouse" });
    firePointer(handle, "pointermove", { clientY: 780, pointerId: 1, pointerType: "mouse" });
    firePointer(handle, "pointerup", { clientY: 780, pointerId: 1, pointerType: "mouse" });
    expect(ruler.style.transform).toBe("translate3d(0, 760px, 0)");

    const settings = openSettingsTab(plugin);
    firstComponent<ButtonStub>(findSetting(settings, "Reset ruler position")).simulateClick();
    await flush();

    // Back to the default ratio (0.4 * 760 = 304):
    expect(ruler.style.transform).toBe("translate3d(0, 304px, 0)");
    expect((plugin as any).typographySettings.readingRulerPositionRatio).toBeNull();
    expect(Notice.messages.some((m) => m.includes("reset"))).toBe(true);

    await plugin.onunload();
  });

  it("Ruler interaction mode dropdown persists the chosen mode", async () => {
    const plugin = makePlugin({ typography: { readingRulerEnabled: true } });
    await plugin.onload();

    const settings = openSettingsTab(plugin);
    const dropdown = firstComponent<DropdownStub>(findSetting(settings, "Ruler interaction mode"));
    expect(Object.keys(dropdown.options)).toEqual(["auto", "follow", "manual"]);

    dropdown.simulateChange("manual");
    await flush();
    expect((plugin as any).__getData().typography.readingRulerMode).toBe("manual");

    await plugin.onunload();
  });

  it("Typography toggle, font dropdown and sliders drive the CSS variables", async () => {
    const plugin = makePlugin();
    await plugin.onload();

    const settings = openSettingsTab(plugin);

    firstComponent<ToggleStub>(findSetting(settings, "Enable typography")).simulateChange(false);
    await flush();
    expect(document.body.classList.contains(TYPOGRAPHY_BODY_CLASS)).toBe(false);

    firstComponent<SliderStub>(findSetting(settings, "Font size (px)")).simulateChange(21);
    await flush();
    expect(document.documentElement.style.getPropertyValue("--frt-font-size")).toBe("21px");

    firstComponent<SliderStub>(findSetting(settings, "Line height")).simulateChange(1.9);
    await flush();
    expect(document.documentElement.style.getPropertyValue("--frt-line-height")).toBe("1.9");

    firstComponent<SliderStub>(findSetting(settings, "Paragraph spacing")).simulateChange(2);
    await flush();
    expect(document.documentElement.style.getPropertyValue("--frt-para-spacing")).toBe("2");

    firstComponent<SliderStub>(findSetting(settings, "Max line width (chars)")).simulateChange(80);
    await flush();
    expect(document.documentElement.style.getPropertyValue("--frt-max-width")).toBe("80ch");

    const font = firstComponent<DropdownStub>(findSetting(settings, "Reading font"));
    expect(Object.keys(font.options)).toContain("lexend");
    font.simulateChange("lexend");
    await flush();
    expect(document.documentElement.style.getPropertyValue("--frt-font-family")).toBe("'Lexend', sans-serif");

    await plugin.onunload();
  });

  it("custom font stack field appears only for the custom family and is sanitized", async () => {
    const plugin = makePlugin({ typography: { fontFamily: "custom", customFontFamily: "Georgia, serif" } });
    await plugin.onload();

    const settings = openSettingsTab(plugin);
    const custom = findSetting(settings, "Custom font stack");
    const text = firstComponent<TextStub>(custom);
    expect(text.value).toBe("Georgia, serif");

    text.simulateChange("Evil} body { background: red");
    await flush();
    expect((plugin as any).typographySettings.customFontFamily).not.toContain("}");

    await plugin.onunload();
  });

  it("Google Fonts toggle loads only the selected family, and only when enabled", async () => {
    const plugin = makePlugin({ typography: { fontFamily: "lexend", loadGoogleFonts: true } });
    await plugin.onload();

    let link = document.getElementById("frt-google-fonts-link") as HTMLLinkElement | null;
    expect(link).not.toBeNull();
    expect(link!.href).toContain("family=Lexend");
    expect(link!.href).not.toContain("IBM");

    const settings = openSettingsTab(plugin);
    firstComponent<ToggleStub>(findSetting(settings, "Load Google Fonts")).simulateChange(false);
    await flush();
    expect(document.getElementById("frt-google-fonts-link")).toBeNull();

    await plugin.onunload();
  });

  it("timer-module controls still work in the unified tab (no regressions)", async () => {
    const plugin = makePlugin();
    await plugin.onload();

    const settings = openSettingsTab(plugin);
    firstComponent<ToggleStub>(findSetting(settings, "Enable floating timer")).simulateChange(false);
    await flush();
    expect(document.getElementById("frt-floating-timer")!.style.display).toBe("none");

    firstComponent<SliderStub>(findSetting(settings, "Work minutes")).simulateChange(50);
    await flush();
    expect((plugin as any).__getData().settings.timerWorkMinutes).toBe(50);

    await plugin.onunload();
  });
});
