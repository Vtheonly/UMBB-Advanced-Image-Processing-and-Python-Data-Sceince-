# Legacy plugins (archived)

These are the three **former** plugins, frozen exactly as they were at v1.1.0 and kept as a
rollback/behavioral reference. They are **superseded by Focus Read Suite**
(`../focus-read-suite/`), which consolidates all three into one plugin and migrates their
settings and data automatically.

| Folder | Legacy plugin id | Deployed folder (in the vault) |
| --- | --- | --- |
| `focus-read-timer/` | `focus-read-timer` | `.obsidian/plugins/focus-read-timer/` |
| `focus-read-typography/` | `focus-read-typography` | `.obsidian/plugins/focus-read-typography/` |
| `heatmap-of-notes/` | `heatmap-of-notes` | `.obsidian/plugins/heatmap/` (folder name quirk kept) |
| `shared/` | — | shared viewport helpers + test stubs used by the three above |

**Status:** archived — no further development happens here. The code still compiles and its
128 tests still run as a behavioral reference:

```bash
cd obsidian-plugins
npm run test:legacy    # run the archived test suites
npm run build:legacy   # build the archived bundles (rollback artifacts)
node scripts/deploy.mjs --legacy ..   # redeploy the legacy bundles into the vault
```

Once you have verified Focus Read Suite in your vault (Settings → Advanced shows the
migration report), you can disable and remove the legacy plugins — see the main
[`../README.md`](../README.md#removing-the-legacy-plugins-after-verifying).
