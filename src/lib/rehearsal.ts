import type { RehearsalReport, RehearsalTarget } from "./types";

export type RehearsalVerdict =
  "passed" | "passedWithNotes" | "noSignal" | "failed" | "cancelled";

/** A destination the rehearsal actually sent to, as opposed to one it had no private way to test. */
export function rehearsalTested(target: RehearsalTarget): boolean {
  return target.route !== null && target.outcome !== "skipped";
}

/**
 * One sentence for the whole rehearsal. A warning or a silent signal still passes: the stream got
 * there, and the note says what Corneta or the streamer should adjust.
 */
export function rehearsalVerdict(report: RehearsalReport): RehearsalVerdict {
  if (report.cancelled) return "cancelled";
  if (!report.signalArrived) return "noSignal";
  const tested = report.targets.filter(rehearsalTested);
  if (
    tested.some(
      (target) => target.outcome === "refused" || target.outcome === "failed",
    )
  )
    return "failed";
  if (tested.some((target) => target.outcome === "warned") || !report.hasAudio)
    return "passedWithNotes";
  return "passed";
}
