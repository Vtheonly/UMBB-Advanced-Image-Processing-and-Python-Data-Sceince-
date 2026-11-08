/**
 * Focus Read Suite — the module contract.
 *
 * The plugin is four modules (Timer, Reading Focus, Typography, Heatmap)
 * sharing one core. Modules are independent: each can be enabled/disabled
 * through its own settings section without breaking the others, and each
 * owns its entire UI/DOM footprint (mounted on load, removed on unload).
 */

import { App } from "obsidian";
import { LifecycleHub } from "../core/lifecycle";
import { SettingsManager } from "../core/settings-manager";
import { SectionId } from "../core/settings-schema";

export type ModuleId = "timer" | "focus" | "typography" | "heatmap";

export interface ModuleContext {
  app: App;
  settings: SettingsManager;
  lifecycle: LifecycleHub;
  isMobile: boolean;
  /** Registers an Obsidian command (auto-cleaned on unload). */
  addCommand(command: { id: string; name: string; callback?: () => any; hotkeys?: any[] }): unknown;
}

export interface FocusSuiteModule {
  readonly id: ModuleId;
  readonly name: string;

  /** Called once after the plugin loads and settings are ready. */
  load(ctx: ModuleContext): void | Promise<void>;

  /** Called on plugin unload / disable. Must fully undo `load`. */
  unload(): void | Promise<void>;

  /**
   * Called whenever one of `sections()` (or "*") changed. Modules re-apply
   * their configuration here — this is what makes settings take effect
   * immediately.
   */
  onSettingsChanged(sections: SectionId[]): void;

  /** Which settings sections this module cares about. */
  sections(): SectionId[];
}
