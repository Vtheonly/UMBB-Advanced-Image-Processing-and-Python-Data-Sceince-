/**
 * Focus Read Suite — the unified settings schema.
 *
 * One typed, versioned schema for the whole plugin, organized into the eight
 * sections shown in the settings tab:
 *
 *   1. General            — plugin-wide behavior (stats, feedback notices)
 *   2. Focus Read Timer   — floating timer, focus detection, nudge, goal bar
 *   3. Notch & Reading Focus — ruler interaction model (notch, focus line…)
 *   4. Typography         — reading font, size, line height, width
 *   5. Yellow Ruler       — the highlight band itself (height, color, opacity)
 *   6. Heat Map of Notes  — attention heatmap tracking + appearance
 *   7. Appearance         — shared visual identity (accent, widget scale)
 *   8. Advanced           — debug, analytics interval, maintenance
 *
 * Every value is normalized on load (and after every update) so hand-edited
 * or outdated data can never produce broken CSS, a 0-bucket canvas or an
 * off-screen widget.
 */

/* ------------------------------------------------------------------ */
/* Section ids                                                         */
/* ------------------------------------------------------------------ */

export type SectionId =
  | "general"
  | "timer"
  | "focus"
  | "ruler"
  | "typography"
  | "heatmap"
  | "appearance"
  | "advanced";

export const SECTION_IDS: SectionId[] = [
  "general",
  "timer",
  "focus",
  "ruler",
  "typography",
  "heatmap",
  "appearance",
  "advanced",
];

/* ------------------------------------------------------------------ */
/* 1. General                                                          */
/* ------------------------------------------------------------------ */

export interface GeneralSettings {
  /** Accumulate reading-time statistics (streaks, today, per-day history). */
  statsEnabled: boolean;
  /** Show informational notices (errors are always shown). */
  showNotices: boolean;
}

/* ------------------------------------------------------------------ */
/* 2. Focus Read Timer                                                 */
/* ------------------------------------------------------------------ */

export interface TimerSettings {
  /** Master toggle: show the floating timer widget. */
  enabled: boolean;
  workMinutes: number;
  breakMinutes: number;
  autoHide: boolean;
  autoHideSeconds: number;
  /** Pause the running session when Obsidian loses focus / is hidden. */
  pauseOnBlur: boolean;
  /** null = default top-right anchor; otherwise last dragged position (px). */
  positionX: number | null;
  positionY: number | null;
  /** Only accumulate focus time while the user is actively reading. */
  focusDetectionEnabled: boolean;
  focusDetectionIdleSeconds: number;
  /** Idle nudge ("you stopped reading") with snooze. */
  nudgeEnabled: boolean;
  nudgeIdleSeconds: number;
  /** Scrolling while reading should not reset the idle (nudge) timer. */
  nudgeIgnoreScroll: boolean;
  /** Bottom "daily goal" progress bar. */
  dopamineEnabled: boolean;
  dopamineDailyGoalMinutes: number;
}

/* ------------------------------------------------------------------ */
/* 3. Notch & Reading Focus                                            */
/* ------------------------------------------------------------------ */

export type RulerMode = "auto" | "follow" | "manual";

export interface FocusSettings {
  /** Master toggle for the whole reading-assistance system (ruler + notch). */
  enabled: boolean;
  /** Show the draggable notch (the tab on the ruler's right edge). */
  showNotch: boolean;
  /** Notch touch-target size in px (36–56). */
  notchSize: number;
  /** Draw a crisp focus line at the band's center (eye-tracking aid). */
  focusLine: boolean;
  /** Smooth (interpolated) pointer following instead of instant jumps. */
  smoothFollow: boolean;
  /** Keyboard/command nudge step, as % of the movable range. */
  keyboardStepPercent: number;
}

/* ------------------------------------------------------------------ */
/* 4. Typography                                                       */
/* ------------------------------------------------------------------ */

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

export interface TypographySettings {
  enabled: boolean;
  fontFamily: string;
  customFontFamily: string;
  loadGoogleFonts: boolean;
  fontSize: number;
  lineHeight: number;
  maxWidthChars: number;
  paragraphSpacing: number;
}

/* ------------------------------------------------------------------ */
/* 5. Yellow Ruler                                                     */
/* ------------------------------------------------------------------ */

export interface RulerSettings {
  /** Band height in px. */
  height: number;
  /** Band color (the classic "yellow ruler" default). */
  color: string;
  /** Band opacity (0.05–0.9). */
  opacity: number;
  /** auto: follow on desktop, manual on touch. */
  mode: RulerMode;
  /**
   * Position stored as a 0..1 ratio of the movable range — survives
   * orientation changes and other screen sizes. null = default position.
   */
  positionRatio: number | null;
}

/* ------------------------------------------------------------------ */
/* 6. Heat Map of Notes                                                */
/* ------------------------------------------------------------------ */

export interface HeatmapSettings {
  /** Master toggle: track and render the reading heatmap. */
  enabled: boolean;
  idleSeconds: number;
  bucketCount: number;
  width: number;
  offsetRight: number;
  opacity: number;
}

/* ------------------------------------------------------------------ */
/* 7. Appearance                                                       */
/* ------------------------------------------------------------------ */

export type AccentMode = "native" | "custom";

export interface AppearanceSettings {
  /** native: use Obsidian's accent color; custom: use customAccent. */
  accentMode: AccentMode;
  customAccent: string;
  /** Scale for floating widgets (0.8–1.25). */
  widgetScale: number;
}

/* ------------------------------------------------------------------ */
/* 8. Advanced                                                         */
/* ------------------------------------------------------------------ */

export interface AdvancedSettings {
  debugMode: boolean;
  /** Heatmap engine tick interval in ms (250–5000). */
  refreshIntervalMs: number;
}

/* ------------------------------------------------------------------ */
/* The whole schema                                                    */
/* ------------------------------------------------------------------ */

export interface FocusSuiteSettings {
  general: GeneralSettings;
  timer: TimerSettings;
  focus: FocusSettings;
  ruler: RulerSettings;
  typography: TypographySettings;
  heatmap: HeatmapSettings;
  appearance: AppearanceSettings;
  advanced: AdvancedSettings;
}

export const DEFAULT_SETTINGS: FocusSuiteSettings = {
  general: {
    statsEnabled: true,
    showNotices: true,
  },
  timer: {
    enabled: true,
    workMinutes: 25,
    breakMinutes: 5,
    autoHide: true,
    autoHideSeconds: 4,
    pauseOnBlur: true,
    positionX: null,
    positionY: null,
    focusDetectionEnabled: true,
    focusDetectionIdleSeconds: 30,
    nudgeEnabled: false,
    nudgeIdleSeconds: 60,
    nudgeIgnoreScroll: true,
    dopamineEnabled: false,
    dopamineDailyGoalMinutes: 60,
  },
  focus: {
    enabled: false,
    showNotch: true,
    notchSize: 44,
    focusLine: false,
    smoothFollow: false,
    keyboardStepPercent: 5,
  },
  ruler: {
    height: 28,
    color: "#ffd54f",
    opacity: 0.18,
    mode: "auto",
    positionRatio: null,
  },
  typography: {
    enabled: true,
    fontFamily: "system",
    customFontFamily: "",
    loadGoogleFonts: false,
    fontSize: 17,
    lineHeight: 1.7,
    maxWidthChars: 66,
    paragraphSpacing: 1.4,
  },
  heatmap: {
    enabled: true,
    idleSeconds: 30,
    bucketCount: 100,
    width: 16,
    offsetRight: 12,
    opacity: 0.85,
  },
  appearance: {
    accentMode: "native",
    customAccent: "#7c4dff",
    widgetScale: 1,
  },
  advanced: {
    debugMode: false,
    refreshIntervalMs: 1000,
  },
};

/* ------------------------------------------------------------------ */
/* Normalization                                                       */
/* ------------------------------------------------------------------ */

function clampNum(value: unknown, min: number, max: number, fallback: number, round = true): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const clamped = Math.min(Math.max(value, min), max);
  return round ? Math.round(clamped) : clamped;
}

function clampRatio2(value: unknown, min: number, max: number, fallback: number): number {
  return Math.round(clampNum(value, min, max, fallback, false) * 100) / 100;
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function strOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

/**
 * Sanitizes a user-entered CSS font stack. Custom stacks end up inside a CSS
 * custom property, so strip characters that could break out of the value.
 */
export function sanitizeFontStack(raw: unknown): string {
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

function normalizeHexColor(value: unknown, fallback: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(String(value)) ? String(value) : fallback;
}

/**
 * Normalizes one section (or all settings when section is "*").
 * Missing keys fall back to defaults; bad values are clamped/repaired.
 */
export function normalizeSettings(
  raw: Partial<Record<SectionId, any>> | null | undefined,
  sections: SectionId[] | "*" = "*"
): FocusSuiteSettings {
  const out: FocusSuiteSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  if (!raw || typeof raw !== "object") return out;

  const sectionList = sections === "*" ? SECTION_IDS : sections;

  for (const section of sectionList) {
    const incoming = raw[section];
    if (!incoming || typeof incoming !== "object") continue;

    if (section === "general") {
      const d = DEFAULT_SETTINGS.general;
      out.general = {
        statsEnabled: boolOr(incoming.statsEnabled, d.statsEnabled),
        showNotices: boolOr(incoming.showNotices, d.showNotices),
      };
    } else if (section === "timer") {
      const d = DEFAULT_SETTINGS.timer;
      const pos = (key: "positionX" | "positionY"): number | null => {
        const v = incoming[key];
        return typeof v === "number" && Number.isFinite(v) ? v : null;
      };
      out.timer = {
        enabled: boolOr(incoming.enabled, d.enabled),
        workMinutes: clampNum(incoming.workMinutes, 1, 180, d.workMinutes),
        breakMinutes: clampNum(incoming.breakMinutes, 1, 60, d.breakMinutes),
        autoHide: boolOr(incoming.autoHide, d.autoHide),
        autoHideSeconds: clampNum(incoming.autoHideSeconds, 1, 120, d.autoHideSeconds),
        pauseOnBlur: boolOr(incoming.pauseOnBlur, d.pauseOnBlur),
        positionX: pos("positionX"),
        positionY: pos("positionY"),
        focusDetectionEnabled: boolOr(incoming.focusDetectionEnabled, d.focusDetectionEnabled),
        focusDetectionIdleSeconds: clampNum(incoming.focusDetectionIdleSeconds, 5, 600, d.focusDetectionIdleSeconds),
        nudgeEnabled: boolOr(incoming.nudgeEnabled, d.nudgeEnabled),
        nudgeIdleSeconds: clampNum(incoming.nudgeIdleSeconds, 5, 600, d.nudgeIdleSeconds),
        nudgeIgnoreScroll: boolOr(incoming.nudgeIgnoreScroll, d.nudgeIgnoreScroll),
        dopamineEnabled: boolOr(incoming.dopamineEnabled, d.dopamineEnabled),
        dopamineDailyGoalMinutes: clampNum(incoming.dopamineDailyGoalMinutes, 1, 720, d.dopamineDailyGoalMinutes),
      };
    } else if (section === "focus") {
      const d = DEFAULT_SETTINGS.focus;
      out.focus = {
        enabled: boolOr(incoming.enabled, d.enabled),
        showNotch: boolOr(incoming.showNotch, d.showNotch),
        notchSize: clampNum(incoming.notchSize, 36, 56, d.notchSize),
        focusLine: boolOr(incoming.focusLine, d.focusLine),
        smoothFollow: boolOr(incoming.smoothFollow, d.smoothFollow),
        keyboardStepPercent: clampNum(incoming.keyboardStepPercent, 2, 25, d.keyboardStepPercent),
      };
    } else if (section === "ruler") {
      const d = DEFAULT_SETTINGS.ruler;
      const mode = incoming.mode;
      const ratio = incoming.positionRatio;
      out.ruler = {
        height: clampNum(incoming.height, 10, 80, d.height),
        color: normalizeHexColor(incoming.color, d.color),
        opacity: clampRatio2(incoming.opacity, 0.05, 0.9, d.opacity),
        mode: mode === "auto" || mode === "follow" || mode === "manual" ? mode : d.mode,
        positionRatio:
          ratio === null || ratio === undefined
            ? null
            : Number.isFinite(Number(ratio))
              ? Math.min(Math.max(Number(ratio), 0), 1)
              : null,
      };
    } else if (section === "typography") {
      const d = DEFAULT_SETTINGS.typography;
      const family = fontOptionById(strOr(incoming.fontFamily, d.fontFamily))
        ? strOr(incoming.fontFamily, d.fontFamily)
        : d.fontFamily;
      out.typography = {
        enabled: boolOr(incoming.enabled, d.enabled),
        fontFamily: family,
        customFontFamily: sanitizeFontStack(incoming.customFontFamily),
        loadGoogleFonts: boolOr(incoming.loadGoogleFonts, d.loadGoogleFonts),
        fontSize: clampNum(incoming.fontSize, 13, 26, d.fontSize),
        lineHeight: clampRatio2(incoming.lineHeight, 1.2, 2.2, d.lineHeight),
        maxWidthChars: clampNum(incoming.maxWidthChars, 40, 120, d.maxWidthChars),
        paragraphSpacing: clampRatio2(incoming.paragraphSpacing, 1, 2.5, d.paragraphSpacing),
      };
    } else if (section === "heatmap") {
      const d = DEFAULT_SETTINGS.heatmap;
      out.heatmap = {
        enabled: boolOr(incoming.enabled, d.enabled),
        idleSeconds: clampNum(incoming.idleSeconds, 5, 600, d.idleSeconds),
        bucketCount: clampNum(incoming.bucketCount, 10, 400, d.bucketCount),
        width: clampNum(incoming.width, 8, 48, d.width),
        offsetRight: clampNum(incoming.offsetRight, 0, 80, d.offsetRight),
        opacity: clampRatio2(incoming.opacity, 0.1, 1, d.opacity),
      };
    } else if (section === "appearance") {
      const d = DEFAULT_SETTINGS.appearance;
      const accentMode = incoming.accentMode;
      out.appearance = {
        accentMode: accentMode === "native" || accentMode === "custom" ? accentMode : d.accentMode,
        customAccent: normalizeHexColor(incoming.customAccent, d.customAccent),
        widgetScale: clampRatio2(incoming.widgetScale, 0.8, 1.25, d.widgetScale),
      };
    } else if (section === "advanced") {
      const d = DEFAULT_SETTINGS.advanced;
      out.advanced = {
        debugMode: boolOr(incoming.debugMode, d.debugMode),
        refreshIntervalMs: clampNum(incoming.refreshIntervalMs, 250, 5000, d.refreshIntervalMs),
      };
    }
  }

  return out;
}

/** Formats milliseconds as mm:ss (ceil'ed to the next second). */
export function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
