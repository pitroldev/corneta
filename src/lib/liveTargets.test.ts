import { describe, expect, it } from "vitest";
import { makeTarget } from "./factory";
import { liveTargetRows, liveTargetsSignature } from "./liveTargets";
import type { TargetStatus } from "./types";

const status = (
  targetId: string,
  name: string,
  platformId: string,
  state: TargetStatus["state"] = "live",
): TargetStatus => ({
  targetId,
  name,
  platformId,
  action: "copy",
  state,
  bitrateKbps: 6000,
  fps: 60,
  droppedFrames: 0,
  uptimeSec: 10,
});

describe("live destination rows", () => {
  it("lists what the engine streams, even after the config drops a destination", () => {
    const twitch = { ...makeTarget("twitch"), id: "a" };
    const kick = { ...makeTarget("kick"), id: "b", enabled: false };
    const youtube = { ...makeTarget("youtube"), id: "c" };
    const signature = liveTargetsSignature({
      c: status("c", "YouTube", "youtube"),
      b: status("b", "Kick", "kick"),
      a: status("a", "Twitch", "twitch"),
    });
    expect(liveTargetRows(signature, [twitch, kick, youtube])).toEqual([
      { id: "a", name: "Twitch", platformId: "twitch" },
      { id: "b", name: "Kick", platformId: "kick" },
      { id: "c", name: "YouTube", platformId: "youtube" },
    ]);
    expect(liveTargetRows(signature, [youtube])).toEqual([
      { id: "c", name: "YouTube", platformId: "youtube" },
      { id: "a", name: "Twitch", platformId: "twitch" },
      { id: "b", name: "Kick", platformId: "kick" },
    ]);
  });

  it("keeps the same signature while only metrics change", () => {
    const before = liveTargetsSignature({
      a: status("a", "Twitch", "twitch", "connecting"),
    });
    const after = liveTargetsSignature({
      a: { ...status("a", "Twitch", "twitch"), bitrateKbps: 5800 },
    });
    expect(after).toBe(before);
  });
});
