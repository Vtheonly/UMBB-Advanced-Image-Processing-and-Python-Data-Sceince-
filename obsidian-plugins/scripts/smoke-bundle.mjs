#!/usr/bin/env node
/**
 * Bundle-level integration smoke test for the Focus Read Suite.
 *
 * Loads the ACTUAL dist/main.js artifact (not the TypeScript sources) into
 * a happy-dom environment with a stubbed `obsidian` module, then:
 *
 *   1. boots the plugin with the three legacy plugins' REAL data.json
 *      files present in the fake vault adapter → verifies migration;
 *   2. verifies the DOM effects of all four modules (timer widget, ruler,
 *      typography CSS vars, heatmap strips);
 *   3. drives interactions through the DOM (timer buttons, touch drag on
 *      the ruler notch);
 *   4. unloads and asserts full cleanup + data preservation;
 *   5. asserts the legacy files were never modified.
 *
 * This is the closest verification possible to running inside the real
 * Obsidian app without the app itself.
 */
import { Window } from "happy-dom";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ */
/* Global DOM environment                                              */
/* ------------------------------------------------------------------ */

const win = new Window();
const globalsToInstall = [
  "HTMLElement", "HTMLDivElement", "HTMLCanvasElement", "HTMLButtonElement",
  "HTMLLinkElement", "Element", "Node", "NodeList", "Event", "CustomEvent",
  "PointerEvent", "MouseEvent", "KeyboardEvent", "MutationObserver",
  "ResizeObserver", "getComputedStyle", "requestAnimationFrame",
  "cancelAnimationFrame", "matchMedia", "localStorage",
];
globalThis.window = win;
globalThis.document = win.document;
for (const key of globalsToInstall) {
  if (win[key] !== undefined) globalThis[key] = win[key];
}
if (typeof globalThis.requestAnimationFrame !== "function") {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  globalThis.cancelAnimationFrame = clearTimeout;
}

/* Obsidian's HTMLElement extensions. */
{
  const proto = win.HTMLElement.prototype;
  const applyOpts = (el, opts = {}) => {
    if (opts.cls) el.className = opts.cls;
    if (opts.text !== undefined) el.textContent = opts.text;
  };
  proto.createEl = function (tag, opts = {}) {
    const el = win.document.createElement(tag);
    applyOpts(el, opts);
    this.appendChild(el);
    return el;
  };
  proto.createDiv = function (opts = {}) { return this.createEl("div", opts); };
  proto.createSpan = function (opts = {}) { return this.createEl("span", opts); };
  proto.setText = function (text) { this.textContent = text; return this; };
  proto.empty = function () { while (this.firstChild) this.removeChild(this.firstChild); return this; };
}

/* ------------------------------------------------------------------ */
/* obsidian stub (runtime JS mirror of test/helpers/obsidian-stub.ts)  */
/* ------------------------------------------------------------------ */

class Notice {
  static messages = [];
  constructor(message) { Notice.messages.push(String(message)); }
  static reset() { Notice.messages = []; }
}

class PluginSettingTab {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
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
  addToggle(cb) { return this.comp("toggle", cb); }
  addSlider(cb) { return this.comp("slider", cb); }
  addText(cb) { return this.comp("text", cb); }
  addDropdown(cb) { return this.comp("dropdown", cb); }
  addColorPicker(cb) { return this.comp("color", cb); }
  addButton(cb) { return this.comp("button", cb); }
  comp(kind, cb) {
    const c = stubComponent(kind);
    cb(c);
    this.components.push(c);
    return this;
  }
}

function stubComponent() {
  return {
    kind: arguments[0],
    setValue() { return this; },
    setLimits() { return this; },
    setDynamicTooltip() { return this; },
    setDisabled() { return this; },
    setWarning() { return this; },
    setButtonText() { return this; },
    setCta() { return this; },
    addOption() { return this; },
    onChange() { return this; },
    onClick() { return this; },
  };
}

class Modal {
  constructor(app) {
    this.app = app;
    this.titleEl = win.document.createElement("h2");
    this.contentEl = win.document.createElement("div");
  }
  open() {}
  close() {}
}

class ButtonComponent {
  constructor(containerEl) {
    this.el = win.document.createElement("button");
    containerEl?.appendChild(this.el);
  }
  setButtonText() { return this; }
  setWarning() { return this; }
  onClick(cb) { this.el.addEventListener("click", cb); return this; }
}

class MarkdownView {}
class TAbstractFile {}
class TFile extends TAbstractFile {}
class TFolder extends TAbstractFile {}

const Platform = { isDesktop: true, isMobile: false, isDesktopApp: true, isMobileApp: false };

const obsidianStub = {
  Plugin: class Plugin {
    constructor(app, manifest) {
      this.app = app;
      this.manifest = manifest;
      this.commands = [];
      this.registeredDomEvents = [];
      this.registeredIntervals = [];
      this.onUnloadCallbacks = [];
      this.data = null;
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
  MarkdownView,
  TAbstractFile,
  TFile,
  TFolder,
  Platform,
  normalizePath: (p) => p,
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Legacy data (mirrors the vault's real files). */
const legacyFiles = {
  ".obsidian/plugins/focus-read-timer/data.json": {
    settings: {
      timerEnabled: true, timerWorkMinutes: 25, timerBreakMinutes: 5,
      timerAutoHide: false, timerPauseOnBlur: false,
      timerPositionX: 1187, timerPositionY: 162,
      focusDetectionEnabled: false, nudgeEnabled: true, nudgeIdleSeconds: 30,
      nudgeIgnoreScroll: false, dopamineEnabled: false, dopamineDailyGoalMinutes: 60,
    },
    stats: {
      totalReadingMs: 6365749, todayMs: 30005, todayDate: "2026-09-17", streak: 1,
      lastReadDate: "2026-09-17", longestStreak: 3,
      perDayMs: { "2026-07-08": 3278903, "2026-09-17": 30005 },
      longestFocusMs: 1464168, sessionsToday: 0,
    },
  },
  ".obsidian/plugins/focus-read-typography/data.json": {
    typographyEnabled: false, fontFamily: "lexend", customFontFamily: "",
    loadGoogleFonts: false, fontSize: 17, lineHeight: 1.7, maxWidthChars: 66,
    paragraphSpacing: 1.4, readingRulerEnabled: true, readingRulerHeight: 47,
    readingRulerColor: "#ffc400", readingRulerOpacity: 0.6, readingRulerMode: "manual",
  },
  ".obsidian/plugins/heatmap/data.json": {
    settings: { idleSeconds: 10, bucketCount: 200, heatmapWidth: 16, heatmapOffsetRight: 12, heatmapOpacity: 1, refreshIntervalMs: 1000, debugMode: true },
    records: {
      "test/note.md": { totalTimeMs: 275000, visits: 3, lastAccessed: "2026-09-17T01:22:03.206Z", buckets: Array(200).fill(1000), bucketVisits: Array(200).fill(1) },
    },
  },
};

function makeApp() {
  const files = new Map(Object.entries(legacyFiles).map(([k, v]) => [k, JSON.stringify(v)]));
  const adapter = {
    exists: async (path) => files.has(path),
    read: async (path) => {
      if (!files.has(path)) throw new Error("not found: " + path);
      return files.get(path);
    },
  };
  const workspace = {
    layoutReady: true,
    on: () => ({}),
    onLayoutReady: (cb) => cb(),
    iterateAllLeaves: () => {},
    getActiveViewOfType: () => null,
  };
  const vault = {
    on: () => ({}),
    getAbstractFileByPath: () => null,
    adapter,
  };
  return {
    workspace,
    vault,
    isMobile: false,
    plugins: { enabledPlugins: new Set(["focus-read-timer"]), disablePlugin: async () => {} },
    commands: { executeCommandById: () => {} },
    get legacyFileSnapshots() {
      return Object.fromEntries([...files.entries()]);
    },
  };
}

function loadBundle(path) {
  const source = require("node:fs").readFileSync(path, "utf8");
  const moduleObj = { exports: {} };
  const fakeRequire = (request) => {
    if (request === "obsidian") return obsidianStub;
    throw new Error(`unexpected require("${request}")`);
  };
  new Function("module", "exports", "require", source)(moduleObj, moduleObj.exports, fakeRequire);
  return moduleObj.exports.default ?? moduleObj.exports;
}

function fire(el, type, props = {}) {
  const Ctor = win.PointerEvent || win.Event;
  const event = new Ctor(type, { bubbles: true, cancelable: true });
  for (const [k, v] of Object.entries(props)) {
    try {
      Object.defineProperty(event, k, { value: v, configurable: true });
    } catch { /* ignore */ }
  }
  el.dispatchEvent(event);
}

let failures = 0;
function check(name, cond, extra = "") {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ FAIL: ${name} ${extra}`);
  }
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

/* ------------------------------------------------------------------ */
/* Smoke test                                                          */
/* ------------------------------------------------------------------ */

const { require } = { require: (await import("node:module")).createRequire(import.meta.url) };

async function smokeSuite() {
  console.log("\n[smoke] focus-read-suite (real bundle + real legacy data)");

  const PluginClass = loadBundle(resolve(root, "..", "focus-read-suite", "dist", "main.js"));
  const app = makeApp();
  const plugin = new PluginClass(app, { id: "focus-read-suite", version: "2.0.0" });

  await plugin.onload();

  /* ---- Migration ---- */
  // Settings persist through a 300 ms debounce — let it fire before reading.
  await sleep(450);
  const saved = plugin.__getData ? plugin.__getData() : plugin.data;
  check("migration marker written", saved?.migration?.state === "done");
  check("migration saw all three sources", (saved?.migration?.sources ?? []).length === 3);
  check("timer settings migrated", saved?.settings?.timer?.workMinutes === 25);
  check("timer position migrated (1187px desktop)", saved?.settings?.timer?.positionX === 1187);
  check("ruler settings migrated (47px, #ffc400)", saved?.settings?.ruler?.height === 47 && saved?.settings?.ruler?.color === "#ffc400");
  check("reading focus enabled from legacy", saved?.settings?.focus?.enabled === true);
  check("heatmap settings migrated", saved?.settings?.heatmap?.bucketCount === 200);
  check("stats preserved verbatim", saved?.stats?.totalReadingMs === 6365749);
  check("heatmap records preserved", saved?.heatmapRecords?.["test/note.md"] !== undefined);
  check("migration notice shown", Notice.messages.some((m) => m.includes("migrated")));

  /* ---- DOM effects of each module ---- */
  const timerEl = win.document.getElementById("frs-timer");
  check("timer widget mounted", !!timerEl);
  check("timer visible (legacy timerEnabled)", timerEl?.style.display === "block");

  const ruler = win.document.getElementById("frs-ruler");
  check("ruler mounted (legacy readingRulerEnabled)", !!ruler);
  check("ruler has notch", !!ruler?.querySelector(".frs-notch"));
  check("ruler user's height applied", ruler?.style.getPropertyValue("--frs-ruler-height") === "47px");
  check("ruler user's color applied", ruler?.style.getPropertyValue("--frs-ruler-color") === "#ffc400");

  check("typography vars applied (19→17px default? no — legacy 17)", win.document.documentElement.style.getPropertyValue("--frs-font-size") === "17px");
  check("typography disabled per legacy setting", !win.document.body.classList.contains("frs-typography-on"));
  check("goal bar mounted", !!win.document.getElementById("frs-goal-bar"));

  /* ---- Interactions through the real bundle ---- */
  // 1. Touch drag on the ruler notch:
  const notch = ruler?.querySelector(".frs-notch");
  fire(notch, "pointerdown", { clientY: 200, pointerId: 1, pointerType: "touch", button: 0 });
  fire(notch, "pointermove", { clientY: 420, pointerId: 1, pointerType: "touch" });
  fire(notch, "pointerup", { clientY: 420, pointerId: 1, pointerType: "touch" });
  await sleep(450); // let the debounced position save fire
  const afterDrag = plugin.__getData ? plugin.__getData() : plugin.data;
  check(
    "ruler position persisted as ratio after touch drag",
    typeof afterDrag?.settings?.ruler?.positionRatio === "number" &&
      afterDrag.settings.ruler.positionRatio > 0 &&
      afterDrag.settings.ruler.positionRatio <= 1
  );
  check("user ruler settings survive the drag save", afterDrag?.settings?.ruler?.color === "#ffc400" && afterDrag?.settings?.ruler?.height === 47);

  // 2. Timer controls through the real buttons:
  timerEl.querySelector('[data-action="start"]').click();
  const timerModule = plugin.modules.timer;
  const phase = timerModule ? timerModule.timer?.phase : undefined;
  check("timer module in work phase", phase === "work", `(phase=${phase})`);
  await sleep(300);
  timerEl.querySelector('[data-action="pause"]').click();
  check("pause via UI", timerModule.timer?.running === false);
  timerEl.querySelector('[data-action="stop"]').click();
  check("stop via UI", timerModule.timer?.phase === "idle");

  // 3. Commands registered:
  check("commands registered (≥ 12)", plugin.commands.length >= 12, `(${plugin.commands.length})`);
  const commandIds = plugin.commands.map((c) => c.id);
  check("toggle-reading-focus command exists", commandIds.includes("toggle-reading-focus"));
  check("disable-legacy-plugins command exists", commandIds.includes("disable-legacy-plugins"));

  // 4. Legacy detection works through the bundle:
  check("detects the enabled legacy plugin", JSON.stringify(plugin.detectLegacyPlugins()).includes("focus-read-timer"));

  /* ---- Unload & hygiene ---- */
  await plugin.onunload();
  for (const { el, type, cb, options } of plugin.registeredDomEvents) el.removeEventListener(type, cb, options);
  for (const id of plugin.registeredIntervals) clearInterval(id);
  for (const cb of plugin.onUnloadCallbacks) cb();

  check("timer removed on unload", win.document.getElementById("frs-timer") === null);
  check("ruler removed on unload", win.document.getElementById("frs-ruler") === null);
  check("goal bar removed on unload", win.document.getElementById("frs-goal-bar") === null);
  check("focus body class cleaned", !win.document.body.classList.contains("frs-focus-on"));
  check("typography vars cleaned", win.document.documentElement.style.getPropertyValue("--frs-font-size") === "");

  const finalSave = plugin.__getData ? plugin.__getData() : plugin.data;
  check("stats preserved through unload", finalSave?.stats?.totalReadingMs >= 6365749);
  check("per-day history preserved", finalSave?.stats?.perDayMs?.["2026-07-08"] === 3278903);
  check("records preserved through unload", finalSave?.heatmapRecords?.["test/note.md"] !== undefined);

  /* ---- Legacy files untouched ---- */
  const pristine = Object.fromEntries(
    Object.entries(legacyFiles).map(([k, v]) => [k, JSON.stringify(v)])
  );
  const snapshots = app.legacyFileSnapshots;
  const untouched = Object.entries(pristine).every(
    ([path, content]) => snapshots[path] === content
  );
  check("legacy data.json files were never modified", untouched);
}

(async () => {
  await smokeSuite();
  console.log("\n[smoke] " + (failures === 0 ? "ALL PASSED" : `${failures} FAILURE(S)`));
  process.exit(failures === 0 ? 0 : 1);
})();
