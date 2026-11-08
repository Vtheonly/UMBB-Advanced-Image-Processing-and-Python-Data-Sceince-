import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createAppStub, Notice, MarkdownView, TFile, WorkspaceStub, VaultStub, Events } from "../../shared/test/obsidian-stub";
import { mockRect, setViewport } from "../../shared/test/dom-helpers";
import HEATMAP_PLUGIN from "../src/main";
import { HeatmapDatabase } from "../src/storage";

/**
 * Bootstrap smoke test: runs the real Heatmap of Notes plugin against the
 * obsidian stub + happy-dom, with fake markdown leaves — covering view
 * registration, tracking ticks, renames, and unload hygiene.
 */

const manifest = { id: "heatmap-of-notes", version: "1.1.0" };

/** A workspace stub whose leaves hold MarkdownView-like views. */
class FakeLeaf {
  constructor(public view: MarkdownView) {}
}

function makeScrollerView(path: string, scroll: { top: number; height: number; client: number }) {
  const view = new MarkdownView();
  const file = new TFile();
  file.path = path;
  file.name = path.split("/").pop()!;
  view.file = file;

  const scroller = view.contentEl.ownerDocument.createElement("div");
  scroller.className = "cm-scroller";
  Object.defineProperty(scroller, "scrollTop", { value: scroll.top, configurable: true, writable: true });
  Object.defineProperty(scroller, "scrollHeight", { value: scroll.height, configurable: true, writable: true });
  Object.defineProperty(scroller, "clientHeight", { value: scroll.client, configurable: true, writable: true });
  Object.defineProperty(scroller, "clientWidth", { value: 600, configurable: true, writable: true });
  view.contentEl.appendChild(scroller);
  mockRect(view.contentEl, { width: 600, height: scroll.client });
  // The view must live in the document, like a real open leaf.
  document.body.appendChild(view.contentEl);

  return view;
}

function makePlugin(data: any = null) {
  const app = createAppStub();
  const plugin = new HEATMAP_PLUGIN(app as any, manifest);
  if (data) (plugin as any).__setData(data);
  return { plugin, app };
}

beforeEach(() => {
  document.body.innerHTML = "";
  setViewport(1200, 800);
  Notice.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Heatmap of Notes plugin bootstrap", () => {
  it("loads, registers workspace/vault events, and starts the engine", async () => {
    const { plugin, app } = makePlugin();
    await plugin.onload();

    expect(plugin.database).toBeInstanceOf(HeatmapDatabase);
    expect((plugin as any).registeredEventRefs.length).toBeGreaterThanOrEqual(3); // layout, leaf, rename
    expect((plugin as any).registeredIntervals.length).toBe(1); // engine tick

    await plugin.onunload();
    (plugin as any).__obsidianTeardown();
    expect((plugin as any).registeredIntervals.length).toBe(0);
  });

  it("attaches a heatmap strip to open markdown views and tracks reading time", async () => {
    const { plugin, app } = makePlugin({ settings: { bucketCount: 10, refreshIntervalMs: 1000, idleSeconds: 30 } });
    await plugin.onload();

    const view = makeScrollerView("notes/a.md", { top: 0, height: 4000, client: 800 });
    (app.workspace as WorkspaceStub).leaves.push(new FakeLeaf(view));
    app.workspace.trigger("layout-change");

    expect(view.contentEl.querySelector(".frh-heatmap-wrapper")).not.toBeNull();
    expect(plugin.database.getRecord("notes/a.md")).toBeDefined(); // visit counted
    expect(plugin.database.getRecord("notes/a.md")!.visits).toBe(1);

    // Simulate the engine tick with an active user:
    plugin.engine.tick();

    const rec = plugin.database.getRecord("notes/a.md")!;
    expect(rec.totalTimeMs).toBe(1000);
    // Viewport [0, 800) of 4000 with 10 buckets -> buckets 0..2 credited.
    expect(rec.buckets[0]).toBe(1000);
    expect(rec.buckets[2]).toBe(1000);
    expect(rec.buckets[3]).toBe(0);

    await plugin.onunload();
    (plugin as any).__obsidianTeardown();
    // Strip removed from the live view:
    expect(view.contentEl.querySelector(".frh-heatmap-wrapper")).toBeNull();
  });

  it("rebuilds renderers after a settings change WITHOUT inflating visit counts (old bug)", async () => {
    const { plugin, app } = makePlugin({ settings: { bucketCount: 10, refreshIntervalMs: 1000 } });
    await plugin.onload();

    const view = makeScrollerView("notes/a.md", { top: 0, height: 2000, client: 800 });
    (app.workspace as WorkspaceStub).leaves.push(new FakeLeaf(view));
    app.workspace.trigger("layout-change");

    expect(plugin.database.getRecord("notes/a.md")!.visits).toBe(1);

    // User changes bucket resolution -> renderers rebuilt:
    plugin.database.settings.bucketCount = 20;
    plugin.database.resizeAllRecords(20);
    plugin.engine.rebuildRenderers();

    expect(plugin.database.getRecord("notes/a.md")!.visits).toBe(1); // still 1!
    expect(view.contentEl.querySelector(".frh-heatmap-wrapper")).not.toBeNull();

    await plugin.onunload();
  });

  it("survives rename of a FILE and remaps records for a FOLDER rename (old bug)", async () => {
    const { plugin, app } = makePlugin({
      settings: { bucketCount: 4, refreshIntervalMs: 1000 },
      records: {
        "course/lesson.md": {
          totalTimeMs: 5000, visits: 1, lastAccessed: "x",
          buckets: [1, 2, 3, 4], bucketVisits: [1, 1, 1, 1],
        },
        "course/deep/nested.md": {
          totalTimeMs: 2000, visits: 1, lastAccessed: "x",
          buckets: [1, 2, 3, 4], bucketVisits: [1, 1, 1, 1],
        },
      },
    });
    await plugin.onload();

    // File rename:
    const file = new TFile();
    file.path = "course/lesson-renamed.md";
    (app.vault as VaultStub).trigger("rename", file, "course/lesson.md");
    expect(plugin.database.getRecord("course/lesson-renamed.md")).toBeDefined();
    expect(plugin.database.getRecord("course/lesson.md")).toBeUndefined();

    // Folder rename:
    (app.vault as unknown as Events).trigger("rename", { path: "renamed-course" } as any, "course");
    expect(plugin.database.getRecord("renamed-course/deep/nested.md")).toBeDefined();
    expect(plugin.database.getRecord("course/deep/nested.md")).toBeUndefined();

    await plugin.onunload();
  });

  it("marks the body on touch devices so the strip never blocks scrolling", async () => {
    // Simulate a touch-only device:
    const originalMatchMedia = window.matchMedia;
    (window as any).matchMedia = (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    });

    try {
      const { plugin } = makePlugin();
      await plugin.onload();
      expect(document.body.classList.contains("frh-touch-device")).toBe(true);

      await plugin.onunload();
      (plugin as any).__obsidianTeardown();
      expect(document.body.classList.contains("frh-touch-device")).toBe(false);
    } finally {
      (window as any).matchMedia = originalMatchMedia;
    }
  });

  it("does NOT mark the body on desktop (hover pointers keep tooltips)", async () => {
    const originalMatchMedia = window.matchMedia;
    (window as any).matchMedia = (query: string) => ({
      matches: query.includes("(hover: hover) and (pointer: fine)"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    });
    try {
      const { plugin } = makePlugin();
      await plugin.onload();
      expect(document.body.classList.contains("frh-touch-device")).toBe(false);
      await plugin.onunload();
    } finally {
      (window as any).matchMedia = originalMatchMedia;
    }
  });

  it("prunes records for deleted notes via the database API", async () => {
    const { plugin, app } = makePlugin({
      settings: { bucketCount: 4 },
      records: {
        "gone.md": { totalTimeMs: 1, visits: 1, lastAccessed: "x", buckets: [1], bucketVisits: [1] },
        "kept.md": { totalTimeMs: 1, visits: 1, lastAccessed: "x", buckets: [1], bucketVisits: [1] },
      },
    });
    await plugin.onload();

    const removed = plugin.database.pruneDeleted(
      (p) => app.vault.getAbstractFileByPath(p) !== null || p === "kept.md"
    );
    expect(removed).toEqual(["gone.md"]);
    expect(plugin.database.getRecord("kept.md")).toBeDefined();

    await plugin.onunload();
  });

  it("clear-heatmap-data command clears the active note's record", async () => {
    const { plugin, app } = makePlugin({
      settings: { bucketCount: 4 },
      records: {
        "active.md": { totalTimeMs: 9, visits: 3, lastAccessed: "x", buckets: [1, 2, 3, 4], bucketVisits: [1, 1, 1, 1] },
      },
    });
    await plugin.onload();

    const view = makeScrollerView("active.md", { top: 0, height: 2000, client: 800 });
    (app.workspace as WorkspaceStub).activeView = view;
    (app.workspace as any).activeLeaf = new FakeLeaf(view);

    const cmd = (plugin as any).commands.find((c: any) => c.id === "clear-heatmap-data");
    cmd.callback();
    expect(plugin.database.getRecord("active.md")).toBeUndefined();
    expect(Notice.messages.some((m) => m.includes("Cleared"))).toBe(true);

    await plugin.onunload();
  });
});
