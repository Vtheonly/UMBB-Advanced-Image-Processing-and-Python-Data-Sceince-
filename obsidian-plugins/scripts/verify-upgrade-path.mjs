#!/usr/bin/env node
/**
 * REAL-DATA upgrade-path verification for Focus Read Suite.
 *
 * Boots the DEPLOYED suite bundle (repo .obsidian/plugins/focus-read-suite)
 * against the vault's ACTUAL legacy data.json files (read from disk, not
 * inline copies), driving the full pre-merge → post-merge upgrade:
 *
 *   1. First boot: migration runs, the user's exact Yellow Ruler mounts
 *      (#ffc400, 47px, 0.6, enabled), timer + stats + heatmap records all
 *      carry over, a migration notice appears.
 *   2. Interactions: touch-drag the notch, run the ruler commands.
 *   3. Unload: full cleanup, data saved with all sections, and the legacy
 *      data.json files are byte-identical to before (never modified).
 *   4. Second boot from the saved payload: ruler back, no re-migration.
 */
import { Window } from "happy-dom";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const REPO = "/home/z/my-project/repo";
const VAULT = "/home/z/my-project/vault";

const LEGACY_PATHS = {
  timer: ".obsidian/plugins/focus-read-timer/data.json",
  typography: ".obsidian/plugins/focus-read-typography/data.json",
  heatmap: ".obsidian/plugins/heatmap/data.json",
};

/* ------------------------------------------------------------------ */
/* Global DOM environment                                              */
/* ------------------------------------------------------------------ */

const win = new Window();
globalThis.window = win;
globalThis.document = win.document;
for (const key of [
  "HTMLElement", "HTMLDivElement", "HTMLCanvasElement", "HTMLButtonElement",
  "HTMLLinkElement", "Element", "Node", "NodeList", "Event", "CustomEvent",
  "PointerEvent", "MouseEvent", "KeyboardEvent", "MutationObserver",
  "ResizeObserver", "getComputedStyle", "requestAnimationFrame",
  "cancelAnimationFrame", "matchMedia", "localStorage",
]) {
  if (win[key] !== undefined) globalThis[key] = win[key];
}
if (typeof globalThis.requestAnimationFrame !== "function") {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  globalThis.cancelAnimationFrame = clearTimeout;
}

/* Obsidian's HTMLElement extensions. */
{
  const proto = win.HTMLElement.prototype;
  proto.createEl = function (tag, opts = {}) {
    const el = win.document.createElement(tag);
    if (opts.cls) el.className = opts.cls;
    if (opts.text !== undefined) el.textContent = String(opts.text);
    this.appendChild(el);
    return el;
  };
  proto.createDiv = function (opts = {}) { return this.createEl("div", opts); };
  proto.createSpan = function (opts = {}) { return this.createEl("span", opts); };
  proto.setText = function (text) { this.textContent = text; return this; };
  proto.empty = function () { while (this.firstChild) this.removeChild(this.firstChild); return this; };
}

/* ------------------------------------------------------------------ */
/* obsidian stub                                                       */
/* ------------------------------------------------------------------ */

class Notice {
  static messages = [];
  constructor(message) { Notice.messages.push(String(message)); }
  static reset() { Notice.messages = []; }
}

class PluginSettingTab {
  constructor(app, plugin) {
    this.app = app; this.plugin = plugin;
    this.containerEl = win.document.createElement("div");
  }
}

class Setting {
  constructor(containerEl) {
    this.settingEl = win.document.createElement("div");
    this.nameEl = win.document.createElement("div");
    this.descEl = win.document.createElement("div");
    this.settingEl.appendChild(this.nameEl);
    this.settingEl.appendChild(this.descEl);
    this.components = [];
    if (containerEl) containerEl.appendChild(this.settingEl);
  }
  setName(n) { this.name = String(n); this.nameEl.setText(this.name); return this; }
  setDesc(d) { this.desc = String(d); this.descEl.setText(this.desc); return this; }
  setClass(c) { this.settingEl.classList.add(c); return this; }
  addToggle(cb) { return this.comp(cb); }
  addSlider(cb) { return this.comp(cb); }
  addText(cb) { return this.comp(cb); }
  addDropdown(cb) { return this.comp(cb); }
  addColorPicker(cb) { return this.comp(cb); }
  addButton(cb) { return this.comp(cb); }
  comp(cb) {
    const c = {
      setValue() { return this; }, setLimits() { return this; },
      setDynamicTooltip() { return this; }, setDisabled() { return this; },
      setWarning() { return this; }, setButtonText() { return this; },
      setCta() { return this; }, addOption() { return this; },
      onChange() { return this; }, onClick() { return this; },
    };
    cb(c);
    this.components.push(c);
    return this;
  }
}

class Modal {
  constructor(app) { this.app = app; this.titleEl = win.document.createElement("h2"); this.contentEl = win.document.createElement("div"); }
  open() {} close() {}
}

class ButtonComponent {
  constructor(containerEl) { this.el = win.document.createElement("button"); containerEl?.appendChild(this.el); }
  setButtonText() { return this; }
  onClick(cb) { this.el.addEventListener("click", cb); return this; }
}

const obsidianStub = {
  Plugin: class Plugin {
    constructor(app, manifest) {
      this.app = app; this.manifest = manifest;
      this.commands = []; this.registeredDomEvents = []; this.registeredIntervals = [];
      this.onUnloadCallbacks = []; this.data = null;
    }
    async loadData() { return this.data; }
    async saveData(d) { this.data = JSON.parse(JSON.stringify(d)); }
    addCommand(c) { this.commands.push(c); return c; }
    addSettingTab() {}
    registerDomEvent(el, type, cb, options) {
      el.addEventListener(type, cb, options);
      this.registeredDomEvents.push({ el, type, cb, options });
    }
    registerInterval(id) { this.registeredIntervals.push(id); return id; }
    registerEvent() {}
    register(cb) { this.onUnloadCallbacks.push(cb); }
  },
  PluginSettingTab,
  Setting,
  Notice,
  Modal,
  ButtonComponent,
  MarkdownView: class MarkdownView {},
  TAbstractFile: class TAbstractFile {},
  TFile: class TFile extends (class {}) {},
  TFolder: class TFolder extends (class {}) {},
  Platform: { isDesktop: true, isMobile: false, isDesktopApp: true, isMobileApp: false },
  normalizePath: (p) => p,
};

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

/* ------------------------------------------------------------------ */
/* Real legacy data, read from disk                                     */
/* ------------------------------------------------------------------ */

const realFiles = new Map();
for (const [key, path] of Object.entries(LEGACY_PATHS)) {
  const text = await readFile(resolve(VAULT, path), "utf8");
  realFiles.set(path, text);
}
const legacyTimer = JSON.parse(realFiles.get(LEGACY_PATHS.timer));
const legacyTypo = JSON.parse(realFiles.get(LEGACY_PATHS.typography));
const legacyHeatmap = JSON.parse(realFiles.get(LEGACY_PATHS.heatmap));
console.log(`  (real legacy data: timer stats total=${legacyTimer.stats?.totalReadingMs}ms, ` +
  `ruler=${legacyTypo.readingRulerEnabled}/${legacyTypo.readingRulerColor}/${legacyTypo.readingRulerHeight}px/${legacyTypo.readingRulerOpacity}, ` +
  `heatmap records=${Object.keys(legacyHeatmap.records ?? {}).length})`);

function makeApp() {
  const adapter = {
    exists: async (path) => realFiles.has(path),
    read: async (path) => {
      if (!realFiles.has(path)) throw new Error("not found: " + path);
      return realFiles.get(path);
    },
  };
  return {
    workspace: {
      layoutReady: true,
      on: () => ({}),
      onLayoutReady: (cb) => cb(),
      iterateAllLeaves: () => {},
      getActiveViewOfType: () => null,
    },
    vault: { on: () => ({}), getAbstractFileByPath: () => null, adapter },
    isMobile: false,
    plugins: { enabledPlugins: new Set(["focus-read-timer", "focus-read-typography", "heatmap-of-notes"]), disablePlugin: async () => {} },
    commands: { executeCommandById: () => {} },
  };
}

function teardown(plugin) {
  for (const { el, type, cb, options } of plugin.registeredDomEvents) el.removeEventListener(type, cb, options);
  for (const id of plugin.registeredIntervals) clearInterval(id);
  for (const cb of plugin.onUnloadCallbacks ?? []) cb();
}

/* ------------------------------------------------------------------ */
/* The upgrade path                                                    */
/* ------------------------------------------------------------------ */

const PluginClass = loadBundle(resolve(REPO, ".obsidian/plugins/focus-read-suite/main.js"));
const manifest = { id: "focus-read-suite", version: "2.0.0" };

/* ---- 1. First boot: migration ---- */
const plugin = new PluginClass(makeApp(), manifest);
await plugin.onload();

const ruler = win.document.getElementById("frs-ruler");
check("ruler mounted (user had readingRulerEnabled=true)", !!ruler);
check(`ruler color = user's ${legacyTypo.readingRulerColor}`, ruler?.style.getPropertyValue("--frs-ruler-color") === legacyTypo.readingRulerColor);
check(`ruler height = user's ${legacyTypo.readingRulerHeight}px`, ruler?.style.getPropertyValue("--frs-ruler-height") === `${legacyTypo.readingRulerHeight}px`);
check(`ruler opacity = user's ${legacyTypo.readingRulerOpacity}`, ruler?.style.getPropertyValue("--frs-ruler-opacity") === String(legacyTypo.readingRulerOpacity));
check("ruler body class on", win.document.body.classList.contains("frs-focus-on"));
check("notch present (drag handle)", !!ruler?.querySelector(".frs-notch"));
check("typography disabled per user (typographyEnabled=false)", !win.document.body.classList.contains("frs-typography-on"));
check("timer widget mounted", !!win.document.getElementById("frs-timer"));
check("migration notice shown", Notice.messages.some((m) => m.includes("migrated")));

const settings = plugin.settings.settings;
check("migrated: focus.enabled = true", settings.focus.enabled === true);
check("migrated: ruler.height = 47", settings.ruler.height === legacyTypo.readingRulerHeight);
check("migrated: ruler.color = #ffc400", settings.ruler.color === legacyTypo.readingRulerColor);
check("migrated: typography.fontFamily = lexend", settings.typography.fontFamily === legacyTypo.fontFamily);
check("migrated: typography.enabled = false (as the user had it)", settings.typography.enabled === false);
check("migrated: timer.workMinutes carried over", settings.timer.workMinutes === legacyTimer.settings.timerWorkMinutes);
check("migrated: heatmap.bucketCount = 200", settings.heatmap.bucketCount === legacyHeatmap.settings.bucketCount);
check("stats carried over", plugin.settings.raw?.stats?.totalReadingMs === legacyTimer.stats.totalReadingMs);
check("per-day history carried over", Object.keys(plugin.settings.raw?.stats?.perDayMs ?? {}).length === Object.keys(legacyTimer.stats.perDayMs).length);
check("heatmap records carried over", Object.keys(plugin.settings.raw?.heatmapRecords ?? {}).length === Object.keys(legacyHeatmap.records).length);

const commandIds = plugin.commands.map((c) => c.id);
check("ruler commands registered", ["toggle-reading-focus", "center-reading-ruler", "move-reading-ruler-up", "move-reading-ruler-down"].every((id) => commandIds.includes(id)));
check("typography command registered", commandIds.includes("toggle-typography"));
check("legacy-disable command registered", commandIds.includes("disable-legacy-plugins"));

/* ---- 2. Interactions ---- */
const notch = ruler.querySelector(".frs-notch");
const before = ruler.style.transform;
fire(notch, "pointerdown", { clientY: 200, pointerId: 1, pointerType: "touch", button: 0 });
fire(notch, "pointermove", { clientY: 500, pointerId: 1, pointerType: "touch" });
fire(notch, "pointerup", { clientY: 500, pointerId: 1, pointerType: "touch" });
await sleep(30);
check("touch drag on the notch moved the ruler", ruler.style.transform !== before);
check("position updated in-memory immediately", typeof plugin.settings.settings.ruler.positionRatio === "number");
await sleep(450); // settings persistence is debounced (300 ms) by design
check("position persisted as ratio (after debounce)", typeof plugin.data?.settings?.ruler?.positionRatio === "number");

// A tap elsewhere must not teleport the ruler (the original mobile bug):
const afterDrag = ruler.style.transform;
fire(win.document.body, "pointerdown", { clientY: 10, pointerType: "touch" });
fire(win.document.body, "pointerup", { clientY: 10, pointerType: "touch" });
fire(win, "mousemove", { clientY: 10 });
await sleep(30);
check("a tap elsewhere does not teleport the ruler", ruler.style.transform === afterDrag);

// Command: center the ruler
const centerCmd = plugin.commands.find((c) => c.id === "center-reading-ruler");
centerCmd.callback();
await sleep(30);
const range = 800 - legacyTypo.readingRulerHeight; // happy-dom viewport 1024x768? -> use innerHeight
const expectedCenter = Math.round((win.innerHeight - legacyTypo.readingRulerHeight) / 2);
check("center command centers the ruler", ruler.style.transform === `translate3d(0, ${expectedCenter}px, 0)`, `(got ${ruler.style.transform}, expected translate3d(0, ${expectedCenter}px, 0), range=${range})`);

/* ---- 3. Unload + data integrity ---- */
await plugin.onunload();
teardown(plugin);

check("ruler removed on unload", win.document.getElementById("frs-ruler") === null);
check("timer removed on unload", win.document.getElementById("frs-timer") === null);
check("focus body class cleaned", !win.document.body.classList.contains("frs-focus-on"));
check("typography body class cleaned", !win.document.body.classList.contains("frs-typography-on"));

const saved = plugin.data;
check("saved payload has settings+stats+heatmapRecords+migration",
  !!(saved?.settings && saved?.stats && saved?.heatmapRecords && saved?.migration));
check("migration marker = done", saved?.migration?.state === "done");
check("stats preserved through unload", saved?.stats?.totalReadingMs === legacyTimer.stats.totalReadingMs);
check("heatmap records preserved through unload", Object.keys(saved?.heatmapRecords ?? {}).length === Object.keys(legacyHeatmap.records).length);
check("user ruler settings in saved payload", saved?.settings?.ruler?.color === legacyTypo.readingRulerColor && saved?.settings?.ruler?.height === legacyTypo.readingRulerHeight);

// The legacy data.json files must be byte-identical (never modified):
let legacyUntouched = true;
for (const path of Object.values(LEGACY_PATHS)) {
  const now = await readFile(resolve(VAULT, path), "utf8");
  if (now !== realFiles.get(path)) { legacyUntouched = false; console.error(`    modified: ${path}`); }
}
check("legacy data.json files were never modified", legacyUntouched);

/* ---- 4. Second boot: idempotent, ruler restored ---- */
Notice.reset();
const plugin2 = new PluginClass(makeApp(), manifest);
plugin2.data = JSON.parse(JSON.stringify(saved));
await plugin2.onload();

const ruler2 = win.document.getElementById("frs-ruler");
check("second boot: ruler back with user settings",
  ruler2?.style.getPropertyValue("--frs-ruler-height") === `${legacyTypo.readingRulerHeight}px` &&
  ruler2?.style.getPropertyValue("--frs-ruler-color") === legacyTypo.readingRulerColor);
check("second boot: centered position restored", ruler2?.style.transform === `translate3d(0, ${expectedCenter}px, 0)`);
check("second boot: no duplicate migration notice", !Notice.messages.some((m) => m.includes("migrated")));
await plugin2.onunload();
teardown(plugin2);

console.log("\n[upgrade-path] " + (failures === 0 ? "ALL PASSED" : `${failures} FAILURE(S)`));
process.exit(failures === 0 ? 0 : 1);
