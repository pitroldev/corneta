import { describe, expect, it } from "vitest";
import { rehearsalTested, rehearsalVerdict } from "./rehearsal";
import type { RehearsalReport, RehearsalTarget } from "./types";

const target = (patch: Partial<RehearsalTarget> = {}): RehearsalTarget => ({
  targetId: "tgt_a1",
  platformId: "twitch",
  name: "Twitch",
  route: "bandwidthTest",
  outcome: "received",
  ...patch,
});
const report = (patch: Partial<RehearsalReport> = {}): RehearsalReport => ({
  phase: "done",
  obsStarted: true,
  signalArrived: true,
  hasAudio: true,
  secondsLeft: 0,
  targets: [target()],
  cancelled: false,
  ...patch,
});

describe("rehearsalVerdict", () => {
  it("passes when the signal arrived and every tested platform received it", () => {
    expect(rehearsalVerdict(report())).toBe("passed");
  });

  it("does not let a skipped platform decide the verdict", () => {
    const skipped = target({ route: null, outcome: "skipped" });
    expect(rehearsalTested(skipped)).toBe(false);
    expect(rehearsalVerdict(report({ targets: [target(), skipped] }))).toBe(
      "passed",
    );
    expect(rehearsalVerdict(report({ targets: [skipped] }))).toBe("passed");
  });

  it("passes with notes on a platform warning or a signal without sound", () => {
    expect(
      rehearsalVerdict(report({ targets: [target({ outcome: "warned" })] })),
    ).toBe("passedWithNotes");
    expect(rehearsalVerdict(report({ hasAudio: false }))).toBe(
      "passedWithNotes",
    );
  });

  it("fails when a tested platform refused or dropped the stream", () => {
    for (const outcome of ["refused", "failed"] as const)
      expect(rehearsalVerdict(report({ targets: [target({ outcome })] }))).toBe(
        "failed",
      );
  });

  it("names a missing OBS signal and a cancelled run before anything else", () => {
    expect(
      rehearsalVerdict(
        report({
          signalArrived: false,
          targets: [target({ outcome: "failed" })],
        }),
      ),
    ).toBe("noSignal");
    expect(rehearsalVerdict(report({ cancelled: true }))).toBe("cancelled");
  });
});
