/**
 * Settings schema: defaults, normalization, sanitization.
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  sanitizeFontStack,
  resolveFontStack,
  formatClock,
  FONT_OPTIONS,
} from "../src/core/settings-schema";

describe("settings schema", () => {
  it("returns pristine defaults for null/undefined input", () => {
    for (const raw of [null, undefined, {}, "nope" as any]) {
      expect(normalizeSettings(raw as any)).toEqual(DEFAULT_SETTINGS);
    }
  });

  it("preserves valid values", () => {
    const s = normalizeSettings({
      timer: { workMinutes: 45, breakMinutes: 10, positionX: 120, positionY: 40 },
      ruler: { height: 50, color: "#ffc400", opacity: 0.6, mode: "follow", positionRatio: 0.7 },
      typography: { fontFamily: "lexend", fontSize: 20 },
    });
    expect(s.timer.workMinutes).toBe(45);
    expect(s.timer.positionX).toBe(120);
    expect(s.ruler.color).toBe("#ffc400");
    expect(s.ruler.mode).toBe("follow");
    expect(s.ruler.positionRatio).toBe(0.7);
    expect(s.typography.fontFamily).toBe("lexend");
    expect(s.typography.fontSize).toBe(20);
  });

  it("clamps out-of-range numbers instead of producing broken UI", () => {
    const s = normalizeSettings({
      timer: { workMinutes: 9999, breakMinutes: -5, autoHideSeconds: 1e9 },
      ruler: { height: 400, opacity: 5 },
      typography: { fontSize: 3, lineHeight: 99, maxWidthChars: 5 },
      heatmap: { bucketCount: 0, width: 900 },
      focus: { notchSize: 10, keyboardStepPercent: 500 },
      appearance: { widgetScale: 9 },
      advanced: { refreshIntervalMs: 10 },
    });
    expect(s.timer.workMinutes).toBe(180);
    expect(s.timer.breakMinutes).toBe(1);
    expect(s.timer.autoHideSeconds).toBe(120);
    expect(s.ruler.height).toBe(80);
    expect(s.ruler.opacity).toBe(0.9);
    expect(s.typography.fontSize).toBe(13);
    expect(s.typography.lineHeight).toBe(2.2);
    expect(s.typography.maxWidthChars).toBe(40);
    expect(s.heatmap.bucketCount).toBe(10);
    expect(s.heatmap.width).toBe(48);
    expect(s.focus.notchSize).toBe(36);
    expect(s.focus.keyboardStepPercent).toBe(25);
    expect(s.appearance.widgetScale).toBe(1.25);
    expect(s.advanced.refreshIntervalMs).toBe(250);
  });

  it("repairs invalid types and unknown enum values", () => {
    const s = normalizeSettings({
      timer: { workMinutes: "25" as any, positionX: "NaN" as any },
      ruler: { color: "javascript:alert(1)", mode: "telepathy" as any, positionRatio: "high" as any },
      typography: { fontFamily: "does-not-exist" },
      appearance: { accentMode: "rainbow" as any, customAccent: "nothex" },
    });
    expect(s.timer.workMinutes).toBe(DEFAULT_SETTINGS.timer.workMinutes);
    expect(s.timer.positionX).toBeNull();
    expect(s.ruler.color).toBe(DEFAULT_SETTINGS.ruler.color);
    expect(s.ruler.mode).toBe("auto");
    expect(s.ruler.positionRatio).toBeNull();
    expect(s.typography.fontFamily).toBe("system");
    expect(s.appearance.accentMode).toBe("native");
    expect(s.appearance.customAccent).toBe(DEFAULT_SETTINGS.appearance.customAccent);
  });

  it("keeps null ruler position but clamps numeric ratios into 0..1", () => {
    expect(normalizeSettings({ ruler: { positionRatio: null } }).ruler.positionRatio).toBeNull();
    expect(normalizeSettings({ ruler: { positionRatio: 1.4 } }).ruler.positionRatio).toBe(1);
    expect(normalizeSettings({ ruler: { positionRatio: -3 } }).ruler.positionRatio).toBe(0);
  });

  it("sanitizes custom font stacks (CSS injection guard)", () => {
    expect(sanitizeFontStack("Georgia, 'Times New Roman', serif")).toBe("Georgia, 'Times New Roman', serif");
    expect(sanitizeFontStack("Inter; } body { background: red")).toBe("Inter, body { background: red".replace(/[{}<>\\@]+/g, ""));
    expect(sanitizeFontStack("A <script>@import url(x); B")).toBe("A scriptimport url(x), B");
    expect(sanitizeFontStack(42 as any)).toBe("");
    expect(sanitizeFontStack("  Only ;  Semicolons ;  ")).toBe("Only, Semicolons");
  });

  it("resolves the effective font stack per family", () => {
    expect(resolveFontStack(normalizeSettings({ typography: { fontFamily: "system" } }).typography)).toBe("");
    const lexend = normalizeSettings({ typography: { fontFamily: "lexend" } }).typography;
    expect(resolveFontStack(lexend)).toBe("'Lexend', sans-serif");
    const custom = normalizeSettings({ typography: { fontFamily: "custom", customFontFamily: "Comic Sans, cursive" } }).typography;
    expect(resolveFontStack(custom)).toBe("Comic Sans, cursive");
  });

  it("exposes 8 font options including custom", () => {
    expect(FONT_OPTIONS.length).toBe(8);
    expect(FONT_OPTIONS.some((f) => f.id === "custom")).toBe(true);
    expect(FONT_OPTIONS.every((f) => typeof f.label === "string")).toBe(true);
  });

  it("formats clocks as mm:ss (ceil'ed to the next second)", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(59_999)).toBe("01:00"); // 59.999s ceils to the next full minute
    expect(formatClock(60_000)).toBe("01:00");
    expect(formatClock(25 * 60_000)).toBe("25:00");
    expect(formatClock(-5)).toBe("00:00");
  });

  it("normalizes only the requested sections, leaving others default", () => {
    const s = normalizeSettings({ timer: { workMinutes: 50 }, typography: { fontSize: 21 } }, ["timer"]);
    expect(s.timer.workMinutes).toBe(50);
    expect(s.typography.fontSize).toBe(DEFAULT_SETTINGS.typography.fontSize);
  });
});
