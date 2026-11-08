/**
 * Focus Read Suite — the lifecycle hub.
 *
 * Every DOM listener, interval, timeout, Obsidian event ref and unload hook
 * in the entire plugin is registered through this hub, which delegates to
 * Obsidian's Plugin#registerDomEvent / registerInterval / registerEvent /
 * register APIs. Obsidian tears all of it down automatically when the plugin
 * is disabled or reloaded — modules never call raw addEventListener /
 * setInterval, so no module can leak.
 *
 * It also tracks what was registered (for the Advanced → diagnostics view
 * and for tests asserting zero leftovers after unload).
 */

import { logger } from "./logger";

export type DomEventOptions = boolean | AddEventListenerOptions;

export interface LifecycleStats {
  domEvents: number;
  intervals: number;
  eventRefs: number;
  unloadHooks: number;
}

export interface LifecycleHost {
  registerDomEvent(el: any, type: string, cb: (e: any) => any, options?: DomEventOptions): void;
  registerInterval(id: number): number;
  registerEvent(ref: any): void;
  register(cb: () => any): void;
}

export class LifecycleHub {
  private host: LifecycleHost;

  /** Records for diagnostics/tests. */
  readonly domEvents: Array<{ el: any; type: string; cb: any }> = [];
  readonly intervals: number[] = [];
  readonly unloadHooks: Array<() => any> = [];

  constructor(host: LifecycleHost) {
    this.host = host;
  }

  /** Registers a DOM listener that is auto-removed on unload. */
  domEvent(el: any, type: string, cb: (e: any) => any, options?: DomEventOptions): void {
    if (!el) {
      logger.warn(`domEvent(${type}) called with a null element — ignored.`);
      return;
    }
    this.host.registerDomEvent(el, type, cb, options);
    this.domEvents.push({ el, type, cb });
  }

  /** Registers an Obsidian event ref (workspace/vault events). */
  event(ref: any): void {
    this.host.registerEvent(ref);
  }

  /** Runs `fn` on an interval that is auto-cleared on unload. */
  every(ms: number, fn: () => void): number {
    const id = window.setInterval(fn, ms);
    this.host.registerInterval(id);
    this.intervals.push(id);
    return id;
  }

  /** Registers an interval id created elsewhere (parity with legacy code). */
  interval(id: number): number {
    this.host.registerInterval(id);
    this.intervals.push(id);
    return id;
  }

  /** Runs `fn` once after `ms` — cleared automatically on unload. */
  later(ms: number, fn: () => void): number {
    const id = window.setTimeout(fn, ms);
    const clear = () => clearTimeout(id);
    this.host.register(clear);
    this.unloadHooks.push(clear);
    return id;
  }

  /** Registers a callback that runs when the plugin unloads. */
  onUnload(cb: () => any): void {
    this.host.register(cb);
    this.unloadHooks.push(cb);
  }

  get stats(): LifecycleStats {
    return {
      domEvents: this.domEvents.length,
      intervals: this.intervals.length,
      eventRefs: -1, // refs are opaque; not tracked individually
      unloadHooks: this.unloadHooks.length,
    };
  }
}
