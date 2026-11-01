// Native installation owns exclusion with stream startup through restart.
import { create } from "zustand";
import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";
import { addStep, capture } from "./telemetry";
import { normalizeErrorCode } from "./telemetry-schema";

/** Defer update checks to avoid competing with initial app setup. */
const BOOT_DELAY_MS = 20_000;
/** An app left in the tray for days still hears about new releases. */
const RECHECK_MS = 6 * 60 * 60 * 1000;
const NOTIFIED_KEY = "corneta.update.notified";

export interface DirectUpdateInfo {
  source?: "direct";
  version: string;
  notes: string;
  handle: Update;
}

export type UpdateInfo =
  | DirectUpdateInfo
  | {
      source: "store";
      version: null;
      notes: "";
    };

export type InstallOutcome = "installed" | "cancelled" | "current";
type UpdateEvent =
  | DownloadEvent
  | {
      event: "StoreProgress";
      data: { progress: number; installing: boolean };
    };

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

let installation: Promise<InstallOutcome> | null = null;

const inTauri = (): boolean =>
  import.meta.env.VITE_CONTRIBUTOR !== "1" &&
  typeof window !== "undefined" &&
  "__TAURI_INTERNALS__" in window;

/** Store errors reach manual checks; background checks suppress them without claiming the app is current. */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!inTauri()) return null;
  if (import.meta.env.VITE_STORE === "1") {
    const { invoke } = await import("@tauri-apps/api/core");
    return (await invoke<boolean>("check_store_update"))
      ? { source: "store", version: null, notes: "" }
      : null;
  }
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
export function installUpdate(info: UpdateInfo): Promise<InstallOutcome> {
  if (
    !inTauri() ||
    (import.meta.env.VITE_STORE === "1") !== (info.source === "store")
  )
    return Promise.reject(
      new Error("Update source does not match this app edition."),
    );
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

async function runInstallation(info: UpdateInfo): Promise<InstallOutcome> {
  addStep("update_install_requested", { stage: "update_install" });
  let total = 0;
  let downloaded = 0;
  let active = true;
  try {
    const { Channel, invoke } = await import("@tauri-apps/api/core");
    const onEvent = new Channel<UpdateEvent>();
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
      } else if (ev.event === "StoreProgress") {
        useUpdate.setState({
          progress: Number.isFinite(ev.data.progress)
            ? Math.max(0, Math.min(1, ev.data.progress))
            : null,
          phase: ev.data.installing ? "installing" : "downloading",
        });
      }
    };
    if (info.source === "store") {
      const outcome = await invoke<InstallOutcome>("install_store_update", {
        onEvent,
      });
      if (outcome === "installed" || outcome === "current")
        useUpdate.setState({ info: null });
      return outcome;
    }
    await invoke("install_update", { rid: info.handle.rid, onEvent });
  } catch (error) {
    capture("update_completed", {
      from_version: __APP_VERSION__,
      to_version: info.version ?? "unknown",
      outcome: "failed",
      error_code: normalizeErrorCode(error, "update_install_failed"),
    });
    throw error;
  } finally {
    active = false;
  }
  capture("update_completed", {
    from_version: __APP_VERSION__,
    to_version: info.version ?? "unknown",
    outcome: "installed",
    error_code: "none",
  });
  return "installed";
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
export function scheduleUpdateChecks(
  onFound: (info: UpdateInfo) => void,
): () => void {
  if (!inTauri()) return () => {};
  let alive = true;
  const run = () => {
    void checkForUpdate()
      .then((info) => {
        if (alive && info) onFound(info);
      })
      .catch(() => undefined);
  };
  const boot = setTimeout(run, BOOT_DELAY_MS);
  const every = setInterval(run, RECHECK_MS);
  return () => {
    alive = false;
    clearTimeout(boot);
    clearInterval(every);
  };
}

const release = (info: UpdateInfo) =>
  info.source === "store"
    ? Promise.resolve()
    : info.handle.close().catch(() => undefined);

/** A repeated automatic check keeps the user's dismissal of the same version. */
export function offerUpdate(next: UpdateInfo): void {
  const { info, installing, nativeInstalling } = useUpdate.getState();
  if (installing || nativeInstalling || info?.version === next.version) {
    void release(next);
    return;
  }
  if (info) void release(info);
  useUpdate.setState({ info: next, dismissed: false });
}

function readNotified(): string | null {
  try {
    return localStorage.getItem(NOTIFIED_KEY);
  } catch {
    return null;
  }
}

/** One Windows notification per version, held until the live ends; an attended window has the banner. */
export async function announceUpdate(
  version: string,
  live: boolean,
): Promise<void> {
  if (live || !inTauri() || readNotified() === version) return;
  try {
    localStorage.setItem(NOTIFIED_KEY, version);
  } catch {
    // Without storage the notification may repeat on the next launch.
  }
  if (document.visibilityState === "visible" && document.hasFocus()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("notify_update_available", { version });
  } catch {
    // The banner still offers the update when the window opens.
  }
}
