// ============================================================
// Corneta — modelo de dados (compartilhado conceitualmente com o backend Rust)
// ============================================================

export type PlatformId =
  | "twitch"
  | "youtube"
  | "facebook"
  | "kick"
  | "tiktok"
  | "x"
  | "instagram"
  | "custom";

export type Protocol = "rtmp" | "rtmps" | "srt";

/** O que o relay faz com cada destino. */
export type EncodingAction = "copy" | "transcode";

/** Modo global de encoding (ver PLANEJAMENTO.md §8). */
export type EncodingMode = "per-platform" | "passthrough" | "hybrid";

/** Encoders de hardware suportados. */
export type EncoderKind =
  | "auto"
  | "nvenc"
  | "qsv"
  | "amf"
  | "videotoolbox"
  | "software";

export interface VideoPreset {
  width: number;
  height: number;
  fps: number;
  videoBitrateKbps: number;
  audioBitrateKbps: number;
  keyframeSec: number;
}

/** Catálogo de uma plataforma (valores de referência — atualizáveis). */
export interface PlatformPreset {
  id: PlatformId;
  name: string;
  /** Cor de marca para a UI. */
  color: string;
  protocol: Protocol;
  /** URL de ingestão (sem a chave). */
  ingestUrl: string;
  /** Configuração recomendada de encoding. */
  recommended: VideoPreset;
  /** Observações didáticas exibidas na UI. */
  note?: string;
  /** Página do painel onde o usuário pega a stream key. */
  keyUrl?: string;
  /** Plataforma cuja chave não é auto-serviço / suporte experimental. */
  experimental?: boolean;
}

/** Configuração de encoding de um destino específico. */
export interface TargetEncoding {
  /** Legado — não usado; o híbrido decide via hybridOverride/auto. */
  action: EncodingAction;
  /** Parâmetros de saída quando recodifica. */
  preset?: VideoPreset;
  encoder: EncoderKind;
  /** No modo híbrido: override manual. undefined = decisão automática. */
  hybridOverride?: EncodingAction;
}

/** Um destino de transmissão configurado pelo usuário. */
export interface Target {
  id: string;
  platformId: PlatformId;
  name: string;
  enabled: boolean;
  protocol: Protocol;
  ingestUrl: string;
  /** A chave NUNCA é guardada aqui — só sabemos se existe no cofre. */
  hasKey: boolean;
  encoding: TargetEncoding;
}

/** Endpoint local que o OBS usa para publicar. */
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
  /** Senha do obs-websocket (vazio = sem auth). */
  obsPassword: string;
  /** Ligar/parar o OBS junto com o BORA AO VIVO. */
  autoStartObs: boolean;
  /** Atalho global pra começar/parar (acelerador do Tauri). */
  liveShortcut: string;
  /** Chat: API key do YouTube Data API v3 (compartilhada entre as fontes do YouTube). */
  youtubeApiKey: string;
  /** Chat: fontes (várias por plataforma). */
  chatSources: ChatSource[];
  /** Exibição do chat. */
  chatShowEmotes: boolean;
  chatShowBadges: boolean;
  chatShowPlatform: boolean;
  chatShowSource: boolean;
  chatShowTimestamps: boolean;
}

export type ChatPlatform = "twitch" | "youtube" | "kick";

export interface ChatSource {
  id: string;
  platform: ChatPlatform;
  value: string;
  name: string;
  enabled: boolean;
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
  nativeId?: string;
  color?: string;
  text: string;
  fragments: ChatFragment[];
  badges: ChatBadge[];
  ts: number;
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
  status: string; // connected | disconnected | error
}

export interface Profile {
  id: string;
  name: string;
  mode: EncodingMode;
  targets: Target[];
}

export interface AppConfig {
  ingest: IngestConfig;
  mode: EncodingMode;
  targets: Target[];
  settings: AppSettings;
  profiles: Profile[];
  activeProfileId: string;
}

// ---- Estado de execução ----

export type EngineState = "stopped" | "starting" | "live" | "error";

export type TargetState =
  | "idle"
  | "connecting"
  | "live"
  | "reconnecting"
  | "error";

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
  /** Congestionamento de saída (0..1). */
  congestion: number;
}

export interface EngineSnapshot {
  state: EngineState;
  startedAt: number | null;
  targets: Record<string, TargetStatus>;
  message?: string;
  /** Uso real de CPU/GPU (%) enquanto transmite. */
  cpu?: number;
  gpu?: number;
  /** Stats do OBS (se conectado via obs-websocket). */
  obs?: ObsStats;
}

export interface EncoderInfo {
  kind: EncoderKind;
  label: string;
  available: boolean;
  /** Sessões simultâneas estimadas (heurística). */
  maxSessions?: number;
}

// ---- Relatório pós-live ----

export interface SessionPlatform {
  id: string;
  name: string;
  platformId: PlatformId;
}

export interface SessionMeta {
  id: string;
  startedAt: number;
  endedAt?: number;
  durationSec: number;
  mode: EncodingMode;
  platforms: SessionPlatform[];
}

export interface SessionSampleTarget {
  id: string;
  name: string;
  state: TargetState;
  bitrate: number;
  fps: number;
  dropped: number;
}

export interface SessionSample {
  t: number;
  cpu?: number;
  gpu?: number;
  obs?: ObsStats;
  targets: SessionSampleTarget[];
}

export interface SessionData {
  meta: SessionMeta;
  samples: SessionSample[];
}
