import { describe, expect, it } from "vitest";
import { describePlatformCheck, issueTopic } from "./platformCheck";

describe("platform check line", () => {
  it("confirms a healthy live and ignores informational notes", () => {
    expect(describePlatformCheck({ state: "confirmed" })).toEqual({
      kind: "confirmed",
    });
    expect(
      describePlatformCheck({
        state: "confirmed",
        health: "good",
        issues: [{ kind: "bitrateLow", severity: "info" }],
      }),
    ).toEqual({ kind: "confirmed" });
  });

  it("explains the most severe issue the platform reports", () => {
    expect(
      describePlatformCheck({
        state: "confirmed",
        health: "ok",
        issues: [
          { kind: "audioBitrateLow", severity: "warning" },
          { kind: "gopSizeLong", severity: "error" },
        ],
      }),
    ).toEqual({ kind: "confirmedWithIssue", topic: "keyframes" });
  });

  it("calls out a bad grade even without a listed issue", () => {
    expect(
      describePlatformCheck({ state: "confirmed", health: "bad" }),
    ).toEqual({
      kind: "confirmedWithIssue",
      topic: "signal",
    });
  });

  it("says when the platform does not show the live", () => {
    expect(
      describePlatformCheck({ state: "notLive", health: "noData" }),
    ).toEqual({ kind: "notLive" });
  });

  it("groups platform issue tokens into topics it can word", () => {
    expect(issueTopic("bitrateLow")).toBe("bitrateLow");
    expect(issueTopic("bitrateHigh")).toBe("bitrateHigh");
    expect(issueTopic("gopSizeOver")).toBe("keyframes");
    expect(issueTopic("openGop")).toBe("keyframes");
    expect(issueTopic("framerateMismatch")).toBe("frameRate");
    expect(issueTopic("videoResolutionSuboptimal")).toBe("resolution");
    expect(issueTopic("videoIngestionStarved")).toBe("slowUpload");
    expect(issueTopic("audioSampleRate")).toBe("audio");
    expect(issueTopic("noAudioStream")).toBe("audio");
    expect(issueTopic("somethingNew")).toBe("other");
  });
});
