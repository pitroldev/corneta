import type { I18n } from "../i18n";
import {
  type TelemetryChoice,
  type TelemetryStatus,
} from "../telemetry-schema";
import type {
  Alert,
  AppConfig,
  ChatDelete,
  ChatMessage,
  ChatStatus,
  EncoderInfo,
  EngineSnapshot,
  Leak,
  ObsCheck,
  RecordDirCheck,
  SessionMeta,
  Viewers,
} from "../types";

export interface CornetaApi {
  getConfig(): Promise<AppConfig>;
  saveConfig(config: AppConfig): Promise<AppConfig>;
  /** Synchronize config saved by any webview to prevent cross-window overwrites. */
  subscribeConfigChanged(cb: (c: AppConfig) => void): () => void;
  setKey(targetId: string, key: string): Promise<void>;
  clearKey(targetId: string): Promise<void>;
  detectEncoders(): Promise<EncoderInfo[]>;
  testUpload(): Promise<number>; // Mbps
  setAutostart(enabled: boolean): Promise<void>;
  start(operationId?: string): Promise<void>;
  stop(operationId?: string): Promise<void>;
  setTargetPaused(targetId: string, paused: boolean): Promise<void>;
  /** Reread a failed destination's vault key and retry without restarting the stream. */
  retryTarget(targetId: string): Promise<void>;
  /** Toggle manual BRB; requires protection to have been enabled at stream startup. */
  setForceBrb(on: boolean): Promise<void>;
  subscribe(cb: (s: EngineSnapshot) => void): () => void;
  /** Translation is used only for browser demo fixtures. */
  listSessions(t: I18n["t"]): Promise<SessionMeta[]>;
  readSession(id: string): Promise<string>;
  readSessionBytes(id: string, chat?: boolean): Promise<ArrayBuffer>;
  /** Recorded chat NDJSON; empty when chat was not recorded. */
  readSessionChat(id: string): Promise<string>;
  deleteSession(id: string): Promise<void>;
  openSessionsDir(): Promise<void>;
  /** Check that the candidate directory exists and permits an actual write. */
  recordCheckDir(dir: string): Promise<RecordDirCheck>;
  /** null means the native folder picker was cancelled. */
  recordPickDir(): Promise<string | null>;
  /** Record a five-second test clip and return its path. */
  recordTest(dir: string): Promise<string>;
  recordRetry(): Promise<void>;
  /** Grant per-file asset access and return a playable URL. */
  recordVideoUrl(path: string): Promise<string>;
  /** Replay offset in milliseconds, clamped to ±30 seconds by the backend. */
  setSessionOffset(id: string, ms: number): Promise<void>;
  /** Delete session videos only, preserving reports and chat. */
  deleteSessionRecordings(id: string): Promise<void>;
  openRecordingFolder(): Promise<void>;
  /** t is the viewed timestamp, not the time of the click. */
  addSessionMarker(id: string, t: number, label: string): Promise<void>;
  /** Bitstream-copy clip export; null means the save dialog was cancelled. */
  exportClip(
    path: string,
    startMs: number,
    endMs: number,
  ): Promise<string | null>;
  /** false means the save dialog was cancelled. */
  saveTextFile(file: {
    name: string;
    label: string;
    ext: string;
    content: string;
  }): Promise<boolean>;
  /** Translation is used only for browser demo fixtures. */
  chatStart(t: I18n["t"]): Promise<void>;
  chatStop(): Promise<void>;
  chatRunning(): Promise<boolean>;
  /** Chat connection state is shared across webviews. */
  subscribeChatRunning(cb: (running: boolean) => void): () => void;
  chatSend(text: string, sources?: string[]): Promise<void>;
  subscribeChatAuth(
    onAuth: (a: { source: string; login: string; ok: boolean }) => void,
  ): () => void;
  setOauthConfig(c: {
    twitchClientId: string;
    googleClientId: string;
    kickClientId: string;
    setupApiUrl: string;
  }): Promise<void>;
  authStatus(): Promise<{
    twitchLogin: string | null;
    youtube: boolean;
    /** At least one official or user-supplied login path exists. */
    youtubeConfigured: boolean;
    /** The official path is ready, so switching modes will not strand login. */
    youtubeOfficialReady: boolean;
    /** User-supplied credentials remain available in the vault. */
    youtubeOwnCreds: boolean;
    youtubeUsingOwnCreds: boolean;
    kick: boolean;
    kickConfigured: boolean;
    kickOfficialReady: boolean;
    kickOwnCreds: boolean;
    kickUsingOwnCreds: boolean;
    brokerError: string | null;
  }>;
  twitchLoginStart(): Promise<void>;
  twitchLogout(): Promise<void>;
  youtubeLoginStart(): Promise<void>;
  youtubeLogout(): Promise<void>;
  youtubeBroadcastRecoveryStatus(): Promise<"none" | "pending" | "unknown">;
  youtubeRetryBroadcastCleanup(): Promise<void>;
  youtubeAcknowledgeUnknownBroadcast(confirmed: boolean): Promise<void>;
  kickLoginStart(): Promise<void>;
  kickLogout(): Promise<void>;
  setStreamInfo(
    title: string,
    category?: string,
  ): Promise<Record<string, { ok: boolean; error?: string; warn?: string }>>;
  setYoutubeOauth(clientId: string, clientSecret: string): Promise<void>;
  clearYoutubeOauth(): Promise<void>;
  /** Switch modes without deleting credentials; reject unavailable modes. */
  youtubeUseOfficial(): Promise<void>;
  youtubeUseOwnCreds(): Promise<void>;
  setKickOauth(clientId: string, clientSecret: string): Promise<void>;
  clearKickOauth(): Promise<void>;
  kickUseOfficial(): Promise<void>;
  kickUseOwnCreds(): Promise<void>;
  chatModerate(
    sourceId: string,
    action: string,
    opts?: {
      nativeId?: string;
      author?: string;
      authorId?: string;
      seconds?: number;
    },
  ): Promise<void>;
  subscribeAuthFlow(
    onAuth: (
      who: string,
      a: {
        state: string;
        userCode: string;
        verifyUri: string;
        verifyUriComplete?: string;
        login: string;
      },
    ) => void,
  ): () => void;
  openChatWindow(): Promise<void>;
  subscribeChat(
    onMsg: (m: ChatMessage) => void,
    onStatus: (s: ChatStatus) => void,
    onDelete: (d: ChatDelete) => void,
  ): () => void;
  subscribeAlerts(onAlert: (a: Alert) => void): () => void;
  alertsStart(): Promise<void>;
  alertsStop(): Promise<void>;
  subscribeAlertStatus(
    onStatus: (s: { source: string; status: string }) => void,
  ): () => void;
  subscribeViewers(onViewers: (v: Viewers) => void): () => void;
  obsSetStream(start: boolean): Promise<void>;
  testTarget(targetId: string, t: I18n["t"]): Promise<string>;
  /** Resolve with a verification message or reject with the failure reason. */
  youtubeKeyCheck(key: string, t: I18n["t"]): Promise<string>;
  /** Resolve with a verification message or reject with the failure reason. */
  alertTest(sourceId: string, t: I18n["t"]): Promise<string>;
  openLogsDir(): Promise<void>;
  exportDiagnostics(): Promise<boolean>;
  /** Telemetry preferences are stored separately from exportable AppConfig. */
  telemetryStatus(): Promise<TelemetryStatus>;
  telemetrySetConsent(input: {
    usage: TelemetryChoice;
    crashReports: TelemetryChoice;
    noticeVersion: string;
  }): Promise<TelemetryStatus>;
  /** Rotate the installation UUID only when both telemetry purposes are disabled. */
  telemetryRegenerateId(): Promise<TelemetryStatus>;
  registerShortcut(shortcut: string): Promise<void>;
  subscribeShortcut(cb: () => void): () => void;
  /** Recorder notice kinds are stable protocol values; translate only their display text. */
  subscribeRecorder(
    cb: (e: { kind: string; detail?: string | null }) => void,
  ): () => void;
  obsCheck(): Promise<ObsCheck>;
  obsAutoconfigure(): Promise<void>;
  markMoment(label?: string): Promise<void>;
  exportConfig(): Promise<boolean>;
  importConfig(): Promise<boolean>;
  saveBrbSlate(b64: string, generation?: string): Promise<void>;
  brbSlateNeedsRefresh(generation: string): Promise<boolean>;
  /** null means media selection was cancelled. */
  setBrbSlate(): Promise<{ kind: "image" | "video"; fileName: string } | null>;
  clearBrbSlate(): Promise<void>;
  /** Base64 JPEG without a data: prefix; empty when unavailable. */
  getBrbSlatePreview(): Promise<string>;
  captureFrame(t: I18n["t"]): Promise<string>;
  subscribeGuardian(
    onLeak: (l: Leak) => void,
    onCensor: (on: boolean) => void,
  ): () => void;
  mesaStartServer(): Promise<MesaServerInfo>;
  mesaStopServer(): Promise<void>;
  mesaObsAddSource(url: string, width: number, height: number): Promise<void>;
  mesaObsRemoveSource(): Promise<void>;
  overlayStart(): Promise<OverlayInfo>;
  overlayStop(): Promise<void>;
  overlayStatus(): Promise<OverlayInfo | null>;
  overlayTest(): Promise<void>;
  overlayChatTest(): Promise<void>;
  overlayObsAddSource(url: string): Promise<void>;
  openPrivacySettings(which: "camera" | "microphone"): Promise<void>;
}

export interface MesaServerInfo {
  port: number;
  /** LAN IPv4 used in invitations reachable by guests. */
  lanIp: string;
}

export interface OverlayInfo {
  port: number;
  /** Base alert overlay URL without query parameters. */
  url: string;
  /** Base chat overlay URL without query parameters. */
  chatUrl: string;
}
