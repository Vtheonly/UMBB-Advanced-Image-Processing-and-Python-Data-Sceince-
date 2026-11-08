#!/usr/bin/env node
/**
 * Copies built plugin artifacts (dist/) into the vault's .obsidian/plugins
 * folders so Obsidian loads the freshly built versions.
 *
 * Usage:
 *   node scripts/deploy.mjs <vaultRoot> [<vaultRoot2> ...]
 *
 * For each plugin the deploy target is:
 *   <vaultRoot>/.obsidian/plugins/<installDir>/{main.js, manifest.json, styles.css}
 *
 * `data.json` (user settings + tracked data) is intentionally NEVER touched.
 */
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

/** plugin source folder -> folder name inside .obsidian/plugins */
const PLUGINS = [
  { src: "focus-read-timer", dir: "focus-read-timer" },
  { src: "focus-read-typography", dir: "focus-read-typography" },
  { src: "heatmap-of-notes", dir: "heatmap" }, // keep existing folder name (compatibility)
];

const vaultRoots = process.argv.slice(2);
if (vaultRoots.length === 0) {
  console.error("Usage: node scripts/deploy.mjs <vaultRoot> [...more vault roots]");
  process.exit(1);
}

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

    // Sanity check: manifest id must stay stable so existing enabled-state and
    // data.json keep working across the upgrade.
    const manifest = JSON.parse(await readFile(resolve(target, "manifest.json"), "utf8"));
    console.log(
      `[deploy] ${vault} -> .obsidian/plugins/${dir}/ (id: ${manifest.id}, v${manifest.version})`
    );
  }
  console.log(`[deploy] ${vault}: done. data.json files were left untouched.`);
}
