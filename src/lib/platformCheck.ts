import type { PlatformCheck, PlatformIssue } from "./types";

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
