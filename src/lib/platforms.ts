import type { PlatformId, PlatformPreset, VideoPreset } from "./types";

// ============================================================
// Catálogo de plataformas (valores de REFERÊNCIA — ver PLANEJAMENTO.md §8.5/§9).
// Numa versão futura isto vira um JSON remoto versionado, validado pelo app.
// ============================================================

const p = (
  width: number,
  height: number,
  fps: number,
  videoBitrateKbps: number,
  audioBitrateKbps = 160,
  keyframeSec = 2
): VideoPreset => ({ width, height, fps, videoBitrateKbps, audioBitrateKbps, keyframeSec });

export const PLATFORMS: Record<PlatformId, PlatformPreset> = {
  twitch: {
    id: "twitch",
    name: "Twitch",
    color: "#9146FF",
    protocol: "rtmp",
    ingestUrl: "rtmp://live.twitch.tv/app",
    recommended: p(1920, 1080, 60, 6000, 160),
    note: "Limite prático ~6000 kbps (não-parceiros). Há ingests regionais.",
    keyUrl: "https://dashboard.twitch.tv/settings/stream",
    liveUrl: "https://dashboard.twitch.tv/stream-manager",
  },
  youtube: {
    id: "youtube",
    name: "YouTube",
    color: "#FF0000",
    protocol: "rtmp",
    ingestUrl: "rtmp://a.rtmp.youtube.com/live2",
    recommended: p(1920, 1080, 60, 9000, 192),
    note: "Aceita bitrate alto. Keyframe a cada 2 s (máx 4 s).",
    keyUrl: "https://studio.youtube.com/channel/live/streaming",
    liveUrl: "https://studio.youtube.com/channel/live",
  },
  facebook: {
    id: "facebook",
    name: "Facebook",
    color: "#1877F2",
    protocol: "rtmps",
    ingestUrl: "rtmps://live-api-s.facebook.com:443/rtmp",
    recommended: p(1280, 720, 30, 4000, 128),
    note: "Exige RTMPS (TLS). RTMP puro foi descontinuado.",
    keyUrl: "https://www.facebook.com/live/producer",
    liveUrl: "https://www.facebook.com/live/producer",
  },
  kick: {
    id: "kick",
    name: "Kick",
    color: "#53FC18",
    protocol: "rtmps",
    ingestUrl: "rtmps://fa723fc1b171.global-contribute.live-video.net/app",
    recommended: p(1920, 1080, 60, 6000, 160),
    note: "Pega a URL/chave exatas no painel do criador.",
    keyUrl: "https://kick.com/dashboard/settings/stream",
    liveUrl: "https://kick.com/dashboard/stream",
  },
  tiktok: {
    id: "tiktok",
    name: "TikTok",
    color: "#25F4EE",
    protocol: "rtmp",
    ingestUrl: "rtmp://", // fornecido pelo painel (varia)
    recommended: p(720, 1280, 30, 3000, 128),
    note: "Vertical 720×1280. Acesso ao Live exige elegibilidade; chave nem sempre é auto-serviço.",
    experimental: true,
  },
  x: {
    id: "x",
    name: "X (Twitter)",
    color: "#1d9bf0",
    protocol: "rtmp",
    ingestUrl: "rtmp://",
    recommended: p(1280, 720, 30, 3000, 128),
    note: "Chave gerada no Media Studio.",
    experimental: true,
  },
  instagram: {
    id: "instagram",
    name: "Instagram",
    color: "#E1306C",
    protocol: "rtmp",
    ingestUrl: "rtmp://",
    recommended: p(720, 1280, 30, 2500, 128),
    note: "Sem ingestão RTMP oficial estável — suporte experimental.",
    experimental: true,
  },
  custom: {
    id: "custom",
    name: "Personalizado",
    color: "#8b93a7",
    protocol: "rtmp",
    ingestUrl: "rtmp://",
    recommended: p(1920, 1080, 30, 4500, 160),
    note: "Defina URL e protocolo manualmente (RTMP/RTMPS/SRT).",
  },
};

export const PLATFORM_LIST: PlatformPreset[] = [
  PLATFORMS.twitch,
  PLATFORMS.youtube,
  PLATFORMS.facebook,
  PLATFORMS.kick,
  PLATFORMS.tiktok,
  PLATFORMS.x,
  PLATFORMS.instagram,
  PLATFORMS.custom,
];

/** Iniciais para o "glifo" colorido da plataforma na UI. */
export function platformInitials(id: PlatformId): string {
  switch (id) {
    case "twitch": return "Tw";
    case "youtube": return "YT";
    case "facebook": return "Fb";
    case "kick": return "Ki";
    case "tiktok": return "Tk";
    case "x": return "X";
    case "instagram": return "Ig";
    default: return "•";
  }
}
