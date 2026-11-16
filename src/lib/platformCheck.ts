import type { EncodingAction, PlatformCheck, PlatformIssue } from "./types";

export type PlatformIssueTopic =
  | "bitrateLow"
  | "bitrateHigh"
  | "keyframes"
  | "frameRate"
  | "resolution"
  | "slowUpload"
  | "audio"
  | "signal"
  | "other";

/** Groups a platform's issue token into something the destination row can explain. */
export function issueTopic(kind: string): PlatformIssueTopic {
  if (kind === "bitrateLow" || kind === "videoBitrateLow") return "bitrateLow";
  if (kind === "bitrateHigh" || kind === "videoBitrateHigh")
    return "bitrateHigh";
  if (/^gop|^openGop/i.test(kind)) return "keyframes";
  if (/frame ?rate/i.test(kind)) return "frameRate";
  if (/resolution/i.test(kind)) return "resolution";
  if (/ingestionStarved/i.test(kind)) return "slowUpload";
  if (/^audio|^noAudio/i.test(kind)) return "audio";
  return "other";
}

const SEVERITY: Record<PlatformIssue["severity"], number> = {
  info: 0,
  warning: 1,
  error: 2,
};

export type PlatformCheckLine =
  | { kind: "confirmed" }
  | { kind: "confirmedWithIssue"; topic: PlatformIssueTopic }
  | { kind: "notLive" };

export type ObsGuide =
  "keyframes" | "bitrate" | "frameRate" | "resolution" | "audio" | "other";

/** The OBS setting behind a topic; connection trouble has none. */
export function obsGuide(topic: PlatformIssueTopic): ObsGuide | null {
  if (topic === "slowUpload" || topic === "signal") return null;
  if (topic === "bitrateLow" || topic === "bitrateHigh") return "bitrate";
  return topic;
}

export type PlatformFix =
  /** The destination copies OBS's signal: re-encoding it in Corneta fixes the warning now. */
  | { kind: "reencode"; guide: ObsGuide }
  /** Already re-encoded on request; the platform may keep the old warning for a while. */
  | { kind: "reencoded"; guide: ObsGuide | null }
  /** Corneta already encodes it, so the destination's preset decides. */
  | { kind: "preset" }
  | { kind: "none" };

/** What a destination row can offer for the platform's warning. */
export function platformFix(
  line: PlatformCheckLine | null,
  action: EncodingAction,
  reencoded: boolean,
  fixedGuide: ObsGuide | null = null,
): PlatformFix {
  const guide =
    line?.kind === "confirmedWithIssue" ? obsGuide(line.topic) : null;
  if (reencoded) return { kind: "reencoded", guide: guide ?? fixedGuide };
  if (!guide) return { kind: "none" };
  return action === "copy" ? { kind: "reencode", guide } : { kind: "preset" };
}

/** What a destination row says about the platform's own view of the live. */
export function describePlatformCheck(check: PlatformCheck): PlatformCheckLine {
  if (check.state === "notLive") return { kind: "notLive" };
  const worst = (check.issues ?? [])
    .filter((issue) => issue.severity !== "info")
    .sort((a, b) => SEVERITY[b.severity] - SEVERITY[a.severity])[0];
  if (worst)
    return { kind: "confirmedWithIssue", topic: issueTopic(worst.kind) };
  if (check.health === "bad")
    return { kind: "confirmedWithIssue", topic: "signal" };
  return { kind: "confirmed" };
}
