/**
 * Focus Read: Timer & Nudge — the floating timer widget.
 *
 * Fixes vs. the original:
 * - The saved position is clamped to the viewport on mount AND on every
 *   resize/orientation change. Previously a position saved on a large
 *   desktop screen (e.g. x=1187) put the timer permanently off-screen on a
 *   phone.
 * - Drag clamping uses the element's real size, not hardcoded minimums, so
 *   the box can never be dragged mostly out of view.
 * - Every listener is registered through `registerDomEvent`, so cleanup is
 *   automatic (the original leaked a `visibilitychange` listener on
 *   `document`).
 */

import { clampToViewport } from "../../shared/src/viewport";
import { TimerSnapshot } from "./timer";
import { TimerSettings, formatClock } from "./settings";

export const TIMER_ID = "frt-floating-timer";
const DRAG_HEADER_CLASS = "frt-timer-drag-header";

export interface WidgetHost {
  getSettings(): TimerSettings;
  onControl(action: TimerControlAction): void;
  registerDomElement(el: Element, type: string, callback: (e: any) => void, options?: any): void;
  savePosition(x: number, y: number): void;
}

export type TimerControlAction = "start" | "pause" | "addtime" | "stop";

export class TimerWidget {
  private host: WidgetHost;
  private el: HTMLElement | null = null;

  private dragging = false;
  private dragPointerId: number | null = null;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  constructor(host: WidgetHost) {
    this.host = host;
  }

  /* ------------------------------------------------------------------ */
  /* Lifecycle                                                           */
  /* ------------------------------------------------------------------ */

  mount(): void {
    if (document.getElementById(TIMER_ID)) return;

    const el = document.createElement("div");
    el.id = TIMER_ID;
    el.className = "frt-floating-timer";
    el.style.display = "none";
    el.innerHTML = `
      <div class="${DRAG_HEADER_CLASS}" title="Drag to move the timer">
        <span class="frt-drag-grip">⠿</span>
        <span class="frt-drag-label-text">Reading Timer</span>
        <span class="frt-drag-grip">⠿</span>
      </div>
      <div class="frt-timer-time">00:00</div>
      <div class="frt-timer-bar"><div class="frt-timer-bar-fill"></div></div>
      <div class="frt-timer-xp"></div>
      <div class="frt-timer-controls">
        <button class="frt-timer-btn frt-timer-btn-primary" data-action="start">Start</button>
        <button class="frt-timer-btn" data-action="pause">Pause</button>
        <button class="frt-timer-btn frt-timer-btn-add" data-action="addtime">+30s</button>
        <button class="frt-timer-btn frt-timer-btn-stop" data-action="stop">Stop</button>
      </div>
    `;
    document.body.appendChild(el);
    this.el = el;

    this.bindControls(el);
    this.bindDrag(el);
    this.applyVisibility();
    this.applySavedPosition();
  }

  destroy(): void {
    this.el?.remove();
    this.el = null;
  }

  /* ------------------------------------------------------------------ */
  /* Visibility & position                                               */
  /* ------------------------------------------------------------------ */

  applyVisibility(): void {
    const el = this.el ?? (document.getElementById(TIMER_ID) as HTMLElement | null);
    if (!el) return;
    const visible = this.host.getSettings().timerEnabled;
    el.style.display = visible ? "block" : "none";
    if (visible) this.applySavedPosition();
  }

  /**
   * Restores the saved position, clamped into the current viewport — this is
   * what keeps the timer reachable after switching from a big desktop screen
   * to a phone.
   */
  applySavedPosition(): void {
    const el = this.el;
    if (!el) return;
    const { timerPositionX, timerPositionY } = this.host.getSettings();

    if (timerPositionX === null || timerPositionY === null) {
      // Default anchor: top-right corner.
      el.style.left = "auto";
      el.style.top = "16px";
      el.style.right = "16px";
      return;
    }

    const rect = el.getBoundingClientRect();
    const { x, y } = clampToViewport(timerPositionX, timerPositionY, rect.width || 220, rect.height || 140);
    el.style.right = "auto";
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(y)}px`;
  }

  /** Re-clamps the current position after a resize/orientation change. */
  reflow(): void {
    const el = this.el;
    if (!el || this.dragging) return;
    const { timerPositionX, timerPositionY } = this.host.getSettings();
    if (timerPositionX === null || timerPositionY === null) return; // corner anchor is safe
    this.applySavedPosition();
  }

  resetPosition(): void {
    const el = this.el;
    if (!el) return;
    el.style.left = "auto";
    el.style.right = "16px";
    el.style.top = "16px";
  }

  /* ------------------------------------------------------------------ */
  /* Rendering                                                           */
  /* ------------------------------------------------------------------ */

  render(snap: TimerSnapshot): void {
    const el = this.el ?? (document.getElementById(TIMER_ID) as HTMLElement | null);
    if (!el) return;
    const s = this.host.getSettings();

    const timeEl = el.querySelector<HTMLElement>(".frt-timer-time");
    const labelEl = el.querySelector<HTMLElement>(".frt-drag-label-text");
    const fillEl = el.querySelector<HTMLElement>(".frt-timer-bar-fill");
    const xpEl = el.querySelector<HTMLElement>(".frt-timer-xp");

    const startBtn = el.querySelector<HTMLButtonElement>('[data-action="start"]');
    const pauseBtn = el.querySelector<HTMLButtonElement>('[data-action="pause"]');
    const addBtn = el.querySelector<HTMLButtonElement>('[data-action="addtime"]');
    const stopBtn = el.querySelector<HTMLButtonElement>('[data-action="stop"]');

    if (snap.phase === "idle") {
      if (labelEl) labelEl.textContent = "Ready — drag me";
      if (timeEl) timeEl.textContent = formatClock(s.timerWorkMinutes * 60_000);
      if (fillEl) fillEl.style.width = "0%";
      if (xpEl) xpEl.textContent = "Click Start to begin";
    } else {
      if (timeEl) timeEl.textContent = formatClock(snap.remainingMs);
      if (labelEl) {
        labelEl.textContent =
          snap.phase === "break" ? "Break" : snap.running ? "Reading" : "Paused";
      }
      const pct = snap.totalMs > 0 ? (1 - snap.remainingMs / snap.totalMs) * 100 : 0;
      if (fillEl) fillEl.style.width = `${pct}%`;
      if (xpEl) {
        xpEl.textContent =
          snap.phase === "break" ? "On break" : `+${Math.round(snap.focusMs / 60_000)} min`;
      }
    }

    if (startBtn) {
      startBtn.disabled = snap.phase === "idle" ? false : snap.phase === "break" ? false : !snap.running && snap.phase === "work" ? true : false;
      startBtn.textContent = snap.phase === "break" ? "Skip Break" : "Start";
    }
    if (pauseBtn) {
      pauseBtn.disabled = snap.phase === "idle";
      pauseBtn.textContent = snap.running ? "Pause" : "Resume";
    }
    if (addBtn) addBtn.disabled = snap.phase === "idle";
    if (stopBtn) stopBtn.disabled = snap.phase === "idle";
  }

  /* ------------------------------------------------------------------ */
  /* Interaction                                                         */
  /* ------------------------------------------------------------------ */

  private bindControls(el: HTMLElement): void {
    const controls = el.querySelector(".frt-timer-controls");
    if (!controls) return;

    // Prevent control presses from starting a header drag.
    this.host.registerDomElement(controls, "pointerdown", (e: Event) => e.stopPropagation());
    this.host.registerDomElement(controls, "click", (e: MouseEvent) => {
      const btn = (e.target as HTMLElement | null)?.closest?.(".frt-timer-btn");
      if (!btn) return;
      e.stopPropagation();
      this.host.onControl(btn.getAttribute("data-action") as TimerControlAction);
    });
  }

  private bindDrag(el: HTMLElement): void {
    const header = el.querySelector(`.${DRAG_HEADER_CLASS}`);
    if (!header) return;

    const register = (type: string, cb: (e: any) => void) =>
      this.host.registerDomElement(header, type, cb);

    register("pointerdown", (e: PointerEvent) => {
      if (e.button !== undefined && e.button !== 0) return;
      this.dragging = true;
      this.dragPointerId = e.pointerId;

      const rect = el.getBoundingClientRect();
      this.dragOffsetX = e.clientX - rect.left;
      this.dragOffsetY = e.clientY - rect.top;
      el.classList.add("frt-dragging");

      // Pin to the current position by switching from the corner anchor to
      // explicit left/top before moving.
      el.style.right = "auto";
      el.style.left = `${rect.left}px`;
      el.style.top = `${rect.top}px`;

      try {
        (header as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* capture unsupported — bubbling still works */
      }

      e.preventDefault();
      e.stopPropagation();
    });

    register("pointermove", (e: PointerEvent) => {
      if (!this.dragging || e.pointerId !== this.dragPointerId) return;
      const rect = el.getBoundingClientRect();
      const { x, y } = clampToViewport(
        e.clientX - this.dragOffsetX,
        e.clientY - this.dragOffsetY,
        rect.width || 220,
        rect.height || 140
      );
      el.style.left = `${Math.round(x)}px`;
      el.style.top = `${Math.round(y)}px`;
      e.preventDefault();
    });

    const endDrag = (e: PointerEvent) => {
      if (!this.dragging || e.pointerId !== this.dragPointerId) return;
      this.dragging = false;
      this.dragPointerId = null;
      el.classList.remove("frt-dragging");
      try {
        (header as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* pointer already released */
      }
      const rect = el.getBoundingClientRect();
      this.host.savePosition(Math.round(rect.left), Math.round(rect.top));
    };
    register("pointerup", endDrag);
    register("pointercancel", endDrag);
    register("lostpointercapture", (e: PointerEvent) => {
      if (this.dragging && e.pointerId === this.dragPointerId) {
        this.dragging = false;
        this.dragPointerId = null;
        el.classList.remove("frt-dragging");
        const rect = el.getBoundingClientRect();
        this.host.savePosition(Math.round(rect.left), Math.round(rect.top));
      }
    });

    register("contextmenu", (e: Event) => {
      if (this.dragging) e.preventDefault();
    });
  }

  /* ------------------------------------------------------------------ */
  /* Auto-hide                                                           */
  /* ------------------------------------------------------------------ */

  private autoHideTimer: number | null = null;

  /** Un-dims the widget and restarts the auto-hide countdown. */
  poke(): void {
    const el = this.el;
    if (!el) return;
    el.style.opacity = "1";
    this.resetAutoHide();
  }

  resetAutoHide(): void {
    const s = this.host.getSettings();
    if (this.autoHideTimer !== null) {
      clearTimeout(this.autoHideTimer);
      this.autoHideTimer = null;
    }
    if (!s.timerAutoHide) return;
    this.autoHideTimer = window.setTimeout(() => {
      const el = this.el;
      if (el && !this.dragging) el.style.opacity = "0.55";
    }, s.timerAutoHideSeconds * 1000);
  }

  cancelAutoHide(): void {
    if (this.autoHideTimer !== null) {
      clearTimeout(this.autoHideTimer);
      this.autoHideTimer = null;
    }
  }
}
