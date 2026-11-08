import { describe, it, expect } from "vitest";
import { clampToViewport, getViewportSize, createRafScheduler } from "../src/viewport";
import { setViewport } from "./dom-helpers";

describe("getViewportSize", () => {
  it("reports innerWidth/innerHeight", () => {
    setViewport(1280, 720);
    expect(getViewportSize()).toEqual({ width: 1280, height: 720 });
  });
});

describe("clampToViewport", () => {
  it("keeps in-range positions untouched", () => {
    setViewport(1000, 800);
    expect(clampToViewport(100, 200, 220, 140)).toEqual({ x: 100, y: 200 });
  });

  it("clamps off-screen positions back into view (the mobile off-screen bug)", () => {
    setViewport(390, 700); // phone
    // A position saved on a 1920px desktop screen:
    const { x, y } = clampToViewport(1187, 162, 220, 140);
    expect(x).toBe(390 - 220); // fully visible on the right edge
    expect(y).toBe(162);
  });

  it("clamps negative positions to 0", () => {
    setViewport(800, 600);
    expect(clampToViewport(-50, -20, 100, 100)).toEqual({ x: 0, y: 0 });
  });

  it("handles elements larger than the viewport without NaN", () => {
    setViewport(200, 300);
    const { x, y } = clampToViewport(500, 500, 400, 500);
    expect(Number.isFinite(x)).toBe(true);
    expect(Number.isFinite(y)).toBe(true);
    expect(x).toBe(0);
    expect(y).toBe(0);
  });
});

describe("createRafScheduler", () => {
  it("coalesces multiple calls into one rAF flush", async () => {
    const runs: number[] = [];
    const schedule = createRafScheduler();
    schedule(() => runs.push(1));
    schedule(() => runs.push(2));
    schedule(() => runs.push(3));
    expect(runs).toEqual([]); // nothing runs synchronously
    await new Promise((r) => setTimeout(r, 30));
    // Only the LAST scheduled callback runs — coalesced.
    expect(runs).toEqual([3]);
  });
});
