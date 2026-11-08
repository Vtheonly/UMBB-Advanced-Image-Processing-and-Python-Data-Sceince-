# Focus Read Suite — Source, Build & Tests

This directory contains the **complete TypeScript source, build system, test suites and deployed artifact** for **Focus Read Suite** (`focus-read-suite` v2.0.0) — the single unified Obsidian plugin that consolidates the three former plugins:

| Former plugin | Legacy id | Install folder | Now |
| --- | --- | --- | --- |
| Focus Read: Timer & Nudge | `focus-read-timer` | `.obsidian/plugins/focus-read-timer/` | **Timer module** |
| Focus Read: Typography & Ruler | `focus-read-typography` | `.obsidian/plugins/focus-read-typography/` | **Reading Focus + Typography modules** |
| Heatmap of Notes | `heatmap-of-notes` | `.obsidian/plugins/heatmap/` | **Heatmap module** |

One plugin, one settings system, one visual identity — while every original feature is preserved, improved, and **your data migrates automatically** on first launch.

---

## Quick start

```bash
cd obsidian-plugins
npm install                     # dev toolchain: esbuild, typescript, vitest, happy-dom
npm test                        # 161 unit + integration tests
npm run build                   # type-safe bundle -> focus-read-suite/dist/main.js
npm run verify                  # bundle shape sanity checks
node scripts/smoke-bundle.mjs   # boots the REAL bundle with legacy data + stubbed Obsidian
npm run deploy -- ..            # copies dist into ../.obsidian/plugins/focus-read-suite/
npm run check                   # build + verify + test + smoke in one go
```

`data.json` (user settings + tracked data) is **never** touched by build or deploy.

---

## What the suite includes

### 1. Focus Read Timer (`modules/timer`)
The floating focus timer with a redesigned card UI (status pill with live phase dot, big tabular clock, phase-colored progress bar, touch-friendly controls, double-click/double-tap header to collapse):
- Pomodoro-style work/break state machine — pausable in **both** phases, accurate in background windows (250 ms timestamp math, DOM touched ~1 Hz).
- **Focus detection** — only accumulates focus time while you're actively reading.
- **Idle nudge** — "you stopped reading" card with a real snooze after dismissal.
- **Daily goal bar** — bottom progress strip with safe-area support.
- **Reading statistics** — today / all-time / per-day history, streaks, longest focus, sessions; rendered as a dashboard in Settings → Timer.

### 2. Notch & Reading Focus (`modules/focus`)
The completely reconstructed reading ruler — the feature that was most broken on mobile:
- The band itself is `pointer-events: none` — it **never** teleports to taps and never intercepts scrolling.
- The **notch** (the round tab on the right edge) is the only interactive element: a 36–56 px touch target with `touch-action: none` and `setPointerCapture`, driven by **Pointer Events** (mouse, pen and touch unified).
- `pointercancel` and `lostpointercapture` end drags cleanly (no ruler glued to your finger after an OS gesture takeover).
- Follow mode tracks only hover-capable pointers; touch pointers never move the ruler implicitly.
- Position persists as a **0–1 ratio** of the movable range — survives rotation and screen switches, re-clamped on `resize` / `orientationchange` / `visualViewport.resize`.
- New: **focus line** (crisp center guide for eye tracking), **smooth follow** (interpolated), live **position badge** while dragging, keyboard support on the notch (Arrow keys / Enter), configurable keyboard step.

### 3. Typography (`modules/typography`)
Reading font (8 presets + custom stack), size, line height, paragraph spacing, max line width. CSS custom properties on `:root` consumed by the static stylesheet — one source of truth, no CSS re-parsing. Google Fonts loads **only the selected family**.

### 4. Heat Map of Notes (`modules/heatmap`)
The per-note vertical attention strip, redrawn:
- Per-bucket **intensity texture** + the signature profile area/outline + the current-viewport band.
- Tooltip now shows time, visits **and note coverage** (read-only lookups — hovering never creates records).
- Folder renames remap all nested records; visits counted once per session; per-path viewport state pruned when the last view closes; touch devices never get their scroll swallowed by the strip.
- Maintenance tools: reset current note, reset database (confirmation modal), prune deleted-note records.

---

## Settings: one system, eight sections

Settings → **Focus Read Suite** opens a tabbed interface (sticky navigation, horizontally scrollable on phones):

1. **General** — stats tracking on/off, feedback notices, module overview
2. **Focus Read Timer** — timer, focus detection, idle nudge, daily goal + reading stats dashboard
3. **Notch & Reading Focus** — master toggle, notch visibility/size, focus line, smooth follow, keyboard step
4. **Typography** — font, size, line height, spacing, width, Google Fonts
5. **Yellow Ruler** — band height, color, opacity, interaction mode, position reset
6. **Heat Map of Notes** — tracking thresholds, resolution, strip appearance + analytics dashboard & maintenance
7. **Appearance** — accent source (native/custom), widget scale
8. **Advanced** — debug mode, analytics interval, migration card, legacy-plugin helper, full settings reset

Every control is **live**: it writes through the central `SettingsManager`, which notifies the owning module and the change takes effect immediately (verified by tests that flip settings and assert the DOM/behavior). Every value is validated and clamped on load, after every update, and on reset — hand-edited or corrupt `data.json` can never produce broken CSS or an off-screen widget. Each section has a **Reset** action; Advanced has **Reset all settings** (statistics and heatmap records are kept).

---

## Migration from the three legacy plugins

On first launch the suite reads (read-only!):

```
.obsidian/plugins/focus-read-timer/data.json        { settings, stats }
.obsidian/plugins/focus-read-typography/data.json   (flat settings)
.obsidian/plugins/heatmap/data.json                 { settings, records }
```

…maps every compatible key into the unified schema, imports your **reading statistics and heatmap records verbatim**, writes its own `data.json` with a migration marker, and shows a summary notice. Migration runs exactly once; it can be re-run from Settings → Advanced (your customized suite settings win on conflicts).

**The legacy files are never modified or deleted.** The old plugin folders stay in `.obsidian/plugins/` as a rollback safety net. Because running old and new plugins together duplicates UI, the suite detects enabled legacy plugins and offers one-click disable (Settings → Advanced or the command palette: *"Disable the legacy Focus Read / Heatmap plugins"*). Once you've verified everything works, delete the old folders whenever you like.

Migration is covered by dedicated unit tests (pure mapping, missing files, corrupt data, idempotence, forced re-run, custom-settings precedence) **and** by the bundle smoke test which boots the real artifact against the real legacy payloads.

---

## Architecture

```
obsidian-plugins/
├── focus-read-suite/                  # THE plugin
│   ├── manifest.json                  # id: focus-read-suite, v2.0.0, desktop+mobile
│   ├── styles.css                     # unified design system (single source of truth)
│   ├── src/
│   │   ├── main.ts                    # thin entry: settings+migration+lifecycle, module registry
│   │   ├── core/
│   │   │   ├── settings-schema.ts     # typed 8-section schema, defaults, normalization (pure)
│   │   │   ├── settings-manager.ts    # the one write path: update/normalize/persist/emit
│   │   │   ├── migration.ts           # legacy readers + pure mapping + runner (idempotent)
│   │   │   ├── lifecycle.ts           # LifecycleHub: every listener/interval registered here
│   │   │   ├── viewport.ts            # visual-viewport size, clamping, hover detection, rAF
│   │   │   └── logger.ts              # leveled logger (debug via Advanced settings)
│   │   ├── modules/
│   │   │   ├── module.ts              # the FocusSuiteModule contract (load/unload/sections)
│   │   │   ├── timer/                 # FocusTimer, TimerWidget, stats, Nudge, GoalBar, module
│   │   │   ├── focus/                 # ReadingRuler (notch+band+focus line), module
│   │   │   ├── typography/            # TypographyController, module
│   │   │   └── heatmap/               # storage, engine, renderer, activity, module
│   │   └── ui/
│   │       ├── settings-tab.ts        # 8-section tabbed settings UI
│   │       └── components.ts          # labeled sliders, section headers, pills, callouts
│   └── test/                          # 161 tests + obsidian-stub + DOM helpers
├── legacy/                            # ARCHIVED former plugins (frozen, buildable, rollback)
│   ├── focus-read-timer/
│   ├── focus-read-typography/
│   ├── heatmap-of-notes/
│   └── shared/
├── scripts/
│   ├── build.mjs                      # esbuild: TS -> single-file CJS bundle
│   ├── deploy.mjs                     # copy dist into the vault's .obsidian/plugins
│   ├── verify-bundle.mjs              # bundle shape checks (class export, obsidian external)
│   └── smoke-bundle.mjs               # boots the REAL bundle + legacy data + interactions
├── package.json                       # test / test:legacy / build / verify / smoke / deploy / check
├── tsconfig.json                      # strict TypeScript over both trees
└── vitest.config.ts                   # suite tests (legacy has its own config)
```

**Design rules** the implementation follows:

- **One write path for settings.** Everything goes through `SettingsManager.update(section, mutator)` → normalize → persist (debounced or immediate) → emit. Modules subscribe and re-apply. No module touches `saveData` directly for settings.
- **One registration surface.** Every DOM listener, interval, timeout and unload hook goes through the `LifecycleHub`, which delegates to Obsidian's `registerDomEvent` / `registerInterval` / `registerEvent` / `register` — so Obsidian's own teardown guarantees zero leaks. No raw `addEventListener` / `setInterval` anywhere in module code.
- **Modules are independent.** Each can be disabled without breaking the others; each owns its entire DOM footprint; `onunload` fully undoes `load` (verified by leak tests).
- **Shared infrastructure is centralized** — viewport math, clamping, rAF scheduling, hover detection, logging — instead of the three per-plugin copies the legacy tree had.
- **Cross-platform by construction** — pointer events (not mouse+touch duplicates), `visualViewport`-aware positioning, safe-area insets, `(hover: hover)` capability queries, `@media` responsive layouts.

---

## Testing

Four layers, all green:

1. **Unit tests** (vitest, 161 tests): settings schema normalization (clamping, sanitization, regression tests for two real bugs found during development), settings manager (update semantics, debounced persistence, resets, extras), migration mapping + runner, timer state machine, stats/streak math, nudge snooze logic, heatmap bucket math + storage (resampling, rename remapping, pruning), ruler interactions.
2. **DOM interaction tests** (happy-dom + pointer-event pipeline): mouse drags, **touch drags**, taps (the old teleport bug), `pointercancel`, `lostpointercapture`, viewport rotations, double-tap detection, keyboard support, widget collapse, settings-tab wiring (toggles/sliders/dropdowns/colors drive real modules).
3. **Bootstrap tests**: the real plugin class loads against an Obsidian API stub with legacy data present, runs `onload → migrate → interact → onunload`, asserting DOM effects, data preservation, legacy-file immutability and **zero leaked listeners/intervals**.
4. **Bundle smoke test** (`scripts/smoke-bundle.mjs`): the *shipped* `dist/main.js` is booted with the vault's legacy `data.json` payloads; interactions are driven through the DOM; migration, data preservation, cleanup and legacy-file immutability are verified end-to-end.

The archived legacy plugins keep their 128 tests (`npm run test:legacy`) as a behavioral reference.

### Verification status (honest breakdown)

- ✅ **Automated test coverage**: 161 suite tests + 128 legacy reference tests + 37 bundle smoke checks — all passing.
- ✅ **Verified in this environment**: migration & data preservation, settings live-wiring, lifecycle hygiene (zero leaks), cross-platform interaction pipelines (pointer/touch/cancel/capture), responsive re-clamping, module independence.
- ⚠️ **Not verifiable in this sandbox**: running inside the actual Obsidian desktop/Electron, Android and iOS apps. The pointer-event code paths are exactly what mobile browsers deliver, but the physical feel (gesture-nav interplay, capacitive dragging) and the real Google Fonts download on a mobile connection should get a quick pass on a real device. Canvas painting is structurally guarded but should be eyeballed once in the app.
- ℹ️ Performance on very large vaults: heatmap records still live in one `data.json` with 10 s throttled writes (same as before); the prune tool keeps it small.

---

## Deploying / updating the vault

```bash
npm run build
node scripts/deploy.mjs ..            # this vault
node scripts/deploy.mjs /path/to/other/vault
```

The script copies `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/focus-read-suite/` and never touches `data.json`. After deploying: restart Obsidian (or reload the plugin), then enable **Focus Read Suite** in Settings → Community plugins. On first launch it migrates everything automatically.

## Removing the legacy plugins (after verifying)

1. Enable **Focus Read Suite** and check that your settings/stats/heatmap arrived (Settings → Advanced shows the migration report).
2. Disable the three legacy plugins — one click via Settings → Advanced → *Disable legacy plugins*, or the command palette.
3. When you're confident, delete `.obsidian/plugins/focus-read-timer/`, `.obsidian/plugins/focus-read-typography/` and `.obsidian/plugins/heatmap/` (the suite never needs them again; migration results live in its own `data.json`).
