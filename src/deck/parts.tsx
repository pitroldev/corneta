import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  Clapperboard,
  Eye,
  LayoutGrid,
  LoaderCircle,
  MessagesSquare,
  Mic,
  MicOff,
  MonitorX,
  RefreshCw,
  TriangleAlert,
  WifiOff,
  X,
  EllipsisVertical,
} from "lucide-react";
import { useI18n } from "../lib/i18n";
import {
  hms,
  liveElapsed,
  targetTone,
  type DeckState,
  type DeckTarget,
} from "./model";
import { PlatformGlyph, platformLabel } from "./ui";

export type Tab = "deck" | "chat" | "health";

/** Ticks once a second while something on screen counts time. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

export function Head({
  state,
  receivedAt,
  onMenu,
}: {
  state: DeckState;
  receivedAt: number;
  onMenu: () => void;
}) {
  const { t, fmt } = useI18n();
  const live = state.live.state === "live";
  const now = useNow(live);
  let pill: ReactNode;
  if (state.live.state === "starting")
    pill = (
      <span className="onair starting">
        <LoaderCircle className="ic spin" aria-hidden />
        {t("deck.head.starting")}
      </span>
    );
  else if (live) {
    const time = hms(
      liveElapsed(state.live.startedAt, state.now, receivedAt, now),
    );
    pill = (
      <span className={`onair pulse ${state.live.forcedBrb ? "brb" : ""}`}>
        <span className="dot" />
        {state.live.forcedBrb ? t("deck.head.brb") : t("deck.head.live")}
        <span className="tnum" aria-label={t("deck.head.elapsed", { time })}>
          {time}
        </span>
      </span>
    );
  } else
    pill = (
      <span className="onair off">
        <span className="dot" />
        {t("deck.head.off")}
      </span>
    );
  const total = state.viewers.total;
  return (
    <header className="head">
      {pill}
      {live && total !== null ? (
        <span className="aud" title={t("deck.head.viewersHint")}>
          <Eye className="ic" aria-hidden />
          <b className="tnum">{fmt.num(total)}</b>
          <span className="sr">{t("deck.head.viewers")}</span>
        </span>
      ) : (
        <span className="aud" />
      )}
      <button
        type="button"
        className="iconbtn"
        onClick={onMenu}
        aria-label={t("deck.menu.open")}
      >
        <EllipsisVertical className="ic" aria-hidden />
      </button>
    </header>
  );
}

export function stateText(
  t: ReturnType<typeof useI18n>["t"],
  state: string,
): string {
  switch (state) {
    case "live":
      return t("deck.target.live");
    case "brb":
      return t("deck.target.brb");
    case "connecting":
    case "waiting":
      return t("deck.target.connecting");
    case "reconnecting":
      return t("deck.target.reconnecting");
    case "paused":
      return t("deck.target.paused");
    case "signal-lost":
      return t("deck.target.signalLost");
    case "error":
      return t("deck.target.error");
    default:
      return t("deck.target.off");
  }
}

/** Two targets on one platform keep their own names; otherwise the platform name is enough. */
export function chipName(state: DeckState, target: DeckTarget): string {
  const twins =
    state.targets.filter((t) => t.platform === target.platform).length > 1;
  return twins && target.name ? target.name : platformLabel(target.platform);
}

export function Plats({
  state,
  onOpen,
}: {
  state: DeckState;
  onOpen: (target: DeckTarget) => void;
}) {
  const { t } = useI18n();
  if (!state.targets.length) return null;
  return (
    <div className="plats">
      {state.targets.map((target) => {
        const name = chipName(state, target);
        const text = stateText(t, target.state);
        return (
          <button
            key={target.id}
            type="button"
            className="plat"
            data-tone={targetTone(target.state)}
            onClick={() => onOpen(target)}
            aria-label={`${name}: ${text}`}
          >
            <PlatformGlyph platform={target.platform} size={15} />
            <span>
              <b>{name}</b>
              <small>{text}</small>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export interface Banner {
  id: string;
  tone: "bad" | "warn" | "brass";
  icon: ReactNode;
  title: string;
  body?: string;
  action?: { label: string; icon?: ReactNode; run: () => void };
  dismissible?: boolean;
  /** Only announced politely; alarms interrupt the screen reader. */
  polite?: boolean;
}

export function Alerts({
  items,
  onDismiss,
}: {
  items: Banner[];
  onDismiss: (id: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="alerts">
      {items.map((item) => (
        <div
          key={item.id}
          className={`alert ${item.tone}`}
          role={item.polite ? "status" : "alert"}
        >
          {item.icon}
          <div className="txt">
            <b>{item.title}</b>
            {item.body && <p>{item.body}</p>}
            {item.action && (
              <div className="acts">
                <button
                  type="button"
                  className="btn btn-subtle btn-sm"
                  onClick={item.action.run}
                >
                  {item.action.icon}
                  {item.action.label}
                </button>
              </div>
            )}
          </div>
          {item.dismissible && (
            <button
              type="button"
              className="close"
              onClick={() => onDismiss(item.id)}
              aria-label={t("deck.alert.close", { title: item.title })}
            >
              <X className="ic" aria-hidden />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export const ALERT_ICONS = {
  link: <WifiOff className="ic" aria-hidden />,
  black: <MonitorX className="ic" aria-hidden />,
  signal: <TriangleAlert className="ic" aria-hidden />,
  mic: <MicOff className="ic" aria-hidden />,
  reconnecting: <Activity className="ic" aria-hidden />,
  error: <TriangleAlert className="ic" aria-hidden />,
  retry: <RefreshCw className="ic" aria-hidden />,
  scene: <Clapperboard className="ic" aria-hidden />,
  openMic: <Mic className="ic" aria-hidden />,
};

export function Tabs({
  tab,
  onTab,
  unread,
  tabs = ["deck", "chat", "health"],
  className = "tabs",
}: {
  tab: Tab;
  onTab: (tab: Tab) => void;
  unread: number;
  tabs?: Tab[];
  className?: string;
}) {
  const { t } = useI18n();
  const look = {
    deck: { Icon: LayoutGrid, label: t("deck.tabs.deck") },
    chat: { Icon: MessagesSquare, label: t("deck.tabs.chat") },
    health: { Icon: Activity, label: t("deck.tabs.health") },
  };
  return (
    <div className={className} role="tablist" aria-label={t("deck.tabs.label")}>
      {tabs.map((id) => {
        const { Icon, label } = look[id];
        return (
          <button
            key={id}
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === id}
            onClick={() => onTab(id)}
            data-on-brass={tab === id ? true : undefined}
          >
            <Icon className="ic" aria-hidden />
            {label}
            {id === "chat" && unread > 0 && (
              <span
                className="badge"
                aria-label={t("deck.tabs.unread", { n: unread })}
              >
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
