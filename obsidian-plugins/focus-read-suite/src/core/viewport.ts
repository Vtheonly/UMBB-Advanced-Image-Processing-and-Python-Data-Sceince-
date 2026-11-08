/**
 * Focus Read Suite — cross-platform viewport helpers.
 *
 * Shared by every module that positions floating UI (timer widget, reading
 * ruler) and by the heatmap (touch detection). One implementation for
 * desktop and mobile — no duplicated platform code.
 */

export interface ViewportSize {
  width: number;
  height: number;
}

/** Returns the current *visual* viewport size, falling back gracefully. */
export function getViewportSize(): ViewportSize {
  const w =
    typeof window !== "undefined"
      ? window.visualViewport?.width ?? window.innerWidth
      : 1024;
  const h =
    typeof window !== "undefined"
      ? window.visualViewport?.height ?? window.innerHeight
      : 768;
  return { width: Math.max(0, w), height: Math.max(0, h) };
}

/**
 * Clamps a position so an element of the given size stays fully inside the
 * viewport. Keeps widgets reachable after switching between a large desktop
 * screen and a phone.
 */
export function clampToViewport(
  x: number,
  y: number,
  elWidth: number,
  elHeight: number
): { x: number; y: number } {
  const { width, height } = getViewportSize();
  const maxX = Math.max(0, width - elWidth);
  const maxY = Math.max(0, height - elHeight);
  return {
    x: Math.min(Math.max(0, x), maxX),
    y: Math.min(Math.max(0, y), maxY),
  };
}

/** True when the environment has a hover-capable (fine) pointer. */
export function hasHoverPointer(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return true;
  }
  try {
    return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  } catch {
    return true;
  }
}

/** Runs `fn` on the next animation frame, coalescing multiple calls. */
export function createRafScheduler(): (fn: () => void) => void {
  let scheduled = false;
  let pending: (() => void) | null = null;
  return (fn: () => void) => {
    pending = fn;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      const run = pending;
      pending = null;
      run?.();
    });
  };
}

/**
 * Registers the full set of viewport-change events (resize, orientation
 * change, visualViewport resize) through a single registration callback.
 * Used by every module that must re-clamp positions when the screen changes.
 */
export function registerViewportChangeHandlers(
  register: (target: EventTarget, type: string, cb: () => void) => void,
  handler: () => void
): void {
  register(window, "resize", handler);
  register(window, "orientationchange", handler);
  if (typeof window !== "undefined" && window.visualViewport) {
    register(window.visualViewport, "resize", handler);
  }
}
