import { Bell, Eye, LogIn, MonitorPlay, Tv2 } from "lucide-react";
import { type Translate } from "../../lib/chatSend";
import { type MessageKey } from "../../lib/i18n";
import type { AlertSourceKind, ChatPlatform } from "../../lib/types";

export const PLATFORM_OPTS: { value: ChatPlatform; label: string }[] = [
  { value: "twitch", label: "Twitch" },
  { value: "kick", label: "Kick" },
  { value: "youtube", label: "YouTube" },
  { value: "cinefy", label: "Cinefy · experimental" },
];

export const CHAT_PLATFORM_LABEL: Record<ChatPlatform, string> = {
  twitch: "Twitch",
  kick: "Kick",
  youtube: "YouTube",
  cinefy: "Cinefy",
};

export const VALUE_LABEL: Record<ChatPlatform, MessageKey> = {
  twitch: "chat.source.value.twitch",
  kick: "chat.source.value.kick",
  youtube: "chat.source.value.youtube",
  cinefy: "chat.source.value.cinefy",
};

export const PLACEHOLDER: Record<ChatPlatform, MessageKey> = {
  twitch: "chat.source.placeholder.twitch",
  kick: "chat.source.placeholder.kick",
  youtube: "chat.source.placeholder.youtube",
  cinefy: "chat.source.placeholder.cinefy",
};

export const HINT: Record<ChatPlatform, MessageKey> = {
  twitch: "chat.source.hint.twitch",
  kick: "chat.source.hint.kick",
  youtube: "chat.source.hint.youtube",
  cinefy: "chat.source.hint.cinefy",
};

export type ConfigTab =
  "canais" | "conta" | "alertas" | "overlays" | "exibicao";

export const CONFIG_TABS: {
  id: ConfigTab;
  labelKey: MessageKey;
  icon: typeof Tv2;
}[] = [
  { id: "canais", labelKey: "chat.config.tab.channels", icon: Tv2 },
  { id: "conta", labelKey: "chat.config.tab.account", icon: LogIn },
  { id: "alertas", labelKey: "chat.config.tab.alerts", icon: Bell },
  { id: "overlays", labelKey: "chat.config.tab.overlays", icon: MonitorPlay },
  { id: "exibicao", labelKey: "chat.config.tab.display", icon: Eye },
];

// Values are overlay query parameters; only labels may be localized.
export const overlayPosOpts = (t: Translate) => [
  { value: "top", label: t("chat.overlay.pos.top") },
  { value: "bottom", label: t("chat.overlay.pos.bottom") },
  { value: "center", label: t("chat.overlay.pos.center") },
  { value: "top-left", label: t("chat.overlay.pos.topLeft") },
  { value: "top-right", label: t("chat.overlay.pos.topRight") },
  { value: "bottom-left", label: t("chat.overlay.pos.bottomLeft") },
  { value: "bottom-right", label: t("chat.overlay.pos.bottomRight") },
];

export const chatPosOpts = (t: Translate) => [
  { value: "bottom", label: t("chat.overlay.chatPos.bottom") },
  { value: "top", label: t("chat.overlay.chatPos.top") },
];

export const scaleOpts = (t: Translate) => [
  { value: "sm", label: t("chat.overlay.scale.sm") },
  { value: "md", label: t("chat.overlay.scale.md") },
  { value: "lg", label: t("chat.overlay.scale.lg") },
];

export const statusDot = (status: string) =>
  status === "connected"
    ? "bg-ok"
    : status === "error"
      ? "bg-bad"
      : status === "waiting"
        ? "bg-warn animate-pulse"
        : "bg-ink-faint";

export const statusLabel = (t: Translate, status: string) =>
  status === "connected"
    ? t("chat.status.label.live")
    : status === "error"
      ? t("chat.status.label.dropped")
      : status === "waiting"
        ? t("chat.status.label.waiting")
        : t("chat.status.label.connecting");

export const statusExplain = (
  t: Translate,
  platform: string,
  status: string,
) => {
  if (status === "connected") return t("chat.status.explain.live");
  if (status === "waiting")
    return platform === "youtube"
      ? t("chat.status.explain.waiting.youtube")
      : t("chat.status.explain.waiting");
  if (status === "error") {
    if (platform === "kick") return t("chat.status.explain.error.kick");
    if (platform === "youtube") return t("chat.status.explain.error.youtube");
    if (platform === "cinefy") return t("chat.status.explain.error.cinefy");
    return t("chat.status.explain.error");
  }
  return t("chat.status.explain.connecting");
};

export const ALERT_META: Record<
  AlertSourceKind,
  { label: string; placeholder: string; hintKey: MessageKey }
> = {
  streamlabs: {
    label: "Streamlabs",
    placeholder: "Socket API Token",
    hintKey: "chat.alertsrc.hint.streamlabs",
  },
  streamelements: {
    label: "StreamElements",
    placeholder: "JWT Token",
    hintKey: "chat.alertsrc.hint.streamelements",
  },
};

// Status keys use the source name, falling back to its backend kind.
export const alertSourceLabel = (name: string) =>
  name in ALERT_META ? ALERT_META[name as AlertSourceKind].label : name;

export const ALERT_STATUS: Record<string, MessageKey> = {
  connected: "chat.alertsrc.status.live",
  error: "chat.alertsrc.status.error",
  disconnected: "chat.alertsrc.status.dropped",
};
