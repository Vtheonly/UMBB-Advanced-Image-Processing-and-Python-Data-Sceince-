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
import { cp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

/** plugin source folder -> folder name inside .obsidian/plugins */
const PLUGINS = [
  { src: "focus-read-timer", dir: "focus-read-timer" },
  { src: "heatmap-of-notes", dir: "heatmap" }, // keep existing folder name (compatibility)
];

/**
 * The typography & ruler functionality was merged into focus-read-timer
 * (v2.0.0). The legacy standalone plugin must stop loading so there is
 * never a duplicate ruler. We remove its code files but deliberately KEEP
 * its data.json: the merged plugin imports the user's settings from it on
 * first launch (one-time migration).
 */
async function pruneLegacyTypographyPlugin(vault) {
  const legacyDir = resolve(vault, ".obsidian", "plugins", "focus-read-typography");
  const legacyManifest = resolve(legacyDir, "manifest.json");
  if (!existsSync(legacyManifest)) return;
  for (const file of ["main.js", "manifest.json", "styles.css"]) {
    await rm(resolve(legacyDir, file), { force: true });
  }
  console.log(
    `[deploy] ${vault}: removed legacy focus-read-typography plugin code` +
      ` (data.json kept — settings are migrated automatically).`
  );

  // Drop it from the enabled-plugins list so Obsidian doesn't warn about a
  // missing plugin id.
  const communityListPath = resolve(vault, ".obsidian", "community-plugins.json");
  if (existsSync(communityListPath)) {
    try {
      const list = JSON.parse(await readFile(communityListPath, "utf8"));
      if (Array.isArray(list) && list.includes("focus-read-typography")) {
        const updated = list.filter((id) => id !== "focus-read-typography");
        await writeFile(communityListPath, JSON.stringify(updated, null, 2) + "\n", "utf8");
        console.log(`[deploy] ${vault}: removed focus-read-typography from community-plugins.json`);
      }
    } catch {
      /* unreadable list — leave it alone */
    }
  }
}

const vaultRoots = process.argv.slice(2);
if (vaultRoots.length === 0) {
  console.error("Usage: node scripts/deploy.mjs <vaultRoot> [...more vault roots]");
  process.exit(1);
}

for (const vault of vaultRoots) {
  await pruneLegacyTypographyPlugin(vault);
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
