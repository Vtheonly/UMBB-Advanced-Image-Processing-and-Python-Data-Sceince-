#!/usr/bin/env node
/**
 * Smoke-verifies each built bundle:
 *   1. The bundle must be non-empty CommonJS that exports a class.
 *   2. It must require the `obsidian` module at runtime (never inlined).
 *   3. Loading it with a stubbed obsidian + minimal DOM must not throw.
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const PLUGINS = ["focus-read-timer", "focus-read-typography", "heatmap-of-notes"];

let failed = false;

for (const plugin of PLUGINS) {
  const mainPath = resolve(root, "..", plugin, "dist", "main.js");
  if (!existsSync(mainPath)) {
    console.error(`[verify] ${plugin}: dist/main.js missing`);
    failed = true;
    continue;
  }

  const source = await readFile(mainPath, "utf8");

  if (source.trim().length === 0) {
    console.error(`[verify] ${plugin}: bundle is empty`);
    failed = true;
    continue;
  }

  // The Obsidian API must be required at runtime, never inlined.
  if (!/require\(\s*["']obsidian["']\s*\)/.test(source)) {
    console.error(`[verify] ${plugin}: bundle does not require("obsidian") — wrong external config?`);
    failed = true;
    continue;
  }

  // Evaluate the CommonJS bundle in a sandbox with a stubbed `obsidian`
  // module and check the export shape.
  const obsidianStub = {
    Plugin: class Plugin {},
    PluginSettingTab: class PluginSettingTab {},
    Setting: class Setting {},
    Notice: class Notice {},
    MarkdownView: class MarkdownView {},
    Modal: class Modal {},
    ButtonComponent: class ButtonComponent {},
    TAbstractFile: class TAbstractFile {},
    TFile: class TFile {},
    TFolder: class TFolder {},
    Platform: { isMobile: false, isDesktop: true },
  };

  try {
    const moduleObj = { exports: {} };
    const fakeRequire = (request) => {
      if (request === "obsidian") return obsidianStub;
      throw new Error(`unexpected require("${request}") in bundle`);
    };
    const fn = new Function("module", "exports", "require", source);
    fn(moduleObj, moduleObj.exports, fakeRequire);

    const exported = moduleObj.exports?.default ?? moduleObj.exports;
    const isClass = typeof exported === "function" && /^\s*class/.test(exported.toString() || "");
    if (!isClass) {
      console.error(`[verify] ${plugin}: export is not a class (got ${typeof exported})`);
      failed = true;
      continue;
    }
    const proto = exported.prototype || {};
    const hasLifecycle = typeof proto.onload === "function" && typeof proto.onunload === "function";
    if (!hasLifecycle) {
      console.error(`[verify] ${plugin}: export lacks onload/onunload lifecycle methods`);
      failed = true;
      continue;
    }
    console.log(
      `[verify] ${plugin}: OK (${(source.length / 1024).toFixed(1)} kB, exports class with lifecycle)`
    );
  } catch (err) {
    console.error(`[verify] ${plugin}: failed to load bundle`);
    console.error(err);
    failed = true;
  }
}

if (failed) process.exit(1);
