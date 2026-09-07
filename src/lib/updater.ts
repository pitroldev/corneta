// Native installation owns exclusion with stream startup through restart.
import { create } from "zustand";
import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";
import { addStep, capture } from "./telemetry";
import { normalizeErrorCode } from "./telemetry-schema";

/** Defer update checks to avoid competing with initial app setup. */
const BOOT_DELAY_MS = 20_000;

export interface UpdateInfo {
  version: string;
  notes: string;
  handle: Update;
}

interface UpdateState {
  info: UpdateInfo | null;
  dismissed: boolean;
  installing: boolean;
  nativeInstalling: boolean;
  progress: number | null;
  phase: "downloading" | "installing";
  setInfo: (info: UpdateInfo | null) => void;
  dismiss: () => void;
}

export const useUpdate = create<UpdateState>((set) => ({
  info: null,
  dismissed: false,
  installing: false,
  nativeInstalling: false,
  progress: null,
  phase: "downloading",
  setInfo: (info) => set({ info, dismissed: false }),
  dismiss: () => set({ dismissed: true }),
}));

export const updateBusy = (state: UpdateState): boolean =>
  state.installing || state.nativeInstalling;

let installation: Promise<void> | null = null;

const inTauri = (): boolean =>
  import.meta.env.VITE_CONTRIBUTOR !== "1" &&
  typeof window !== "undefined" &&
  "__TAURI_INTERNALS__" in window;

/** Return null when current or unavailable; network check failures do not throw. */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!inTauri()) return null;
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) return null;
    return {
      version: update.version,
      notes: update.body ?? "",
      handle: update,
    };
  } catch {
    return null;
  }
}

/** Share one request across buttons and remounts; native code also rejects competing starts. */
export function installUpdate(info: UpdateInfo): Promise<void> {
  if (installation) return installation;
  useUpdate.setState({
    installing: true,
    progress: null,
    phase: "downloading",
  });
  installation = runInstallation(info).finally(() => {
    installation = null;
    useUpdate.setState({ installing: false, progress: null });
  });
  return installation;
}

async function runInstallation(info: UpdateInfo): Promise<void> {
  addStep("update_install_requested", { stage: "update_install" });
  let total = 0;
  let downloaded = 0;
  let active = true;
  try {
    const { Channel, invoke } = await import("@tauri-apps/api/core");
    const onEvent = new Channel<DownloadEvent>();
    onEvent.onmessage = (ev) => {
      if (!active) return;
      if (ev.event === "Started") {
        total = ev.data.contentLength ?? 0;
        useUpdate.setState({ progress: total > 0 ? 0 : null });
      } else if (ev.event === "Progress") {
        downloaded += ev.data.chunkLength;
        useUpdate.setState({
          progress: total > 0 ? Math.min(1, downloaded / total) : null,
        });
      } else if (ev.event === "Finished") {
        useUpdate.setState({ progress: 1, phase: "installing" });
      }
    };
    await invoke("install_update", { rid: info.handle.rid, onEvent });
  } catch (error) {
    capture("update_completed", {
      from_version: __APP_VERSION__,
      to_version: info.version,
      outcome: "failed",
      error_code: normalizeErrorCode(error, "update_install_failed"),
    });
    throw error;
  } finally {
    active = false;
  }
  capture("update_completed", {
    from_version: __APP_VERSION__,
    to_version: info.version,
    outcome: "installed",
    error_code: "none",
  });
}

/** Restore the native gate after reload; an older query cannot overwrite an event. */
export function subscribeUpdateStatus(): () => void {
  if (!inTauri()) return () => {};
  let cancelled = false;
  let unlisten: (() => void) | undefined;
  let revision = 0;
  void Promise.all([
    import("@tauri-apps/api/core"),
    import("@tauri-apps/api/event"),
  ])
    .then(async ([{ invoke }, { listen }]) => {
      if (cancelled) return;
      const stop = await listen<boolean>("updater://installing", (event) => {
        revision++;
        if (!cancelled) useUpdate.setState({ nativeInstalling: event.payload });
      });
      if (cancelled) {
        stop();
        return;
      }
      unlisten = stop;
      const observedRevision = revision;
      const busy = await invoke<boolean>("update_installing");
      if (!cancelled && revision === observedRevision)
        useUpdate.setState({ nativeInstalling: busy });
    })
    .catch(() => {
      // Native startup still enforces exclusion when event delivery is unavailable.
    });
  return () => {
    cancelled = true;
    unlisten?.();
  };
}

/** Return a cancellation function for effect cleanup. */
export function scheduleBootCheck(
  onFound: (info: UpdateInfo) => void,
): () => void {
  if (!inTauri()) return () => {};
  let alive = true;
  const t = setTimeout(() => {
    void checkForUpdate().then((info) => {
      if (alive && info) onFound(info);
    });
  }, BOOT_DELAY_MS);
  return () => {
    alive = false;
    clearTimeout(t);
  };
}
