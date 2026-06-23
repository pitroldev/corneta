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
  /** Plataforma cuja chave não é auto-serviço / suporte experimental. */
  experimental?: boolean;
}

/** Configuração de encoding de um destino específico. */
export interface TargetEncoding {
  action: EncodingAction;
  /** Quando action = "transcode": parâmetros de saída. */
  preset?: VideoPreset;
  encoder: EncoderKind;
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
  state: TargetState;
  bitrateKbps: number;
  fps: number;
  droppedFrames: number;
  uptimeSec: number;
  message?: string;
}

export interface EngineSnapshot {
  state: EngineState;
  startedAt: number | null;
  targets: Record<string, TargetStatus>;
  message?: string;
}

export interface EncoderInfo {
  kind: EncoderKind;
  label: string;
  available: boolean;
  /** Sessões simultâneas estimadas (heurística). */
  maxSessions?: number;
}
