/**
 * Focus Read Suite — shared settings-UI components.
 *
 * Small helpers that give every section the same look & behavior:
 * - `labeledSlider`: slider whose current value is echoed as a badge next
 *   to the name (Obsidian sliders show no value by default);
 * - section headers with an optional "Reset section" action;
 * - module status pills.
 */

import { Setting } from "obsidian";

/** Formats a slider value with optional unit/decimals for the badge. */
export function formatSliderValue(value: number, decimals = 0, unit = ""): string {
  return `${value.toFixed(decimals)}${unit}`;
}

export interface LabeledSliderOptions {
  name: string;
  desc?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  decimals?: number;
  unit?: string;
  onChange: (value: number) => void | Promise<void>;
}

/**
 * A Setting with a slider and a live value badge, e.g. "Font size  17px".
 */
export function labeledSlider(containerEl: HTMLElement, opts: LabeledSliderOptions): Setting {
  const setting = new Setting(containerEl).setName(opts.name);
  if (opts.desc) setting.setDesc(opts.desc);

  const badge = document.createElement("span");
  badge.className = "frs-setting-value";
  badge.textContent = formatSliderValue(opts.value, opts.decimals ?? 0, opts.unit ?? "");

  // Obsidian renders the control area after the name; append the badge to
  // the name element so it hugs the label.
  setting.nameEl.appendChild(badge);

  setting.addSlider((slider) =>
    slider
      .setLimits(opts.min, opts.max, opts.step)
      .setValue(opts.value)
      .setDynamicTooltip()
      .onChange(async (v) => {
        badge.textContent = formatSliderValue(v, opts.decimals ?? 0, opts.unit ?? "");
        await opts.onChange(v);
      })
  );

  return setting;
}

export interface SectionHeaderOptions {
  title: string;
  subtitle?: string;
  /** "Reset section" button in the header; receives a click handler. */
  onReset?: () => void | Promise<void>;
}

/** A section heading with optional subtitle + reset action. */
export function sectionHeader(
  containerEl: HTMLElement,
  title: string,
  subtitle?: string,
  onReset?: () => void | Promise<void>
): HTMLElement {
  const wrap = containerEl.createDiv({ cls: "frs-settings-section-head" });
  const titles = wrap.createDiv({ cls: "frs-settings-section-titles" });
  titles.createEl("h3", { text: title });
  if (subtitle) {
    titles.createEl("p", { text: subtitle, cls: "frs-settings-section-subtitle" });
  }
  if (onReset) {
    const resetBtn = wrap.createEl("button", {
      text: "Reset",
      cls: "frs-chip frs-chip-action",
    });
    resetBtn.setAttribute("aria-label", `Reset ${title} to defaults`);
    resetBtn.addEventListener("click", () => void onReset());
  }
  return wrap;
}

/** A small status pill (used for module overview + diagnostics). */
export function statusPill(
  containerEl: HTMLElement,
  label: string,
  active: boolean
): HTMLElement {
  const pill = containerEl.createSpan({ cls: `frs-pill ${active ? "frs-pill-on" : "frs-pill-off"}` });
  pill.createSpan({ cls: "frs-pill-dot", text: "" });
  pill.createSpan({ text: label });
  return pill;
}

/** An informational callout block. */
export function callout(containerEl: HTMLElement, text: string, variant: "info" | "warn" = "info"): HTMLElement {
  return containerEl.createDiv({ cls: `frs-callout frs-callout-${variant}`, text });
}
