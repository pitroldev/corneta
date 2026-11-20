import { describe, it, expect } from "vitest";
import {
  acceptsCodec,
  smartHybridAction,
  effectiveAction,
  lowestCommonDenominator,
  bandFit,
  estimate,
} from "./estimates";
import { defaultConfig, makeTarget } from "./factory";
import type { AppConfig, EncodingMode, PlatformId } from "./types";

function cfg(mode: EncodingMode, platforms: PlatformId[]): AppConfig {
  return {
    ...defaultConfig(),
    mode,
    targets: platforms.map((p) => makeTarget(p)),
  };
}

describe("smartHybridAction / effectiveAction", () => {
  it("copies landscape, transcodes primary portrait, and copies dedicated vertical feeds", () => {
    expect(smartHybridAction("twitch")).toBe("copy");
    expect(smartHybridAction("tiktok")).toBe("transcode");
    expect(smartHybridAction("instagram")).toBe("transcode");
    expect(smartHybridAction("tiktok", "h264", "vertical")).toBe("copy");
    expect(smartHybridAction("instagram", "h264", "vertical")).toBe("copy");
  });

  it("applies global mode and explicit hybrid overrides", () => {
    const t = makeTarget("twitch");
    expect(effectiveAction("passthrough", t)).toBe("copy");
    expect(effectiveAction("per-platform", t)).toBe("transcode");
    expect(effectiveAction("hybrid", t)).toBe("copy");
    t.encoding.hybridOverride = "transcode";
    expect(effectiveAction("hybrid", t)).toBe("transcode");

    const v = makeTarget("tiktok");
    v.encoding.sourceFeed = "vertical";
    expect(effectiveAction("hybrid", v)).toBe("copy");
    expect(effectiveAction("per-platform", v)).toBe("transcode");
  });

  it("copies HEVC and AV1 to YouTube and Custom while transcoding H.264-only destinations", () => {
    for (const codec of ["hevc", "av1"] as const) {
      expect(acceptsCodec("youtube", codec)).toBe(true);
      expect(acceptsCodec("custom", codec)).toBe(true);
      expect(smartHybridAction("youtube", codec)).toBe("copy");
      expect(smartHybridAction("custom", codec)).toBe("copy");
      for (const legacy of [
        "twitch",
        "kick",
        "facebook",
        "x",
        "tiktok",
      ] as const) {
        expect(acceptsCodec(legacy, codec)).toBe(false);
        expect(smartHybridAction(legacy, codec)).toBe("transcode");
      }
    }
  });
});

describe("lowestCommonDenominator", () => {
  it("passthrough uses the lowest copied-platform limit", () => {
    const lcd = lowestCommonDenominator(
      cfg("passthrough", ["twitch", "facebook"]),
    );
    expect(lcd.videoKbps).toBe(4000);
    expect(lcd.capBy).toBe("Facebook");
  });

  it("per-platform has no OBS bitrate constraint", () => {
    expect(
      lowestCommonDenominator(cfg("per-platform", ["twitch", "facebook"]))
        .videoKbps,
    ).toBeNull();
  });

  it("ignores disabled destinations", () => {
    const c = cfg("passthrough", ["twitch", "facebook"]);
    c.targets[1].enabled = false;
    expect(lowestCommonDenominator(c).videoKbps).toBe(6000);
  });
});

describe("bandFit", () => {
  it("requires twenty percent headroom for ok", () => {
    expect(bandFit(6000, null)).toBe("unknown");
    expect(bandFit(6000, 7.2)).toBe("ok");
    expect(bandFit(6000, 6.5)).toBe("warn");
    expect(bandFit(6000, 5)).toBe("bad");
  });
});

describe("estimate", () => {
  it("counts copies and transcodes and sums upload", () => {
    const e = estimate(cfg("passthrough", ["twitch", "facebook"]));
    expect(e.enabledCount).toBe(2);
    expect(e.copyCount).toBe(2);
    expect(e.transcodeCount).toBe(0);
  });

  it("per-platform transcodes all destinations and counts hardware only when available", () => {
    const withHw = estimate(cfg("per-platform", ["twitch", "youtube"]), {
      anyHwAvailable: true,
    });
    expect(withHw.transcodeCount).toBe(2);
    expect(withHw.hwTranscodeCount).toBe(2);
    const noHw = estimate(cfg("per-platform", ["twitch", "youtube"]), {
      anyHwAvailable: false,
    });
    expect(noHw.hwTranscodeCount).toBe(0);
    // Load estimation still weights the raw auto encoder as hardware; availability affects session counts only.
    expect(withHw.load).toBeGreaterThan(0);
    expect(noHw.load).toBe(withHw.load);
  });

  it("computes upload and shared GPU session count when OBS sends HEVC or AV1 in hybrid mode", () => {
    const c = cfg("hybrid", ["youtube", "twitch", "kick"]);
    for (const sourceCodec of ["hevc", "av1"] as const) {
      const est = estimate(c, { anyHwAvailable: true, sourceCodec });
      // YouTube stays on copy (9000+192); Twitch and Kick transcode (6000+160 each) and share 1 GPU session.
      expect(est.copyCount).toBe(1);
      expect(est.transcodeCount).toBe(2);
      expect(est.hwTranscodeCount).toBe(1);
      expect(est.uploadKbps).toBe(9000 + 192 + 2 * (6000 + 160));
    }
  });

  it("reports zero GPU transcode load when a portrait destination uses the dedicated vertical feed", () => {
    const c = cfg("hybrid", ["twitch", "tiktok"]);
    c.targets[1].encoding.sourceFeed = "vertical";
    const est = estimate(c, { anyHwAvailable: true });
    expect(est.copyCount).toBe(2);
    expect(est.transcodeCount).toBe(0);
    expect(est.hwTranscodeCount).toBe(0);
    expect(est.load).toBe(0);
  });
});
