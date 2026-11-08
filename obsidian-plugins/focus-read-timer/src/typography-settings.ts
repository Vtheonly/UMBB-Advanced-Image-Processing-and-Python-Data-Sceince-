/**
 * Focus Read — typography & reading ruler settings model.
 *
 * Recovered from the original standalone "Focus Read: Typography & Ruler"
 * plugin (vault git history, commit 1f79343) and integrated into the main
 * Focus Read plugin. Every original setting is preserved:
 *
 *   typographyEnabled, fontFamily, customFontFamily, loadGoogleFonts,
 *   fontSize, lineHeight, maxWidthChars, paragraphSpacing,
 *   readingRulerEnabled, readingRulerHeight, readingRulerColor,
 *   readingRulerOpacity
 *
 * plus two modern additions:
 *   readingRulerMode           — how the ruler is moved (auto/follow/manual)
 *   readingRulerPositionRatio  — persisted position as 0..1 of the movable
 *                                range (survives orientation/screen changes)
 */

export type RulerMode = "auto" | "follow" | "manual";

export interface TypographySettings {
  typographyEnabled: boolean;
  fontFamily: string;
  customFontFamily: string;
  loadGoogleFonts: boolean;
  fontSize: number;
  lineHeight: number;
  maxWidthChars: number;
  paragraphSpacing: number;
  readingRulerEnabled: boolean;
  readingRulerHeight: number;
  readingRulerColor: string;
  readingRulerOpacity: number;
  /** "auto" follows the pointer on devices with a mouse, manual elsewhere. */
  readingRulerMode: RulerMode;
  /**
   * Ruler position stored as a 0..1 ratio of the movable range (not pixels!)
   * so the position survives changes of screen size and orientation.
   * null = use the default (slightly above the middle).
   */
  readingRulerPositionRatio: number | null;
}

export const DEFAULT_TYPOGRAPHY_SETTINGS: TypographySettings = {
  typographyEnabled: true,
  fontFamily: "system",
  customFontFamily: "",
  loadGoogleFonts: false,
  fontSize: 17,
  lineHeight: 1.7,
  maxWidthChars: 66,
  paragraphSpacing: 1.4,
  readingRulerEnabled: false,
  readingRulerHeight: 28,
  readingRulerColor: "#ffd54f",
  readingRulerOpacity: 0.18,
  readingRulerMode: "auto",
  readingRulerPositionRatio: null,
};

export interface FontOption {
  id: string;
  label: string;
  stack: string;
  googleFamily: string | null;
}

export const FONT_OPTIONS: FontOption[] = [
  { id: "system", label: "System default", stack: "", googleFamily: null },
  { id: "lexend", label: "Lexend (recommended for ADHD)", stack: "'Lexend', sans-serif", googleFamily: "Lexend" },
  { id: "atkinson", label: "Atkinson Hyperlegible", stack: "'Atkinson Hyperlegible', sans-serif", googleFamily: "Atkinson+Hyperlegible" },
  { id: "inter", label: "Inter", stack: "'Inter', sans-serif", googleFamily: "Inter" },
  { id: "source", label: "Source Sans 3", stack: "'Source Sans 3', sans-serif", googleFamily: "Source+Sans+3" },
  { id: "ibmplex", label: "IBM Plex Sans", stack: "'IBM Plex Sans', sans-serif", googleFamily: "IBM+Plex+Sans" },
  { id: "noto", label: "Noto Sans", stack: "'Noto Sans', sans-serif", googleFamily: "Noto+Sans" },
  { id: "custom", label: "Custom font stack", stack: "", googleFamily: null },
];

export function fontOptionById(id: string): FontOption | undefined {
  return FONT_OPTIONS.find((f) => f.id === id);
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

/**
 * Sanitizes a user-entered CSS font stack. Custom stacks are user data that
 * ends up inside a CSS custom property, so strip characters that could break
 * out of the property value (`}`, `{`, `<`, `>`, backslash, `@`).
 */
export function sanitizeFontStack(raw: string): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[{}<>\\@]+/g, "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(", ");
}

/** Resolves the effective font-family CSS value for the current settings. */
export function resolveFontStack(settings: TypographySettings): string {
  if (settings.fontFamily === "custom") {
    return sanitizeFontStack(settings.customFontFamily);
  }
  const option = fontOptionById(settings.fontFamily);
  return option ? option.stack : "";
}

/**
 * Validates and normalizes settings loaded from data.json.
 * Fixes out-of-range values (e.g. from hand-edited files) instead of
 * producing broken CSS, and applies defaults for new keys. Accepts both the
 * current nested shape and the legacy flat shape of the old standalone
 * plugin (which had exactly these keys at the top level).
 */
export function normalizeTypographySettings(
  raw: Partial<TypographySettings> | null | undefined
): TypographySettings {
  const merged: TypographySettings = { ...DEFAULT_TYPOGRAPHY_SETTINGS, ...(raw ?? {}) };
  merged.fontSize = Math.round(clamp(merged.fontSize, 13, 26, DEFAULT_TYPOGRAPHY_SETTINGS.fontSize));
  merged.lineHeight = Math.round(clamp(merged.lineHeight, 1.2, 2.2, DEFAULT_TYPOGRAPHY_SETTINGS.lineHeight) * 100) / 100;
  merged.paragraphSpacing = Math.round(clamp(merged.paragraphSpacing, 1, 2.5, DEFAULT_TYPOGRAPHY_SETTINGS.paragraphSpacing) * 100) / 100;
  merged.maxWidthChars = Math.round(clamp(merged.maxWidthChars, 40, 120, DEFAULT_TYPOGRAPHY_SETTINGS.maxWidthChars));
  merged.readingRulerHeight = Math.round(clamp(merged.readingRulerHeight, 10, 80, DEFAULT_TYPOGRAPHY_SETTINGS.readingRulerHeight));
  merged.readingRulerOpacity = Math.round(clamp(merged.readingRulerOpacity, 0.05, 0.9, DEFAULT_TYPOGRAPHY_SETTINGS.readingRulerOpacity) * 100) / 100;
  merged.readingRulerColor = /^#[0-9a-fA-F]{3,8}$/.test(String(merged.readingRulerColor))
    ? merged.readingRulerColor
    : DEFAULT_TYPOGRAPHY_SETTINGS.readingRulerColor;
  if (merged.readingRulerMode !== "auto" && merged.readingRulerMode !== "follow" && merged.readingRulerMode !== "manual") {
    merged.readingRulerMode = "auto";
  }
  if (merged.readingRulerPositionRatio !== null) {
    const ratio = Number(merged.readingRulerPositionRatio);
    merged.readingRulerPositionRatio = Number.isFinite(ratio)
      ? Math.min(Math.max(ratio, 0), 1)
      : null;
  }
  merged.customFontFamily = sanitizeFontStack(merged.customFontFamily);
  return merged;
}
