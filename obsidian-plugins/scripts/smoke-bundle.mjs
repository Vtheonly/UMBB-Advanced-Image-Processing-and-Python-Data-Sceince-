#!/usr/bin/env node
/**
 * Bundle-level integration smoke test.
 *
 * Loads the ACTUAL dist/main.js artifacts (not the TypeScript sources) into
 * a happy-dom environment with a stubbed `obsidian` module, boots each
 * plugin with the user's REAL data.json from the vault, exercises basic
 * interactions through pointer events, unloads, and asserts full cleanup.
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
  "HTMLElement",
  "HTMLDivElement",
  "HTMLCanvasElement",
  "HTMLButtonElement",
  "HTMLLinkElement",
  "Element",
  "Node",
  "NodeList",
  "Event",
  "CustomEvent",
  "PointerEvent",
  "MouseEvent",
  "KeyboardEvent",
  "MutationObserver",
  "ResizeObserver",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "matchMedia",
  "localStorage",
];
globalThis.window = win;
globalThis.document = win.document;
for (const key of globalsToInstall) {
  if (win[key] !== undefined) globalThis[key] = win[key];
}
// rAF that actually runs (happy-dom ties it to timers).
if (typeof globalThis.requestAnimationFrame !== "function") {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  globalThis.cancelAnimationFrame = clearTimeout;
}

/* ------------------------------------------------------------------ */
/* obsidian stub (runtime JS mirror of shared/test/obsidian-stub.ts)   */
/* ------------------------------------------------------------------ */

class Notice {
  static messages = [];
  constructor(message) {
    Notice.messages.push(String(message));
  }
  static reset() {
    Notice.messages = [];
  }
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
    if (containerEl) containerEl.appendChild(this.settingEl);
  }
  setName(n) { return this; }
  setDesc(d) { return this; }
  addToggle(cb) { cb(stubComponent("toggle")); return this; }
  addSlider(cb) { cb(stubComponent("slider")); return this; }
  addText(cb) { cb(stubComponent("text")); return this; }
  addDropdown(cb) { cb(stubComponent("dropdown")); return this; }
  addColorPicker(cb) { cb(stubComponent("color")); return this; }
  addButton(cb) { cb(stubComponent("button")); return this; }
}

function stubComponent() {
  return {
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
  setCta() { return this; }
  setDisabled() { return this; }
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
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function makeApp(legacyTypographyData = null) {
  const app = {
    workspace: {
      layoutReady: true,
      on: () => ({}),
      onLayoutReady: (cb) => cb(),
      iterateAllLeaves: () => {},
      getActiveViewOfType: () => null,
    },
    vault: {
      on: () => ({}),
      getAbstractFileByPath: () => null,
    },
  };
  if (legacyTypographyData !== null) {
    // Simulates the legacy standalone plugin's data.json still on disk.
    app.vault.adapter = {
      exists: async (p) => p === ".obsidian/plugins/focus-read-typography/data.json",
      read: async () => JSON.stringify(legacyTypographyData),
    };
  }
  return app;
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
/* Smoke tests                                                         */
/* ------------------------------------------------------------------ */

const { require } = { require: (await import("node:module")).createRequire(import.meta.url) };

async function smokeFocusRead() {
  console.log("\n[smoke] focus-read-timer v2 (bundle + real user data + legacy migration)");
  const PluginClass = loadBundle(resolve(root, "..", "focus-read-timer", "dist", "main.js"));

  // Real timer data.json (pre-merge shape: no `typography` section) + the
  // legacy standalone plugin's data.json still present in the vault:
  const legacyTypography = {
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
  const plugin = new PluginClass(makeApp(legacyTypography), { id: "focus-read-timer", version: "2.0.0" });
  plugin.data = {
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
      dopamineDailyGoalMinutes: 60,
    },
    stats: {
      totalReadingMs: 6365749,
      todayMs: 30005,
      todayDate: "2026-09-17",
      streak: 1,
      lastReadDate: "2026-09-17",
      longestStreak: 3,
      perDayMs: { "2026-07-08": 3278903, "2026-09-17": 30005 },
      longestFocusMs: 1464168.299999997,
      sessionsToday: 0,
    },
  };

  await plugin.onload();

  // --- Timer side (unchanged behavior) ---
  const el = win.document.getElementById("frt-floating-timer");
  check("timer box mounted", !!el);
  check("timer visible", el?.style.display === "block");
  check("all 9 commands registered (timer + typography/ruler)", plugin.commands.length === 9);

  el.querySelector('[data-action="start"]').click();
  check("work session starts via UI", plugin.timer.phase === "work" && plugin.timer.running);
  await sleep(400); // let a tick happen
  el.querySelector('[data-action="pause"]').click();
  check("pause via UI", !plugin.timer.running);
  el.querySelector('[data-action="stop"]').click();
  check("stop via UI", plugin.timer.phase === "idle");

  // --- Ruler side (migrated from the legacy plugin) ---
  const ruler = win.document.getElementById("frt-reading-ruler");
  check("ruler mounted via legacy migration", !!ruler);
  check("ruler migrated with user's height (47px)", ruler?.style.getPropertyValue("--frt-ruler-height") === "47px");
  check("ruler migrated with user's color (#ffc400)", ruler?.style.getPropertyValue("--frt-ruler-color") === "#ffc400");
  check("ruler migrated with user's opacity (0.6)", ruler?.style.getPropertyValue("--frt-ruler-opacity") === "0.6");
  check("ruler visible via body class", win.document.body.classList.contains("frt-ruler-on"));
  check("typography disabled per user settings", !win.document.body.classList.contains("frt-typography-on"));
  check("has drag handle with pointer-events target", !!ruler?.querySelector(".frt-ruler-handle"));
  check("migration was persisted immediately", !!plugin.data?.typography?.readingRulerColor);

  // Simulate a touch drag on the handle:
  const handle = ruler.querySelector(".frt-ruler-handle");
  fire(handle, "pointerdown", { clientY: 200, pointerId: 1, pointerType: "touch", button: 0 });
  fire(handle, "pointermove", { clientY: 420, pointerId: 1, pointerType: "touch" });
  fire(handle, "pointerup", { clientY: 420, pointerId: 1, pointerType: "touch" });
  await sleep(30);
  const saved = plugin.data;
  check("position persisted as ratio after touch drag", typeof saved.typography?.readingRulerPositionRatio === "number" && saved.typography.readingRulerPositionRatio > 0 && saved.typography.readingRulerPositionRatio <= 1);
  check("user ruler settings preserved on save", saved.typography?.readingRulerColor === "#ffc400" && saved.typography?.readingRulerHeight === 47);

  await plugin.onunload();
  for (const { el, type, cb, options } of plugin.registeredDomEvents) el.removeEventListener(type, cb, options);
  for (const id of plugin.registeredIntervals) clearInterval(id);
  check("timer box removed", win.document.getElementById("frt-floating-timer") === null);
  check("ruler removed on unload", win.document.getElementById("frt-reading-ruler") === null);
  check("body classes cleaned", !win.document.body.classList.contains("frt-ruler-on") && !win.document.body.classList.contains("frt-typography-on"));

  // --- Stats integrity (nothing lost in the merge) ---
  const savedFinal = plugin.data;
  check("stats preserved through unload", savedFinal.stats.totalReadingMs >= 6365749);
  check("per-day history preserved", savedFinal.stats.perDayMs["2026-07-08"] === 3278903);
  check("settings preserved", savedFinal.settings.timerWorkMinutes === 25);
}

async function smokeHeatmap() {
  console.log("\n[smoke] heatmap-of-notes (bundle + real data)");
  const PluginClass = loadBundle(resolve(root, "..", "heatmap-of-notes", "dist", "main.js"));
  const plugin = new PluginClass(makeApp(), { id: "heatmap-of-notes", version: "1.1.0" });

  // Real data.json (with actual tracked records):
  const realDataPath = process.argv[2];
  if (existsSync(realDataPath)) {
    plugin.data = JSON.parse(await readFile(realDataPath, "utf8"));
    console.log(`  (using real data.json: ${realDataPath})`);
  } else {
    plugin.data = {
      settings: { idleSeconds: 10, bucketCount: 200, heatmapWidth: 16, heatmapOffsetRight: 12, heatmapOpacity: 1, refreshIntervalMs: 1000, debugMode: true },
      records: {
        "test/note.md": { totalTimeMs: 275000, visits: 3, lastAccessed: "2026-09-17T01:22:03.206Z", buckets: Array(200).fill(1000), bucketVisits: Array(200).fill(1) },
      },
    };
  }

  await plugin.onload();

  const recordCount = Object.keys(plugin.database.records).length;
  check("records loaded intact", recordCount > 0, `(${recordCount} records)`);
  check("settings normalized", plugin.database.settings.bucketCount >= 10);

  // Rename remap through the database API:
  const firstPath = Object.keys(plugin.database.records)[0];
  if (firstPath) {
    plugin.database.handleRename(firstPath, "renamed/" + firstPath.split("/").pop());
    check("rename remaps records", plugin.database.getRecord("renamed/" + firstPath.split("/").pop()) !== undefined);
  }

  await plugin.onunload();
  for (const { el, type, cb, options } of plugin.registeredDomEvents) el.removeEventListener(type, cb, options);
  for (const id of plugin.registeredIntervals) clearInterval(id);
  const saved = plugin.data;
  check("records survive unload+save", Object.keys(saved.records).length === recordCount);
}

(async () => {
  await smokeFocusRead();
  await smokeHeatmap();

  console.log("\n[smoke] " + (failures === 0 ? "ALL PASSED" : `${failures} FAILURE(S)`));
  process.exit(failures === 0 ? 0 : 1);
})();
