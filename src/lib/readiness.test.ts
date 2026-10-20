import { describe, expect, it } from "vitest";
import { makeTarget } from "./factory";
import {
  joinNames,
  obsConfigured,
  readiness,
  targetBlockers,
  youtubeAutoTargetId,
} from "./readiness";
import type { PlatformId, Target } from "./types";

function target(platformId: PlatformId, patch: Partial<Target> = {}): Target {
  return { ...makeTarget(platformId), ...patch };
}

const MANUAL = { youtubeAuto: false };
const AUTO = { youtubeAuto: true };

describe("readiness", () => {
  it("splits enabled targets into ready and pending, ignoring disabled ones", () => {
    const twitch = target("twitch", { hasKey: true });
    const youtube = target("youtube");
    const kick = target("kick", { enabled: false });
    const r = readiness([twitch, youtube, kick], MANUAL);
    expect(r.enabled.map((t) => t.id)).toEqual([twitch.id, youtube.id]);
    expect(r.ready.map((t) => t.id)).toEqual([twitch.id]);
    expect(r.pending).toEqual([{ target: youtube, issues: ["noKey"] }]);
  });

  it("lets automatic YouTube start without a pasted key", () => {
    const youtube = target("youtube");
    expect(targetBlockers(youtube, [youtube], AUTO)).toEqual([]);
    expect(targetBlockers(youtube, [youtube], MANUAL)).toEqual(["noKey"]);
  });

  it("exempts only the first enabled YouTube target, the one start provisions", () => {
    const off = target("youtube", { enabled: false });
    const first = target("youtube");
    const second = target("youtube");
    const all = [off, first, second];
    expect(youtubeAutoTargetId(all, AUTO)).toBe(first.id);
    expect(targetBlockers(first, all, AUTO)).toEqual([]);
    expect(targetBlockers(second, all, AUTO)).toEqual(["noKey"]);
  });

  it("keeps URL problems blocking for automatic YouTube", () => {
    const youtube = target("youtube", { ingestUrl: "not a url" });
    expect(targetBlockers(youtube, [youtube], AUTO)).toEqual(["badUrl"]);
  });

  it("never exempts other platforms", () => {
    const kick = target("kick", { ingestUrl: "rtmps://example.test/app" });
    expect(targetBlockers(kick, [kick], AUTO)).toEqual(["noKey"]);
    expect(youtubeAutoTargetId([kick], AUTO)).toBeNull();
  });
});

describe("obsConfigured", () => {
  const check = {
    reachable: true,
    pointingAtCorneta: true,
  } as Parameters<typeof obsConfigured>[0];
  it("needs a finished check that reaches OBS and points it here", () => {
    expect(obsConfigured(check)).toBe(true);
    expect(obsConfigured(null)).toBe(false);
    expect(obsConfigured("loading")).toBe(false);
    expect(
      obsConfigured({
        ...(check as object),
        pointingAtCorneta: false,
      } as Parameters<typeof obsConfigured>[0]),
    ).toBe(false);
  });
});

describe("joinNames", () => {
  const t = ((key: string, vars?: Record<string, string>) =>
    key === "golive.list.join"
      ? `${vars?.head} e ${vars?.last}`
      : key) as Parameters<typeof joinNames>[1];
  it("reads like a sentence", () => {
    expect(joinNames([], t)).toBe("");
    expect(joinNames(["Twitch"], t)).toBe("Twitch");
    expect(joinNames(["Twitch", "YouTube"], t)).toBe("Twitch e YouTube");
    expect(joinNames(["Twitch", "YouTube", "Kick"], t)).toBe(
      "Twitch, YouTube e Kick",
    );
  });
});
