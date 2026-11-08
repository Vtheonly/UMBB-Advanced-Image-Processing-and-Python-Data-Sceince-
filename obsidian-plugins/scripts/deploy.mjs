#!/usr/bin/env node
/**
 * Copies built plugin artifacts (dist/) into the vault's .obsidian/plugins
 * folders so Obsidian loads the freshly built versions.
 *
 * Usage:
 *   node scripts/deploy.mjs <vaultRoot> [...more vault roots]   → suite only
 *   node scripts/deploy.mjs --legacy <vaultRoot>                → suite + legacy
 *
 * For the suite the deploy target is:
 *   <vaultRoot>/.obsidian/plugins/focus-read-suite/{main.js, manifest.json, styles.css}
 *
 * `data.json` (user settings + tracked data) is intentionally NEVER touched —
 * neither for the suite nor for the legacy plugins (they stay rollback-able).
 */
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

const withLegacy = process.argv.includes("--legacy");
const vaultRoots = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (vaultRoots.length === 0) {
  console.error("Usage: node scripts/deploy.mjs [--legacy] <vaultRoot> [...more vault roots]");
  process.exit(1);
}

/** plugin source folder -> folder name inside .obsidian/plugins */
const PLUGINS = [
  { src: "focus-read-suite", dir: "focus-read-suite" },
  ...(withLegacy
    ? [
        { src: "legacy/focus-read-timer", dir: "focus-read-timer" },
        { src: "legacy/focus-read-typography", dir: "focus-read-typography" },
        { src: "legacy/heatmap-of-notes", dir: "heatmap" }, // keep existing folder name (compatibility)
      ]
    : []),
];

for (const vault of vaultRoots) {
  for (const { src, dir } of PLUGINS) {
    const dist = resolve(root, "..", src, "dist");
    const target = resolve(vault, ".obsidian", "plugins", dir);

    if (!existsSync(resolve(dist, "main.js"))) {
      console.error(`[deploy] ${src}: dist/main.js missing — run the build first.`);
      process.exitCode = 1;
      continue;
    }

    await mkdir(target, { recursive: true });
    for (const file of ["main.js", "manifest.json", "styles.css"]) {
      if (existsSync(resolve(dist, file))) {
        await cp(resolve(dist, file), resolve(target, file));
      }
    }

    const manifest = JSON.parse(await readFile(resolve(target, "manifest.json"), "utf8"));
    console.log(
      `[deploy] ${vault} -> .obsidian/plugins/${dir}/ (id: ${manifest.id}, v${manifest.version})`
    );
  }
  console.log(`[deploy] ${vault}: done. data.json files were left untouched.`);
}
