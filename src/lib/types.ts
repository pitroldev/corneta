export type PlatformId =
  | "twitch"
  | "youtube"
  | "facebook"
  | "kick"
  | "tiktok"
  | "x"
  | "instagram"
  | "custom";

export type Protocol = "rtmp" | "rtmps";

export type EncodingAction = "copy" | "transcode";

export type EncodingMode = "per-platform" | "passthrough" | "hybrid";

export type EncoderKind =
  "auto" | "nvenc" | "qsv" | "amf" | "videotoolbox" | "software";

export interface VideoPreset {
  width: number;
  height: number;
  fps: number;
  videoBitrateKbps: number;
  audioBitrateKbps: number;
  keyframeSec: number;
}

export interface PlatformPreset {
  id: PlatformId;
  name: string;
  color: string;
  protocol: Protocol;
  /** Ingest URL without the stream key. */
  ingestUrl: string;
  recommended: VideoPreset;
  note?: string;
  keyUrl?: string;
  liveUrl?: string;
  experimental?: boolean;
}

/** Portrait crop: x/y pan within 0–1; zoom within 0.25–1. */
export interface Reframe {
  x: number;
  y: number;
  zoom: number;
}

export interface TargetEncoding {
  /** Persisted legacy field; hybrid behavior uses hybridOverride or automatic selection. */
  action: EncodingAction;
  preset?: VideoPreset;
  encoder: EncoderKind;
  /** undefined selects automatic behavior in hybrid mode. */
  hybridOverride?: EncodingAction;
  /** undefined selects a centered portrait crop. */
  reframe?: Reframe;
}

export interface Target {
  id: string;
  platformId: PlatformId;
  name: string;
  enabled: boolean;
  protocol: Protocol;
  ingestUrl: string;
  /** Never store the stream key here; only record its vault presence. */
  hasKey: boolean;
  encoding: TargetEncoding;
}

export interface IngestConfig {
  protocol: "rtmp";
  host: string;
  port: number;
  app: string;
  key: string;
}

export interface AppSettings {
  minimizeToTray: boolean;
  autostart: boolean;
  /** Empty means OBS WebSocket authentication is disabled. */
  obsPassword: string;
  autoStartObs: boolean;
  liveShortcut: string;
  /** One YouTube Data API key shared by YouTube chat sources. */
  youtubeApiKey: string;
  chatSources: ChatSource[];
  alertSources: AlertSource[];
  chatShowEmotes: boolean;
  chatShowBadges: boolean;
  chatShowPlatform: boolean;
  chatShowSource: boolean;
  chatShowTimestamps: boolean;
  chatShowViewers: boolean;
  theme: "dark" | "light";
  /** auto follows the system locale. */
  language: "auto" | "pt-BR" | "en";
  /** Chat font size in pixels. */
  chatFontSize: number;
  /** Alert font size in pixels. */
  alertFontSize: number;
  chatBothLayout: "auto" | "row" | "col";
  chatBothAlertsFirst: boolean;
  /** Percentage of the combined popout occupied by alerts. */
  chatBothSplit: number;
  guardianEnabled: boolean;
  /** Explicit user watchlist; the engine ignores terms shorter than three characters. */
  guardianWatchlist: string[];
  loudnessNormalize: boolean;
  /** Integrated loudness target in LUFS. */
  loudnessTargetLufs: number;
  brbEnabled: boolean;
  brbSlateKind: "auto" | "image" | "video";
  /** Original filename for display only; the backend stores brb-slate.*. */
  brbSlateFileName?: string;
  /** Recording is opt-in to avoid unexpected disk usage. */
  recordVideo: boolean;
  /** Empty resolves to the session directory at runtime, keeping exported config portable. */
  recordVideoDir: string;
  /** Recording retention limit in GB, based on space rather than file count. */
  recordVideoKeepGb: number;
  /** Chat recording is independent of video because it stores third-party personal data. */
  recordChat: boolean;
  autoBitrate: boolean;
  youtubeAutoLive: boolean;
  /** Persisted across sessions and used for automatic YouTube broadcasts. */
  streamTitle: string;
  chatAutoConnect: boolean;
  chatPopoutTab: "chat" | "alerts" | "both";
  chatShowAlertsPanel: boolean;
  overlayEnabled: boolean;
  overlaySound: boolean;
  overlayPosition: string;
  overlayPort: number;
  overlayChatPosition: string;
  /** Alert display duration in seconds. */
  overlayDurationSecs: number;
  overlayScale: string;
  overlayShowFollows: boolean;
  /** Overlay chat font size in pixels. */
  overlayChatSize: number;
  overlayChatMax: number;
  overlayChatBadges: boolean;
  overlayChatPlatform: boolean;
  overlayChatHideCommands: boolean;
  /** Seconds before hiding a message; zero means never. */
  overlayChatFadeSecs: number;
}

export interface ObsCheck {
  reachable: boolean;
  /** Structured authentication failure flag; do not infer it from localized error text. */
  authFailed?: boolean;
  pointingAtCorneta: boolean;
  width: number;
  height: number;
  fps: number;
  error?: string;
}

/** Cinefy is a chat source, not a streaming destination. */
export type ChatPlatform = "twitch" | "youtube" | "kick" | "cinefy";

export interface ChatSource {
  id: string;
  platform: ChatPlatform;
  value: string;
  name: string;
  enabled: boolean;
  /** Vault-derived sending-token presence, currently for Twitch only. */
  hasSendToken?: boolean;
}

export type AlertSourceKind = "streamlabs" | "streamelements";

export interface AlertSource {
  id: string;
  kind: AlertSourceKind;
  name: string;
  enabled: boolean;
  /** Recomputed by the backend from the vault; not authoritative for persistence. */
  hasToken?: boolean;
}

export interface ChatFragment {
  kind: "text" | "emote";
  text?: string;
  url?: string;
}

export interface ChatBadge {
  label: string;
  kind: string;
}

export interface ChatMessage {
  id: string;
  platform: ChatPlatform;
  source: string;
  author: string;
  /** Platform author ID permits moderation without a username lookup. */
  authorId?: string;
  nativeId?: string;
  color?: string;
  text: string;
  fragments: ChatFragment[];
  badges: ChatBadge[];
  ts: number;
  /** Moderated messages remain as tombstones in the live feed. */
  deleted?: boolean;
}

export interface ChatDelete {
  scope: "message" | "user" | "all";
  platform: string;
  source?: string;
  nativeId?: string;
  author?: string;
}

export interface ChatStatus {
  platform: string;
  source: string;
  status: string;
}

export interface ViewerItem {
  platform: ChatPlatform;
  source: string;
  viewers: number | null;
  live: boolean;
}

export interface Viewers {
  total: number;
  anyLive: boolean;
  items: ViewerItem[];
}

export type AlertKind =
  | "follow"
  | "sub"
  | "resub"
  | "subgift"
  | "bits"
  | "tip"
  | "raid"
  | "member"
  | "superchat";

export interface Alert {
  id: string;
  platform: string;
  source: string;
  kind: AlertKind;
  user: string;
  amount?: number;
  currency?: string;
  tier?: string;
  message?: string;
  /** Emote fragments; empty or absent falls back to plain message text. */
  fragments?: ChatFragment[];
  ts: number;
}

export interface Leak {
  label: string;
  snippet: string;
}

export interface Profile {
  id: string;
  name: string;
  mode: EncodingMode;
  targets: Target[];
}

export interface AppConfig {
  schemaVersion: number;
  revision: number;
  ingest: IngestConfig;
  mode: EncodingMode;
  targets: Target[];
  settings: AppSettings;
  profiles: Profile[];
  activeProfileId: string;
}

export type EngineState = "stopped" | "starting" | "live" | "error";

export type TargetState =
  | "idle"
  | "connecting"
  | "live"
  | "reconnecting"
  | "error"
  | "paused"
  | "waiting"
  /** OBS signal loss after going live, distinct from preflight waiting. */
  | "signal-lost"
  | "brb"
  | "censor";

export interface TargetStatus {
  targetId: string;
  name: string;
  state: TargetState;
  bitrateKbps: number;
  fps: number;
  droppedFrames: number;
  uptimeSec: number;
  message?: string;
}

export interface ObsStats {
  activeFps: number;
  avgRenderMs: number;
  renderSkipped: number;
  outputSkipped: number;
  /** Output congestion, 0–1. */
  congestion: number;
}

export interface EngineSnapshot {
  state: EngineState;
  startedAt: number | null;
  /** Input video can be present before any destination accepts its connection. */
  ingestLive?: boolean;
  targets: Record<string, TargetStatus>;
  message?: string;
  /** Current live-operation UUID shared by UI and native engine. */
  operationId?: string;
  /** Opaque native failure UUID for a correlated diagnostic event. */
  errorId?: string;
  /** Observed CPU and GPU usage percentages. */
  cpu?: number;
  gpu?: number;
  memoryPct?: number;
  obs?: ObsStats;
  forcedBrb?: boolean;
  guardianStatus?: "starting" | "ready" | "unavailable";
}

export interface EncoderInfo {
  kind: EncoderKind;
  label: string;
  available: boolean;
  /** Estimated simultaneous hardware sessions, not a measured limit. */
  maxSessions?: number;
}

export interface SessionPlatform {
  id: string;
  name: string;
  platformId: PlatformId;
}

export interface SessionMeta {
  /** Native size/mtime revision invalidates summaries after external edits. */
  sourceRevision?: string;
  id: string;
  startedAt: number;
  endedAt?: number;
  durationSec: number;
  mode: EncodingMode;
  platforms: SessionPlatform[];
  /** Derived from file existence, not merely recording entries in NDJSON. */
  hasVideo?: boolean;
  hasChat?: boolean;
}

export interface SessionSampleTarget {
  id: string;
  name: string;
  state: TargetState;
  bitrate: number;
  fps: number;
  dropped: number;
}

/** At most three competing processes, without paths, command lines or window titles. */
export interface SessionResourceApp {
  appRef: string;
  name: string;
  /** Percentage of whole-machine capacity, 0–100. */
  cpu: number;
  memoryMb: number;
  gpu3d?: number;
  gpuEncode?: number;
}

export interface SessionSample {
  t: number;
  cpu?: number;
  gpu?: number;
  memoryPct?: number;
  /** Sparse process sampling, normally about every six seconds and faster under pressure. */
  apps?: SessionResourceApp[];
  obs?: ObsStats;
  /** Chat messages during this sample window, approximately two seconds. */
  chat?: number;
  /** Counts keyed by platform:source; absent in legacy sessions and windows with no messages. */
  chatBy?: Record<string, number>;
  targets: SessionSampleTarget[];
}

export interface SessionMarker {
  t: number;
  label: string;
}

export interface SessionViewerSample {
  t: number;
  total: number;
  items: { platform: ChatPlatform; source: string; viewers: number | null }[];
}

/** Absolute follower totals; gains require differences between samples. */
export interface SessionFollowerSample {
  t: number;
  items: { platform: ChatPlatform; source: string; total: number }[];
}

export interface SessionAlertEvent {
  t: number;
  platform: ChatPlatform;
  /** Source label in the viewers/chatBy namespace; absent in legacy records. Aggregator alerts use their aggregator as platform. */
  source?: string;
  kind: AlertKind;
  user: string;
  amount?: number;
}

/** Only error prevents recording; other fields are advisory. */
export interface RecordDirCheck {
  ok: boolean;
  /** Stable protocol reason translated by the frontend. */
  error?: string;
  freeBytes?: number;
  lowSpace: boolean;
  removableOrNetwork: boolean;
  longPath: boolean;
}

/** Compact persisted chat fields: t epoch, p platform, s source, a author, c color, m text, i native ID. */
export interface ReplayChatMessage {
  t: number;
  p: ChatPlatform;
  s: string;
  a: string;
  c?: string;
  m: string;
  i?: string;
  /** Moderated after delivery; replay hides the message by default. */
  deleted?: boolean;
}

export interface ReplayChatGap {
  t: number;
  from: number;
}

export interface SessionData {
  meta: SessionMeta;
  samples: SessionSample[];
  markers: SessionMarker[];
  viewerSamples: SessionViewerSample[];
  followerSamples: SessionFollowerSample[];
  alertEvents: SessionAlertEvent[];
  recordings: SessionRecording[];
  clockJumps: { t: number; delta: number }[];
  /** Manual replay synchronization offset in milliseconds. */
  offsetMs: number;
}

export interface SessionRecording {
  seg: number;
  t: number;
  path: string;
  codec: string;
  estimated: boolean;
  syncs: { t: number; out: number }[];
  endT: number;
  reason?: string;
  finalized: boolean;
}

export interface SessionSummary {
  /** false means no usable samples; do not render summary metrics. */
  hasData: boolean;
  peakViewers: number | null;
  avgViewers: number | null;
  chatTotal: number | null;
  problemWindows: number;
  verdictTone: "ok" | "warn" | "bad";
}
