import { describe, it, expect, beforeEach } from "vitest";
import { NudgeController } from "../src/nudge";

function createController(thresholdMs = 60_000) {
  let now = 1_000_000;
  const controller = new NudgeController(
    {
      registerDomElement: (el: any, type: string, cb: any) => el.addEventListener(type, cb),
      getWorkRemainingMs: () => null,
      onContinue: () => {},
    },
    () => thresholdMs,
    () => now
  );
  return {
    controller,
    advance: (ms: number) => {
      now += ms;
      return now;
    },
    now: () => now,
  };
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("NudgeController", () => {
  it("shows the nudge once the idle threshold is crossed", () => {
    const { controller, advance } = createController(60_000);
    controller.checkIdle(advance(30_000));
    expect(document.getElementById("frt-adhd-nudge")).toBeNull();

    controller.checkIdle(advance(40_000)); // 70s idle
    const nudge = document.getElementById("frt-adhd-nudge");
    expect(nudge).not.toBeNull();
    expect(nudge!.textContent).toContain("idle for 60s");
  });

  it("shows remaining session time when a work session is running", () => {
    let remaining = 5 * 60_000;
    let now = 1_000_000;
    const controller = new NudgeController(
      {
        registerDomElement: (el: any, type: string, cb: any) => el.addEventListener(type, cb),
        getWorkRemainingMs: () => remaining,
        onContinue: () => {},
      },
      () => 60_000,
      () => now
    );
    now += 70_000;
    controller.checkIdle();
    const nudge = document.getElementById("frt-adhd-nudge")!;
    expect(nudge.textContent).toContain("5 min left");
    void remaining;
  });

  it("dismissal snoozes instead of re-appearing every 5 seconds (the old bug)", () => {
    const { controller, advance } = createController(60_000);
    controller.checkIdle(advance(70_000));
    expect(document.getElementById("frt-adhd-nudge")).not.toBeNull();

    const dismiss = document.querySelector<HTMLButtonElement>(".frt-nudge-dismiss")!;
    dismiss.click();
    expect(document.getElementById("frt-adhd-nudge")).toBeNull();

    // 5 seconds later (the old idle-check period): still hidden.
    controller.checkIdle(advance(5_000));
    expect(document.getElementById("frt-adhd-nudge")).toBeNull();

    // 30 more seconds: still snoozed (snooze = max(2x threshold, 60s)).
    controller.checkIdle(advance(30_000));
    expect(document.getElementById("frt-adhd-nudge")).toBeNull();
  });

  it("the snooze eventually expires and the nudge can return", () => {
    const { controller, advance } = createController(60_000);
    controller.checkIdle(advance(70_000));
    document.querySelector<HTMLButtonElement>(".frt-nudge-dismiss")!.click();

    // Snooze is max(2*60s, 60s) = 120s.
    controller.checkIdle(advance(125_000));
    expect(document.getElementById("frt-adhd-nudge")).not.toBeNull();
  });

  it("any real input activity hides the nudge and resets the snooze", () => {
    const { controller, advance, now } = createController(60_000);
    controller.checkIdle(advance(70_000));
    expect(document.getElementById("frt-adhd-nudge")).not.toBeNull();

    controller.noteInputActivity(now());
    expect(document.getElementById("frt-adhd-nudge")).toBeNull();

    // Idle again past threshold -> shows again (no stale snooze).
    controller.checkIdle(advance(65_000));
    expect(document.getElementById("frt-adhd-nudge")).not.toBeNull();
  });

  it("continue button hides the nudge and records activity", () => {
    const { controller, advance } = createController(60_000);
    controller.checkIdle(advance(70_000));

    const before = (controller as any).lastInputActivityAt;
    document.querySelector<HTMLButtonElement>(".frt-nudge-continue")!.click();
    expect(document.getElementById("frt-adhd-nudge")).toBeNull();
    const after = (controller as any).lastInputActivityAt;
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it("does not stack multiple nudges", () => {
    const { controller, advance } = createController(60_000);
    controller.checkIdle(advance(70_000));
    controller.checkIdle(advance(75_000));
    controller.checkIdle(advance(80_000));
    expect(document.querySelectorAll("#frt-adhd-nudge").length).toBe(1);
  });

  it("destroy removes the nudge", () => {
    const { controller, advance } = createController(60_000);
    controller.checkIdle(advance(70_000));
    controller.destroy();
    expect(document.getElementById("frt-adhd-nudge")).toBeNull();
  });
});
