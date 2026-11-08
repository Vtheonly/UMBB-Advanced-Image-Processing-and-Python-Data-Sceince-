/**
 * Heatmap of Notes — user activity monitor.
 *
 * Uses pointer events (mouse + pen + touch in one API) instead of the old
 * mouse/touch/click trio. Every listener is registered through the plugin's
 * lifecycle (`registerDomElement`), so nothing leaks on unload.
 */

import { logger } from "./logger";

export type ActivityEventName =
  | "pointermove"
  | "pointerdown"
  | "keydown"
  | "wheel"
  | "scroll"
  | "visibilitychange";

const WINDOW_EVENTS: ActivityEventName[] = ["pointermove", "pointerdown", "keydown", "wheel", "scroll"];

export class ActivityMonitor {
  private idleThresholdMs: number;
  private lastActivityAt = Date.now();
  private register: (el: any, type: string, cb: (e: any) => void, options?: any) => void;

  constructor(
    registerDomElement: (el: any, type: string, cb: (e: any) => void, options?: any) => void,
    idleThresholdSeconds: number
  ) {
    this.register = registerDomElement;
    this.idleThresholdMs = idleThresholdSeconds * 1000;
  }

  setIdleThreshold(seconds: number): void {
    this.idleThresholdMs = seconds * 1000;
    logger.debug(`Idle threshold updated to ${seconds}s.`);
  }

  start(): void {
    this.recordActivity();
    const handler = () => this.recordActivity();
    for (const evt of WINDOW_EVENTS) {
      this.register(window, evt, handler, { passive: true });
    }
    // Registered on document via the same lifecycle-managed path (the
    // original attached this with a raw addEventListener and leaked it).
    this.register(document, "visibilitychange", handler);
    logger.debug("ActivityMonitor listeners registered successfully.");
  }

  recordActivity(): void {
    this.lastActivityAt = Date.now();
  }

  isUserActive(now: number = Date.now()): boolean {
    if (typeof document !== "undefined" && document.hidden) return false;
    return now - this.lastActivityAt < this.idleThresholdMs;
  }
}
