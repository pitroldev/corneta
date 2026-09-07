import { create } from "zustand";
import { api, IS_TAURI, START_CANCELLED } from "./api";
import * as cfgOps from "./configOps";
import { createChatSlice } from "./store/chat";
import { createNavigationSlice } from "./store/navigation";
import { createOauthSlice } from "./store/oauth";
import type { State, T } from "./store/types";
import { addStep, capture } from "./telemetry";
import {
  createTelemetryId,
  fpsBucket,
  isUuid,
  normalizeErrorCode,
  resolutionBucket,
  type SafePlatform,
} from "./telemetry-schema";
import { toast } from "./toast";
import type { AppConfig, EncoderInfo, EngineSnapshot, Target } from "./types";
import { uid } from "./utils";
import { createObsCoordinator, ObsConfigSaveError } from "./obsCoordinator";

// Última remoção de destino (para o "desfazer").
let pendingRemoval: { target: Target; index: number } | null = null;

// Uma única sonda por WebView. Encoding/Ao vivo podem montar quase juntos; ambas aguardam
// a mesma Promise em vez de abrir processos FFmpeg duplicados.
let encoderLoadPromise: Promise<EncoderInfo[]> | null = null;

const EMPTY_SNAPSHOT: EngineSnapshot = {
  state: "stopped",
  startedAt: null,
  ingestLive: false,
  targets: {},
};

/** Quantas plataformas estão "fora" na live: em erro, reconectando ou sem o sinal do OBS.
 *  Um filtro só pra LiveBar (chip vermelho) e pro aria-live do App — antes cada um tinha
 *  o seu e o leitor de tela dizia "todas" enquanto o chip contava uma caída. */
export function downTargets(snapshot: EngineSnapshot): number {
  return Object.values(snapshot.targets).filter(
    (t) =>
      t.state === "error" ||
      t.state === "reconnecting" ||
      t.state === "signal-lost",
  ).length;
}

// Lê a config e aplica as migrações que precisam acontecer antes da primeira tela.
async function readConfig(t: T): Promise<AppConfig> {
  let config = await api.getConfig();
  // Migração: configs antigas sem perfis ganham um "Padrão" com o estado atual.
  if (!config.profiles || config.profiles.length === 0) {
    const id = uid("prof");
    config = {
      ...config,
      profiles: [
        {
          id,
          name: t("core.profile.default.name"),
          mode: config.mode,
          targets: config.targets,
        },
      ],
      activeProfileId: id,
    };
    config = await api.saveConfig(config);
  } else if (!config.profiles.some((p) => p.id === config.activeProfileId)) {
    const p = config.profiles[0];
    config = {
      ...config,
      activeProfileId: p.id,
      mode: p.mode,
      targets: p.targets.map((t) => ({ ...t })),
    };
  }
  return config;
}

export const useStore = create<State>((set, get) => {
  // Persiste a config + mantém o perfil ativo em sincronia com o working set.
  // Enfileira cada gravação imediatamente. Não dependemos de beforeunload (assíncrono e não
  // garantido por WebView); a fila preserva a ordem quando duas edições acontecem em sequência.
  let saveChain: Promise<void> = Promise.resolve();
  let saveRevision = 0;
  let pendingSaves = 0;
  let saveFailed = false;
  let liveOperation: { id: string } | null = null;
  const flushSave = () => saveChain;
  const persist = (config: AppConfig) => {
    const profiles = config.profiles.map((p) =>
      p.id === config.activeProfileId
        ? { ...p, mode: config.mode, targets: config.targets }
        : p,
    );
    const next = { ...config, profiles };
    set({ config: next });
    pendingSaves += 1;
    saveChain = saveChain
      .catch(() => undefined)
      .then(async () => {
        const saved = await api.saveConfig({ ...next, revision: saveRevision });
        saveFailed = false;
        saveRevision = saved.revision;
        pendingSaves -= 1;
        if (pendingSaves === 0) set({ config: saved });
      })
      .catch((error) => {
        saveFailed = true;
        pendingSaves = Math.max(0, pendingSaves - 1);
        console.error("Falha ao salvar configuração", error);
      });
  };

  const obs = createObsCoordinator({
    async flushSave() {
      // New edits can be queued while we wait; OBS must see the latest saved value.
      let pending: Promise<void>;
      do {
        pending = saveChain;
        await pending;
      } while (pending !== saveChain);
      if (saveFailed) throw new ObsConfigSaveError();
    },
    configKey() {
      const config = get().config;
      // In-memory only: never log/cache this key outside this coordinator.
      return JSON.stringify([config?.ingest, config?.settings.obsPassword]);
    },
    check: () => api.obsCheck(),
    configure: () => api.obsAutoconfigure(),
  });

  return {
    ...createOauthSlice({ set, get, persist, flushSave }),
    ...createChatSlice({ set, get, persist, flushSave }),
    ...createNavigationSlice({ set, get, persist, flushSave }),
    loaded: false,
    bootError: null,
    config: null,
    snapshot: EMPTY_SNAPSHOT,
    encoders: [],
    encodersError: false,
    uploadMbps: null,
    lastOperationId: null,
    async load(t) {
      // A configuração é tudo de que a primeira tela precisa. A sonda real dos encoders abre
      // processos FFmpeg e agora é lazy (Qualidade/Ao vivo/BORA), fora do caminho crítico do boot.
      set({ bootError: null });
      let config: AppConfig;
      try {
        config = await readConfig(t);
      } catch (error) {
        // Config ilegível: sem isto `loaded` nunca virava true e o app ficava em
        // "Abrindo sua bancada…" pra sempre. O App mostra o erro com "Tentar de novo".
        console.error("Falha ao ler a configuração", error);
        set({ bootError: String(error) });
        return;
      }
      saveRevision = config.revision;
      saveFailed = false;
      set({ config, loaded: true });
      // Semeia o estado de conexão do chat: a janela pode ter aberto (ou o popout montado)
      // com o chat já no ar — sem isto o botão nasceria em "Conectar" com o chat rodando.
      try {
        set({ chatConnected: await api.chatRunning() });
      } catch {
        /* backend indisponível (demo) — mantém o default */
      }
      // Selo "NOVO" de relatório sobrevive ao fechar o app: se existe sessão mais nova
      // que a última visita a Relatórios, o selo volta aceso.
      try {
        const sessions = await api.listSessions(t);
        const newest = sessions[0];
        const seenAt = Number(
          localStorage.getItem("corneta.lastSeenReportAt") || 0,
        );
        if (seenAt === 0) {
          // Migração (1ª execução com o recurso): sessões antigas não acendem o selo —
          // o usuário pode já tê-las visto antes de existir o carimbo.
          localStorage.setItem("corneta.lastSeenReportAt", String(Date.now()));
        } else if (newest && (newest.endedAt ?? newest.startedAt) > seenAt) {
          set({ unseenReport: true });
        }
      } catch {
        /* sem sessões ainda */
      }
    },
    bindEngine(t) {
      return api.subscribe((snapshot) => {
        const previousSnapshot = get().snapshot;
        const prev = previousSnapshot.state;
        const operationId = isUuid(snapshot.operationId)
          ? snapshot.operationId
          : liveOperation?.id;
        set({
          snapshot,
          ...(isUuid(operationId) ? { lastOperationId: operationId } : {}),
        });
        if (prev !== "live" && snapshot.state === "live" && operationId)
          addStep("live_became_active", { operation_id: operationId });
        if (
          liveOperation &&
          (snapshot.state === "error" || snapshot.state === "stopped")
        )
          liveOperation = null;
        // Entrou no ar → liga o chat sozinho (se tem fonte configurada e a opção está on).
        // O streamer médio esquece o clique manual em outra tela — e conclui que "o chat não funciona".
        if (prev !== "live" && snapshot.state === "live") {
          const s = get();
          const st = s.config?.settings;
          const hasSources =
            (st?.chatSources ?? []).some((x) => x.enabled && x.value.trim()) ||
            (st?.alertSources ?? []).some((x) => x.enabled && x.hasToken);
          if ((st?.chatAutoConnect ?? true) && hasSources && !s.chatConnected) {
            s.connectChat(t).catch(() =>
              toast.error(t("core.chat.autoConnect.failed")),
            );
          }
        }
      });
    },
    bindConfigSync() {
      // Config salva por outra janela → atualiza a base local SEM re-persistir (senão as
      // janelas entrariam em loop sobrescrevendo o disco uma da outra). Fecha o clobber em
      // que o popout revertia um destino/perfil criado na janela principal (e vice-versa).
      return api.subscribeConfigChanged((config) => {
        saveRevision = Math.max(saveRevision, config.revision);
        if (pendingSaves === 0) {
          saveFailed = false;
          set({ config });
        }
      });
    },
    // Coordenadores finos: lê a config, chama o reducer PURO (configOps), persiste se mudou.
    addTarget(platformId) {
      const config = get().config;
      if (!config) return;
      const { config: next, id } = cfgOps.addTarget(config, platformId);
      persist(next);
      return id;
    },
    setPlatforms(ids) {
      const config = get().config;
      if (!config) return;
      persist(cfgOps.syncTargetsToPlatforms(config, ids));
    },
    updateTarget(id, patch) {
      const config = get().config;
      if (!config) return;
      persist(cfgOps.updateTarget(config, id, patch));
    },
    removeTarget(id) {
      const config = get().config;
      if (!config) return;
      const { config: next, removed } = cfgOps.removeTarget(config, id);
      // Não apaga a chave do cofre — assim o "desfazer" restaura tudo, chave inclusa.
      if (removed) pendingRemoval = removed;
      persist(next);
    },
    toggleTarget(id) {
      const config = get().config;
      if (!config) return;
      persist(cfgOps.toggleTarget(config, id));
    },
    reorderTargets(ordered) {
      const config = get().config;
      if (!config) return;
      persist(cfgOps.reorderTargets(config, ordered));
    },
    duplicateTarget(id) {
      const config = get().config;
      if (!config) return;
      const next = cfgOps.duplicateTarget(config, id, uid("tgt"));
      if (next !== config) persist(next);
    },
    moveTarget(id, dir) {
      const config = get().config;
      if (!config) return;
      const next = cfgOps.moveTarget(config, id, dir);
      if (next !== config) persist(next);
    },
    undoRemoveTarget() {
      const config = get().config;
      if (!config || !pendingRemoval) return;
      const { target, index } = pendingRemoval;
      pendingRemoval = null;
      persist(cfgOps.insertTarget(config, target, index));
    },
    setMode(mode) {
      const config = get().config;
      if (!config) return;
      persist({ ...config, mode });
    },
    setIngest(patch) {
      const config = get().config;
      if (!config) return;
      persist({ ...config, ingest: { ...config.ingest, ...patch } });
    },
    setSettings(patch) {
      const config = get().config;
      if (!config) return;
      persist({ ...config, settings: { ...config.settings, ...patch } });
      // Efeito colateral: ligar/desligar o autostart no nível do SO.
      if (patch.autostart !== undefined) void api.setAutostart(patch.autostart);
    },
    loadProfile(id) {
      pendingRemoval = null;
      const config = get().config;
      if (!config) return;
      const next = cfgOps.loadProfile(config, id);
      if (next !== config) persist(next);
    },
    addProfile(label) {
      pendingRemoval = null;
      const config = get().config;
      if (!config) return;
      persist(cfgOps.addProfile(config, uid("prof"), label));
    },
    removeProfile(id) {
      pendingRemoval = null;
      const config = get().config;
      if (!config) return;
      const next = cfgOps.removeProfile(config, id);
      if (next !== config) persist(next);
    },
    renameProfile(id, name) {
      const config = get().config;
      if (!config) return;
      persist(cfgOps.renameProfile(config, id, name));
    },
    async setKey(id, key) {
      // O backend só aceita gravar em namespaces que já existem na config persistida. Um destino
      // recém-adicionado aparece na UI antes do save assíncrono terminar; como colar a chave salva
      // imediatamente, sem esta barreira o cofre pode receber o ID primeiro e rejeitá-lo.
      await flushSave();
      await api.setKey(id, key);
      get().updateTarget(id, { hasKey: true });
    },
    async clearKey(id) {
      await flushSave();
      await api.clearKey(id);
      get().updateTarget(id, { hasKey: false });
    },
    async refreshEncoders() {
      if (get().encoders.length > 0) return;
      set({ encodersError: false });
      encoderLoadPromise ??= api.detectEncoders();
      try {
        set({ encoders: await encoderLoadPromise });
      } catch (error) {
        console.error("Falha ao detectar encoders", error);
        set({ encodersError: true });
      } finally {
        encoderLoadPromise = null;
      }
    },
    obs: null,
    async checkObs(force = false) {
      // force = clique explícito em "Verificar OBS" → feedback visível (spinner);
      // polls de fundo trocam o resultado em silêncio pra não piscar a tela.
      if (force || get().obs === null) set({ obs: "loading" });
      try {
        const r = await obs.check(force);
        set({ obs: r });
        if (force)
          capture("obs_check_completed", {
            outcome: !r.reachable
              ? "not_reachable"
              : r.pointingAtCorneta
                ? "ok"
                : "wrong_destination",
            error_code: r.reachable
              ? r.pointingAtCorneta
                ? "none"
                : "wrong_destination"
              : r.authFailed
                ? "auth_failed"
                : normalizeErrorCode(r.error, "obs_unavailable"),
            resolution_bucket: resolutionBucket(r.width, r.height),
            fps_bucket: fpsBucket(r.fps),
          });
        return r;
      } catch (e) {
        set({
          obs: {
            reachable: false,
            pointingAtCorneta: false,
            width: 0,
            height: 0,
            fps: 0,
            error: String(e),
          },
        });
        if (force)
          capture("obs_check_completed", {
            outcome: "error",
            error_code: normalizeErrorCode(e, "obs_check_failed"),
            resolution_bucket: "unknown",
            fps_bucket: "unknown",
          });
        throw e;
      }
    },
    async runObsCheck(force = false) {
      // Background polls are fire-and-forget. Explicit actions use checkObs and
      // receive failures; both paths publish the same shared connection state.
      await get()
        .checkObs(force)
        .catch(() => {});
    },
    async configureObs() {
      await obs.configure();
      set({ obs: null });
    },
    async runUploadTest() {
      // Propaga o erro pra a tela mostrar um toast (ex.: sem internet).
      set({ uploadMbps: await api.testUpload() });
    },
    async start() {
      const config = get().config;
      const operation = {
        id: createTelemetryId(),
      };
      liveOperation = operation;
      set({ lastOperationId: operation.id });
      const enabledTargets = (config?.targets ?? []).filter(
        (target) => target.enabled,
      );
      const requestProperties = {
        operation_id: operation.id,
        mode: config?.mode ?? "per-platform",
        target_count: enabledTargets.length,
        platforms: [
          ...new Set(enabledTargets.map((target) => target.platformId)),
        ].sort() as SafePlatform[],
        brb_enabled: config?.settings.brbEnabled ?? false,
        guardian_enabled: config?.settings.guardianEnabled ?? false,
        record_video_enabled: config?.settings.recordVideo ?? false,
      } as const;
      addStep("live_start_requested", {
        operation_id: operation.id,
        stage: "engine_start",
      });
      let requestCaptured = false;
      try {
        await flushSave();
        set({
          leaks: [],
          censored: false,
          viewers: { total: 0, anyLive: false, items: [] },
        });
        // A UI é dona do request porque conhece a intenção e captura exatamente
        // antes do invoke; do recebimento em diante, outcomes pertencem ao Rust.
        capture("live_start_requested", requestProperties);
        requestCaptured = true;
        await api.start(operation.id);
      } catch (error) {
        const rustSawOperation =
          IS_TAURI &&
          (error === START_CANCELLED ||
            get().snapshot.operationId === operation.id ||
            String(error).includes(`operation_id: ${operation.id}`));
        if (!rustSawOperation) {
          if (!requestCaptured)
            capture("live_start_requested", requestProperties);
          capture("live_start_failed", {
            operation_id: operation.id,
            stage: "ui_pre_command",
            error_code: normalizeErrorCode(error, "engine_start_failed"),
            cancelled: normalizeErrorCode(error) === "start_cancelled",
          });
        }
        if (liveOperation?.id === operation.id) liveOperation = null;
        throw error;
      }
      // A1: liga o OBS junto (melhor-esforço) — e CONTA pra tela o que aconteceu,
      // pra o toast não mentir "no ar" quando o OBS nem recebeu o play.
      if (get().config?.settings.autoStartObs) {
        try {
          await api.obsSetStream(true);
          return "obs-ok";
        } catch {
          return "obs-failed";
        }
      }
      return "manual";
    },
    async stop() {
      await flushSave();
      // Só marca relatório novo se chegou a ficar AO VIVO (cancelar no "starting" não gera live).
      const wasLive = get().snapshot.state === "live";
      const operationId =
        liveOperation?.id ??
        (isUuid(get().snapshot.operationId)
          ? get().snapshot.operationId
          : undefined);
      if (operationId)
        addStep("live_stop_requested", {
          operation_id: operationId,
          stage: "engine_stop",
        });
      if (get().config?.settings.autoStartObs) {
        try {
          await api.obsSetStream(false);
        } catch {
          /* ignore */
        }
      }
      await api.stop(operationId);
      if (liveOperation?.id === operationId) liveOperation = null;
      if (wasLive) set({ unseenReport: true });
    },
  };
});
