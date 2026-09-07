import { describe, it, expect } from "vitest";
import { makeTarget, defaultConfig, obsIngestUrl } from "./factory";
import { PLATFORMS } from "./platforms";

describe("makeTarget", () => {
  it("inherits platform name and preset and starts enabled without a key", () => {
    const t = makeTarget("twitch");
    expect(t.platformId).toBe("twitch");
    expect(t.name).toBe(PLATFORMS.twitch.name);
    expect(t.enabled).toBe(true);
    expect(t.hasKey).toBe(false);
    expect(t.encoding.encoder).toBe("auto");
    expect(t.encoding.preset).toEqual(PLATFORMS.twitch.recommended);
    expect(t.id).toMatch(/^tgt/);
  });

  it("creates unique IDs", () => {
    expect(makeTarget("twitch").id).not.toBe(makeTarget("twitch").id);
  });
});

describe("defaultConfig", () => {
  it("starts with Twitch, YouTube, hybrid mode and one active profile", () => {
    const c = defaultConfig();
    expect(c.targets.map((t) => t.platformId)).toEqual(["twitch", "youtube"]);
    expect(c.mode).toBe("hybrid");
    expect(c.profiles).toHaveLength(1);
    expect(c.activeProfileId).toBe(c.profiles[0].id);
    expect(c.ingest.port).toBe(1935);
  });
});

describe("obsIngestUrl", () => {
  it("constructs the URL without exposing the destination key", () => {
    expect(
      obsIngestUrl({
        protocol: "rtmp",
        host: "127.0.0.1",
        port: 1935,
        app: "live",
        key: "obs",
      }),
    ).toBe("rtmp://127.0.0.1:1935/live");
  });
});
