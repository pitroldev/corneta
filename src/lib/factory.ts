import type { AppConfig, PlatformId, Target } from "./types";
import { PLATFORMS } from "./platforms";
import { INGEST_URL_RE } from "./validation";
import { uid } from "./utils";

export function makeTarget(platformId: PlatformId): Target {
  const preset = PLATFORMS[platformId];
  return {
    id: uid("tgt"),
    platformId,
    name: preset.name,
    enabled: true,
    protocol: preset.protocol,
    ingestUrl: INGEST_URL_RE.test(preset.ingestUrl) ? preset.ingestUrl : "",
    hasKey: false,
    encoding: {
      action: "transcode",
      preset: { ...preset.recommended },
      encoder: "auto",
    },
  };
}

export function defaultConfig(): AppConfig {
  const targets = [makeTarget("twitch"), makeTarget("youtube")];
  const profId = uid("prof");
  return {
    schemaVersion: 1,
    revision: 0,
    ingest: {
      protocol: "rtmp",
      host: "127.0.0.1",
      port: 1935,
      app: "live",
      key: "obs",
    },
    mode: "hybrid",
    targets,
    settings: {
      minimizeToTray: true,
      autostart: false,
      obsPassword: "",
      autoStartObs: true,
      liveShortcut: "CommandOrControl+Alt+L",
      youtubeApiKey: "",
      chatSources: [],
      alertSources: [],
      chatShowEmotes: true,
      chatShowBadges: true,
      chatShowPlatform: true,
      chatShowSource: false,
      chatShowTimestamps: false,
      chatShowViewers: true,
      theme: "dark",
      language: "auto",
      chatFontSize: 14,
      alertFontSize: 14,
      chatBothLayout: "auto",
      chatBothAlertsFirst: false,
      chatBothSplit: 35,
      brbEnabled: false,
      brbSlateKind: "auto",
      autoBitrate: true,
      guardianEnabled: false,
      guardianWatchlist: [],
      loudnessNormalize: false,
      loudnessTargetLufs: -14,
      youtubeAutoLive: true,
      streamTitle: "",
      chatAutoConnect: true,
      chatPopoutTab: "both",
      chatShowAlertsPanel: false,
      overlayEnabled: false,
      overlaySound: true,
      overlayPosition: "top",
      overlayPort: 7393,
      overlayChatPosition: "bottom",
      overlayDurationSecs: 6,
      overlayScale: "md",
      overlayShowFollows: true,
      overlayChatSize: 22,
      overlayChatMax: 12,
      overlayChatBadges: true,
      overlayChatPlatform: true,
      overlayChatHideCommands: false,
      overlayChatFadeSecs: 0,
      // Keep both recording defaults disabled, matching Rust Settings::default().
      recordVideo: false,
      recordVideoDir: "",
      recordVideoKeepGb: 20,
      recordChat: false,
    },
    profiles: [{ id: profId, name: "Padrão", mode: "hybrid", targets }],
    activeProfileId: profId,
  };
}

export function obsIngestUrl(cfg: AppConfig["ingest"]): string {
  return `${cfg.protocol}://${cfg.host}:${cfg.port}/${cfg.app}`;
}
