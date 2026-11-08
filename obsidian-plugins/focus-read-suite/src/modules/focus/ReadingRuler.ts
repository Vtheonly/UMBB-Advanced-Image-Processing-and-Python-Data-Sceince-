/**
 * Focus Read Suite — the reading ruler with its notch, rebuilt.
 *
 * This is the feature the project brief called out as the most broken on
 * mobile ("the yellow ruler behaves unexpectedly when touched"). The
 * interaction model was redesigned from scratch around Pointer Events:
 *
 * Interaction model
 * ─────────────────
 *   ┌──────────────────────────────────────────────┐ ← the band (yellow,
 *   │              translucent highlight             │   pointer-events:none)
 *   ├──────────────────────────────────────────────┤
 *   │                                    ┌─────┐    │ ← the NOTCH: the only
 *   └────────────────────────────────────└─────┘────┘   interactive element
 *                                             ⠿         (44px target,
 *                                                        touch-action:none)
 * Rules that make it predictable on every device:
 * 1. The band itself never reacts to taps/clicks/scroll — it is
 *    pointer-events:none. The ruler can never "teleport" to a tap again.
 * 2. Moving the ruler is a *deliberate* act: drag the notch (mouse, pen or
 *    finger) or use the commands. setPointerCapture keeps fast drags glued
 *    to the finger; pointercancel/lostpointercapture end the drag cleanly.
 * 3. "Follow pointer" mode only tracks hover-capable pointers (mouse/pen).
 *    Touch pointers never move the ruler implicitly — they scroll.
 * 4. The position is persisted as a 0..1 ratio of the movable range, so it
 *    survives orientation changes and screen switches, and is re-clamped on
 *    resize/orientationchange/visualViewport.resize.
 * 5. Movement writes transform:translate3d through an rAF-coalesced
 *    scheduler (no layout thrash at 60 events/s).
 * 6. Optional smooth-follow interpolates toward the pointer (no jumps).
 * 7. A live position badge shows the height percentage while dragging.
 * 8. Double-tap / double-click the notch centers the ruler; the notch is
 *    keyboard-focusable (ArrowUp/ArrowDown move it).
 */

import { Platform } from "obsidian";
import { FocusSettings, RulerSettings, RulerMode } from "../../core/settings-schema";
import {
  hasHoverPointer,
  getViewportSize,
  createRafScheduler,
  registerViewportChangeHandlers,
} from "../../core/viewport";

export const RULER_ID = "frs-ruler";
export const RULER_BODY_CLASS = "frs-focus-on";
/** Default rest position: slightly above the vertical middle. */
const DEFAULT_POSITION_RATIO = 0.4;

export interface RulerHost {
  getFocusSettings(): FocusSettings;
  getRulerSettings(): RulerSettings;
  saveRulerSettings(mutate: (draft: { focus: FocusSettings; ruler: RulerSettings }) => void): Promise<void>;
  /** Registers a DOM listener that is cleaned up automatically on unload. */
  registerDomEvent(el: any, type: string, callback: (e: any) => void, options?: boolean | AddEventListenerOptions): void;
}

export class ReadingRuler {
  private host: RulerHost;

  private el: HTMLElement | null = null;
  private notch: HTMLElement | null = null;
  private badge: HTMLElement | null = null;

  /** Current top of the band, in px. */
  topPx = 0;

  private dragging = false;
  private dragPointerId: number | null = null;
  private dragStartPointerY = 0;
  private dragStartTopPx = 0;
  private dragMoved = false;

  /** Double-tap detection (dblclick is unreliable on touch). */
  private lastNotchTapAt = 0;
  private lastNotchTapX = 0;
  private lastNotchTapY = 0;

  /** Follow mode state. */
  private followTargetPx: number | null = null;
  private followRafId: number | null = null;

  private scheduleApply = createRafScheduler();

  constructor(host: RulerHost) {
    this.host = host;
  }

  /* ------------------------------------------------------------------ */
  /* Lifecycle                                                           */
  /* ------------------------------------------------------------------ */

  mount(): void {
    if (this.el) return;

    const el = document.createElement("div");
    el.id = RULER_ID;
    el.className = "frs-ruler";
    el.setAttribute("aria-hidden", "false");

    // The translucent band. Its opacity lives on this child (NOT on the
    // ruler itself) so the notch and badge stay fully opaque.
    const band = document.createElement("div");
    band.className = "frs-ruler-band";
    el.appendChild(band);

    // Optional focus line — a crisp 2px guide at the band's center.
    const focusLine = document.createElement("div");
    focusLine.className = "frs-ruler-focus-line";
    el.appendChild(focusLine);

    // The notch: the ONLY interactive element of the ruler.
    const notch = document.createElement("div");
    notch.className = "frs-notch";
    notch.setAttribute("role", "slider");
    notch.setAttribute("aria-label", "Reading ruler position — drag to move, double-tap to center");
    notch.setAttribute("aria-orientation", "vertical");
    notch.tabIndex = 0;
    const icon = document.createElement("span");
    icon.className = "frs-notch-icon";
    icon.textContent = "⠿";
    notch.appendChild(icon);
    el.appendChild(notch);
    this.notch = notch;

    // Live position badge shown while dragging.
    const badge = document.createElement("div");
    badge.className = "frs-ruler-badge";
    badge.textContent = "40%";
    el.appendChild(badge);
    this.badge = badge;

    document.body.appendChild(el);
    this.el = el;

    this.bindPointerEvents();
    this.applyConfig();
    this.applyPosition();
    this.applyVisibility();
  }

  destroy(): void {
    this.stopFollowLoop();
    this.el?.remove();
    this.el = null;
    this.notch = null;
    this.badge = null;
  }

  /* ------------------------------------------------------------------ */
  /* Configuration                                                       */
  /* ------------------------------------------------------------------ */

  /** Applies height/color/opacity/notch/focus-line config; re-clamps. */
  applyConfig(): void {
    if (!this.el) return;
    const { ruler, focus } = this.currentSettings();
    this.el.style.setProperty("--frs-ruler-height", `${ruler.height}px`);
    this.el.style.setProperty("--frs-ruler-color", ruler.color);
    this.el.style.setProperty("--frs-ruler-opacity", String(ruler.opacity));
    this.el.style.setProperty("--frs-notch-size", `${focus.notchSize}px`);
    this.el.classList.toggle("frs-ruler-with-focus-line", focus.focusLine);
    if (this.notch) {
      this.notch.style.display = focus.showNotch ? "" : "none";
    }
    this.applyPosition();
    this.updateAria();
  }

  applyVisibility(): void {
    const { focus } = this.currentSettings();
    document.body.classList.toggle(RULER_BODY_CLASS, focus.enabled);
    if (focus.enabled && !this.el) {
      this.mount();
      return;
    }
    if (focus.enabled) this.applyPosition();
    else this.stopFollowLoop();
  }

  /* ------------------------------------------------------------------ */
  /* Positioning                                                         */
  /* ------------------------------------------------------------------ */

  private currentSettings(): { focus: FocusSettings; ruler: RulerSettings } {
    return { focus: this.host.getFocusSettings(), ruler: this.host.getRulerSettings() };
  }

  /** Effective mode after resolving "auto" for this device. */
  get effectiveMode(): Exclude<RulerMode, "auto"> {
    const { mode } = this.currentSettings().ruler;
    if (mode === "follow" || mode === "manual") return mode;
    // auto: follow the pointer only where a hover pointer exists (desktop).
    // On touch devices there is no hover — dragging the notch is the only
    // sensible interaction.
    return hasHoverPointer() && !Platform.isMobile ? "follow" : "manual";
  }

  /** Movable vertical range for the current viewport and ruler height. */
  private movableRange(): number {
    const { height } = getViewportSize();
    const rulerHeight = this.currentSettings().ruler.height;
    return Math.max(0, height - rulerHeight);
  }

  /** Restores the persisted ratio (or default) and clamps it. */
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
    const { positionRatio } = this.currentSettings().ruler;
    this.topPx = this.ratioToPx(positionRatio);
    this.el.style.transform = `translate3d(0, ${Math.round(this.topPx)}px, 0)`;
    this.updateAria();
  }

  /** Moves the ruler to an absolute viewport Y, clamped. */
  private moveToPx(px: number, options: { persist?: boolean } = {}): void {
    const range = this.movableRange();
    this.topPx = Math.min(Math.max(px, 0), range);
    if (this.el) {
      this.el.style.transform = `translate3d(0, ${Math.round(this.topPx)}px, 0)`;
    }
    if (options.persist) {
      const ratio = this.pxToRatio(this.topPx);
      void this.host.saveRulerSettings((draft) => {
        draft.ruler.positionRatio = ratio;
      });
    }
    this.updateBadge();
    this.updateAria();
  }

  /** Public API for keyboard commands / notch double-tap. */
  center(): void {
    this.moveToPx(this.movableRange() / 2, { persist: true });
  }

  nudge(direction: -1 | 1): void {
    const stepPercent = this.currentSettings().focus.keyboardStepPercent;
    const range = this.movableRange();
    this.moveToPx(this.topPx + direction * range * (stepPercent / 100), { persist: true });
  }

  private updateAria(): void {
    if (!this.notch) return;
    const range = this.movableRange();
    const pct = range > 0 ? Math.round((this.topPx / range) * 100) : 0;
    this.notch.setAttribute("aria-valuenow", String(pct));
    this.notch.setAttribute("aria-valuetext", `${pct}% of the screen height`);
  }

  /** Shows the live position badge (dragging feedback). */
  private updateBadge(): void {
    if (!this.badge) return;
    const range = this.movableRange();
    const pct = range > 0 ? Math.round((this.topPx / range) * 100) : 0;
    this.badge.textContent = `${pct}%`;
    this.badge.classList.toggle("frs-visible", this.dragging);
  }

  /* ------------------------------------------------------------------ */
  /* Pointer handling                                                    */
  /* ------------------------------------------------------------------ */

  private bindPointerEvents(): void {
    if (!this.el || !this.notch) return;
    const register = this.host.registerDomEvent;

    /* ---- Notch drag: the deliberate way to move the ruler ---- */

    register(this.notch, "pointerdown", (e: PointerEvent) => {
      if (e.button !== 0) return;
      this.dragging = true;
      this.dragMoved = false;
      this.dragPointerId = e.pointerId;
      this.dragStartPointerY = e.clientY;
      this.dragStartTopPx = this.topPx;
      this.el?.classList.add("frs-ruler-dragging");
      document.body.classList.add("frs-ruler-drag-global");

      try {
        this.notch?.setPointerCapture(e.pointerId);
      } catch {
        /* not supported — drag still works via bubbling */
      }

      e.preventDefault();
      e.stopPropagation();
    });

    register(this.notch, "pointermove", (e: PointerEvent) => {
      if (!this.dragging || e.pointerId !== this.dragPointerId) return;
      const delta = e.clientY - this.dragStartPointerY;
      if (Math.abs(delta) > 2) this.dragMoved = true;
      this.moveToPx(this.dragStartTopPx + delta);
      e.preventDefault();
    });

    const endDrag = (e: PointerEvent) => {
      if (!this.dragging || e.pointerId !== this.dragPointerId) return;
      this.finishDrag(e.pointerId);
    };
    register(this.notch, "pointerup", endDrag);
    register(this.notch, "pointercancel", endDrag);

    // A lost pointer capture (element removed, browser gesture takeover)
    // must end the drag too — otherwise the ruler sticks to the finger.
    register(this.notch, "lostpointercapture", (e: PointerEvent) => {
      if (this.dragging && e.pointerId === this.dragPointerId) {
        this.finishDrag(e.pointerId);
      }
    });

    // Long-press/right-click on the notch must not open the context menu
    // mid-interaction on mobile.
    register(this.notch, "contextmenu", (e: Event) => {
      if (this.dragging) e.preventDefault();
    });

    /* ---- Double-tap / double-click the notch to center ---- */

    register(this.notch, "dblclick", () => this.center());

    register(this.notch, "pointerup", (e: PointerEvent) => {
      if (e.pointerType === "touch") this.maybeDoubleTap(e);
    });

    /* ---- Keyboard support on the notch ---- */

    register(this.notch, "keydown", (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        this.nudge(e.key === "ArrowUp" ? -1 : 1);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.center();
      }
    });

    /* ---- Follow mode (hover pointers only) ---- */

    register(window, "pointermove", (e: PointerEvent) => {
      const { focus, ruler } = this.currentSettings();
      if (!focus.enabled) return;
      if (this.effectiveMode !== "follow") return;
      if (this.dragging) return;
      // Touch pointers never drive "follow": without hover this is a scroll
      // gesture, not an attempt to move the ruler.
      if (e.pointerType === "touch") return;

      const targetY = e.clientY - ruler.height / 2;
      if (focus.smoothFollow) {
        this.followTargetPx = targetY;
        this.startFollowLoop();
      } else {
        // rAF-coalesced transform update: one write per frame at most.
        this.scheduleApply(() => this.moveToPx(targetY));
      }
    });

    /* ---- Viewport changes ---- */

    registerViewportChangeHandlers(
      (target, type, cb) => register(target, type, cb),
      () => this.applyPosition()
    );
  }

  private finishDrag(pointerId: number): void {
    this.dragging = false;
    this.dragPointerId = null;
    this.el?.classList.remove("frs-ruler-dragging");
    document.body.classList.remove("frs-ruler-drag-global");
    try {
      this.notch?.releasePointerCapture(pointerId);
    } catch {
      /* pointer already released */
    }
    // Persist as a ratio so the position survives orientation changes and
    // other devices.
    this.moveToPx(this.topPx, { persist: true });
    this.updateBadge();
  }

  /** Manual double-tap detection on the notch. */
  private maybeDoubleTap(e: PointerEvent): void {
    if (this.dragMoved) return; // a real drag is not a tap
    const now = Date.now();
    const isDoubleTap =
      now - this.lastNotchTapAt < 320 &&
      Math.abs(e.clientX - this.lastNotchTapX) < 30 &&
      Math.abs(e.clientY - this.lastNotchTapY) < 30;
    this.lastNotchTapAt = now;
    this.lastNotchTapX = e.clientX;
    this.lastNotchTapY = e.clientY;
    if (isDoubleTap) {
      this.lastNotchTapAt = 0;
      this.center();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Smooth follow                                                       */
  /* ------------------------------------------------------------------ */

  /**
   * Interpolates toward the follow target each frame (factor 0.25 ≈ smooth
   * but responsive). The loop stops itself once it converges, so no rAF
   * churn while reading without moving the mouse.
   */
  private startFollowLoop(): void {
    if (this.followRafId !== null) return;
    const step = () => {
      this.followRafId = null;
      if (this.followTargetPx === null || this.dragging) return;
      const diff = this.followTargetPx - this.topPx;
      if (Math.abs(diff) < 0.5) {
        this.moveToPx(this.followTargetPx);
        return;
      }
      this.moveToPx(this.topPx + diff * 0.25);
      this.followRafId = requestAnimationFrame(step);
    };
    this.followRafId = requestAnimationFrame(step);
  }

  private stopFollowLoop(): void {
    if (this.followRafId !== null) {
      cancelAnimationFrame(this.followRafId);
      this.followRafId = null;
    }
    this.followTargetPx = null;
  }
}
