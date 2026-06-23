import type { AppConfig, PlatformId, Target } from "./types";
import { PLATFORMS } from "./platforms";
import { uid } from "./utils";

/** Cria um destino a partir do preset de uma plataforma. */
export function makeTarget(platformId: PlatformId): Target {
  const preset = PLATFORMS[platformId];
  return {
    id: uid("tgt"),
    platformId,
    name: preset.name,
    enabled: true,
    protocol: preset.protocol,
    ingestUrl: preset.ingestUrl,
    hasKey: false,
    encoding: {
      // MVP lidera com encoding por plataforma (PLANEJAMENTO.md §12.1).
      action: "transcode",
      preset: { ...preset.recommended },
      encoder: "auto",
    },
  };
}

/** Configuração inicial (primeira execução / demo). */
export function defaultConfig(): AppConfig {
  const targets = [makeTarget("twitch"), makeTarget("youtube")];
  const profId = uid("prof");
  return {
    ingest: { protocol: "rtmp", host: "127.0.0.1", port: 1935, app: "live", key: "obs" },
    mode: "hybrid",
    targets,
    settings: {
      minimizeToTray: true,
      autostart: false,
      obsPassword: "",
      youtubeApiKey: "",
      chatSources: [],
      chatShowEmotes: true,
      chatShowBadges: true,
      chatShowPlatform: true,
      chatShowSource: false,
      chatShowTimestamps: false,
    },
    profiles: [{ id: profId, name: "Padrão", mode: "hybrid", targets }],
    activeProfileId: profId,
  };
}

/** URL completa que o OBS deve usar (sem expor a chave do destino). */
export function obsIngestUrl(cfg: AppConfig["ingest"]): string {
  return `${cfg.protocol}://${cfg.host}:${cfg.port}/${cfg.app}`;
}
