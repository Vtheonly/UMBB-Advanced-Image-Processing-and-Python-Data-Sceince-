/**
 * Focus Read Suite — the floating focus timer widget (redesigned UI).
 *
 * Layout:
 *   ┌──────────────────────────┐
 *   │ ⠿  FOCUS READER   ● Reading │  ← drag header (entire strip)
 *   │        24:31             │  ← big tabular clock
 *   │   ▓▓▓▓▓▓▓░░░░░░░░░░░░    │  ← progress bar (phase-colored)
 *   │      +12 min focused     │  ← session info line
 *   │ [Pause] [+30s] [Stop]    │  ← controls (44px touch targets)
 *   └──────────────────────────┘
 *
 * Interaction fixes kept from the audited rewrite (all verified by tests):
 * - saved position clamped into the viewport on mount AND on every
 *   resize/orientation change (desktop-saved coordinates no longer strand
 *   the widget off-screen on phones);
 * - drag uses pointer events + setPointerCapture (mouse, pen, touch);
 * - double-click/double-tap the header collapses the card to a compact pill;
 * - auto-hide dims via opacity on an inner element so controls stay legible.
 */

import { clampToViewport } from "../../core/viewport";
import { TimerSnapshot, TimerControlAction } from "./FocusTimer";
import { TimerSettings, formatClock } from "../../core/settings-schema";

export const TIMER_ELEMENT_ID = "frs-timer";

export interface WidgetHost {
  getSettings(): TimerSettings;
  onControl(action: TimerControlAction): void;
  registerDomEvent(el: any, type: string, cb: (e: any) => void, options?: any): void;
  savePosition(x: number, y: number): void;
}

export class TimerWidget {
  private host: WidgetHost;
  private el: HTMLElement | null = null;

  private dragging = false;
  private dragPointerId: number | null = null;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private collapsed = false;

  /** For double-tap detection on touch (dblclick is unreliable there). */
  private lastHeaderTapAt = 0;
  private lastHeaderTapX = 0;
  private lastHeaderTapY = 0;

  private autoHideTimer: number | null = null;

  constructor(host: WidgetHost) {
    this.host = host;
  }

  /* ------------------------------------------------------------------ */
  /* Lifecycle                                                           */
  /* ------------------------------------------------------------------ */

  mount(): void {
    if (document.getElementById(TIMER_ELEMENT_ID)) return;

    const el = document.createElement("div");
    el.id = TIMER_ELEMENT_ID;
    el.className = "frs-timer";
    el.style.display = "none";
    el.innerHTML = `
      <div class="frs-timer-header" title="Drag to move — double-click to collapse">
        <span class="frs-grip" aria-hidden="true">⠿</span>
        <span class="frs-timer-title">Focus Reader</span>
        <span class="frs-timer-phase"><span class="frs-timer-phase-dot"></span><span class="frs-timer-phase-label">Ready</span></span>
      </div>
      <div class="frs-timer-body">
        <div class="frs-timer-clock">00:00</div>
        <div class="frs-timer-progress"><div class="frs-timer-progress-fill"></div></div>
        <div class="frs-timer-info">Click Start to begin</div>
        <div class="frs-timer-controls">
          <button class="frs-btn frs-btn-primary" data-action="start">Start</button>
          <button class="frs-btn" data-action="pause">Pause</button>
          <button class="frs-btn" data-action="addtime">+30s</button>
          <button class="frs-btn frs-btn-danger" data-action="stop">Stop</button>
        </div>
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
    this.cancelAutoHide();
    this.el?.remove();
    this.el = null;
  }

  /* ------------------------------------------------------------------ */
  /* Visibility & position                                               */
  /* ------------------------------------------------------------------ */

  applyVisibility(): void {
    const el = this.el;
    if (!el) return;
    const visible = this.host.getSettings().enabled;
    el.style.display = visible ? "block" : "none";
    if (visible) this.applySavedPosition();
  }

  /**
   * Restores the saved position clamped into the current viewport — keeps
   * the timer reachable after switching from a big desktop screen to a phone.
   */
  applySavedPosition(): void {
    const el = this.el;
    if (!el) return;
    const { positionX, positionY } = this.host.getSettings();

    if (positionX === null || positionY === null) {
      el.style.left = "auto";
      el.style.top = "16px";
      el.style.right = "16px";
      return;
    }

    const rect = el.getBoundingClientRect();
    const { x, y } = clampToViewport(positionX, positionY, rect.width || 220, rect.height || 150);
    el.style.right = "auto";
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(y)}px`;
  }

  /** Re-clamps after a resize/orientation change. */
  reflow(): void {
    if (!this.el || this.dragging) return;
    const { positionX, positionY } = this.host.getSettings();
    if (positionX === null || positionY === null) return;
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
    const el = this.el;
    if (!el) return;
    const s = this.host.getSettings();

    const clockEl = el.querySelector<HTMLElement>(".frs-timer-clock");
    const infoEl = el.querySelector<HTMLElement>(".frs-timer-info");
    const fillEl = el.querySelector<HTMLElement>(".frs-timer-progress-fill");
    const phaseLabelEl = el.querySelector<HTMLElement>(".frs-timer-phase-label");
    const cardEl = el.querySelector<HTMLElement>(".frs-timer-body");

    const startBtn = el.querySelector<HTMLButtonElement>('[data-action="start"]');
    const pauseBtn = el.querySelector<HTMLButtonElement>('[data-action="pause"]');
    const addBtn = el.querySelector<HTMLButtonElement>('[data-action="addtime"]');
    const stopBtn = el.querySelector<HTMLButtonElement>('[data-action="stop"]');

    // Phase pill.
    const phaseKey =
      snap.phase === "idle" ? "ready" : snap.phase === "break" ? "break" : snap.running ? "reading" : "paused";
    el.setAttribute("data-phase", phaseKey);
    if (phaseLabelEl) {
      phaseLabelEl.textContent =
        phaseKey === "ready" ? "Ready" : phaseKey === "break" ? "Break" : phaseKey === "reading" ? "Reading" : "Paused";
    }

    if (snap.phase === "idle") {
      if (clockEl) clockEl.textContent = formatClock(s.workMinutes * 60_000);
      if (fillEl) fillEl.style.width = "0%";
      if (infoEl) infoEl.textContent = "Click Start to begin";
    } else {
      if (clockEl) clockEl.textContent = formatClock(snap.remainingMs);
      const pct = snap.totalMs > 0 ? (1 - snap.remainingMs / snap.totalMs) * 100 : 0;
      if (fillEl) fillEl.style.width = `${pct}%`;
      if (infoEl) {
        infoEl.textContent =
          snap.phase === "break"
            ? "Break — stretch, breathe"
            : snap.running
              ? `+${Math.round(snap.focusMs / 60_000)} min focused`
              : "Paused";
      }
    }

    // A collapsed card shows only the header + clock.
    if (cardEl) {
      cardEl.classList.toggle("frs-timer-collapsed-body", this.collapsed);
    }
    el.classList.toggle("frs-timer-collapsed", this.collapsed);

    if (startBtn) {
      const startDisabled = snap.phase === "work" && !snap.running;
      startBtn.disabled = startDisabled;
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
    const controls = el.querySelector(".frs-timer-controls");
    if (!controls) return;

    // Control presses must never start a header drag.
    this.host.registerDomEvent(controls, "pointerdown", (e: Event) => e.stopPropagation());
    this.host.registerDomEvent(controls, "click", (e: MouseEvent) => {
      const btn = (e.target as HTMLElement | null)?.closest?.(".frs-btn");
      if (!btn) return;
      e.stopPropagation();
      this.host.onControl(btn.getAttribute("data-action") as TimerControlAction);
    });
  }

  private bindDrag(el: HTMLElement): void {
    const header = el.querySelector<HTMLElement>(".frs-timer-header");
    if (!header) return;

    const register = (type: string, cb: (e: any) => void, options?: any) =>
      this.host.registerDomEvent(header, type, cb, options);

    register("pointerdown", (e: PointerEvent) => {
      if (e.button !== undefined && e.button !== 0) return;
      this.dragging = true;
      this.dragPointerId = e.pointerId;

      const rect = el.getBoundingClientRect();
      this.dragOffsetX = e.clientX - rect.left;
      this.dragOffsetY = e.clientY - rect.top;
      el.classList.add("frs-dragging");

      // Pin to the current position by switching from the corner anchor to
      // explicit left/top before moving.
      el.style.right = "auto";
      el.style.left = `${rect.left}px`;
      el.style.top = `${rect.top}px`;

      try {
        header.setPointerCapture(e.pointerId);
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
        rect.height || 150
      );
      el.style.left = `${Math.round(x)}px`;
      el.style.top = `${Math.round(y)}px`;
      e.preventDefault();
    });

    const endDrag = (e: PointerEvent) => {
      if (!this.dragging || e.pointerId !== this.dragPointerId) return;
      this.finishDrag(header, e.pointerId);
    };
    register("pointerup", endDrag);
    register("pointercancel", endDrag);
    register("lostpointercapture", (e: PointerEvent) => {
      if (this.dragging && e.pointerId === this.dragPointerId) {
        this.finishDrag(header, e.pointerId);
      }
    });

    register("contextmenu", (e: Event) => {
      if (this.dragging) e.preventDefault();
    });

    /* ---- Collapse: double-click (desktop) + double-tap (touch) ---- */

    register("dblclick", () => this.toggleCollapsed());

    register("pointerup", (e: PointerEvent) => {
      if (e.pointerType === "touch") this.maybeDoubleTap(e);
    });
  }

  private finishDrag(header: HTMLElement, pointerId: number): void {
    this.dragging = false;
    this.dragPointerId = null;
    this.el?.classList.remove("frs-dragging");
    try {
      header.releasePointerCapture(pointerId);
    } catch {
      /* pointer already released */
    }
    const rect = this.el?.getBoundingClientRect();
    if (rect) {
      this.host.savePosition(Math.round(rect.left), Math.round(rect.top));
    }
  }

  /** Manual double-tap detection (dblclick does not fire reliably on touch). */
  private maybeDoubleTap(e: PointerEvent): void {
    const now = Date.now();
    const isDoubleTap =
      now - this.lastHeaderTapAt < 320 &&
      Math.abs(e.clientX - this.lastHeaderTapX) < 30 &&
      Math.abs(e.clientY - this.lastHeaderTapY) < 30;
    this.lastHeaderTapAt = now;
    this.lastHeaderTapX = e.clientX;
    this.lastHeaderTapY = e.clientY;
    if (isDoubleTap) {
      this.lastHeaderTapAt = 0; // avoid triple-tap chaining
      this.toggleCollapsed();
    }
  }

  toggleCollapsed(): void {
    this.collapsed = !this.collapsed;
    if (this.el) {
      this.el.classList.toggle("frs-timer-collapsed", this.collapsed);
      const body = this.el.querySelector(".frs-timer-body");
      body?.classList.toggle("frs-timer-collapsed-body", this.collapsed);
    }
  }

  get isCollapsed(): boolean {
    return this.collapsed;
  }

  /* ------------------------------------------------------------------ */
  /* Auto-hide                                                           */
  /* ------------------------------------------------------------------ */

  /** Un-dims the widget and restarts the auto-hide countdown. */
  poke(): void {
    if (!this.el) return;
    this.el.classList.remove("frs-dimmed");
    this.resetAutoHide();
  }

  resetAutoHide(): void {
    const s = this.host.getSettings();
    if (this.autoHideTimer !== null) {
      clearTimeout(this.autoHideTimer);
      this.autoHideTimer = null;
    }
    if (!s.autoHide) return;
    this.autoHideTimer = window.setTimeout(() => {
      if (this.el && !this.dragging) this.el.classList.add("frs-dimmed");
    }, s.autoHideSeconds * 1000);
  }

  cancelAutoHide(): void {
    if (this.autoHideTimer !== null) {
      clearTimeout(this.autoHideTimer);
      this.autoHideTimer = null;
    }
  }
}
