import { describe, expect, it } from "vitest";
import { obsEnvSignature, obsLights } from "./obsLights";
import type { ObsCheck, ObsEnvironment } from "./types";

const env = (patch: Partial<ObsEnvironment> = {}): ObsEnvironment => ({
  installed: true,
  running: true,
  websocketEnabled: true,
  websocketPort: 4455,
  authRequired: true,
  streamlabs: false,
  ...patch,
});
const check = (patch: Partial<ObsCheck> = {}): ObsCheck => ({
  reachable: false,
  pointingAtCorneta: false,
  width: 0,
  height: 0,
  fps: 0,
  ...patch,
});

describe("obsLights", () => {
  it("asks to open OBS when it is installed but closed, and to install it otherwise", () => {
    expect(obsLights(env({ running: false }), check())).toEqual({
      open: "todo",
      remote: "wait",
      pointed: "wait",
      action: "open",
    });
    expect(
      obsLights(env({ running: false, installed: false }), null).action,
    ).toBe("install");
  });

  it("names the WebSocket switch when OBS's own settings say it is off", () => {
    expect(obsLights(env({ websocketEnabled: false }), check())).toEqual({
      open: "ok",
      remote: "todo",
      pointed: "wait",
      action: "enableRemote",
    });
    // The settings are enough: no need to wait for a connection attempt to fail.
    expect(obsLights(env({ websocketEnabled: false }), "loading").action).toBe(
      "enableRemote",
    );
  });

  it("asks for the password only after OBS refused the one it had", () => {
    expect(obsLights(env(), check({ authFailed: true })).action).toBe(
      "password",
    );
    expect(obsLights(env(), check()).action).toBe("retry");
    expect(obsLights(env({ websocketEnabled: null }), check()).action).toBe(
      "retry",
    );
  });

  it("waits, without blaming anything, while the first check is still running", () => {
    expect(obsLights(env(), "loading")).toEqual({
      open: "ok",
      remote: "wait",
      pointed: "wait",
      action: null,
    });
    expect(obsLights(null, null)).toEqual({
      open: "wait",
      remote: "wait",
      pointed: "wait",
      action: null,
    });
  });

  it("trusts an answering WebSocket over a stale process list", () => {
    const lights = obsLights(
      env({ running: false }),
      check({ reachable: true }),
    );
    expect(lights).toEqual({
      open: "ok",
      remote: "ok",
      pointed: "todo",
      action: "point",
    });
  });

  it("is all green once OBS points at Corneta", () => {
    expect(
      obsLights(env(), check({ reachable: true, pointingAtCorneta: true })),
    ).toEqual({ open: "ok", remote: "ok", pointed: "ok", action: null });
  });
});

describe("obsEnvSignature", () => {
  it("changes when OBS opens or its WebSocket switch flips", () => {
    const closed = obsEnvSignature(env({ running: false }));
    const open = obsEnvSignature(env());
    const off = obsEnvSignature(env({ websocketEnabled: false }));
    expect(new Set([closed, open, off, obsEnvSignature(null)]).size).toBe(4);
  });
});
