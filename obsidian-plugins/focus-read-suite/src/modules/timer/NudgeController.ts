/**
 * Focus Read Suite — the idle nudge ("you stopped reading").
 *
 * Kept behavior: dismissing snoozes the nudge for max(2 × threshold, 60 s);
 * real input activity cancels the snooze. The card uses the unified design
 * system classes.
 */

const NUDGE_ID = "frs-nudge";

export interface NudgeHost {
  registerDomEvent(el: any, type: string, callback: (e: any) => void, options?: any): void;
  /** Remaining ms in the running work session, or null. */
  getWorkRemainingMs(): number | null;
  onContinue(): void;
}

export class NudgeController {
  private host: NudgeHost;
  private visible = false;
  private dismissedAt: number | null = null;
  private idleThresholdMs: () => number;
  private nowMs: () => number;
  private lastInputActivityAt: number;

  constructor(host: NudgeHost, idleThresholdMs: () => number, nowMs: () => number = () => Date.now()) {
    this.host = host;
    this.idleThresholdMs = idleThresholdMs;
    this.nowMs = nowMs;
    this.lastInputActivityAt = nowMs();
  }

  /** Called on real user input (keyboard, taps — not passive scroll). */
  noteInputActivity(at?: number): void {
    this.lastInputActivityAt = at ?? this.nowMs();
    this.dismissedAt = null;
    if (this.visible) this.hide();
  }

  /** Runs on the periodic check; shows the nudge when appropriate. */
  checkIdle(now?: number): void {
    if (this.visible) return;
    const at = now ?? this.nowMs();
    const threshold = this.idleThresholdMs();
    const idleMs = at - this.lastInputActivityAt;
    if (idleMs < threshold) return;

    if (this.dismissedAt !== null) {
      const snoozeMs = Math.max(threshold * 2, 60_000);
      if (at - this.dismissedAt < snoozeMs) return;
      this.dismissedAt = null;
    }

    this.show();
  }

  get is_visible(): boolean {
    return this.visible;
  }

  private show(): void {
    if (this.visible || document.getElementById(NUDGE_ID)) return;

    const nudge = document.createElement("div");
    nudge.id = NUDGE_ID;
    nudge.className = "frs-nudge";
    nudge.setAttribute("role", "alert");

    const remaining = this.host.getWorkRemainingMs();
    const body =
      remaining !== null && remaining > 0
        ? `Continue? ${Math.ceil(remaining / 60_000)} min left in session.`
        : `You've been idle for ${Math.round(this.idleThresholdMs() / 1000)}s. Get back to reading?`;

    nudge.innerHTML = `
      <div class="frs-nudge-title">You stopped reading.</div>
      <div class="frs-nudge-body">${body}</div>
      <div class="frs-nudge-actions">
        <button class="frs-btn frs-btn-primary frs-nudge-continue">Continue</button>
        <button class="frs-btn frs-nudge-dismiss">Dismiss</button>
      </div>`;

    document.body.appendChild(nudge);
    this.visible = true;

    const continueBtn = nudge.querySelector(".frs-nudge-continue");
    const dismissBtn = nudge.querySelector(".frs-nudge-dismiss");
    if (continueBtn) {
      this.host.registerDomEvent(continueBtn, "click", () => {
        this.host.onContinue();
        this.noteInputActivity();
      });
    }
    if (dismissBtn) {
      this.host.registerDomEvent(dismissBtn, "click", () => {
        this.dismissedAt = this.nowMs();
        this.hide();
      });
    }
  }

  hide(): void {
    document.getElementById(NUDGE_ID)?.remove();
    this.visible = false;
  }

  destroy(): void {
    this.hide();
  }
}
