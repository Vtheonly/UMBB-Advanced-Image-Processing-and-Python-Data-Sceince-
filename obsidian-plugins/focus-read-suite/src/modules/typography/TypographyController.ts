/**
 * Focus Read Suite — typography application.
 *
 * Writes the typography settings into CSS custom properties on :root; the
 * static stylesheet (styles.css) consumes them. One source of truth, zero
 * re-parsing. The Google Fonts loader only ever loads the *selected*
 * family (the legacy bundle injected all six at once).
 */

import { TypographySettings, resolveFontStack, fontOptionById } from "../../core/settings-schema";

export const TYPOGRAPHY_BODY_CLASS = "frs-typography-on";
const GOOGLE_FONTS_LINK_ID = "frs-google-fonts-link";

const ROOT_VARS = [
  "--frs-font-size",
  "--frs-line-height",
  "--frs-para-spacing",
  "--frs-max-width",
  "--frs-font-family",
] as const;

export class TypographyController {
  constructor(private getSettings: () => TypographySettings) {}

  /** Writes current typography settings into CSS variables + body class. */
  apply(): void {
    const s = this.getSettings();
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty("--frs-font-size", `${s.fontSize}px`);
    rootStyle.setProperty("--frs-line-height", String(s.lineHeight));
    rootStyle.setProperty("--frs-para-spacing", String(s.paragraphSpacing));
    rootStyle.setProperty("--frs-max-width", `${s.maxWidthChars}ch`);
    rootStyle.setProperty("--frs-font-family", resolveFontStack(s) || "inherit");
    document.body.classList.toggle(TYPOGRAPHY_BODY_CLASS, s.enabled);
  }

  /** Manages the Google Fonts <link> (only the selected family). */
  applyGoogleFonts(): void {
    const s = this.getSettings();
    let link = document.getElementById(GOOGLE_FONTS_LINK_ID) as HTMLLinkElement | null;

    const option = fontOptionById(s.fontFamily);
    const googleFamily = option?.googleFamily ?? null;

    if (!s.loadGoogleFonts || !googleFamily || !s.enabled) {
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
