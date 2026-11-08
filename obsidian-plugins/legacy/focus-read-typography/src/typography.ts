/**
 * Focus Read: Typography & Ruler — typography application.
 *
 * The old implementation rebuilt an entire `<style>` element's textContent
 * (duplicating rules that already exist in styles.css) on every settings
 * change. This controller instead only sets CSS custom properties on :root;
 * the static stylesheet consumes them. One source of truth, zero re-parsing.
 */

import { TypographySettings, resolveFontStack, fontOptionById } from "./settings";

export const TYPOGRAPHY_BODY_CLASS = "frt-typography-on";
const GOOGLE_FONTS_LINK_ID = "frt-google-fonts-link";

const ROOT_VARS = [
  "--frt-font-size",
  "--frt-line-height",
  "--frt-para-spacing",
  "--frt-max-width",
  "--frt-font-family",
] as const;

export class TypographyController {
  constructor(private getSettings: () => TypographySettings) {}

  /** Writes current typography settings into CSS variables + body class. */
  apply(): void {
    const s = this.getSettings();
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty("--frt-font-size", `${s.fontSize}px`);
    rootStyle.setProperty("--frt-line-height", String(s.lineHeight));
    rootStyle.setProperty("--frt-para-spacing", String(s.paragraphSpacing));
    rootStyle.setProperty("--frt-max-width", `${s.maxWidthChars}ch`);
    rootStyle.setProperty("--frt-font-family", resolveFontStack(s) || "inherit");
    document.body.classList.toggle(TYPOGRAPHY_BODY_CLASS, s.typographyEnabled);
  }

  /**
   * Manages the Google Fonts `<link>`.
   * Only the *selected* family is loaded — the old version injected a
   * stylesheet URL containing all six families at once, wasting bandwidth
   * (especially on mobile connections).
   */
  applyGoogleFonts(): void {
    const s = this.getSettings();
    let link = document.getElementById(GOOGLE_FONTS_LINK_ID) as HTMLLinkElement | null;

    const option = fontOptionById(s.fontFamily);
    const googleFamily = option?.googleFamily ?? null;

    if (!s.loadGoogleFonts || !googleFamily) {
      link?.remove();
      return;
    }

    const href = `https://fonts.googleapis.com/css2?family=${googleFamily}&display=swap`;
    if (!link) {
      link = document.createElement("link");
      link.id = GOOGLE_FONTS_LINK_ID;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    if (link.getAttribute("href") !== href) link.href = href;
  }

  /** Removes every trace this controller left on the DOM. */
  destroy(): void {
    document.getElementById(GOOGLE_FONTS_LINK_ID)?.remove();
    document.body.classList.remove(TYPOGRAPHY_BODY_CLASS);
    const rootStyle = document.documentElement.style;
    for (const prop of ROOT_VARS) {
      rootStyle.removeProperty(prop);
    }
  }
}
