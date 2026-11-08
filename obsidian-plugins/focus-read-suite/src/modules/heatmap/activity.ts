/**
 * Focus Read Suite — heatmap user activity monitor.
 *
 * Uses pointer events (mouse + pen + touch in one API). Every listener is
 * registered through the lifecycle hub, so nothing leaks on unload.
 */

import { logger } from "../../core/logger";

const WINDOW_EVENTS = ["pointermove", "pointerdown", "keydown", "wheel", "scroll"] as const;

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
    this.register(document, "visibilitychange", handler);
    logger.debug("ActivityMonitor listeners registered.");
  }

  recordActivity(): void {
    this.lastActivityAt = Date.now();
  }

  isUserActive(now: number = Date.now()): boolean {
    if (typeof document !== "undefined" && document.hidden) return false;
    return now - this.lastActivityAt < this.idleThresholdMs;
  }
}
