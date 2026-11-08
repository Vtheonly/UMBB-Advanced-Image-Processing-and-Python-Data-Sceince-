/**
 * Settings tab: renders all 8 sections, navigation works, controls are
 * wired to real settings (changes reach the owning modules), value badges
 * update, and resets work.
 *
 * The obsidian-stub's Setting instances carry a DOM back-reference
 * (`settingEl.__settingInstance`), so controls are found by their rendered
 * names — exactly what a user sees.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import "../test/helpers/dom-setup";
import { createAppStub, Notice } from "./helpers/obsidian-stub";
import { installDomExtensions } from "./helpers/dom";
import FocusReadSuitePlugin from "../src/main";
import { FocusSuiteSettingTab } from "../src/ui/settings-tab";

installDomExtensions();

const manifest = { id: "focus-read-suite", version: "2.0.0" };

async function makeTab() {
  const app = createAppStub({ legacyFiles: {} });
  const plugin = new FocusReadSuitePlugin(app as any, manifest);
  await plugin.onload();
  const tab = new FocusSuiteSettingTab(app as any, plugin);
  tab.display();
  return { plugin, tab, app };
}

/** All rendered Setting stubs inside the tab container. */
function settingStubs(container: HTMLElement): any[] {
  return [...container.querySelectorAll<HTMLElement>(".setting")]
    .map((el) => (el as any).__settingInstance)
    .filter(Boolean);
}

function findSetting(container: HTMLElement, name: string): any {
  const setting = settingStubs(container).find((s: any) => s.name === name);
  expect(setting, `setting "${name}" rendered`).toBeDefined();
  return setting;
}

function tabButtons(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(".frs-settings-tab")];
}

function clickTab(container: HTMLElement, label: string): void {
  const btn = tabButtons(container).find((b) => b.textContent === label);
  expect(btn, `tab "${label}" exists`).toBeDefined();
  btn!.click();
}

beforeEach(() => {
  Notice.reset();
});

describe("FocusSuiteSettingTab", () => {
  it("renders the header with 4 module status pills", async () => {
    const { plugin, tab } = await makeTab();
    expect(tab.containerEl.querySelectorAll(".frs-pill").length).toBe(4);
    await plugin.onunload();
  });

  it("renders 8 tab navigation buttons in order", async () => {
    const { plugin, tab } = await makeTab();
    const labels = tabButtons(tab.containerEl).map((b) => b.textContent);
    expect(labels).toEqual([
      "General", "Timer", "Reading Focus", "Typography", "Ruler", "Heatmap", "Appearance", "Advanced",
    ]);
    await plugin.onunload();
  });

  it("switching tabs renders the matching section", async () => {
    const { plugin, tab } = await makeTab();

    clickTab(tab.containerEl, "Typography");
    expect(tab.containerEl.textContent).toContain("Reading font");

    clickTab(tab.containerEl, "Ruler");
    expect(tab.containerEl.textContent).toContain("Ruler color");
    expect(tab.containerEl.textContent).toContain("Interaction mode");

    clickTab(tab.containerEl, "Heatmap");
    expect(tab.containerEl.textContent).toContain("Resolution");
    expect(tab.containerEl.textContent).toContain("Maintenance");

    clickTab(tab.containerEl, "Advanced");
    expect(tab.containerEl.textContent).toContain("Legacy plugin migration");

    clickTab(tab.containerEl, "Timer");
    expect(tab.containerEl.textContent).toContain("Work minutes");

    clickTab(tab.containerEl, "General");
    expect(tab.containerEl.textContent).toContain("Track reading-time statistics");
    await plugin.onunload();
  });

  it("every tab renders at least one setting (no empty sections)", async () => {
    const { plugin, tab } = await makeTab();
    for (const label of ["General", "Timer", "Reading Focus", "Typography", "Ruler", "Heatmap", "Appearance", "Advanced"]) {
      clickTab(tab.containerEl, label);
      expect(settingStubs(tab.containerEl).length).toBeGreaterThan(0);
    }
    await plugin.onunload();
  });

  it("a toggle in the tab reaches the module (focus toggle mounts the ruler)", async () => {
    const { plugin, tab } = await makeTab();
    clickTab(tab.containerEl, "Reading Focus");

    const focusToggle = findSetting(tab.containerEl, "Enable reading focus");
    expect(document.getElementById("frs-ruler")).toBeNull();

    focusToggle.components[0].simulateChange(true);
    await vi.waitFor(() => {
      expect(document.getElementById("frs-ruler")).not.toBeNull();
    });
    expect(plugin.settings.settings.focus.enabled).toBe(true);

    focusToggle.components[0].simulateChange(false);
    await vi.waitFor(() => {
      expect(plugin.settings.settings.focus.enabled).toBe(false);
    });
    await plugin.onunload();
  });

  it("sliders update settings AND their value badge (live wiring)", async () => {
    const { plugin, tab } = await makeTab();
    clickTab(tab.containerEl, "Typography");

    const fontSlider = findSetting(tab.containerEl, "Font size");
    const badge = fontSlider.nameEl.querySelector(".frs-setting-value");
    expect(badge.textContent).toBe("17 px");

    fontSlider.components[0].simulateChange(22);
    expect(plugin.settings.settings.typography.fontSize).toBe(22);
    expect(badge.textContent).toBe("22 px");
    // Live effect on the document (applied by the module asynchronously):
    await vi.waitFor(() => {
      expect(document.documentElement.style.getPropertyValue("--frs-font-size")).toBe("22px");
    });

    await plugin.onunload();
  });

  it("timer sliders map to the timer settings", async () => {
    const { plugin, tab } = await makeTab();
    clickTab(tab.containerEl, "Timer");

    findSetting(tab.containerEl, "Work minutes").components[0].simulateChange(45);
    expect(plugin.settings.settings.timer.workMinutes).toBe(45);

    findSetting(tab.containerEl, "Daily goal").components[0].simulateChange(120);
    expect(plugin.settings.settings.timer.dopamineDailyGoalMinutes).toBe(120);

    await plugin.onunload();
  });

  it("dropdowns update enum settings", async () => {
    const { plugin, tab } = await makeTab();
    clickTab(tab.containerEl, "Ruler");

    findSetting(tab.containerEl, "Interaction mode").components[0].simulateChange("follow");
    await vi.waitFor(() => {
      expect(plugin.settings.settings.ruler.mode).toBe("follow");
    });

    clickTab(tab.containerEl, "Appearance");
    findSetting(tab.containerEl, "Accent source").components[0].simulateChange("custom");
    await vi.waitFor(() => {
      expect(plugin.settings.settings.appearance.accentMode).toBe("custom");
    });
    // Custom accent picker appears after re-render:
    await vi.waitFor(() => {
      expect(tab.containerEl.textContent).toContain("Custom accent color");
    });

    await plugin.onunload();
  });

  it("color pickers update colors", async () => {
    const { plugin, tab } = await makeTab();
    // Mount the ruler so the live effect is observable:
    await plugin.settings.update("focus", (draft) => {
      draft.focus.enabled = true;
    });
    clickTab(tab.containerEl, "Ruler");

    findSetting(tab.containerEl, "Ruler color").components[0].simulateChange("#112233");
    await vi.waitFor(() => {
      expect(plugin.settings.settings.ruler.color).toBe("#112233");
    });
    // Live effect:
    await vi.waitFor(() => {
      expect(document.getElementById("frs-ruler")?.style.getPropertyValue("--frs-ruler-color")).toBe("#112233");
    });
    await plugin.onunload();
  });

  it("custom font stack input appears only for the custom family", async () => {
    const { plugin, tab } = await makeTab();
    clickTab(tab.containerEl, "Typography");

    expect(settingStubs(tab.containerEl).some((s: any) => s.name === "Custom font stack")).toBe(false);
    findSetting(tab.containerEl, "Reading font").components[0].simulateChange("custom");
    await vi.waitFor(() => {
      expect(plugin.settings.settings.typography.fontFamily).toBe("custom");
    });
    // display() re-runs after the dropdown change:
    await vi.waitFor(() => {
      expect(settingStubs(tab.containerEl).some((s: any) => s.name === "Custom font stack")).toBe(true);
    });

    await plugin.onunload();
  });

  it("section reset buttons restore defaults", async () => {
    const { plugin, tab } = await makeTab();
    clickTab(tab.containerEl, "Typography");

    await plugin.settings.update("typography", (draft) => {
      draft.typography.fontSize = 26;
    });
    expect(plugin.settings.settings.typography.fontSize).toBe(26);

    const resetBtn = tab.containerEl.querySelector<HTMLElement>(".frs-chip-action")!;
    resetBtn.click();
    await vi.waitFor(() => {
      expect(plugin.settings.settings.typography.fontSize).toBe(17);
    });
    // Other sections untouched:
    expect(plugin.settings.settings.timer.workMinutes).toBe(25);

    await plugin.onunload();
  });

  it("module rows in General toggle modules on and off", async () => {
    const { plugin, tab } = await makeTab(); // General is the default tab.

    const rows = tab.containerEl.querySelectorAll(".frs-module-row");
    expect(rows.length).toBe(4);

    const rowSettings = settingStubs(tab.containerEl).filter((s: any) =>
      s.settingEl.closest?.(".frs-module-row")
    );
    expect(rowSettings.length).toBe(4);

    // Row order: Timer, Focus, Typography, Heatmap.
    expect(document.getElementById("frs-ruler")).toBeNull();
    rowSettings[1].components[0].simulateChange(true);
    await vi.waitFor(() => {
      expect(document.getElementById("frs-ruler")).not.toBeNull();
    });

    // Timer row toggle hides the floating timer:
    rowSettings[0].components[0].simulateChange(false);
    await vi.waitFor(() => {
      expect(document.getElementById("frs-timer")?.style.display).toBe("none");
    });

    await plugin.onunload();
  });

  it("heatmap maintenance tools are reachable", async () => {
    const { plugin, tab } = await makeTab();
    clickTab(tab.containerEl, "Heatmap");

    const resetNote = findSetting(tab.containerEl, "Reset current note analytics");
    const prune = findSetting(tab.containerEl, "Prune records for deleted notes");
    expect(resetNote.components[0].clickListener).toBeDefined();
    expect(prune.components[0].clickListener).toBeDefined();

    prune.components[0].simulateClick(); // runs against the empty vault stub
    await plugin.onunload();
  });

  it("Advanced shows the migration state for fresh installs", async () => {
    const { plugin, tab } = await makeTab();
    clickTab(tab.containerEl, "Advanced");
    expect(tab.containerEl.textContent).toContain("No legacy plugin data was found");
    await plugin.onunload();
  });

  it("the timer section renders the reading stats dashboard", async () => {
    const { plugin, tab } = await makeTab();
    clickTab(tab.containerEl, "Timer");
    expect(tab.containerEl.querySelector(".frs-stat-grid")).not.toBeNull();
    expect(tab.containerEl.textContent).toContain("Reading statistics");
    await plugin.onunload();
  });
});
