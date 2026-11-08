import { describe, it, expect, vi } from "vitest";
import { computeVisibleBuckets, diffVisibleBuckets } from "../src/engine";

describe("computeVisibleBuckets", () => {
  it("covers the whole note when nothing needs scrolling", () => {
    expect(computeVisibleBuckets(0, 1000, 1000, 100)).toEqual({ start: 0, end: 99 });
    expect(computeVisibleBuckets(37, 1000, 1000, 100)).toEqual({ start: 0, end: 99 });
  });

  it("computes partial ranges while scrolled (original boundary semantics preserved)", () => {
    // 50% down a 2x-viewport note: 100 buckets -> [50, 99]
    expect(computeVisibleBuckets(1000, 2000, 1000, 100)).toEqual({ start: 50, end: 99 });
    // 25% down: [25, 75]
    expect(computeVisibleBuckets(500, 2000, 1000, 100)).toEqual({ start: 25, end: 75 });
    // at 0: [0, 50]
    expect(computeVisibleBuckets(0, 2000, 1000, 100)).toEqual({ start: 0, end: 50 });
  });

  it("clamps the end to the last bucket (over-scroll at the bottom)", () => {
    const r = computeVisibleBuckets(1900, 2000, 1000, 100);
    expect(r).toEqual({ start: 95, end: 99 });
  });

  it("returns an empty range for degenerate input", () => {
    expect(computeVisibleBuckets(0, 0, 0, 100)).toEqual({ start: 0, end: -1 });
    expect(computeVisibleBuckets(0, 100, 100, 0)).toEqual({ start: 0, end: -1 });
  });
});

describe("diffVisibleBuckets", () => {
  it("reports only newly visible buckets", () => {
    const prev = new Set([1, 2, 3]);
    const curr = new Set([2, 3, 4, 5]);
    expect(diffVisibleBuckets(curr, prev).sort((a, b) => a - b)).toEqual([4, 5]);
  });

  it("reports everything on first view", () => {
    expect(diffVisibleBuckets(new Set([0, 1]), new Set())).toEqual([0, 1]);
  });

  it("reports nothing when unchanged", () => {
    expect(diffVisibleBuckets(new Set([0, 1]), new Set([0, 1]))).toEqual([]);
  });
});
