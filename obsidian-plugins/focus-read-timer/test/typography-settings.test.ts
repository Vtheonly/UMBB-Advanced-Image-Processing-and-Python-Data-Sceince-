import { describe, it, expect } from "vitest";
import {
  normalizeTypographySettings,
  sanitizeFontStack,
  resolveFontStack,
  DEFAULT_TYPOGRAPHY_SETTINGS,
  fontOptionById,
} from "../src/typography-settings";

describe("normalizeTypographySettings", () => {
  it("applies defaults for missing keys (old data.json compatibility)", () => {
    const s = normalizeTypographySettings({
      typographyEnabled: false,
      readingRulerEnabled: true,
      readingRulerHeight: 47,
      readingRulerColor: "#ffc400",
      readingRulerOpacity: 0.6,
    } as any);
    expect(s.readingRulerMode).toBe("auto"); // new key defaulted
    expect(s.readingRulerPositionRatio).toBeNull();
    expect(s.fontSize).toBe(DEFAULT_TYPOGRAPHY_SETTINGS.fontSize);
    expect(s.typographyEnabled).toBe(false); // preserved
    expect(s.readingRulerHeight).toBe(47); // preserved
  });

  it("repairs out-of-range values instead of generating broken CSS", () => {
    const s = normalizeTypographySettings({
      fontSize: 999,
      lineHeight: 0.1,
      maxWidthChars: -5,
      readingRulerHeight: 100000,
      readingRulerOpacity: 5,
      readingRulerColor: "javascript:alert(1)",
      readingRulerMode: "bogus",
      readingRulerPositionRatio: 42,
    } as any);
    expect(s.fontSize).toBeLessThanOrEqual(26);
    expect(s.lineHeight).toBeGreaterThanOrEqual(1.2);
    expect(s.maxWidthChars).toBeGreaterThanOrEqual(40);
    expect(s.readingRulerHeight).toBeLessThanOrEqual(80);
    expect(s.readingRulerOpacity).toBeLessThanOrEqual(0.9);
    expect(s.readingRulerColor).toBe(DEFAULT_TYPOGRAPHY_SETTINGS.readingRulerColor);
    expect(s.readingRulerMode).toBe("auto");
    expect(s.readingRulerPositionRatio).toBe(1); // clamped, not dropped
  });

  it("preserves valid user data from the real vault", () => {
    // Actual data.json from the user's vault.
    const s = normalizeTypographySettings({
      typographyEnabled: false,
      fontFamily: "lexend",
      customFontFamily: "",
      loadGoogleFonts: false,
      fontSize: 17,
      lineHeight: 1.7,
      maxWidthChars: 66,
      paragraphSpacing: 1.4,
      readingRulerEnabled: true,
      readingRulerHeight: 47,
      readingRulerColor: "#ffc400",
      readingRulerOpacity: 0.6,
    });
    expect(s).toMatchObject({
      fontFamily: "lexend",
      readingRulerHeight: 47,
      readingRulerColor: "#ffc400",
      readingRulerOpacity: 0.6,
      readingRulerEnabled: true,
    });
  });
});

describe("sanitizeFontStack", () => {
  it("strips characters that could break out of a CSS property value", () => {
    expect(sanitizeFontStack("Georgia, 'Times New Roman', serif")).toBe(
      "Georgia, 'Times New Roman', serif"
    );
    expect(sanitizeFontStack("Evil} body { background: red")).not.toContain("}");
    expect(sanitizeFontStack("A<B>C")).toBe("ABC"); // < and > stripped, letters kept
  });

  it("normalizes semicolons into commas and drops empties", () => {
    expect(sanitizeFontStack("Georgia; serif;")).toBe("Georgia, serif");
  });
});

describe("resolveFontStack", () => {
  it("returns the stack for known families", () => {
    expect(resolveFontStack({ fontFamily: "lexend" } as any)).toBe("'Lexend', sans-serif");
  });

  it("returns the sanitized custom stack for custom", () => {
    expect(
      resolveFontStack({ fontFamily: "custom", customFontFamily: "Comic Sans MS, cursive" } as any)
    ).toBe("Comic Sans MS, cursive");
  });

  it("returns empty for system/default", () => {
    expect(resolveFontStack({ fontFamily: "system" } as any)).toBe("");
    expect(resolveFontStack({ fontFamily: "does-not-exist" } as any)).toBe("");
  });
});

describe("fontOptionById", () => {
  it("finds options and yields undefined otherwise", () => {
    expect(fontOptionById("inter")?.googleFamily).toBe("Inter");
    expect(fontOptionById("nope")).toBeUndefined();
  });
});
