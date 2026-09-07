import type { I18n, MessageKey } from "./i18n";
import type { PlatformId, PlatformPreset, VideoPreset } from "./types";

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
    ingestUrl: "rtmp://",
    recommended: p(720, 1280, 30, 3000, 128),
    // Use the LIVE Center root; account-restricted internal paths may not resolve.
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
    // Persisted default name, editable by the user; display platformName() for localized labels.
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

export const platformNote = (id: PlatformId, t: I18n["t"]): string =>
  t(NOTE_KEYS[id]);

export const platformTagline = (id: PlatformId, t: I18n["t"]): string =>
  t(TAGLINE_KEYS[id]);

export const platformName = (id: PlatformId, t: I18n["t"]): string =>
  id === "custom" ? t("core.platform.custom.name") : PLATFORMS[id].name;
