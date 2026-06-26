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
    note: "Sem ser parceiro, a Twitch aguenta uns 6000 kbps (quanto de dado por segundo — mais sobe a qualidade da imagem, mas pesa no seu upload). Ela tem servidores em várias regiões; o mais perto de você costuma travar menos.",
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
    note: "Aceita imagem pesada numa boa (bitrate alto = mais dado por segundo, mais qualidade). Peça pro seu OBS mandar um keyframe (quadro que reinicia a imagem) a cada 2 s — no máximo 4 s.",
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
    note: "Só entra com conexão criptografada (RTMPS). O modo antigo sem proteção saiu de cena — aqui já vai do jeito certo.",
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
    note: "Copie a URL e a chave certinhas no painel de criador da Kick — é lá que ela gera as suas.",
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
    note: "Vídeo em pé (720×1280, formato de celular). Pra transmitir, a TikTok precisa liberar sua conta — e nem todo mundo consegue a chave sozinho.",
    experimental: true,
  },
  x: {
    id: "x",
    name: "X (Twitter)",
    color: "#1d9bf0",
    protocol: "rtmp",
    ingestUrl: "rtmp://",
    recommended: p(1280, 720, 30, 3000, 128),
    note: "A chave de transmissão sai do Media Studio do X — é lá que você a gera.",
    experimental: true,
  },
  instagram: {
    id: "instagram",
    name: "Instagram",
    color: "#E1306C",
    protocol: "rtmp",
    ingestUrl: "rtmp://",
    recommended: p(720, 1280, 30, 2500, 128),
    note: "O Instagram não tem uma entrada oficial firme pra receber transmissão de fora — por isso aqui é experimental e pode falhar.",
    experimental: true,
  },
  custom: {
    id: "custom",
    name: "Personalizado",
    color: "#8b93a7",
    protocol: "rtmp",
    ingestUrl: "rtmp://",
    recommended: p(1920, 1080, 30, 4500, 160),
    note: "Você mesmo informa o endereço e o tipo de conexão (RTMP, RTMPS ou SRT) — serve pra qualquer destino fora da lista.",
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
