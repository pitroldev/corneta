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
  state: string;
  login?: string;
  userCode?: string;
  verifyUri?: string;
  /** Full authorization URL when the provider supports one. */
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
  bootError: string | null;
  config: AppConfig | null;
  snapshot: EngineSnapshot;
  encoders: EncoderInfo[];
  /** An empty encoder list caused by probe failure, not confirmed absence. */
  encodersError: boolean;
  uploadMbps: number | null;
  /** Latest long-running operation, retained after failure for support diagnostics. */
  lastOperationId: string | null;

  load: (t: T) => Promise<void>;
  bindEngine: (t: T) => () => void;
  bindConfigSync: () => () => void;

  /** Return the new ID so the caller can focus the added destination. */
  addTarget: (platformId: PlatformId) => string | undefined;
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

  obs: ObsCheck | "loading" | null;
  /** Use a short cache; force bypasses cached results. */
  runObsCheck: (force?: boolean) => Promise<void>;
  /** Explicit checks propagate save and connection failures. */
  checkObs: (force?: boolean) => Promise<ObsCheck>;
  configureObs: () => Promise<void>;

  start: () => Promise<"obs-ok" | "obs-failed" | "manual">;
  stop: () => Promise<void>;

  chatMessages: ChatMessage[];
  chatConnected: boolean;
  chatStatuses: Record<string, { platform: string; status: string }>;
  bindChat: () => () => void;
  bindChatRunning: () => () => void;
  connectChat: (t: T) => Promise<void>;
  disconnectChat: () => Promise<void>;

  alertStatuses: Record<string, { status: string }>;
  bindAlertStatus: () => () => void;
  setAlertToken: (id: string, token: string) => Promise<void>;
  clearAlertToken: (id: string) => Promise<void>;

  chatAuth: Record<string, { login: string; ok: boolean }>;
  bindChatAuth: () => () => void;
  sendChat: (text: string, sources?: string[]) => Promise<void>;
  setChatSendToken: (id: string, token: string) => Promise<void>;
  clearChatSendToken: (id: string) => Promise<void>;

  chatLogin: { twitch: LoginState; youtube: LoginState; kick: LoginState };
  youtubeOauthReady: boolean;
  /** Available mode switches must leave at least one usable login path. */
  youtubeOauthModes: OauthModes;
  kickOauthModes: OauthModes;
  /** null means the setup API responded successfully. */
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

  alerts: Alert[];
  bindAlerts: () => () => void;
  clearAlerts: () => void;

  viewers: Viewers;
  bindViewers: () => () => void;

  leaks: Leak[];
  censored: boolean;
  bindGuardian: () => () => void;

  goLiveFocus: boolean;
  setGoLiveFocus: (v: boolean) => void;

  unseenReport: boolean;
  markReportSeen: () => void;

  tourNonce: number;
  replayTour: () => void;

  settingsTab: string | null;
  setSettingsTab: (v: string | null) => void;

  navRequest: string | null;
  requestNavigate: (screen: string | null) => void;

  chatConfigRequest: string | null;
  requestChatConfig: (tab: string | null) => void;
}
export interface SliceContext {
  set: StoreApi<State>["setState"];
  get: StoreApi<State>["getState"];
  persist: (config: AppConfig) => void;
  flushSave: () => Promise<void>;
}
