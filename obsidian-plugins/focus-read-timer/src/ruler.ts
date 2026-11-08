/**
 * Focus Read — the reading ruler (the yellow bar).
 *
 * Recovered from the original standalone "Focus Read: Typography & Ruler"
 * plugin (vault git history, commit 1f79343) and integrated into the main
 * Focus Read plugin. All original capabilities are preserved (yellow band,
 * height/color/opacity customization, enable toggle, follow-the-pointer on
 * desktop); the interaction model was rewritten on Pointer Events because
 * the old implementation listened to `mousemove` only, which made the ruler
 * jump to tap positions on touch devices and impossible to move
 * deliberately:
 *
 * - Pointer Events are used everywhere (mouse, touch and pen are unified).
 * - The ruler itself stays `pointer-events: none` so it never blocks reading,
 *   scrolling, links or Obsidian UI.
 * - A dedicated drag handle (44px touch target, `touch-action: none`) is the
 *   only interactive part. It works with mouse drags AND finger drags, using
 *   `setPointerCapture` so fast drags never lose the ruler.
 * - "Follow" mode still tracks the pointer, but only for hover-capable
 *   pointers (mouse/pen); touch pointers never move the ruler implicitly —
 *   they are usually scrolling.
 * - The position is persisted as a ratio of the viewport, so it is restored
 *   sensibly on other screen sizes / orientations, and it is re-clamped on
 *   every resize.
 * - Movement uses `transform: translateY` (compositor-driven) instead of
 *   writing `top` on every mousemove (which forced layout).
 */

import { Platform } from "obsidian";
import { TypographySettings, RulerMode } from "./typography-settings";
import { hasHoverPointer, getViewportSize, createRafScheduler } from "../../shared/src/viewport";

export const RULER_ID = "frt-reading-ruler";
export const RULER_BODY_CLASS = "frt-ruler-on";
/** Default rest position: slightly above the vertical middle. */
const DEFAULT_POSITION_RATIO = 0.4;
/** Vertical move step for the keyboard commands, as ratio of movable range. */
const KEYBOARD_STEP_RATIO = 0.05;

export interface RulerHost {
  settings: TypographySettings;
  saveSettings(): Promise<void>;
  /** Registers a DOM listener that is cleaned up automatically on unload. */
  registerDomEvent(el: any, type: string, callback: (e: any) => void, options?: boolean | AddEventListenerOptions): void;
}

export class ReadingRuler {
  private host: RulerHost;
  private el: HTMLElement | null = null;
  private handle: HTMLElement | null = null;

  /** Current top position of the ruler band, in px. */
  topPx = 0;
  /** True while a pointer drag on the handle is active. */
  private dragging = false;
  private dragPointerId: number | null = null;
  private dragStartPointerY = 0;
  private dragStartTopPx = 0;

  private scheduleApply = createRafScheduler();

  constructor(host: RulerHost) {
    this.host = host;
  }

  /* ------------------------------------------------------------------ */
  /* Lifecycle                                                           */
  /* ------------------------------------------------------------------ */

  mount(): void {
    if (this.el) return;

    // Defensive: if a leftover element from the legacy standalone plugin (or
    // a double mount) is still around with our id, remove it first so there
    // is never more than one ruler.
    document.getElementById(RULER_ID)?.remove();

    const el = document.createElement("div");
    el.id = RULER_ID;
    el.className = "frt-reading-ruler";
    el.setAttribute("aria-hidden", "true");

    // The translucent band. Kept in a child element so the ruler's own
    // opacity can stay 1 — otherwise the drag handle would inherit the
    // (possibly 0.18) opacity and be nearly invisible.
    const band = document.createElement("div");
    band.className = "frt-ruler-band";
    el.appendChild(band);

    // Drag handle — the only interactive part of the ruler.
    const handle = document.createElement("div");
    handle.className = "frt-ruler-handle";
    handle.setAttribute("role", "button");
    handle.setAttribute(
      "aria-label",
      "Reading ruler handle — drag to move the ruler, double-tap to center it"
    );
    const icon = document.createElement("span");
    icon.className = "frt-ruler-handle-icon";
    icon.textContent = "⠿";
    handle.appendChild(icon);
    el.appendChild(handle);

    document.body.appendChild(el);
    this.el = el;
    this.handle = handle;

    this.bindPointerEvents();
    this.applyConfig();
    this.applyPosition();
    this.applyVisibility();
  }

  destroy(): void {
    // Listeners registered through `registerDomEvent` are removed
    // automatically by Obsidian when the plugin unloads; we only need to
    // drop the DOM nodes here.
    this.el?.remove();
    this.el = null;
    this.handle = null;
  }

  /* ------------------------------------------------------------------ */
  /* Configuration                                                       */
  /* ------------------------------------------------------------------ */

  /** Applies height/color/opacity and re-clamps the position. */
  applyConfig(): void {
    if (!this.el) return;
    const s = this.host.settings;
    this.el.style.setProperty("--frt-ruler-height", `${s.readingRulerHeight}px`);
    this.el.style.setProperty("--frt-ruler-color", s.readingRulerColor);
    this.el.style.setProperty("--frt-ruler-opacity", String(s.readingRulerOpacity));
    this.applyPosition();
  }

  applyVisibility(): void {
    const enabled = this.host.settings.readingRulerEnabled;
    document.body.classList.toggle(RULER_BODY_CLASS, enabled);
    if (enabled && !this.el) {
      this.mount();
      return;
    }
    if (enabled) this.applyPosition();
  }

  /* ------------------------------------------------------------------ */
  /* Positioning                                                         */
  /* ------------------------------------------------------------------ */

  /** Effective mode after resolving "auto" for this device. */
  get effectiveMode(): Exclude<RulerMode, "auto"> {
    const mode = this.host.settings.readingRulerMode;
    if (mode === "follow" || mode === "manual") return mode;
    // "auto": follow the pointer only where a hover pointer exists (desktop).
    // On touch devices there is no hover, so manual dragging is the only
    // sensible interaction.
    return hasHoverPointer() && !Platform.isMobile ? "follow" : "manual";
  }

  /** Movable vertical range for the current viewport and ruler height. */
  private movableRange(): number {
    const { height } = getViewportSize();
    const rulerHeight = this.host.settings.readingRulerHeight;
    return Math.max(0, height - rulerHeight);
  }

  /** Restores the persisted ratio (or the default) and clamps it. */
  private ratioToPx(ratio: number | null): number {
    const range = this.movableRange();
    if (range <= 0) return 0;
    const r = ratio === null ? DEFAULT_POSITION_RATIO : Math.min(Math.max(ratio, 0), 1);
    return r * range;
  }

  private pxToRatio(px: number): number {
    const range = this.movableRange();
    if (range <= 0) return 0.5;
    return Math.min(Math.max(px / range, 0), 1);
  }

  /**
   * Re-applies the saved position, clamped to the current viewport.
   * Called on mount, resize, orientation change and config changes.
   */
  applyPosition(): void {
    if (!this.el || this.dragging) return;
    this.topPx = this.ratioToPx(this.host.settings.readingRulerPositionRatio);
    this.el.style.transform = `translate3d(0, ${Math.round(this.topPx)}px, 0)`;
  }

  /** Moves the ruler to an absolute viewport Y, clamped. */
  private moveToPx(px: number, options: { persist?: boolean } = {}): void {
    const range = this.movableRange();
    this.topPx = Math.min(Math.max(px, 0), range);
    if (this.el) {
      this.el.style.transform = `translate3d(0, ${Math.round(this.topPx)}px, 0)`;
    }
    if (options.persist) {
      this.host.settings.readingRulerPositionRatio = this.pxToRatio(this.topPx);
      void this.host.saveSettings();
    }
  }

  /** Public API for keyboard commands / handle double-tap. */
  center(): void {
    this.moveToPx(this.movableRange() / 2, { persist: true });
  }

  nudge(direction: -1 | 1): void {
    const range = this.movableRange();
    this.moveToPx(this.topPx + direction * range * KEYBOARD_STEP_RATIO, { persist: true });
  }

  /* ------------------------------------------------------------------ */
  /* Pointer handling                                                    */
  /* ------------------------------------------------------------------ */

  private bindPointerEvents(): void {
    if (!this.el || !this.handle) return;

    const host = this.host;

    /* ---- Drag handle: the deliberate way to move the ruler ---- */

    host.registerDomEvent(this.handle, "pointerdown", (e: PointerEvent) => {
      // Primary button / finger / pen only.
      if (e.button !== 0) return;
      this.dragging = true;
      this.dragPointerId = e.pointerId;
      this.dragStartPointerY = e.clientY;
      this.dragStartTopPx = this.topPx;
      this.el?.classList.add("frt-ruler-dragging");

      // Capture so pointermove/up keep arriving even if the pointer travels
      // fast or leaves the handle — the classic cause of "lost" drags.
      try {
        this.handle?.setPointerCapture(e.pointerId);
      } catch {
        /* not supported — drag still works via bubbling */
      }

      e.preventDefault();
      e.stopPropagation();
    });

    host.registerDomEvent(this.handle, "pointermove", (e: PointerEvent) => {
      if (!this.dragging || e.pointerId !== this.dragPointerId) return;
      const delta = e.clientY - this.dragStartPointerY;
      this.moveToPx(this.dragStartTopPx + delta);
      e.preventDefault();
    });

    const endDrag = (e: PointerEvent) => {
      if (!this.dragging || e.pointerId !== this.dragPointerId) return;
      this.dragging = false;
      this.dragPointerId = null;
      this.el?.classList.remove("frt-ruler-dragging");
      try {
        this.handle?.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer already released */
      }
      // Persist as a ratio so the position survives orientation changes and
      // other devices.
      this.moveToPx(this.topPx, { persist: true });
    };
    host.registerDomEvent(this.handle, "pointerup", endDrag);
    host.registerDomEvent(this.handle, "pointercancel", endDrag);

    // A lost pointer capture (element removed, browser decision) must end
    // the drag too, otherwise the ruler sticks to the finger forever.
    host.registerDomEvent(this.handle, "lostpointercapture", (e: PointerEvent) => {
      if (this.dragging && e.pointerId === this.dragPointerId) {
        this.dragging = false;
        this.dragPointerId = null;
        this.el?.classList.remove("frt-ruler-dragging");
        this.moveToPx(this.topPx, { persist: true });
      }
    });

    host.registerDomEvent(this.handle, "dblclick", () => this.center());

    // Right-click / long-press on the handle must not open the context menu
    // mid-interaction on mobile.
    host.registerDomEvent(this.handle, "contextmenu", (e: Event) => {
      if (this.dragging) e.preventDefault();
    });

    /* ---- Follow mode (hover pointers only) ---- */

    host.registerDomEvent(window, "pointermove", (e: PointerEvent) => {
      if (!this.host.settings.readingRulerEnabled) return;
      if (this.effectiveMode !== "follow") return;
      if (this.dragging) return;
      // Touch pointers never drive "follow": without a hover pointer this is
      // a scroll gesture, not an attempt to move the ruler.
      if (e.pointerType === "touch") return;

      const height = this.host.settings.readingRulerHeight;
      const targetY = e.clientY - height / 2;
      // rAF-coalesced transform update: one layout per frame max, instead of
      // one per mousemove event.
      this.scheduleApply(() => this.moveToPx(targetY));
    });

    /* ---- Viewport changes ---- */

    const reflow = () => this.applyPosition();
    host.registerDomEvent(window, "resize", reflow);
    host.registerDomEvent(window, "orientationchange", reflow);
    if (window.visualViewport) {
      host.registerDomEvent(window.visualViewport, "resize", reflow);
    }
  }
}
