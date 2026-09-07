// The native install command owns exclusion with stream startup through restart.
import { create } from "zustand";
import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";
import { addStep, capture } from "./telemetry";
import { normalizeErrorCode } from "./telemetry-schema";

/** Espera antes da checagem automática do boot. O primeiro minuto de app é o mais
 *  disputado (motor, chat, OBS, ícones) — a atualização não tem pressa nenhuma. */
const BOOT_DELAY_MS = 20_000;

export interface UpdateInfo {
  version: string;
  /** Notas da release (markdown do GitHub). Vazio se a release não trouxe corpo. */
  notes: string;
  /** Handle do plugin — só serve pra `installUpdate`. */
  handle: Update;
}

/** Store mínimo só pra atualização.
 *
 *  Existe porque duas telas distantes falam da MESMA atualização: a faixa do topo
 *  (que descobre no boot) e o botão da tela Sobre (que descobre sob demanda). Sem um
 *  lugar comum, o botão manual não teria como acender a faixa. */
interface UpdateState {
  info: UpdateInfo | null;
  /** Usuário fechou a faixa nesta sessão — não insiste até reabrir o app. */
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
  // Achar de novo reabre a faixa: se a pessoa foi no Sobre e clicou em procurar,
  // ela QUER ver o aviso outra vez.
  setInfo: (info) => set({ info, dismissed: false }),
  dismiss: () => set({ dismissed: true }),
}));

export const updateBusy = (state: UpdateState): boolean =>
  state.installing || state.nativeInstalling;

let installation: Promise<void> | null = null;

/** Só existe no app empacotado: no `pnpm dev` e no navegador não há updater. */
const inTauri = (): boolean =>
  import.meta.env.VITE_CONTRIBUTOR !== "1" &&
  typeof window !== "undefined" &&
  "__TAURI_INTERNALS__" in window;

/** Procura atualização. `null` = já está na última (ou não dá pra checar).
 *
 *  Nunca lança: falha de rede é o caso comum (o usuário pode estar offline, ou o
 *  GitHub fora do ar) e isso não é problema do usuário — só significa "hoje não". */
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

/** One request across buttons/remounts; native code also rejects competing starts. */
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
  let baixado = 0;
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
        baixado += ev.data.chunkLength;
        useUpdate.setState({
          progress: total > 0 ? Math.min(1, baixado / total) : null,
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
      // Native startup still enforces the lock if event delivery is unavailable.
    });
  return () => {
    cancelled = true;
    unlisten?.();
  };
}

/** Agenda a checagem do boot. Devolve o cancelador (pro cleanup do efeito). */
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
