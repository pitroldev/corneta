import type { I18n, MessageKey } from "./i18n";
import type { PlatformId, PlatformPreset, VideoPreset } from "./types";

// ============================================================
// Catálogo de plataformas (valores de REFERÊNCIA — ver PLANEJAMENTO.md §8.5/§9).
// Numa versão futura isto vira um JSON remoto versionado, validado pelo app.
//
// Aqui fica IDENTIDADE e NÚMERO: id, cor de marca, protocolo, URL de ingestão,
// preset recomendado. A copy (observação didática, frase do picker) vive no
// dicionário — o catálogo guarda só o ENDEREÇO dela, ver NOTE_KEYS/TAGLINE_KEYS.
// ============================================================

const p = (
  width: number,
  height: number,
  fps: number,
  videoBitrateKbps: number,
  audioBitrateKbps = 160,
  keyframeSec = 2,
): VideoPreset => ({
  width,
  height,
  fps,
  videoBitrateKbps,
  audioBitrateKbps,
  keyframeSec,
});

export const PLATFORMS: Record<PlatformId, PlatformPreset> = {
  twitch: {
    id: "twitch",
    name: "Twitch",
    color: "#9146FF",
    protocol: "rtmp",
    ingestUrl: "rtmp://live.twitch.tv/app",
    recommended: p(1920, 1080, 60, 6000, 160),
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
    // Raiz do LIVE Center — o path interno pode 404 pra quem não tem LIVE liberado.
    keyUrl: "https://livecenter.tiktok.com/",
    experimental: true,
  },
  x: {
    id: "x",
    name: "X (Twitter)",
    color: "#1d9bf0",
    protocol: "rtmp",
    ingestUrl: "rtmp://",
    recommended: p(1280, 720, 30, 3000, 128),
    keyUrl: "https://studio.x.com/producer",
    experimental: true,
  },
  instagram: {
    id: "instagram",
    name: "Instagram",
    color: "#E1306C",
    protocol: "rtmp",
    ingestUrl: "rtmp://",
    recommended: p(720, 1280, 30, 2500, 128),
    experimental: true,
  },
  custom: {
    id: "custom",
    // DADO, não copy da tela: é o nome padrão que o destino recebe ao nascer
    // (factory.ts) e que o streamer pode reescrever. Pra EXIBIR o rótulo da
    // plataforma no idioma ativo use platformName() — ver core.platform.custom.name.
    name: "Personalizado",
    color: "#8b93a7",
    protocol: "rtmp",
    ingestUrl: "rtmp://",
    recommended: p(1920, 1080, 30, 4500, 160),
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

// Endereço da copy de cada plataforma no dicionário. É um Record fechado de
// propósito: se um id novo entrar no catálogo, o TypeScript cobra a frase aqui.
const NOTE_KEYS: Record<PlatformId, MessageKey> = {
  twitch: "core.platform.twitch.note",
  youtube: "core.platform.youtube.note",
  facebook: "core.platform.facebook.note",
  kick: "core.platform.kick.note",
  tiktok: "core.platform.tiktok.note",
  x: "core.platform.x.note",
  instagram: "core.platform.instagram.note",
  custom: "core.platform.custom.note",
};

const TAGLINE_KEYS: Record<PlatformId, MessageKey> = {
  twitch: "core.platform.tagline.twitch",
  youtube: "core.platform.tagline.youtube",
  facebook: "core.platform.tagline.facebook",
  kick: "core.platform.tagline.kick",
  tiktok: "core.platform.tagline.tiktok",
  x: "core.platform.tagline.x",
  instagram: "core.platform.tagline.instagram",
  custom: "core.platform.tagline.custom",
};

/** Observação didática exibida embaixo do card do destino, no idioma ativo. */
export const platformNote = (id: PlatformId, t: I18n["t"]): string =>
  t(NOTE_KEYS[id]);

/** Descrição curta e humana pro picker — o pré-requisito aparece ANTES do clique
 *  (protocolo em caixa alta não diz nada pra quem não é técnico). */
export const platformTagline = (id: PlatformId, t: I18n["t"]): string =>
  t(TAGLINE_KEYS[id]);

/** Nome exibido da plataforma. Marca não se traduz (Twitch é Twitch em toda
 *  língua); só o RTMP fora da lista é copy — e essa vem do dicionário.
 *
 *  `PLATFORMS[id].name` continua valendo como DADO (o padrão gravado no
 *  destino); pra mostrar na tela, use esta função. */
export const platformName = (id: PlatformId, t: I18n["t"]): string =>
  id === "custom" ? t("core.platform.custom.name") : PLATFORMS[id].name;

/** Iniciais para o "glifo" colorido da plataforma na UI. */
export function platformInitials(id: PlatformId): string {
  switch (id) {
    case "twitch":
      return "Tw";
    case "youtube":
      return "YT";
    case "facebook":
      return "Fb";
    case "kick":
      return "Ki";
    case "tiktok":
      return "Tk";
    case "x":
      return "X";
    case "instagram":
      return "Ig";
    default:
      return "•";
  }
}
