import { create } from "zustand";
import type { I18n } from "./i18n";
import type {
  Alert,
  AppConfig,
  AppSettings,
  ChatDelete,
  ChatMessage,
  EncoderInfo,
  EncodingMode,
  EngineSnapshot,
  IngestConfig,
  Leak,
  ObsCheck,
  PlatformId,
  Target,
  Viewers,
} from "./types";
import { api, IS_TAURI, START_CANCELLED } from "./api";
import { toast } from "./toast";
import { OAUTH } from "./oauth";
import * as cfgOps from "./configOps";
import { openExternal, uid } from "./utils";
import { addStep, capture } from "./telemetry";
import {
  createTelemetryId,
  fpsBucket,
  isUuid,
  normalizeErrorCode,
  resolutionBucket,
  type SafePlatform,
} from "./telemetry-schema";

interface LoginState {
  state: string; // out | code | connected | error
  login?: string;
  userCode?: string;
  verifyUri?: string;
  /** URL completa de autorização, quando o provedor oferece — abre direto no navegador. */
  verifyUriComplete?: string;
  message?: string;
}

/** Quais caminhos de login existem numa plataforma, e qual está em uso. */
interface OauthModes {
  officialReady: boolean;
  ownCreds: boolean;
  usingOwnCreds: boolean;
}

const NO_OAUTH_MODES: OauthModes = {
  officialReady: false,
  ownCreds: false,
  usingOwnCreds: false,
};

// Última remoção de destino (para o "desfazer").
let pendingRemoval: { target: Target; index: number } | null = null;

// Momento da última consulta ao OBS (cache curto do runObsCheck).
let lastObsCheckAt = 0;
// Uma única sonda por WebView. Encoding/Ao vivo podem montar quase juntos; ambas aguardam
// a mesma Promise em vez de abrir processos FFmpeg duplicados.
let encoderLoadPromise: Promise<EncoderInfo[]> | null = null;

// O store não é componente: não pode usar `useT()`. As ações que escrevem pra
// tela (toast, nome de perfil, mensagem de erro) recebem `t` de quem as chama —
// idioma global aqui viraria corrida entre a janela principal e o popout do chat.
type T = I18n["t"];

interface State {
  loaded: boolean;
  config: AppConfig | null;
  snapshot: EngineSnapshot;
  encoders: EncoderInfo[];
  uploadMbps: number | null;
  /** Última operação longa; fica visível após falha para copiar ao suporte. */
  lastOperationId: string | null;

  load: (t: T) => Promise<void>;
  bindEngine: (t: T) => () => void;
  /** Sincroniza a config quando OUTRA janela (ex.: popout do chat) a salva. */
  bindConfigSync: () => () => void;

  /** Adiciona um destino e devolve o id (pra tela rolar/focar no card novo). */
  addTarget: (platformId: PlatformId) => string | undefined;
  /** Boas-vindas: alinha os destinos às plataformas escolhidas, numa gravação só. */
  setPlatforms: (ids: PlatformId[]) => void;
  updateTarget: (id: string, patch: Partial<Target>) => void;
  removeTarget: (id: string) => void;
  toggleTarget: (id: string) => void;
  reorderTargets: (ordered: Target[]) => void;
  duplicateTarget: (id: string) => void;
  moveTarget: (id: string, dir: -1 | 1) => void;
  undoRemoveTarget: () => void;

  setMode: (mode: EncodingMode) => void;
  setIngest: (patch: Partial<IngestConfig>) => void;
  setSettings: (patch: Partial<AppSettings>) => void;

  loadProfile: (id: string) => void;
  addProfile: () => void;
  removeProfile: (id: string) => void;
  renameProfile: (id: string, name: string) => void;

  setKey: (id: string, key: string) => Promise<void>;
  clearKey: (id: string) => Promise<void>;

  refreshEncoders: () => Promise<void>;
  runUploadTest: () => Promise<void>;

  /** Estado do OBS compartilhado entre telas (Ao vivo, Configurações, checklist). */
  obs: ObsCheck | "loading" | null;
  /** Consulta o OBS via obs-websocket (com cache curto; force=true ignora o cache). */
  runObsCheck: (force?: boolean) => Promise<void>;

  /** Devolve como o OBS reagiu ao BORA: ligado junto, falhou ou é manual. */
  start: () => Promise<"obs-ok" | "obs-failed" | "manual">;
  stop: () => Promise<void>;

  // Chat unificado
  chatMessages: ChatMessage[];
  chatConnected: boolean;
  chatStatuses: Record<string, { platform: string; status: string }>;
  bindChat: () => () => void;
  /** Espelha o estado "conectado" do chat entre janelas (é global no backend). */
  bindChatRunning: () => () => void;
  connectChat: (t: T) => Promise<void>;
  disconnectChat: () => Promise<void>;

  // Alertas externos (Streamlabs/StreamElements)
  alertStatuses: Record<string, { status: string }>;
  bindAlertStatus: () => () => void;
  setAlertToken: (id: string, token: string) => Promise<void>;
  clearAlertToken: (id: string) => Promise<void>;

  // Envio de mensagens (Twitch via token de envio)
  chatAuth: Record<string, { login: string; ok: boolean }>;
  bindChatAuth: () => () => void;
  sendChat: (text: string, sources?: string[]) => Promise<void>;
  setChatSendToken: (id: string, token: string) => Promise<void>;
  clearChatSendToken: (id: string) => Promise<void>;

  // OAuth (login no navegador) — envio/moderação por conta
  chatLogin: { twitch: LoginState; youtube: LoginState; kick: LoginState };
  /** YouTube tem Client ID oficial ou credenciais próprias configuradas. */
  youtubeOauthReady: boolean;
  /** Modos disponíveis — a UI só oferece a troca que não deixa a plataforma sem login. */
  youtubeOauthModes: OauthModes;
  kickOauthModes: OauthModes;
  /** Por que a setup API não respondeu, quando falhou. Null = nossa API respondeu. */
  oauthBrokerError: string | null;
  setYoutubeOauth: (clientId: string, clientSecret: string) => Promise<void>;
  clearYoutubeOauth: () => Promise<void>;
  youtubeUseOfficial: () => Promise<void>;
  youtubeUseOwnCreds: () => Promise<void>;
  kickOauthReady: boolean;
  setKickOauth: (clientId: string, clientSecret: string) => Promise<void>;
  clearKickOauth: () => Promise<void>;
  kickUseOfficial: () => Promise<void>;
  kickUseOwnCreds: () => Promise<void>;
  setupOauth: () => Promise<void>;
  bindAuthFlow: (t: T) => () => void;
  twitchLogin: () => Promise<void>;
  twitchLogout: () => Promise<void>;
  youtubeLogin: () => Promise<void>;
  youtubeLogout: () => Promise<void>;
  kickLogin: () => Promise<void>;
  kickLogout: () => Promise<void>;
  moderate: (
    sourceId: string,
    action: string,
    opts?: {
      nativeId?: string;
      author?: string;
      authorId?: string;
      seconds?: number;
    },
  ) => Promise<void>;
  clearChat: () => void;

  // Alertas centralizados
  alerts: Alert[];
  bindAlerts: () => () => void;
  clearAlerts: () => void;

  // Viewers unificados (todas as plataformas)
  viewers: Viewers;
  bindViewers: () => () => void;

  // Guardião anti-vazamento
  leaks: Leak[];
  censored: boolean;
  bindGuardian: () => () => void;

  // UI: pedido de foco no botão de ir ao vivo (vindo da sidebar)
  goLiveFocus: boolean;
  setGoLiveFocus: (v: boolean) => void;

  // UI: relatório novo (não visto) — selo "NOVO" na sidebar após encerrar uma live.
  unseenReport: boolean;
  markReportSeen: () => void;

  // UI: rever o tour (onboarding) sob demanda (a partir de Sobre).
  tourNonce: number;
  replayTour: () => void;

  // UI: aba pedida ao abrir Configurações (deep-link do "Ajustar").
  settingsTab: string | null;
  setSettingsTab: (v: string | null) => void;

  // UI: navegação global (qualquer tela pede, o App executa) — deep-links entre telas.
  navRequest: string | null;
  requestNavigate: (screen: string | null) => void;

  // UI: pedido pra abrir o modal "Configurar o chat" numa aba (deep-link de outras telas).
  chatConfigRequest: string | null;
  requestChatConfig: (tab: string | null) => void;
}

const EMPTY_SNAPSHOT: EngineSnapshot = {
  state: "stopped",
  startedAt: null,
  ingestLive: false,
  targets: {},
};
const CHAT_CAP = 400;
const ALERT_CAP = 100;

// Decide se uma mensagem sobrevive a um evento de deleção.
function keepMessage(m: ChatMessage, d: ChatDelete): boolean {
  if (m.platform !== d.platform) return true;
  if (d.scope === "message") return m.nativeId !== d.nativeId;
  if (d.scope === "user")
    return !(
      m.source === d.source &&
      m.author.toLowerCase() === (d.author ?? "").toLowerCase()
    );
  if (d.scope === "all") return m.source !== d.source;
  return true;
}

export const useStore = create<State>((set, get) => {
  // Persiste a config + mantém o perfil ativo em sincronia com o working set.
  // Enfileira cada gravação imediatamente. Não dependemos de beforeunload (assíncrono e não
  // garantido por WebView); a fila preserva a ordem quando duas edições acontecem em sequência.
  let saveChain: Promise<void> = Promise.resolve();
  let saveRevision = 0;
  let pendingSaves = 0;
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
        saveRevision = saved.revision;
        pendingSaves -= 1;
        if (pendingSaves === 0) set({ config: saved });
      })
      .catch((error) => {
        pendingSaves = Math.max(0, pendingSaves - 1);
        console.error("Falha ao salvar configuração", error);
      });
  };

  return {
    loaded: false,
    config: null,
    snapshot: EMPTY_SNAPSHOT,
    encoders: [],
    uploadMbps: null,
    lastOperationId: null,

    async load(t) {
      // A configuração é tudo de que a primeira tela precisa. A sonda real dos encoders abre
      // processos FFmpeg e agora é lazy (Qualidade/Ao vivo/BORA), fora do caminho crítico do boot.
      const loaded = await api.getConfig();
      let config = loaded;
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
      } else if (
        !config.profiles.some((p) => p.id === config.activeProfileId)
      ) {
        const p = config.profiles[0];
        config = {
          ...config,
          activeProfileId: p.id,
          mode: p.mode,
          targets: p.targets.map((t) => ({ ...t })),
        };
      }
      saveRevision = config.revision;
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
        if (pendingSaves === 0) set({ config });
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

    addProfile() {
      pendingRemoval = null;
      const config = get().config;
      if (!config) return;
      persist(cfgOps.addProfile(config, uid("prof")));
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
      encoderLoadPromise ??= api.detectEncoders();
      try {
        set({ encoders: await encoderLoadPromise });
      } catch (error) {
        console.error("Falha ao detectar encoders", error);
      } finally {
        encoderLoadPromise = null;
      }
    },

    obs: null,
    async runObsCheck(force = false) {
      // Cache curto: várias telas consultam (Ao vivo, checklist, Configurações) sem
      // martelar o obs-websocket a cada troca de tela.
      if (
        !force &&
        Date.now() - lastObsCheckAt < 5000 &&
        get().obs !== null &&
        get().obs !== "loading"
      )
        return;
      if (get().obs === "loading") return;
      // force = clique explícito em "Verificar OBS" → feedback visível (spinner);
      // polls de fundo trocam o resultado em silêncio pra não piscar a tela.
      if (force || get().obs === null) set({ obs: "loading" });
      try {
        const r = await api.obsCheck();
        lastObsCheckAt = Date.now();
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
      } catch (e) {
        lastObsCheckAt = Date.now();
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
      }
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

    chatMessages: [],
    chatConnected: false,
    chatStatuses: {},
    alertStatuses: {},
    chatAuth: {},
    chatLogin: {
      twitch: { state: "out" },
      youtube: { state: "out" },
      kick: { state: "out" },
    },
    youtubeOauthReady: false,
    kickOauthReady: false,
    youtubeOauthModes: NO_OAUTH_MODES,
    kickOauthModes: NO_OAUTH_MODES,
    oauthBrokerError: null,

    bindChat() {
      return api.subscribeChat(
        (m) =>
          set((s) => {
            // IDs nativos formam a chave idempotente na borda do feed. Adaptadores que
            // reentregam histórico após uma reconexão (como a Cinefy) não precisam
            // conhecer o estado da UI nem carregar deduplicação entre gerações.
            if (
              m.nativeId &&
              s.chatMessages.some(
                (seen) =>
                  seen.platform === m.platform &&
                  seen.source === m.source &&
                  seen.nativeId === m.nativeId,
              )
            ) {
              return {};
            }
            if (s.chatMessages.length < CHAT_CAP) {
              return { chatMessages: [...s.chatMessages, m] };
            }
            // Uma única cópia quando o ring lógico está cheio (antes criava o array
            // ampliado e logo em seguida outro array com `slice`).
            const next = s.chatMessages.slice(-(CHAT_CAP - 1));
            next.push(m);
            return { chatMessages: next };
          }),
        (st) =>
          set((s) => ({
            chatStatuses: {
              ...s.chatStatuses,
              [st.source || st.platform]: {
                platform: st.platform,
                status: st.status,
              },
            },
          })),
        // Moderação: em vez de sumir, marca como removida (vira lápide no feed).
        (d) =>
          set((s) => ({
            chatMessages: s.chatMessages.map((m) =>
              keepMessage(m, d) ? m : { ...m, deleted: true },
            ),
          })),
      );
    },

    bindChatRunning() {
      // "Conectado" é estado global do backend: start/stop de qualquer janela reflete na outra
      // (sem isto, desconectar pelo popout deixava a principal presa em "conectado", e o popout
      // nascia mostrando "Conectar" com o chat já no ar). Não mexe nas mensagens.
      return api.subscribeChatRunning((running) =>
        set({ chatConnected: running }),
      );
    },

    async connectChat(t) {
      // NÃO zera chatMessages: reconectar (ex.: pra ressuscitar uma fonte que caiu)
      // não pode apagar o histórico das outras. Limpar é só no botão "Limpar" (clearChat).
      set({ chatStatuses: {}, alertStatuses: {}, chatAuth: {} });
      await api.chatStart(t);
      await api.alertsStart();
      set({ chatConnected: true });
    },

    async disconnectChat() {
      await api.chatStop();
      await api.alertsStop();
      set({
        chatConnected: false,
        chatStatuses: {},
        alertStatuses: {},
        chatAuth: {},
      });
    },

    bindAlertStatus() {
      return api.subscribeAlertStatus((st) =>
        set((s) => ({
          alertStatuses: {
            ...s.alertStatuses,
            [st.source]: { status: st.status },
          },
        })),
      );
    },

    async setAlertToken(id, token) {
      await flushSave();
      await api.setKey(`alert_${id}`, token);
      const config = get().config;
      if (!config) return;
      persist({
        ...config,
        settings: {
          ...config.settings,
          alertSources: (config.settings.alertSources ?? []).map((a) =>
            a.id === id ? { ...a, hasToken: true } : a,
          ),
        },
      });
    },

    async clearAlertToken(id) {
      await flushSave();
      await api.clearKey(`alert_${id}`);
      const config = get().config;
      if (!config) return;
      persist({
        ...config,
        settings: {
          ...config.settings,
          alertSources: (config.settings.alertSources ?? []).map((a) =>
            a.id === id ? { ...a, hasToken: false } : a,
          ),
        },
      });
    },

    bindChatAuth() {
      return api.subscribeChatAuth((a) =>
        set((s) => ({
          chatAuth: { ...s.chatAuth, [a.source]: { login: a.login, ok: a.ok } },
        })),
      );
    },

    async sendChat(text, sources) {
      await api.chatSend(text, sources);
    },

    async setChatSendToken(id, token) {
      await flushSave();
      await api.setKey(`chat_send_${id}`, token);
      const config = get().config;
      if (!config) return;
      persist({
        ...config,
        settings: {
          ...config.settings,
          chatSources: (config.settings.chatSources ?? []).map((c) =>
            c.id === id ? { ...c, hasSendToken: true } : c,
          ),
        },
      });
    },

    async clearChatSendToken(id) {
      await flushSave();
      await api.clearKey(`chat_send_${id}`);
      const config = get().config;
      if (!config) return;
      persist({
        ...config,
        settings: {
          ...config.settings,
          chatSources: (config.settings.chatSources ?? []).map((c) =>
            c.id === id ? { ...c, hasSendToken: false } : c,
          ),
        },
      });
    },

    async setupOauth() {
      await api.setOauthConfig({
        twitchClientId: OAUTH.twitchClientId,
        googleClientId: OAUTH.googleClientId,
        kickClientId: OAUTH.kickClientId,
        setupApiUrl: OAUTH.setupApiUrl,
      });
      try {
        const a = await api.authStatus();
        set({
          chatLogin: {
            twitch: a.twitchLogin
              ? { state: "connected", login: a.twitchLogin }
              : { state: "out" },
            youtube: a.youtube ? { state: "connected" } : { state: "out" },
            kick: a.kick ? { state: "connected" } : { state: "out" },
          },
          youtubeOauthReady: a.youtubeConfigured,
          kickOauthReady: a.kickConfigured,
          youtubeOauthModes: {
            officialReady: a.youtubeOfficialReady,
            ownCreds: a.youtubeOwnCreds,
            usingOwnCreds: a.youtubeUsingOwnCreds,
          },
          kickOauthModes: {
            officialReady: a.kickOfficialReady,
            ownCreds: a.kickOwnCreds,
            usingOwnCreds: a.kickUsingOwnCreds,
          },
          oauthBrokerError: a.brokerError,
        });
      } catch {
        /* sem login ainda */
      }
    },

    async setYoutubeOauth(clientId, clientSecret) {
      await api.setYoutubeOauth(clientId, clientSecret);
      set((s) => ({
        youtubeOauthReady: true,
        chatLogin: { ...s.chatLogin, youtube: { state: "out" } },
      }));
      await get().setupOauth();
    },
    // Só apaga as credenciais do cofre. Trocar de modo NÃO passa por aqui: a troca é
    // `youtubeUseOfficial`, que mantém tudo salvo — apagar era o que fazia o login do YouTube
    // desaparecer de vez quando o fluxo oficial não estava disponível pra assumir.
    async clearYoutubeOauth() {
      await api.clearYoutubeOauth();
      await get().setupOauth();
    },
    async youtubeUseOfficial() {
      await api.youtubeUseOfficial();
      await get().setupOauth();
    },
    async youtubeUseOwnCreds() {
      await api.youtubeUseOwnCreds();
      await get().setupOauth();
    },
    async setKickOauth(clientId, clientSecret) {
      await api.setKickOauth(clientId, clientSecret);
      set((s) => ({
        kickOauthReady: true,
        chatLogin: { ...s.chatLogin, kick: { state: "out" } },
      }));
      await get().setupOauth();
    },
    async clearKickOauth() {
      await api.clearKickOauth();
      await get().setupOauth();
    },
    async kickUseOfficial() {
      await api.kickUseOfficial();
      await get().setupOauth();
    },
    async kickUseOwnCreds() {
      await api.kickUseOwnCreds();
      await get().setupOauth();
    },

    bindAuthFlow(t) {
      return api.subscribeAuthFlow((who, a) => {
        set((s) => {
          const k = who as "twitch" | "youtube" | "kick";
          let next: LoginState = s.chatLogin[k];
          if (a.state === "code")
            next = {
              state: "code",
              userCode: a.userCode,
              verifyUri: a.verifyUri,
              verifyUriComplete: a.verifyUriComplete,
            };
          else if (a.state === "connected")
            next = { state: "connected", login: a.login || undefined };
          else if (a.state === "error")
            next = {
              state: "error",
              message: a.login || t("core.auth.login.error.fallback"),
            };
          else if (a.state === "loggedout") next = { state: "out" };
          return { chatLogin: { ...s.chatLogin, [k]: next } };
        });
        // Código chegou → abre o navegador direto na autorização (a URL completa, quando existe,
        // já pré-preenche o código). O link no app continua como plano B.
        if (a.state === "code") {
          // No fallback BYOK por device flow, copia o código antes de abrir o navegador. Twitch e
          // o fluxo oficial PKCE do YouTube já levam tudo na URL e não entram neste bloco.
          if (a.userCode) {
            try {
              void navigator.clipboard.writeText(a.userCode);
            } catch {
              /* clipboard indisponível */
            }
          }
          const url = a.verifyUriComplete || a.verifyUri;
          if (url) void openExternal(url);
        }
        // Twitch logou e o chat está no ar → reconecta pra o IRC autenticar (mantém o histórico).
        if (
          who === "twitch" &&
          a.state === "connected" &&
          get().chatConnected
        ) {
          void api.chatStart(t);
        }
      });
    },

    async twitchLogin() {
      set((s) => ({
        chatLogin: { ...s.chatLogin, twitch: { state: "code" } },
      }));
      await api.twitchLoginStart();
    },
    async twitchLogout() {
      await api.twitchLogout();
      set((s) => ({ chatLogin: { ...s.chatLogin, twitch: { state: "out" } } }));
    },
    async youtubeLogin() {
      set((s) => ({
        chatLogin: { ...s.chatLogin, youtube: { state: "code" } },
      }));
      await api.youtubeLoginStart();
    },
    async youtubeLogout() {
      await api.youtubeLogout();
      set((s) => ({
        chatLogin: { ...s.chatLogin, youtube: { state: "out" } },
      }));
    },
    async kickLogin() {
      set((s) => ({ chatLogin: { ...s.chatLogin, kick: { state: "code" } } }));
      await api.kickLoginStart();
    },
    async kickLogout() {
      await api.kickLogout();
      set((s) => ({ chatLogin: { ...s.chatLogin, kick: { state: "out" } } }));
    },

    async moderate(sourceId, action, opts) {
      await api.chatModerate(sourceId, action, opts);
    },

    clearChat() {
      set({ chatMessages: [] });
    },

    alerts: [],
    bindAlerts() {
      return api.subscribeAlerts((a) =>
        set((s) => {
          if (s.alerts.length < ALERT_CAP) {
            return { alerts: [...s.alerts, a] };
          }
          const next = s.alerts.slice(-(ALERT_CAP - 1));
          next.push(a);
          return { alerts: next };
        }),
      );
    },
    clearAlerts() {
      set({ alerts: [] });
    },

    viewers: { total: 0, anyLive: false, items: [] },
    bindViewers() {
      return api.subscribeViewers((v) => set({ viewers: v }));
    },

    leaks: [],
    censored: false,
    bindGuardian() {
      return api.subscribeGuardian(
        (l) => set((s) => ({ leaks: [...s.leaks, l].slice(-20) })),
        (on) => set({ censored: on }),
      );
    },

    goLiveFocus: false,
    setGoLiveFocus(v) {
      set({ goLiveFocus: v });
    },

    unseenReport: false,
    markReportSeen() {
      set({ unseenReport: false });
      // Persistido: o selo não deve reacender ao reabrir o app pra um relatório já visto.
      try {
        localStorage.setItem("corneta.lastSeenReportAt", String(Date.now()));
      } catch {
        /* ignore */
      }
    },

    tourNonce: 0,
    replayTour() {
      set((s) => ({ tourNonce: s.tourNonce + 1 }));
    },

    settingsTab: null,
    setSettingsTab(v) {
      set({ settingsTab: v });
    },

    navRequest: null,
    requestNavigate(screen) {
      set({ navRequest: screen });
    },

    chatConfigRequest: null,
    requestChatConfig(tab) {
      set({ chatConfigRequest: tab });
    },
  };
});
