#!/usr/bin/env node
/**
 * Builds plugins into single-file CommonJS `main.js` bundles Obsidian can
 * load, plus copies manifest/styles next to the bundle.
 *
 *   node scripts/build.mjs            → builds focus-read-suite (the product)
 *   node scripts/build.mjs --legacy   → also builds the archived legacy plugins
 *
 * Output layout (per plugin):
 *   <plugin>/dist/main.js        — bundled plugin entry
 *   <plugin>/dist/manifest.json  — copied from source folder
 *   <plugin>/dist/styles.css     — copied from source folder
 */
import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

const SUITE = "focus-read-suite";
const LEGACY = ["focus-read-timer", "focus-read-typography", "heatmap-of-notes"];

const withLegacy = process.argv.includes("--legacy");
const plugins = [SUITE, ...(withLegacy ? LEGACY : [])];

let failed = false;

for (const plugin of plugins) {
  const srcDir = resolve(root, "..", plugin);
  const outDir = resolve(srcDir, "dist");

  if (!existsSync(resolve(srcDir, "src", "main.ts"))) {
    console.error(`[build] ${plugin}: src/main.ts not found, skipping.`);
    failed = true;
    continue;
  }

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  try {
    const result = await build({
      entryPoints: [resolve(srcDir, "src", "main.ts")],
      bundle: true,
      outfile: resolve(outDir, "main.js"),
      format: "cjs",
      platform: "browser",
      target: "es2018",
      external: ["obsidian", "electron", "@codemirror/autocomplete", "@codemirror/collab", "@codemirror/commands", "@codemirror/language", "@codemirror/lint", "@codemirror/search", "@codemirror/state", "@codemirror/view", "@lezer/common", "@lezer/highlight", "@lezer/lr"],
      minify: false,
      sourcemap: false,
      treeShaking: true,
      legalComments: "none",
      logLevel: "info",
    });

    if (result.errors && result.errors.length > 0) {
      failed = true;
    }

    await cp(resolve(srcDir, "manifest.json"), resolve(outDir, "manifest.json"));
    if (existsSync(resolve(srcDir, "styles.css"))) {
      await cp(resolve(srcDir, "styles.css"), resolve(outDir, "styles.css"));
    }
    console.log(`[build] ${plugin}: OK -> dist/main.js`);
  } catch (err) {
    console.error(`[build] ${plugin}: FAILED`);
    console.error(err);
    failed = true;
  }
}

if (failed) process.exit(1);
