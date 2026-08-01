// ============================================================
// Auto-update via GitHub Releases (tauri-plugin-updater).
//
// A REGRA que manda no desenho: instalar reinicia o app. Reiniciar no meio de uma
// live derruba a transmissão — e o updater não sabe disso sozinho. Por isso quem
// decide a hora é aqui, olhando o estado do motor, e nunca o plugin.
// ============================================================
import { create } from "zustand";
import type { Update } from "@tauri-apps/plugin-updater";
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
  setInfo: (info: UpdateInfo | null) => void;
  dismiss: () => void;
}

export const useUpdate = create<UpdateState>((set) => ({
  info: null,
  dismissed: false,
  // Achar de novo reabre a faixa: se a pessoa foi no Sobre e clicou em procurar,
  // ela QUER ver o aviso outra vez.
  setInfo: (info) => set({ info, dismissed: false }),
  dismiss: () => set({ dismissed: true }),
}));

/** Só existe no app empacotado: no `pnpm dev` e no navegador não há updater. */
const inTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

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

/** Baixa, instala e reinicia. Só volta se FALHAR — no sucesso o processo morre.
 *
 *  `onProgress` recebe 0..1 quando o servidor informa o tamanho; sem `Content-Length`
 *  o total vem zero e o progresso fica indefinido (a UI mostra indeterminado). */
export async function installUpdate(
  info: UpdateInfo,
  onProgress?: (fraction: number | null) => void,
): Promise<void> {
  addStep("update_install_requested", { stage: "update_install" });
  let total = 0;
  let baixado = 0;
  try {
    await info.handle.downloadAndInstall((ev) => {
      if (ev.event === "Started") {
        total = ev.data.contentLength ?? 0;
        onProgress?.(total > 0 ? 0 : null);
      } else if (ev.event === "Progress") {
        baixado += ev.data.chunkLength;
        onProgress?.(total > 0 ? Math.min(1, baixado / total) : null);
      } else if (ev.event === "Finished") {
        onProgress?.(1);
      }
    });
  } catch (error) {
    capture("update_completed", {
      from_version: __APP_VERSION__,
      to_version: info.version,
      outcome: "failed",
      error_code: normalizeErrorCode(error, "update_install_failed"),
    });
    throw error;
  }
  capture("update_completed", {
    from_version: __APP_VERSION__,
    to_version: info.version,
    outcome: "installed",
    error_code: "none",
  });
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
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
