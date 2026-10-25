import { Bell, Eye, LogIn, MonitorPlay, Tv2 } from "lucide-react";
import { chatProvider } from "../../platforms";
import { type Translate } from "../../lib/chatSend";
import { type MessageKey } from "../../lib/i18n";
import type { AlertSourceKind } from "../../lib/types";

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
  const copy = chatProvider(platform)?.copy;
  if (status === "waiting")
    return t(copy?.waiting ?? "chat.status.explain.waiting");
  if (status === "error") return t(copy?.error ?? "chat.status.explain.error");
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
  "invalid-token": "chat.alertsrc.status.invalidToken",
};
