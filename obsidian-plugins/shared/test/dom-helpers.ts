/**
 * Shared DOM/event test helpers used by all plugin test suites.
 */

/** Dispatches a pointer-ish event with the given properties. */
export function firePointer(
  el: Element | Window | Document,
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel" | "pointerover" | "pointerout",
  props: {
    clientX?: number;
    clientY?: number;
    button?: number;
    buttons?: number;
    pointerId?: number;
    pointerType?: string;
    isPrimary?: boolean;
  } = {}
): void {
  const target = el as any;
  const win = (target as any).window ?? target.defaultView ?? globalThis as any;
  const Ctor: any =
    (typeof win !== "undefined" && win.PointerEvent) ||
    (globalThis as any).PointerEvent ||
    win?.Event ||
    (globalThis as any).Event;

  let event: any;
  try {
    event = new Ctor(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: props.clientX ?? 0,
      clientY: props.clientY ?? 0,
      button: props.button ?? 0,
      buttons: props.buttons ?? (type === "pointerup" ? 0 : 1),
      pointerId: props.pointerId ?? 1,
      pointerType: props.pointerType ?? "mouse",
      isPrimary: props.isPrimary ?? true,
    });
    // happy-dom's PointerEvent may not accept these in the dict — force them.
    for (const key of ["clientX", "clientY", "pointerId", "pointerType"] as const) {
      if (event[key] !== (props as any)[key] && (props as any)[key] !== undefined) {
        Object.defineProperty(event, key, { value: (props as any)[key], configurable: true });
      }
    }
  } catch {
    event = new (win.Event || (globalThis as any).Event)(type, { bubbles: true, cancelable: true });
    for (const [key, value] of Object.entries({ ...props })) {
      Object.defineProperty(event, key, { value, configurable: true });
    }
  }
  target.dispatchEvent(event);
}

/** Dispatches a mouse event (legacy paths). */
export function fireMouse(
  el: Element | Window | Document,
  type: "mousemove" | "mousedown" | "mouseup" | "click" | "dblclick",
  props: { clientX?: number; clientY?: number; button?: number } = {}
): void {
  const target = el as any;
  const win = target.window ?? target.defaultView ?? (globalThis as any);
  const Ctor: any = win.MouseEvent || win.Event || (globalThis as any).MouseEvent;
  const event = new Ctor(type, {
    bubbles: true,
    cancelable: true,
    clientX: props.clientX ?? 0,
    clientY: props.clientY ?? 0,
    button: props.button ?? 0,
  });
  target.dispatchEvent(event);
}

/** Overrides getBoundingClientRect on an element. */
export function mockRect(el: Element, rect: { x?: number; y?: number; top?: number; left?: number; width?: number; height?: number; right?: number; bottom?: number }): void {
  (el as any).getBoundingClientRect = () => ({
    x: rect.x ?? rect.left ?? 0,
    y: rect.y ?? rect.top ?? 0,
    top: rect.top ?? 0,
    left: rect.left ?? 0,
    width: rect.width ?? 0,
    height: rect.height ?? 0,
    right: rect.right ?? (rect.left ?? 0) + (rect.width ?? 0),
    bottom: rect.bottom ?? (rect.top ?? 0) + (rect.height ?? 0),
    toJSON: () => ({}),
  });
}

/** Sets the reported viewport size (happy-dom default is 1024x768). */
export function setViewport(width: number, height: number): void {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
}

/** Advances fake timers and flushes pending microtasks/promises. */
export async function advance(ms: number): Promise<void> {
  await Promise.all([vi.advanceTimersByTimeAsync(ms)]);
}
