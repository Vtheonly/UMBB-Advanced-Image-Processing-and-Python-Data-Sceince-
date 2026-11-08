#!/usr/bin/env node
/**
 * Final upgrade-path verification: boots the DEPLOYED focus-read-timer
 * bundle (from the repo's .obsidian/plugins) against the user's REAL vault
 * data files:
 *   - vault/.obsidian/plugins/focus-read-timer/data.json      (old shape)
 *   - vault/.obsidian/plugins/focus-read-typography/data.json (legacy plugin)
 * and asserts the migration produces a working yellow ruler with the user's
 * exact settings, then saves everything back intact.
 */
import { Window } from "happy-dom";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const REPO = "/home/z/my-project/repo";
const VAULT = "/home/z/my-project/vault";

const win = new Window();
globalThis.window = win;
globalThis.document = win.document;
for (const key of ["HTMLElement", "HTMLDivElement", "Element", "Node", "NodeList", "Event", "CustomEvent", "PointerEvent", "MouseEvent", "KeyboardEvent", "MutationObserver", "ResizeObserver", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "matchMedia", "localStorage"]) {
  if (win[key] !== undefined) globalThis[key] = win[key];
}
if (typeof globalThis.requestAnimationFrame !== "function") {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  globalThis.cancelAnimationFrame = clearTimeout;
}

class Notice {
  static messages = [];
  constructor(m) { Notice.messages.push(String(m)); }
}

const obsidianStub = {
  Plugin: class Plugin {
    constructor(app, manifest) {
      this.app = app; this.manifest = manifest;
      this.commands = []; this.registeredDomEvents = []; this.registeredIntervals = [];
    }
    async loadData() { return this.data === null ? null : JSON.parse(JSON.stringify(this.data)); }
    async saveData(d) { this.data = JSON.parse(JSON.stringify(d)); }
    addCommand(c) { this.commands.push(c); return c; }
    addSettingTab() {}
    registerDomEvent(el, type, cb, options) { el.addEventListener(type, cb, options); this.registeredDomEvents.push({ el, type, cb, options }); }
    registerInterval(id) { this.registeredIntervals.push(id); return id; }
    registerEvent() {}
    register(cb) { this.onUnloadCallbacks = (this.onUnloadCallbacks || []).concat(cb); }
  },
  PluginSettingTab: class PluginSettingTab { constructor(app, plugin) { this.app = app; this.plugin = plugin; this.containerEl = win.document.createElement("div"); } },
  Setting: class Setting {
    constructor(c) { this.el = win.document.createElement("div"); if (c) c.appendChild(this.el); }
    setName() { return this; } setDesc() { return this; }
    addToggle(cb) { cb(stub()); return this; } addSlider(cb) { cb(stub()); return this; }
    addText(cb) { cb(stub()); return this; } addDropdown(cb) { cb(stub()); return this; }
    addColorPicker(cb) { cb(stub()); return this; } addButton(cb) { cb(stub()); return this; }
  },
  Notice,
  Modal: class Modal {},
  MarkdownView: class MarkdownView {},
  TAbstractFile: class TAbstractFile {},
  TFile: class TFile extends (class {}) {},
  TFolder: class TFolder extends (class {}) {},
  Platform: { isDesktop: true, isMobile: false, isDesktopApp: true, isMobileApp: false },
};
function stub() {
  return { setValue() { return this; }, setLimits() { return this; }, setDynamicTooltip() { return this; }, setButtonText() { return this; }, addOption() { return this; }, onChange() { return this; }, onClick() { return this; } };
}

const { createRequire } = await import("node:module");
const require = createRequire(import.meta.url);

function loadBundle(path) {
  const source = require("node:fs").readFileSync(path, "utf8");
  const moduleObj = { exports: {} };
  new Function("module", "exports", "require", source)(moduleObj, moduleObj.exports, (r) => {
    if (r === "obsidian") return obsidianStub;
    throw new Error(`unexpected require("${r}")`);
  });
  return moduleObj.exports.default ?? moduleObj.exports;
}

function fire(el, type, props = {}) {
  const Ctor = win.PointerEvent || win.Event;
  const event = new Ctor(type, { bubbles: true, cancelable: true });
  for (const [k, v] of Object.entries(props)) {
    try { Object.defineProperty(event, k, { value: v, configurable: true }); } catch {}
  }
  el.dispatchEvent(event);
}

let failures = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ FAIL: ${name} ${extra}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- Real user data ---- */
const realTimerData = JSON.parse(await readFile(resolve(VAULT, ".obsidian/plugins/focus-read-timer/data.json"), "utf8"));
const realLegacyTypography = JSON.parse(await readFile(resolve(VAULT, ".obsidian/plugins/focus-read-typography/data.json"), "utf8"));
console.log(`  (timer data.json: ${Object.keys(realTimerData).join(", ")})`);
console.log(`  (legacy typography data.json: ruler=${realLegacyTypography.readingRulerEnabled}, h=${realLegacyTypography.readingRulerHeight}, color=${realLegacyTypography.readingRulerColor})`);

/* The vault adapter serves the legacy file from the REAL vault path */
const app = {
  workspace: { layoutReady: true, on: () => ({}), onLayoutReady: (cb) => cb(), iterateAllLeaves: () => {}, getActiveViewOfType: () => null },
  vault: {
    on: () => ({}),
    getAbstractFileByPath: () => null,
    adapter: {
      exists: async (p) => p === ".obsidian/plugins/focus-read-typography/data.json",
      read: async () => JSON.stringify(realLegacyTypography),
    },
  },
};

const PluginClass = loadBundle(resolve(REPO, ".obsidian/plugins/focus-read-timer/main.js"));
const plugin = new PluginClass(app, { id: "focus-read-timer", version: "2.0.0" });
plugin.data = realTimerData;

await plugin.onload();

const ruler = win.document.getElementById("frt-reading-ruler");
check("ruler mounted after migration from real legacy data", !!ruler);
check("user's ruler height (47px)", ruler?.style.getPropertyValue("--frt-ruler-height") === "47px");
check("user's ruler color (#ffc400)", ruler?.style.getPropertyValue("--frt-ruler-color") === realLegacyTypography.readingRulerColor);
check("user's ruler opacity (0.6)", ruler?.style.getPropertyValue("--frt-ruler-opacity") === String(realLegacyTypography.readingRulerOpacity));
check("ruler body class on", win.document.body.classList.contains("frt-ruler-on"));
check("typography body class off (user had it disabled)", !win.document.body.classList.contains("frt-typography-on"));
check("timer still mounted alongside", !!win.document.getElementById("frt-floating-timer"));
check("stats survived boot", plugin.stats?.totalReadingMs === realTimerData.stats?.totalReadingMs);

// Touch-drag the ruler via its handle (mobile path)
const handle = ruler.querySelector(".frt-ruler-handle");
fire(handle, "pointerdown", { clientY: 200, pointerId: 1, pointerType: "touch", button: 0 });
fire(handle, "pointermove", { clientY: 500, pointerId: 1, pointerType: "touch" });
fire(handle, "pointerup", { clientY: 500, pointerId: 1, pointerType: "touch" });
await sleep(30);
check("drag persisted position ratio", typeof plugin.data?.typography?.readingRulerPositionRatio === "number");
check("user ruler settings intact after drag", plugin.data?.typography?.readingRulerColor === realLegacyTypography.readingRulerColor);

// Round-trip: unload saves everything
await plugin.onunload();
for (const { el, type, cb, options } of plugin.registeredDomEvents) el.removeEventListener(type, cb, options);
for (const id of plugin.registeredIntervals) clearInterval(id);

const saved = plugin.data;
check("saved data has settings+stats+typography sections", !!(saved.settings && saved.stats && saved.typography));
check("stats preserved through unload", saved.stats?.totalReadingMs === realTimerData.stats?.totalReadingMs);
check("timer settings preserved", saved.settings?.timerWorkMinutes === realTimerData.settings?.timerWorkMinutes);
check("typography migrated into own section", saved.typography?.fontFamily === realLegacyTypography.fontFamily);
check("DOM fully cleaned", win.document.getElementById("frt-reading-ruler") === null && win.document.getElementById("frt-floating-timer") === null);

// Second boot from the saved shape: no re-migration, no notice
const plugin2 = new PluginClass(app, { id: "focus-read-timer", version: "2.0.0" });
plugin2.data = JSON.parse(JSON.stringify(saved));
Notice.messages = [];
await plugin2.onload();
check("second boot: ruler back with user settings", win.document.getElementById("frt-reading-ruler")?.style.getPropertyValue("--frt-ruler-height") === "47px");
check("second boot: no duplicate migration notice", !Notice.messages.some((m) => m.includes("imported")));
await plugin2.onunload();
for (const { el, type, cb, options } of plugin2.registeredDomEvents) el.removeEventListener(type, cb, options);
for (const id of plugin2.registeredIntervals) clearInterval(id);

console.log("\n[upgrade-path] " + (failures === 0 ? "ALL PASSED" : `${failures} FAILURE(S)`));
process.exit(failures === 0 ? 0 : 1);
