# Obsidian Plugins — Source, Build & Tests

This directory contains the **complete TypeScript source, build system and test suites** for the custom Obsidian plugins of this vault:

| Plugin | Plugin ID | Install folder | Version |
| --- | --- | --- | --- |
| **Focus Read** (the main plugin: timer + nudge + stats + goal bar + typography + **reading ruler**) | `focus-read-timer` | `.obsidian/plugins/focus-read-timer/` | 2.0.0 |
| Heatmap of Notes | `heatmap-of-notes` | `.obsidian/plugins/heatmap/` | 1.1.0 |

> The `heatmap` **folder name intentionally stays** `heatmap` (it differs from the manifest id
> `heatmap-of-notes`) so existing vaults keep their enabled-state and `data.json` working.
> Likewise `focus-read-timer` keeps its id from the pre-merge era so enabled-state and data survive.

**v2.0.0 — the Yellow Ruler merge.** The former standalone plugin *“Focus Read: Typography &
Ruler”* (`focus-read-typography`) was recovered from the vault's git history (commit `1f79343`),
repaired, modernized and **merged into the main Focus Read plugin**. It is no longer a separate
plugin: one settings screen, one data file, one command namespace. Existing user settings are
migrated automatically on first launch (see “Upgrade & migration” below).

---

## Quick start

```bash
cd obsidian-plugins
npm install        # dev toolchain: esbuild, typescript, vitest, happy-dom
npm test           # 138 unit + bootstrap tests
npm run build      # type-safe bundles -> <plugin>/dist/main.js
npm run verify     # bundle shape sanity checks
node scripts/smoke-bundle.mjs          # boots the real bundles with a stubbed Obsidian
node scripts/verify-upgrade-path.mjs   # boots the DEPLOYED bundle with the vault's REAL data.json files
npm run deploy -- ..                   # copies dist into ../.obsidian/plugins/ (and prunes the legacy plugin)
```

---

## What was wrong and what was fixed

### 0. The Yellow Ruler merge (v2.0.0) — recovery, repair, integration

The reading ruler (the yellow bar) originally lived in the standalone *Typography & Ruler*
plugin. Its historical implementation was recovered from the vault's git history (commit
`1f79343`, `.obsidian/plugins/focus-read-typography/main.js`, 323 lines) and compared against
the current code before merging it into the main plugin:

- **All 12 original settings preserved** — `typographyEnabled`, `fontFamily` (8 options incl.
  custom), `customFontFamily`, `loadGoogleFonts`, `fontSize`, `lineHeight`, `paragraphSpacing`,
  `maxWidthChars`, `readingRulerEnabled`, `readingRulerHeight`, `readingRulerColor`,
  `readingRulerOpacity` — plus the two modern additions `readingRulerMode` and
  `readingRulerPositionRatio`.
- **Original commands preserved with the same ids** (`toggle-typography`, `toggle-ruler`) so
  existing hotkeys keep working, plus `center-ruler`, `ruler-up`, `ruler-down`.
- **Two dead settings controls repaired** (found by comparing historical vs. current
  behavior): the *“Enable reading ruler”* toggle and the *“Reset ruler position”* button saved
  their value but never reached the ruler — the ruler only reacted after a plugin reload.
  Both are now wired through `applyRulerVisibility()` / `applyRulerPosition()` and covered by
  settings-wiring regression tests.
- **Custom font stack is sanitized at write time** (previously only at load/apply time).
- **One-time data migration**: on first launch the main plugin imports the legacy plugin's
  `data.json` through the vault adapter (works on desktop *and* mobile), shows a notice, and
  persists immediately so the migration runs exactly once. A corrupted or missing legacy file
  falls back to defaults without crashing. Verified end-to-end against the vault's real data
  files (`scripts/verify-upgrade-path.mjs`).
- **Duplicate-ruler guard**: the ruler removes any leftover `#frt-reading-ruler` element
  before mounting, so a half-uninstalled legacy plugin can never produce two bands.

### 1. Focus Read: Typography & Ruler (historical fixes, carried into the merge)

The reading ruler (the yellow bar) was the most broken piece on mobile. Root causes found in the
original code — not symptoms:

| # | Bug (root cause) | Fix |
| --- | --- | --- |
| 1 | Ruler movement driven **only** by `window.mousemove`. Touch devices fire `mousemove` only as a *compat event after a tap*, so the ruler either never appeared (it started at `top: -9999px`) or **teleported to wherever you tapped**. | Complete rewrite on the **Pointer Events** API. The ruler never reacts to taps anywhere on the page. |
| 2 | The ruler had `pointer-events: none` and **no drag mechanism at all** — there was no way to deliberately position it with mouse *or* finger. | A dedicated **drag handle** (44 px touch target, `touch-action: none`, `setPointerCapture`) works with mouse, pen and touch. Double-tap centers the ruler. |
| 3 | "Follow pointer" semantics on a touchscreen conflict with scrolling. | Follow mode now only tracks **hover-capable pointers** (`pointerType !== "touch"` + `(hover: hover)` media query). New setting *Ruler interaction mode*: `auto` (default: follow on desktop, manual on touch) / `follow` / `manual`. |
| 4 | `mix-blend-mode: multiply` rendered the yellow ruler **almost black in dark themes**. | `multiply` only in light theme; normal blending in `body.theme-dark`. |
| 5 | Writing `style.top` on every mousemove forced layout 60×/s. | Movement via `transform: translate3d()` behind an rAF-coalesced scheduler. |
| 6 | Position was implicit (last mouse Y), never persisted; resize/orientation changes could push it off-screen. | Position persisted as a **0–1 ratio** of the movable range — survives orientation changes and other screen sizes; re-clamped on `resize` / `orientationchange` / `visualViewport.resize`. |
| 7 | Ruler band at `z-index: 9999` painted **above Obsidian modals, menus, popovers and tooltips**. | Sits just below the floating-UI layer (`calc(var(--layer-float, 60) - 5)`). |
| 8 | The translucent band opacity also faded the (future) handle — a 0.18-opacity ruler would have an invisible handle. | Opacity lives on an inner `.frt-ruler-band` child; the handle stays fully opaque. |
| 9 | Google Fonts loader injected **all six families** regardless of selection (wasted mobile bandwidth). | Only the selected family is loaded; link removed when unused. |
| 10 | The base stylesheet existed **twice** (`styles.css` + a JS-injected copy that was rebuilt as `textContent` on every settings change). | Single source of truth: static `styles.css` + CSS custom properties set on `:root` from JS. |
| 11 | Custom font stack (user input) was interpolated into CSS without sanitizing → CSS injection. | `sanitizeFontStack()` strips rule-breaking characters; all numeric settings clamped on load. |
| 12 | No keyboard/commands support for the ruler. | Commands: *Toggle ruler*, *Center ruler*, *Move ruler up/down*. |

### 2. Focus Read: Timer & Nudge (historical fixes, unchanged by the merge)

| # | Bug | Fix |
| --- | --- | --- |
| 1 | `document.addEventListener("visibilitychange", …)` was **never removed** — leaked across plugin reload/disable. | All listeners registered through `registerDomEvent` (auto-cleanup by Obsidian). |
| 2 | Saved timer position (e.g. `x=1187` from a desktop) was applied **without clamping** → box permanently off-screen on phones. | Clamped into the viewport on load **and** on `resize`/`orientationchange`/`visualViewport` changes; drag clamping uses the element's real size. |
| 3 | Ticking ran on `requestAnimationFrame`: the timer **froze in background windows** and re-rendered the whole widget 60×/s. | 250 ms interval + timestamp math (accurate in background), DOM writes only when the displayed second changes (≈1 Hz). |
| 4 | Dismissing the idle nudge was pointless — the 5 s idle check **re-created it immediately**. | Dismissal snoozes for `max(2 × threshold, 60 s)`; real input cancels the snooze. |
| 5 | The reading-time tracker counted time while the user had **walked away** (only checked window focus). | When focus detection is enabled, user activity within the idle threshold is also required. |
| 6 | Breaks could not be paused (state machine conflated phase and running state). | Clean `(phase: work/break, running)` state machine; breaks are pausable. |
| 7 | `resetAutoHide` churned `clearTimeout`/`setTimeout` on **every mousemove**. | Auto-hide timers reset through the widget's `poke()` throttle-free path; no per-mousemove allocation. |
| 8 | Dopamine bar label could sit under the iOS home indicator / Android gesture bar. | `env(safe-area-inset-bottom)` respected; touch-friendly button sizing; narrower layout on phones. |

### 3. Heatmap of Notes

| # | Bug | Fix |
| --- | --- | --- |
| 1 | **Folder renames orphaned every record beneath the folder** (only single-file renames were handled). | `remapRecordPaths()` remaps the file itself and every `oldPrefix/…` record; idempotent under Obsidian's double-fire rename events. |
| 2 | The heatmap strip had `pointer-events: auto` — on touch devices a 16 px strip along the **right edge swallowed scroll gestures**. | On touch devices (detected via `(hover: none)`), the strip becomes `pointer-events: none` (hover tooltips are desktop-only anyway). |
| 3 | Mere **hovering** the strip created a fresh record (2 × bucketCount zeros) for never-opened notes, polluting `data.json`. | Read-only `getRecord()` for tooltip/dashboard; only write paths create records. |
| 4 | `checkAndRebindScroller()` ran `querySelector` + `getMode()` on **every paint, tick and mousemove**. | Scroller is re-resolved only when it is actually detached from the DOM. |
| 5 | Changing settings (e.g. bucket resolution) rebuilt renderers and **recounted a "visit"** for every open note. | Visits are counted once per note per session (`sessionVisitedPaths`), independent of renderer rebuilds. |
| 6 | Per-path viewport state (`lastVisibleBucketsMap`) grew **forever**. | Pruned when the last view for a path closes. |
| 7 | "Reset Database" used the raw `confirm()` dialog (blocked/unavailable in some Obsidian contexts, especially mobile). | Proper Obsidian `Modal` confirmation. |
| 8 | `destroy()` left `position: relative` inline style on live views. | Original inline position recorded and restored on destroy. |
| 9 | Records for deleted notes accumulated forever with no way to clean up. | New **"Prune records for deleted notes"** maintenance action. |
| 10 | Tooltip width hardcoded (140 px) — could overlap the viewport edge. | Uses the real `offsetWidth`, clamped to ≥ 4 px. |

### Cross-cutting improvements (all three plugins)

- Rewritten from bundles into **modular TypeScript** (`settings` / pure logic modules / DOM controllers / plugin entry) — logic modules are DOM-free and unit-testable.
- **Lifecycle hygiene**: every listener, interval and DOM node is registered/owned through Obsidian's `registerDomEvent` / `registerInterval` / `registerEvent` / `register(cb)` APIs; verified by leak tests that run `onunload()` + framework teardown and assert zero leftovers.
- **Settings hardening**: all persisted values are normalized and clamped on load (bad/hand-edited values can no longer produce broken CSS or a 0-bucket canvas).
- **Data compatibility**: `data.json` schemas are unchanged; new keys default sensibly. The bundles were smoke-tested against the vault's **real `data.json` files** (settings, stats and heatmap records all survive a load → unload → save cycle untouched).
- Duplicate/dead code removed (the JS-injected CSS copy, the double body-class toggles, the duplicated DPR logic, etc.).

---

## Architecture

```
obsidian-plugins/
├── shared/                      # code shared across plugins
│   ├── src/viewport.ts          # viewport size, clamping, hover detection, rAF scheduler
│   └── test/                    # obsidian module stub + DOM/pointer test helpers
├── focus-read-timer/            # THE MAIN PLUGIN: "Focus Read" v2.0.0
│   ├── src/
│   │   ├── main.ts              # lifecycle, commands, wiring, legacy migration
│   │   ├── settings.ts          # timer settings model + normalization + clock formatting
│   │   ├── timer.ts             # FocusTimer state machine (pure logic)
│   │   ├── stats.ts             # reading-time stats: rollover, streaks, accrual (pure logic)
│   │   ├── widget.ts            # floating timer box: render, pointer drag, auto-hide
│   │   ├── nudge.ts             # idle nudge with snooze
│   │   ├── dopamine.ts          # daily goal bar
│   │   ├── typography-settings.ts  # typography+ruler settings, font stacks, sanitization
│   │   ├── typography.ts        # CSS-variable application + Google Fonts link management
│   │   ├── ruler.ts             # ReadingRuler: pointer drag + follow + clamping
│   │   └── settings-tab.ts      # unified tab: timer/focus/nudge/goal/typography/ruler
│   └── test/                    # 96 tests (54 timer + 42 typography/ruler incl. migration)
├── heatmap-of-notes/
│   ├── src/
│   │   ├── main.ts              # lifecycle, workspace/vault events
│   │   ├── types.ts             # settings + record models
│   │   ├── logger.ts            # leveled logger
│   │   ├── storage.ts           # HeatmapDatabase + pure helpers (resize, rename remap, prune)
│   │   ├── activity.ts          # ActivityMonitor (pointer-based)
│   │   ├── renderer.ts          # canvas renderer + tooltip
│   │   ├── engine.ts            # tracking loop + pure viewport-bucket math
│   │   └── settings-tab.ts      # settings, dashboard, tools (incl. prune)
│   └── test/                    # 33 tests
├── scripts/
│   ├── build.mjs                # esbuild: TS -> single-file CJS bundle per plugin
│   ├── deploy.mjs               # copy dist into a vault's .obsidian/plugins (+ prune legacy)
│   ├── verify-bundle.mjs        # bundle shape checks (exports class, obsidian external)
│   ├── smoke-bundle.mjs         # boots the REAL bundles with a stubbed Obsidian + happy-dom
│   └── verify-upgrade-path.mjs  # boots the DEPLOYED bundle with the vault's REAL data files
├── package.json                 # npm scripts
├── tsconfig.json                # strict TypeScript
└── vitest.config.ts             # happy-dom environment + obsidian alias to the stub
```

### data.json shape (Focus Read)

```json
{
  "settings":   { "timerEnabled": true, "...": "timer/nudge/focus/goal settings" },
  "stats":      { "totalReadingMs": 0, "...": "reading-time stats" },
  "typography": { "readingRulerEnabled": true, "readingRulerColor": "#ffc400", "...": "typography + ruler settings" }
}
```

The `typography` section is new in v2.0.0; on first launch it is imported from the legacy
standalone plugin's `data.json` (see below).

## Upgrade & migration (old vaults)

For a vault that still has the old two Focus Read plugins installed:

1. Deploy (or git-pull) the new `.obsidian/plugins/focus-read-timer/` (v2.0.0). The plugin id is
   unchanged, so it stays enabled with its existing timer settings and stats.
2. The legacy `focus-read-typography` folder loses its code files (deploy prunes them and drops
   the id from `community-plugins.json`); its `data.json` is **kept on purpose**.
3. On the first launch of Focus Read v2.0.0, the plugin reads that legacy `data.json` through
   the vault adapter, imports every typography/ruler setting, shows a notice, and persists the
   merged data immediately — the migration runs exactly once. After that the legacy `data.json`
   is inert and can be deleted by hand at any time.
4. Nothing else changes: heatmap is untouched, stats are untouched, command ids are preserved.

## Testing

Four layers:

1. **Unit tests** (vitest): pure logic — timer state machine, stats/streak math, bucket math,
   rename remapping, settings normalization, clamping. `npm test`.
2. **DOM interaction tests** (vitest + happy-dom): pointer-event pipelines simulate mouse drags,
   touch drags, taps, `pointercancel` (OS gesture interruption), viewport rotations — asserting
   the exact scenarios that were broken on mobile.
3. **Bootstrap + settings-wiring tests**: the real plugin classes are loaded against an
   Obsidian API stub and run through `onload → interact → onunload`, asserting DOM effects,
   **zero leaked listeners/intervals**, and — for the merged ruler — that *every settings
   control really reaches the live ruler/typography* (toggles mount/unmount the band, sliders
   change `--frt-ruler-*`, the reset button moves the band, values persist across a simulated
   restart, and the legacy `data.json` migration produces the user's exact ruler).
4. **Bundle smoke tests** (`scripts/smoke-bundle.mjs`, `scripts/verify-upgrade-path.mjs`): the
   *actual shipped* bundles are booted with the vault's real `data.json` files; interactions
   are driven through the DOM; data integrity is verified across a full load/unload cycle,
   including the real pre-merge → post-merge upgrade path.

### Testing limitations (please read)

The sandbox cannot run the actual Obsidian desktop/Electron or iOS/Android apps, so the following
could not be verified here and should get a quick pass on a real device:

- Google Fonts download on a mobile connection (opt-in setting).
- The ruler's drag handle on a real capacitive screen (the pointer-event pipeline is tested, but
  only a physical device confirms gesture-nav/scroll-interception feel).
- Canvas painting (happy-dom has no 2D canvas; the renderer's draw path is structurally guarded
  and the paint code is a faithful port of the original, but visual output should be eyeballed
  once).
- Performance on very large vaults: `data.json` still holds all records in one file (10 s
  throttled writes, same as before). The new prune tool helps keep it small.

Everything else — including every fix in the tables above — is covered by the 138 automated tests.

## Deploying

```bash
npm run build
node scripts/deploy.mjs /path/to/vault              # one or more vault roots
```

The script copies `main.js`, `manifest.json` and `styles.css` into
`<vault>/.obsidian/plugins/<folder>/` and never touches `data.json`. For vaults that still
contain the legacy standalone `focus-read-typography` plugin, deploy also removes its code
files (keeping `data.json` for the one-time migration) and drops the id from
`community-plugins.json`. After deploying, restart Obsidian (or toggle the plugins off/on) and
check Settings → Community plugins.
