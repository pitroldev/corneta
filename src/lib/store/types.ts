import type { StoreApi } from "zustand";
import type { I18n } from "../i18n";
import type {
  Alert,
  AppConfig,
  AppSettings,
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
} from "../types";
export type T = I18n["t"];
export interface LoginState {
  state: string; // out | code | connected | error
  login?: string;
  userCode?: string;
  verifyUri?: string;
  /** URL completa de autorização, quando o provedor oferece — abre direto no navegador. */
  verifyUriComplete?: string;
  message?: string;
}
export interface OauthModes {
  officialReady: boolean;
  ownCreds: boolean;
  usingOwnCreds: boolean;
}
export interface State {
  loaded: boolean;
  /** `load()` não conseguiu ler a config: a tela de boot mostra o erro com saída (tentar de novo / logs). */
  bootError: string | null;
  config: AppConfig | null;
  snapshot: EngineSnapshot;
  encoders: EncoderInfo[];
  /** A sonda de encoders falhou (FFmpeg não respondeu) — lista vazia por erro, não por falta. */
  encodersError: boolean;
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
  addProfile: (label: (n: number) => string) => void;
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
  /** Explicit checks propagate save/connection failures to their caller. */
  checkObs: (force?: boolean) => Promise<ObsCheck>;
  configureObs: () => Promise<void>;

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
export interface SliceContext {
  set: StoreApi<State>["setState"];
  get: StoreApi<State>["getState"];
  persist: (config: AppConfig) => void;
  flushSave: () => Promise<void>;
}
