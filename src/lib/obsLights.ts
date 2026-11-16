import type { ObsCheck, ObsEnvironment } from "./types";

export type ObsLight = "ok" | "todo" | "wait";

/** The single thing the user (or Corneta) can do next to turn the pending light green. */
export type ObsAction =
  "install" | "open" | "enableRemote" | "password" | "retry" | "point";

export interface ObsLights {
  /** OBS is running on this PC. */
  open: ObsLight;
  /** OBS's WebSocket server answers, which is what lets Corneta control it. */
  remote: ObsLight;
  /** OBS's stream points at Corneta's local server. */
  pointed: ObsLight;
  action: ObsAction | null;
}

/**
 * Three lights instead of one "couldn't find OBS": the process list and OBS's own settings say
 * which of the usual causes is the real one, so the user gets one instruction at a time.
 */
export function obsLights(
  env: ObsEnvironment | null,
  obs: ObsCheck | "loading" | null,
): ObsLights {
  const checked = obs !== null && obs !== "loading";
  const reachable = checked && obs.reachable;

  // A WebSocket that answers proves OBS is running, whatever the process list said a moment ago.
  if (!reachable && env && !env.running) {
    return {
      open: "todo",
      remote: "wait",
      pointed: "wait",
      action: env.installed ? "open" : "install",
    };
  }
  if (!reachable) {
    const action: ObsAction | null =
      env?.websocketEnabled === false
        ? "enableRemote"
        : !checked
          ? null
          : obs.authFailed
            ? "password"
            : "retry";
    return {
      open: env ? "ok" : "wait",
      remote: action ? "todo" : "wait",
      pointed: "wait",
      action,
    };
  }
  return obs.pointingAtCorneta
    ? { open: "ok", remote: "ok", pointed: "ok", action: null }
    : { open: "ok", remote: "ok", pointed: "todo", action: "point" };
}

/** What a poll needs to compare to decide that OBS changed and the WebSocket is worth retrying. */
export function obsEnvSignature(env: ObsEnvironment | null): string {
  return env
    ? `${env.running}:${env.websocketEnabled}:${env.websocketPort}:${env.authRequired}`
    : "unknown";
}
