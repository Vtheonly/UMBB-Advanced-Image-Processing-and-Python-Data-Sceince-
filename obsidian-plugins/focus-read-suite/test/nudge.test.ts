/**
 * Idle nudge: threshold, snooze after dismissal, input activity resets.
 */
import { describe, it, expect, vi } from "vitest";
import { NudgeController } from "../src/modules/timer/NudgeController";
import "../test/helpers/dom-setup";

function makeController(thresholdMs = 60_000) {
  const host = {
    registerDomEvent: vi.fn(),
    getWorkRemainingMs: vi.fn(() => null as number | null),
    onContinue: vi.fn(),
  };
  let clock = 0;
  const controller = new NudgeController(host, () => thresholdMs, () => clock);
  return { host, controller, advance: (ms: number) => (clock += ms) };
}

describe("NudgeController", () => {
  it("does not show before the idle threshold", () => {
    const { controller, advance } = makeController(60_000);
    advance(59_999);
    controller.checkIdle();
    expect(controller.is_visible).toBe(false);
  });

  it("shows after the idle threshold", () => {
    const { controller, advance } = makeController(60_000);
    advance(60_001);
    controller.checkIdle();
    expect(controller.is_visible).toBe(true);
    expect(document.getElementById("frs-nudge")).not.toBeNull();
  });

  it("shows session time remaining when a session is running", () => {
    const { host, controller, advance } = makeController();
    host.getWorkRemainingMs.mockReturnValue(5 * 60_000);
    advance(120_000);
    controller.checkIdle();
    const body = document.getElementById("frs-nudge")!.textContent ?? "";
    expect(body).toContain("Continue?");
    expect(body).toContain("5 min left");
  });

  it("dismissal snoozes for max(2x threshold, 60s)", () => {
    const { controller, advance } = makeController(10_000); // snooze = 60s
    advance(20_000);
    controller.checkIdle();
    expect(controller.is_visible).toBe(true);
    controller.hide();
    controller.dismissedAt = 20_000; // simulate the dismiss click

    advance(59_000);
    controller.checkIdle();
    expect(controller.is_visible).toBe(false); // still snoozed

    advance(2_000); // 61s after dismissal
    controller.checkIdle();
    expect(controller.is_visible).toBe(true);
  });

  it("input activity hides the nudge and cancels the snooze", () => {
    const { controller, advance } = makeController(10_000);
    advance(20_000);
    controller.checkIdle();
    expect(controller.is_visible).toBe(true);

    controller.noteInputActivity(21_000); // real input
    expect(controller.is_visible).toBe(false);
    expect(controller.dismissedAt).toBeNull();

    advance(5_000); // only 4s since input — below the 10s threshold
    controller.checkIdle();
    expect(controller.is_visible).toBe(false);
  });

  it("destroy removes the card", () => {
    const { controller, advance } = makeController();
    advance(120_000);
    controller.checkIdle();
    controller.destroy();
    expect(document.getElementById("frs-nudge")).toBeNull();
  });
});
