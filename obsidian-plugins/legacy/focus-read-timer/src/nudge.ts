/**
 * Focus Read: Timer & Nudge — the idle nudge.
 *
 * Fix vs. the original: dismissing the nudge used to be pointless — the
 * 5-second idle check re-created it immediately. Dismissal now snoozes the
 * nudge for a while (2x the idle threshold, min 60 s), and any real input
 * activity cancels the snooze.
 */

const NUDGE_ID = "frt-adhd-nudge";

export interface NudgeHost {
  registerDomElement(el: Element, type: string, callback: (e: any) => void, options?: any): void;
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

    // Snooze after an explicit dismissal.
    if (this.dismissedAt !== null) {
      const snoozeMs = Math.max(threshold * 2, 60_000);
      if (at - this.dismissedAt < snoozeMs) return;
      this.dismissedAt = null; // snooze expired
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
    nudge.className = "frt-adhd-nudge";

    const remaining = this.host.getWorkRemainingMs();
    const body =
      remaining !== null && remaining > 0
        ? `Continue? ${Math.ceil(remaining / 60_000)} min left in session.`
        : `You've been idle for ${Math.round(this.idleThresholdMs() / 1000)}s. Get back to reading?`;

    nudge.innerHTML = `
      <div class="frt-nudge-title">You stopped reading.</div>
      <div class="frt-nudge-body">${body}</div>
      <div class="frt-nudge-actions">
        <button class="frt-nudge-continue">Continue</button>
        <button class="frt-nudge-dismiss">Dismiss</button>
      </div>`;

    document.body.appendChild(nudge);
    this.visible = true;

    const continueBtn = nudge.querySelector(".frt-nudge-continue");
    const dismissBtn = nudge.querySelector(".frt-nudge-dismiss");
    if (continueBtn) {
      this.host.registerDomElement(continueBtn, "click", () => {
        this.host.onContinue();
        this.noteInputActivity();
      });
    }
    if (dismissBtn) {
      this.host.registerDomElement(dismissBtn, "click", () => {
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
