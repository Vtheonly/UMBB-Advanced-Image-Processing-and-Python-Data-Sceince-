/**
 * Focus Read Suite — the Reading Focus module (notch + yellow ruler).
 *
 * One module owning the whole reading-assistance system: the ruler band,
 * the notch handle, the optional focus line and the follow/drag interaction
 * model. Exposes commands (toggle, center, move up/down) and applies
 * settings changes immediately.
 */

import { Notice } from "obsidian";
import { FocusSuiteModule, ModuleContext } from "../module";
import { SectionId } from "../../core/settings-schema";
import { ReadingRuler, RULER_BODY_CLASS } from "./ReadingRuler";
import { logger } from "../../core/logger";

export class ReadingFocusModule implements FocusSuiteModule {
  readonly id = "focus" as const;
  readonly name = "Notch & Reading Focus";

  private ctx!: ModuleContext;
  private ruler!: ReadingRuler;

  async load(ctx: ModuleContext): Promise<void> {
    this.ctx = ctx;

    this.ruler = new ReadingRuler({
      getFocusSettings: () => ctx.settings.settings.focus,
      getRulerSettings: () => ctx.settings.settings.ruler,
      saveRulerSettings: (mutate) =>
        ctx.settings.update(["focus", "ruler"], (draft) => mutate(draft), false),
      registerDomEvent: (el, type, cb, options) => ctx.lifecycle.domEvent(el, type, cb, options),
    });

    if (ctx.settings.settings.focus.enabled) {
      this.ruler.mount();
    }

    this.registerCommands(ctx);
    logger.debug("Reading Focus module loaded.");
  }

  async unload(): Promise<void> {
    this.ruler?.destroy();
    document.body.classList.remove(RULER_BODY_CLASS);
    logger.debug("Reading Focus module unloaded.");
  }

  sections(): SectionId[] {
    return ["focus", "ruler"];
  }

  onSettingsChanged(sections: SectionId[]): void {
    if (!sections.includes("focus") && !sections.includes("ruler")) return;
    this.ruler.applyVisibility();
    this.ruler.applyConfig();
  }

  /* ------------------------------------------------------------------ */
  /* Commands                                                            */
  /* ------------------------------------------------------------------ */

  async toggle(): Promise<void> {
    const enabled = !this.ctx.settings.settings.focus.enabled;
    await this.ctx.settings.update("focus", (draft) => {
      draft.focus.enabled = enabled;
    });
    this.ruler.applyVisibility();
    if (this.ctx.settings.settings.general.showNotices) {
      new Notice(`Reading focus: ${enabled ? "ON" : "OFF"}`);
    }
  }

  center(): void {
    this.ensureVisible();
    this.ruler.center();
  }

  nudgeUp(): void {
    this.ensureVisible();
    this.ruler.nudge(-1);
  }

  nudgeDown(): void {
    this.ensureVisible();
    this.ruler.nudge(1);
  }

  private ensureVisible(): void {
    if (!this.ctx.settings.settings.focus.enabled) {
      void this.ctx.settings.update("focus", (draft) => {
        draft.focus.enabled = true;
      });
    }
    this.ruler.applyVisibility();
  }

  private registerCommands(ctx: ModuleContext): void {
    ctx.addCommand({
      id: "toggle-reading-focus",
      name: "Toggle reading focus (ruler)",
      callback: () => void this.toggle(),
    });
    ctx.addCommand({
      id: "center-reading-ruler",
      name: "Center reading ruler",
      callback: () => this.center(),
    });
    ctx.addCommand({
      id: "move-reading-ruler-up",
      name: "Move reading ruler up",
      callback: () => this.nudgeUp(),
    });
    ctx.addCommand({
      id: "move-reading-ruler-down",
      name: "Move reading ruler down",
      callback: () => this.nudgeDown(),
    });
  }
}
