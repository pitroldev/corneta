import { describe, expect, it } from "vitest";
import { detectedEncoder, encoderApp, startedByHand } from "./encoder";
import type { ObsEnvironment } from "./types";

const env = (patch: Partial<ObsEnvironment> = {}): ObsEnvironment => ({
  installed: true,
  running: false,
  websocketEnabled: true,
  websocketPort: 4455,
  authRequired: true,
  streamlabs: false,
  ...patch,
});

describe("encoderApp", () => {
  it("pre-selects Streamlabs only when it is there and OBS is not", () => {
    expect(detectedEncoder(null)).toBe("obs");
    expect(detectedEncoder(env())).toBe("obs");
    expect(detectedEncoder(env({ streamlabs: true }))).toBe("obs");
    expect(detectedEncoder(env({ installed: false, streamlabs: true }))).toBe(
      "streamlabs",
    );
    expect(detectedEncoder(env({ installed: false }))).toBe("obs");
  });

  it("keeps the streamer's answer over what the PC suggests", () => {
    const onlyStreamlabs = env({ installed: false, streamlabs: true });
    expect(encoderApp({ encoderApp: null }, onlyStreamlabs)).toBe("streamlabs");
    expect(encoderApp({ encoderApp: "obs" }, onlyStreamlabs)).toBe("obs");
    expect(encoderApp({ encoderApp: "other" }, env())).toBe("other");
    // A value from a newer or damaged settings file falls back to detection.
    expect(encoderApp({ encoderApp: "vmix" as never }, env())).toBe("obs");
  });

  it("leaves the play button to the user outside an OBS that Corneta set up", () => {
    expect(startedByHand("obs", false)).toBe(false);
    expect(startedByHand("obs", true)).toBe(true);
    expect(startedByHand("streamlabs", false)).toBe(true);
    expect(startedByHand("other", false)).toBe(true);
  });
});
