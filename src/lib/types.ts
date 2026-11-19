/** A destination id: the folder name of a src/platforms/<id>/destination.json. */
export type PlatformId = string;

export type Protocol = "rtmp" | "rtmps";

export type EncodingAction = "copy" | "transcode";

export type VideoCodec = "h264" | "hevc" | "av1";

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

export interface CopyLimits {
  maxHeight: number;
  maxFps: number;
  maxKbps: number;
  acceptedCodecs?: VideoCodec[];
}

export interface PlatformPreset {
  id: PlatformId;
  /** Picker position; lower comes first. */
  order: number;
  name: string;
  color: string;
  /** SVG path in a 24×24 box; destinations without one show a globe. */
  icon?: string;
  protocol: Protocol;
  /** Ingest URL without the stream key; "rtmp://" alone means the user pastes it. */
  ingestUrl: string;
  recommended: VideoPreset;
  /** The most the platform takes as a copy of the OBS signal. */
  copyLimits?: CopyLimits;
  keyUrl?: string;
  liveUrl?: string;
  experimental?: boolean;
  /** Account provider that can sign in and fill this destination. */
  account?: AccountPlatform;
  /** Position in first-run setup; absent destinations are not offered there. */
  setupRank?: number;
  /** Part of a brand-new configuration. */
  starter?: boolean;
  /** The platform's own test mode: receives a stream without showing it on the channel. */
  rehearsal?: { testFlag: string; hosts: string[] };
  /** The ingest URL varies by account or region, so the field stays editable. */
  regionalIngest?: boolean;
  /** Custom ingests may need OBS-style publisher metadata and a separate playpath. */
  publisherCompat?: boolean;
  /** The catalog name is a persisted default; the interface shows core.platform.<id>.name instead. */
  localizedName?: boolean;
  /** Stands in for destination ids the catalog no longer knows, such as in old sessions. */
  fallback?: boolean;
  /** The user brings any server, so the card shows its protocol instead of platform help. */
  userServer?: boolean;
}

/** A crop: x/y pan within 0–1; zoom is the crop height fraction. */
export interface CropBox {
  x: number;
  y: number;
  zoom: number;
}

/**
 * Portrait crop: x/y pan within 0–1; zoom within 0.25–1. The root crop is the whole frame,
 * or its lower region when split.
 */
export interface Reframe extends CropBox {
  /** `split` stacks a camera region over the root crop; absent keeps one frame. */
  layout?: "single" | "split";
  /** The camera region when split. */
  top?: CropBox;
  /** Share of the output height the camera region takes when split, 0.25–0.5. */
  splitRatio?: number;
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

export type YoutubePrivacy = "public" | "unlisted" | "private";

export interface AppSettings {
  minimizeToTray: boolean;
  autostart: boolean;
  /** Empty means OBS WebSocket authentication is disabled. */
  obsPassword: string;
  autoStartObs: boolean;
  /**
   * The user says the server and key were pasted into OBS by hand. It only counts while the
   * WebSocket cannot answer; when it can, what OBS reports wins.
   */
  obsManual: boolean;
  /** The program the streamer said they use; `null` until they answer, so detection decides. */
  encoderApp: EncoderApp | null;
  liveShortcut: string;
  /** Empty until chosen: an update must not grab global keys the user never asked for. */
  markMomentShortcut: string;
  brbShortcut: string;
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
  loudnessNormalize: boolean;
  /** Integrated loudness target in LUFS. */
  loudnessTargetLufs: number;
  /** Opt-in: a dark game scene can look like a failed capture. */
  blackScreenAlert: boolean;
  /** Opt-in: holding scenes and menus sit still on purpose. */
  frozenFrameAlert: boolean;
  /** Opt-in: a quiet stretch behind a noise gate can read as no sound. */
  silentAudioAlert: boolean;
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
  youtubePrivacy: YoutubePrivacy;
  /** YouTube turns the live chat off for content made for kids. */
  youtubeMadeForKids: boolean;
  /** Persisted across sessions and used for automatic YouTube broadcasts. */
  streamTitle: string;
  /** Last category applied or picked; Twitch and Kick names are not localized. */
  streamCategory: string;
  chatAutoConnect: boolean;
  chatPopoutTab: "chat" | "alerts" | "both";
  chatShowAlertsPanel: boolean;
  overlayEnabled: boolean;
  overlaySound: boolean;
  overlayPosition: string;
  overlayPort: number;
  /** Opt-in: the phone deck listens on the home network only while this is on. */
  deckEnabled: boolean;
  deckPort: number;
  /** Deck action ids in key order; empty means the built-in layout. */
  deckLayout: string[];
  /** Combos built on the phone; the layout refers to them as `combo:<id>`. */
  deckCombos: DeckCombo[];
  /** Paired phones; only native code adds or removes them. */
  deckDevices: DeckDevice[];
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

/** Stable OBS failure kinds from the native side; classify OBS errors by these, never by text. */
export type ObsErrorCode =
  | "connectionFailed"
  | "exchangeFailed"
  | "passwordRequired"
  | "authenticationFailed"
  | "identificationFailed"
  | "requestRefused";

/** OBS output video; the bitrate is only reachable in OBS's simple output mode. */
export interface ObsVideo {
  outputWidth: number;
  outputHeight: number;
  fpsNumerator: number;
  fpsDenominator: number;
  simpleKbps: number | null;
  videoCodec?: VideoCodec;
}

export interface ObsVideoCheck {
  current: ObsVideo;
  /** What fits every destination that copies OBS's signal; null when it already fits. */
  proposal: ObsVideo | null;
  limitKbps: number | null;
  canUndo: boolean;
}

export interface ObsCheck {
  reachable: boolean;
  /** Structured authentication failure flag; do not infer it from localized error text. */
  authFailed?: boolean;
  errorCode?: ObsErrorCode;
  pointingAtCorneta: boolean;
  width: number;
  height: number;
  fps: number;
  videoCodec?: VideoCodec;
  error?: string;
}

/** What Corneta reads about OBS on this PC without connecting to it. */
/** The program that sends the picture to Corneta. Only OBS can be set up and started for the user. */
export type EncoderApp = "obs" | "streamlabs" | "other";

export interface ObsEnvironment {
  installed: boolean;
  running: boolean;
  /** `null` when OBS's settings could not be read. */
  websocketEnabled: boolean | null;
  websocketPort: number | null;
  authRequired: boolean | null;
  /** Streamlabs Desktop is on this PC: it has no WebSocket server, so it is set up by hand. */
  streamlabs: boolean;
}

export type { ChatPlatform } from "../platforms/types";
import type { AccountPlatform, ChatPlatform } from "../platforms/types";

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

export type ChatFragmentKind =
  "text" | "emote" | "gif" | "sticker" | "link" | "mention" | "cheer";

/** One piece of a message; `text` is always the plain-text fallback. */
export interface ChatFragment {
  kind: ChatFragmentKind;
  text?: string;
  /** Image for emotes, GIFs, stickers and cheers; the target for links. */
  url?: string;
  /** Bits in a cheer. */
  amount?: number;
  /** Cheer tier color. */
  color?: string;
  /** Zero-width emote drawn over the previous one. */
  overlay?: boolean;
  /** Power-up: the emote is shown much larger. */
  giant?: boolean;
}

export interface ChatBadge {
  label: string;
  kind: string;
  /** Badge image; without one the label is shown. */
  url?: string;
  /** Tooltip, such as "Subscriber · 14 months". */
  title?: string;
}

export type ChatHighlight =
  | "first"
  | "returning"
  | "highlighted"
  | "redeemed"
  | "announcement"
  | "effect"
  | "pinned"
  | "paid"
  | "celebration"
  | "error";

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
  /** `/me`: the whole line takes the author's color. */
  action?: boolean;
  /** Why the platform singles the message out. */
  highlight?: ChatHighlight;
  /** Accent for announcements and paid highlights. */
  accent?: string;
  /** What the highlight is about, such as a message effect or who pinned it. */
  note?: string;
  /** The message this one replies to, as the platform quotes it. */
  reply?: { author: string; text: string };
  /** Shared chat: sent in another channel of the session. */
  shared?: boolean;
  /** A platform notice with no author line, such as a watch streak or a mode change. */
  system?: boolean;
  /** Sent from this app; the author name is localized, so never match on it. */
  own?: boolean;
}

export interface ChatDelete {
  scope: "message" | "user" | "all";
  platform: string;
  source?: string;
  nativeId?: string;
  author?: string;
  /** Matches the author even when the display name differs from the login. */
  authorId?: string;
  /** A timeout's length; absent for bans and hides. */
  seconds?: number;
}

/** Restrictions a chat reports; each update carries only what changed. */
export interface ChatModes {
  emoteOnly?: boolean;
  subsOnly?: boolean;
  membersOnly?: boolean;
  uniqueChat?: boolean;
  /** Seconds between messages; 0 is off. */
  slow?: number;
  /** Minutes a viewer must follow first; -1 is off. */
  followersOnly?: number;
}

export interface ChatPoll {
  id: string;
  kind: "poll" | "prediction";
  question: string;
  options: { label: string; votes?: number; percent?: number }[];
  total?: number;
  ended: boolean;
}

/** What a source keeps on screen besides messages. */
export type ChatSideEvent =
  | { kind: "modes"; platform: string; source: string; modes: ChatModes }
  | {
      kind: "pin";
      platform: string;
      source: string;
      message: ChatMessage | null;
    }
  | { kind: "poll"; platform: string; source: string; poll: ChatPoll | null };

export interface ChatStatus {
  platform: string;
  source: string;
  status: string;
}

export type ViewerAudienceStatus =
  "live" | "offline" | "unavailable" | "embedded";
/** Where an embedded audience is watching: a chat platform, or a site the app does not read. */
export type ViewerAudienceOrigin = ChatPlatform | "external";

export interface ViewerAudienceMetadata {
  audienceStatus?: ViewerAudienceStatus;
  audienceOrigin?: ViewerAudienceOrigin;
  embeddedViewers?: number;
  title?: string;
  startedAt?: string;
}

export interface ViewerItem extends ViewerAudienceMetadata {
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
  | "superchat"
  | "upgrade"
  | "payforward"
  | "streak"
  | "charity"
  | "gift"
  | "kicks"
  | "reward"
  | "milestone";

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
  /** Sticker or gift artwork. */
  image?: string;
  /** What was given or redeemed: a reward, a gift, a charity or a membership level. */
  title?: string;
}

export interface Profile {
  id: string;
  name: string;
  mode: EncodingMode;
  targets: Target[];
  /** The live context the profile restores with its destinations; absent in older profiles. */
  streamTitle?: string;
  streamCategory?: string;
  youtubePrivacy?: YoutubePrivacy;
}

/** A category name from the platforms' search, with the platforms that returned it. */
export interface CategorySuggestion {
  name: string;
  platforms: AccountPlatform[];
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
  | "brb";

export interface TargetStatus {
  targetId: string;
  name: string;
  /** Kept with the status so the live panel lists what is streaming even after config edits. */
  platformId: PlatformId;
  /** How this live sends the destination; a re-encode requested mid-live switches it. */
  action: EncodingAction;
  /** The user asked mid-live to re-encode what OBS sent, so platform warnings may lag behind. */
  reencoded?: boolean;
  state: TargetState;
  bitrateKbps: number;
  fps: number;
  droppedFrames: number;
  uptimeSec: number;
  message?: string;
  /** What the platform itself reports about this destination's live, when it can be asked. */
  platform?: PlatformCheck;
}

export type PlatformHealth = "good" | "ok" | "bad" | "noData";

export interface PlatformIssue {
  /** The platform's own issue token, such as YouTube's configuration issue types. */
  kind: string;
  severity: "info" | "warning" | "error";
}

export type RehearsalOutcome =
  "pending" | "received" | "warned" | "refused" | "failed" | "skipped";

export interface RehearsalTarget {
  targetId: string;
  platformId: string;
  name: string;
  /** How the platform can receive without showing anything; `null` when it cannot. */
  route: "bandwidthTest" | "privateBroadcast" | null;
  outcome: RehearsalOutcome;
  issues?: PlatformIssue[];
  /** Localized reason for a refusal or failure. */
  detail?: string;
  /** Why a skipped platform was left out: no key for its test mode yet, or no test mode. */
  skip?: "noKey" | "noTestMode";
}

/** Progress and result of a private run of the whole chain. */
export interface RehearsalReport {
  phase: "starting" | "waitingObs" | "sending" | "done";
  /** Corneta pressed play in OBS itself. */
  obsStarted: boolean;
  signalArrived: boolean;
  hasAudio: boolean;
  signalKbps?: number;
  secondsLeft: number;
  targets: RehearsalTarget[];
  /** A frame of what arrived, as a data URL. */
  thumbnail?: string;
  cancelled: boolean;
}

export interface PlatformCheck {
  state: "confirmed" | "notLive";
  health?: PlatformHealth;
  issues?: PlatformIssue[];
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
  /** Stable code of the failure behind `message`, when the engine knows it. */
  errorCode?: string;
  /** Observed CPU and GPU usage percentages. */
  cpu?: number;
  gpu?: number;
  memoryPct?: number;
  obs?: ObsStats;
  forcedBrb?: boolean;
  /** The OBS picture has stayed fully black long enough to warn. */
  blackScreen?: boolean;
  /** The OBS picture has not moved long enough to warn. */
  frozenScreen?: boolean;
  /** OBS has sent no audible sound long enough to warn. */
  silentAudio?: boolean;
}

/** What a platform did with a moment marked during the live. */
export interface PlatformMark {
  platform: string;
  outcome: "marked" | "unavailable" | "reconnect" | "failed";
}

export interface DeckDevice {
  id: string;
  name: string;
  pairedAt: number;
}

export type DeckComboAction =
  "mark" | "brb" | "mic" | "scene" | "say" | "pause" | "wait";

/** One combo step; only the fields its action uses are set. */
export interface DeckComboStep {
  action: DeckComboAction;
  label?: string;
  on?: boolean;
  muted?: boolean;
  scene?: string;
  text?: string;
  platform?: string;
  paused?: boolean;
  seconds?: number;
}

export interface DeckCombo {
  id: string;
  name: string;
  steps: DeckComboStep[];
}

export interface DeckStatus {
  running: boolean;
  port: number;
  /** LAN address the phone opens, like "192.168.0.12:7394". */
  address?: string | null;
  error?: string | null;
  devices: (DeckDevice & { connected: boolean })[];
}

export interface DeckPairTicket {
  url: string;
  expiresInMs: number;
}

export interface DeckPairRequest {
  requestId: string;
  name: string;
  code: string;
}

/** Start and stop asked by a phone run in the main window, like its own buttons. */
export interface DeckDesktopRequest {
  id: string;
  action: "start" | "stop";
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
  total: number | null;
  items: (Omit<ViewerItem, "live"> & { live?: boolean })[];
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
  /** Emotes, GIFs and links, when the message had more than text. */
  f?: ChatFragment[];
  b?: ChatBadge[];
  h?: ChatHighlight;
  r?: { author: string; text: string };
  me?: boolean;
  sys?: boolean;
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
