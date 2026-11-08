/**
 * Focus Read Suite — the Typography module.
 *
 * Owns reading typography: font family (bundled options + custom stack),
 * font size, line height, paragraph spacing, max line width and the opt-in
 * Google Fonts loader.
 */

import { Notice } from "obsidian";
import { FocusSuiteModule, ModuleContext } from "../module";
import { SectionId } from "../../core/settings-schema";
import { TypographyController, TYPOGRAPHY_BODY_CLASS } from "./TypographyController";
import { logger } from "../../core/logger";

export class TypographyModule implements FocusSuiteModule {
  readonly id = "typography" as const;
  readonly name = "Typography";

  private ctx!: ModuleContext;
  private controller!: TypographyController;

  async load(ctx: ModuleContext): Promise<void> {
    this.ctx = ctx;
    this.controller = new TypographyController(() => ctx.settings.settings.typography);

    this.controller.apply();
    this.controller.applyGoogleFonts();

    this.registerCommands(ctx);
    logger.debug("Typography module loaded.");
  }

  async unload(): Promise<void> {
    this.controller?.destroy();
    document.body.classList.remove(TYPOGRAPHY_BODY_CLASS);
    logger.debug("Typography module unloaded.");
  }

  sections(): SectionId[] {
    return ["typography"];
  }

  onSettingsChanged(sections: SectionId[]): void {
    if (!sections.includes("typography")) return;
    this.controller.apply();
    this.controller.applyGoogleFonts();
  }

  /* ------------------------------------------------------------------ */
  /* Commands                                                            */
  /* ------------------------------------------------------------------ */

  async toggle(): Promise<void> {
    const enabled = !this.ctx.settings.settings.typography.enabled;
    await this.ctx.settings.update("typography", (draft) => {
      draft.typography.enabled = enabled;
    });
    if (this.ctx.settings.settings.general.showNotices) {
      new Notice(`Typography: ${enabled ? "ON" : "OFF"}`);
    }
  }

  private registerCommands(ctx: ModuleContext): void {
    ctx.addCommand({
      id: "toggle-typography",
      name: "Toggle reading typography",
      callback: () => void this.toggle(),
    });
  }
}
