import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  AppWindow,
  Bell,
  Eye,
  Maximize2,
  Minimize2,
  Minus,
  Send,
  Settings2,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { IS_TAURI } from "../lib/api";
import { useStore } from "../lib/store";
import { sendStatusLine, srcLabel, type Translate } from "../lib/chatSend";
import { useI18n } from "../lib/i18n";
import { toast } from "../lib/toast";
import { cn, errMsg } from "../lib/utils";
import { Mascot } from "../components/decor";
import { Button, Input, Toggle } from "../components/ui";
import { Select } from "../components/Select";
import { Slider } from "../components/Slider";
import { ChatFeed, type ChatView } from "../components/ChatFeed";
import { AlertsFeed } from "../components/AlertsFeed";

// Keep Tailwind classes literal so the compiler discovers both layouts.
const BOTH_DIR: Record<string, string> = {
  auto: "flex-col min-[820px]:flex-row",
  row: "flex-row",
  col: "flex-col",
};
const DIVIDER_CLS: Record<string, string> = {
  auto: "h-1.5 w-full cursor-row-resize min-[820px]:h-auto min-[820px]:w-1.5 min-[820px]:cursor-col-resize",
  row: "w-1.5 cursor-col-resize",
  col: "h-1.5 w-full cursor-row-resize",
};
const layoutOpts = (t: Translate) => [
  { value: "auto", label: t("chat.popout.bothLayout.auto") },
  { value: "row", label: t("chat.popout.bothLayout.row") },
  { value: "col", label: t("chat.popout.bothLayout.col") },
];

export function ChatPopout() {
  const { t, fmt } = useI18n();
  const config = useStore((s) => s.config);
  const loaded = useStore((s) => s.loaded);
  const messages = useStore((s) => s.chatMessages);
  const alerts = useStore((s) => s.alerts);
  const viewers = useStore((s) => s.viewers);
  const connected = useStore((s) => s.chatConnected);
  const connectChat = useStore((s) => s.connectChat);
  const disconnectChat = useStore((s) => s.disconnectChat);
  const clearChat = useStore((s) => s.clearChat);
  const clearAlerts = useStore((s) => s.clearAlerts);
  const setSettings = useStore((s) => s.setSettings);
  const load = useStore((s) => s.load);
  const bindChat = useStore((s) => s.bindChat);
  const bindChatRunning = useStore((s) => s.bindChatRunning);
  const bindConfigSync = useStore((s) => s.bindConfigSync);
  const bindAlerts = useStore((s) => s.bindAlerts);
  const bindViewers = useStore((s) => s.bindViewers);
  const sendChat = useStore((s) => s.sendChat);
  const chatLogin = useStore((s) => s.chatLogin);
  const chatAuth = useStore((s) => s.chatAuth);
  const setupOauth = useStore((s) => s.setupOauth);
  const bindChatAuth = useStore((s) => s.bindChatAuth);
  const bindAuthFlow = useStore((s) => s.bindAuthFlow);
  const theme = useStore((s) => s.config?.settings.theme ?? "dark");
  const [tab, setTab] = useState<"chat" | "alerts" | "both">("both");
  const [showConfig, setShowConfig] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmClearAlerts, setConfirmClearAlerts] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendTo, setSendTo] = useState("all");

  useEffect(() => {
    void load(t);
    void setupOauth();
    const unbindChat = bindChat();
    const unbindChatRunning = bindChatRunning();
    const unbindConfigSync = bindConfigSync();
    const unbindAlerts = bindAlerts();
    const unbindViewers = bindViewers();
    const unbindChatAuth = bindChatAuth();
    const unbindAuthFlow = bindAuthFlow(t);
    return () => {
      unbindChat();
      unbindChatRunning();
      unbindConfigSync();
      unbindAlerts();
      unbindViewers();
      unbindChatAuth();
      unbindAuthFlow();
    };
  }, [
    load,
    setupOauth,
    bindChat,
    bindChatRunning,
    bindConfigSync,
    bindAlerts,
    bindViewers,
    bindChatAuth,
    bindAuthFlow,
    t,
  ]);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  // Window-edge gestures can maximize without using our button; resync on resize.
  useEffect(() => {
    if (!IS_TAURI) return;
    let alive = true;
    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        const w = (await import("@tauri-apps/api/window")).getCurrentWindow();
        const sync = async () => {
          const m = await w.isMaximized();
          if (alive) setMaximized(m);
        };
        await sync();
        unlisten = await w.onResized(() => void sync());
      } catch {
        /* Window APIs are unavailable outside Tauri. */
      }
    })();
    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);
  // Keep separator orientation aligned with the 820 px auto-layout breakpoint.
  const [wide, setWide] = useState(
    () =>
      typeof window.matchMedia === "function" &&
      window.matchMedia("(min-width: 820px)").matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(min-width: 820px)");
    const onChange = (e: MediaQueryListEvent) => setWide(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const st = config?.settings;
  const view: ChatView = useMemo(
    () => ({
      emotes: st?.chatShowEmotes ?? true,
      badges: st?.chatShowBadges ?? true,
      platform: st?.chatShowPlatform ?? true,
      source: st?.chatShowSource ?? false,
      timestamps: st?.chatShowTimestamps ?? false,
      fontSize: st?.chatFontSize ?? 14,
    }),
    [
      st?.chatShowEmotes,
      st?.chatShowBadges,
      st?.chatShowPlatform,
      st?.chatShowSource,
      st?.chatShowTimestamps,
      st?.chatFontSize,
    ],
  );
  const bothLayout = st?.chatBothLayout ?? "auto";
  const alertsFirst = st?.chatBothAlertsFirst ?? false;
  const configured =
    (st?.chatSources ?? []).some((x) => x.enabled && x.value.trim()) ||
    (st?.alertSources ?? []).some((x) => x.enabled && x.hasToken);
  const containerRef = useRef<HTMLDivElement>(null);
  // Keep drag state local and persist only on release.
  const [split, setSplit] = useState(35);
  useEffect(() => {
    if (st?.chatBothSplit != null) setSplit(st.chatBothSplit);
  }, [st?.chatBothSplit]);
  useEffect(() => {
    if (st?.chatPopoutTab) setTab(st.chatPopoutTab);
  }, [st?.chatPopoutTab]);

  if (!loaded || !config) {
    return (
      <div
        data-tauri-drag-region
        className="grid h-screen place-items-center border border-border-soft bg-panel"
      >
        <div className="grid size-12 animate-shout place-items-center rounded-lg bg-brass text-brass-ink pop-brass">
          <Mascot className="size-7" />
        </div>
      </div>
    );
  }

  const iconBtn =
    "rounded p-1.5 text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink";
  const winApi = async () =>
    (await import("@tauri-apps/api/window")).getCurrentWindow();
  const minimize = () => void winApi().then((w) => w.minimize());
  const closeWin = () => void winApi().then((w) => w.close());
  const toggleMaximize = () =>
    void winApi().then(async (w) => {
      await w.toggleMaximize();
      setMaximized(await w.isMaximized());
    });

  const pickTab = (next: "chat" | "alerts" | "both") => {
    setTab(next);
    setSettings({ chatPopoutTab: next });
  };

  const focusMain = async () => {
    try {
      const main = await WebviewWindow.getByLabel("main");
      if (!main) return;
      if (await main.isMinimized()) await main.unminimize();
      await main.setFocus();
    } catch {
      /* Window APIs are unavailable outside Tauri. */
    }
  };
  const doConnect = async () => {
    try {
      await connectChat(t);
    } catch {
      toast.error(t("chat.error.connect"));
    }
  };

  const isRow = bothLayout === "row" || (bothLayout === "auto" && wide);
  const nudgeSplit = (delta: number) => {
    const next = Math.max(15, Math.min(75, split + delta));
    if (next === split) return;
    setSplit(next);
    setSettings({ chatBothSplit: next });
  };
  const onDividerKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const fwd = isRow ? e.key === "ArrowRight" : e.key === "ArrowDown";
    const back = isRow ? e.key === "ArrowLeft" : e.key === "ArrowUp";
    if (!fwd && !back) return;
    e.preventDefault();
    nudgeSplit((fwd ? 5 : -5) * (alertsFirst ? 1 : -1));
  };

  const sendSources = st?.chatSources ?? [];
  const twitchReady = chatLogin.twitch.state === "connected";
  const youtubeReady = chatLogin.youtube.state === "connected";
  const kickReady = chatLogin.kick.state === "connected";
  const sendableSources = sendSources.filter(
    (x) =>
      (x.platform === "twitch" && (x.hasSendToken || twitchReady)) ||
      (x.platform === "youtube" && youtubeReady) ||
      (x.platform === "kick" && kickReady),
  );
  const sendValid =
    sendTo !== "all" && sendableSources.some((x) => x.id === sendTo);
  const effectiveSendTo = sendValid ? sendTo : "all";
  const sendTargets =
    effectiveSendTo === "all"
      ? sendableSources
      : sendableSources.filter((x) => x.id === effectiveSendTo);
  // Twitch requires IRC authentication before sending; YouTube and Kick send over HTTP.
  const canSend = sendTargets.some((x) =>
    x.platform === "youtube"
      ? youtubeReady
      : x.platform === "kick"
        ? kickReady
        : !!chatAuth[x.id]?.ok,
  );
  const sendStatus = sendStatusLine(
    sendTargets,
    chatAuth,
    { twitch: twitchReady, youtube: youtubeReady, kick: kickReady },
    t,
  );
  const doSend = async () => {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    try {
      await sendChat(
        text,
        sendTargets.map((x) => x.id),
      );
      setDraft("");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSending(false);
    }
  };

  const onDividerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const isRow = () =>
      bothLayout === "row" ||
      (bothLayout === "auto" && container.getBoundingClientRect().width >= 820);
    document.body.style.userSelect = "none";
    document.body.style.cursor = isRow() ? "col-resize" : "row-resize";
    let latest = split;
    const move = (ev: PointerEvent) => {
      const r = container.getBoundingClientRect();
      const pct = isRow()
        ? alertsFirst
          ? ((ev.clientX - r.left) / r.width) * 100
          : ((r.right - ev.clientX) / r.width) * 100
        : alertsFirst
          ? ((ev.clientY - r.top) / r.height) * 100
          : ((r.bottom - ev.clientY) / r.height) * 100;
      latest = Math.max(15, Math.min(75, Math.round(pct)));
      setSplit(latest);
    };
    const up = () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      setSettings({ chatBothSplit: latest });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const alertsPanel = (
    <div
      key="alerts"
      style={{ flexBasis: `${split}%` }}
      className="flex min-h-0 min-w-0 shrink-0 grow-0 flex-col overflow-hidden"
    >
      <div className="flex shrink-0 items-center justify-between border-b-2 border-border-soft px-2.5 py-1.5">
        <span className="flex items-center gap-1.5 font-display text-xs font-extrabold">
          <Bell className="size-3.5 text-brass" />{" "}
          {alerts.length > 0
            ? t("chat.popout.tab.alerts.count", { n: alerts.length })
            : t("chat.popout.tab.alerts")}
        </span>
        <button
          onClick={() => {
            if (!confirmClearAlerts) {
              setConfirmClearAlerts(true);
              setTimeout(() => setConfirmClearAlerts(false), 3000);
              return;
            }
            setConfirmClearAlerts(false);
            clearAlerts();
          }}
          title={
            confirmClearAlerts
              ? t("chat.alerts.clear.confirmTitle")
              : t("chat.alerts.clear.title")
          }
          aria-label={
            confirmClearAlerts ? undefined : t("chat.alerts.clear.title")
          }
          className={cn(
            "grid h-8 min-w-8 place-items-center rounded px-1 transition-colors",
            confirmClearAlerts
              ? "text-xs font-bold text-bad"
              : "text-ink-faint hover:text-bad",
          )}
        >
          {confirmClearAlerts ? (
            t("chat.alerts.clear.confirmLabel")
          ) : (
            <Trash2 className="size-3.5" />
          )}
        </button>
      </div>
      <AlertsFeed
        alerts={alerts}
        className="min-h-0 flex-1"
        fontSize={st?.alertFontSize ?? 14}
      />
    </div>
  );
  const chatPanel = (
    <ChatFeed
      key="chat"
      messages={messages}
      view={view}
      connected={connected}
      className="min-h-0 min-w-0 flex-1"
      onFontSize={(n) => setSettings({ chatFontSize: n })}
      disconnectedHint={
        configured
          ? t("chat.popout.feed.hint.ready")
          : t("chat.popout.feed.hint.setup")
      }
      emptyAction={
        configured ? (
          <Button variant="primary" size="sm" onClick={() => void doConnect()}>
            <Wifi className="size-4" /> {t("chat.action.connect")}
          </Button>
        ) : (
          <Button variant="primary" size="sm" onClick={() => void focusMain()}>
            <AppWindow className="size-4" /> {t("chat.popout.openMain")}
          </Button>
        )
      }
    />
  );
  // WAI-ARIA separators support keyboard interaction; jsx-a11y treats this widget as decorative.
  const divider = (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      key="divider"
      role="separator"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      aria-orientation={isRow ? "vertical" : "horizontal"}
      aria-valuenow={split}
      aria-valuemin={15}
      aria-valuemax={75}
      aria-label={t("chat.popout.divider")}
      onPointerDown={onDividerDown}
      onKeyDown={onDividerKey}
      title={t("chat.popout.divider")}
      className={cn(
        "shrink-0 bg-border-soft transition-colors hover:bg-brass focus-visible:bg-brass",
        DIVIDER_CLS[bothLayout],
      )}
    />
  );

  return (
    <div className="flex h-screen flex-col border border-border-soft bg-panel">
      <div
        data-tauri-drag-region
        className="flex h-8 shrink-0 items-center gap-2 border-b border-border-soft pl-2 select-none"
      >
        <div
          data-tauri-drag-region
          className="brand-tile brand-tile--small pointer-events-none grid size-5 place-items-center rounded bg-brass text-brass-ink"
        >
          <Mascot className="size-3.5" />
        </div>
        <span
          data-tauri-drag-region
          className="pointer-events-none font-display text-xs font-extrabold"
        >
          {t("chat.popout.windowTitle")}
        </span>
        <div className="ml-auto flex h-full">
          <WinBtn onClick={minimize} label={t("chat.popout.win.minimize")}>
            <Minus className="size-3.5" strokeWidth={2.4} />
          </WinBtn>
          <WinBtn
            onClick={toggleMaximize}
            label={
              maximized
                ? t("chat.popout.win.restore")
                : t("chat.popout.win.maximize")
            }
          >
            {maximized ? (
              <Minimize2 className="size-3.5" strokeWidth={2.4} />
            ) : (
              <Maximize2 className="size-3.5" strokeWidth={2.4} />
            )}
          </WinBtn>
          <WinBtn onClick={closeWin} label={t("chat.popout.win.close")} danger>
            <X className="size-3.5" strokeWidth={2.4} />
          </WinBtn>
        </div>
      </div>

      <div className="flex items-center gap-1.5 border-b-2 border-border-soft px-2 py-1.5">
        <div
          role="tablist"
          className="flex items-center gap-0.5 rounded-md bg-surface-2 p-0.5"
        >
          <TabBtn active={tab === "both"} onClick={() => pickTab("both")}>
            {t("chat.popout.tab.both")}
          </TabBtn>
          <TabBtn active={tab === "chat"} onClick={() => pickTab("chat")}>
            {t("chat.popout.tab.chat")}
          </TabBtn>
          <TabBtn active={tab === "alerts"} onClick={() => pickTab("alerts")}>
            {alerts.length > 0
              ? t("chat.popout.tab.alerts.count", { n: alerts.length })
              : t("chat.popout.tab.alerts")}
          </TabBtn>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {viewers.total > 0 && (st?.chatShowViewers ?? true) && (
            <button
              type="button"
              onClick={() => setSettings({ chatShowViewers: false })}
              className="flex items-center gap-1 px-0.5 text-xs font-bold text-ink-muted transition-colors hover:text-ink"
              title={
                viewers.items
                  .filter((i) => i.live)
                  .map((i) =>
                    t("chat.viewers.tooltip.row", {
                      source: i.source,
                      n: fmt.num(i.viewers ?? 0),
                    }),
                  )
                  .join("\n") +
                "\n" +
                t("chat.viewers.tooltip.hide")
              }
            >
              <Eye className="size-3.5 text-brass" />
              {fmt.num(viewers.total)}
            </button>
          )}
          {connected ? (
            <button
              onClick={() => void disconnectChat()}
              title={t("chat.action.disconnect")}
              className={iconBtn}
            >
              <WifiOff className="size-4" />
            </button>
          ) : configured ? (
            <button
              onClick={() => void doConnect()}
              title={t("chat.action.connect")}
              className={iconBtn}
            >
              <Wifi className="size-4" />
            </button>
          ) : (
            <button
              onClick={() => void focusMain()}
              title={t("chat.popout.needSetup")}
              aria-label={t("chat.popout.openMain")}
              className={iconBtn}
            >
              <AppWindow className="size-4" />
            </button>
          )}
          <button
            onClick={() => {
              if (!confirmClear) {
                setConfirmClear(true);
                setTimeout(() => setConfirmClear(false), 3000);
                return;
              }
              setConfirmClear(false);
              if (tab === "alerts") clearAlerts();
              else clearChat();
            }}
            title={
              confirmClear
                ? t("chat.alerts.clear.confirmTitle")
                : tab === "alerts"
                  ? t("chat.alerts.clear.title")
                  : t("chat.popout.clear.chat")
            }
            aria-label={
              confirmClear
                ? undefined
                : tab === "alerts"
                  ? t("chat.alerts.clear.title")
                  : t("chat.popout.clear.chat")
            }
            className={cn(
              iconBtn,
              confirmClear &&
                "flex items-center gap-1 text-xs font-bold text-bad",
            )}
          >
            <Trash2 className="size-4" />
            {confirmClear && t("chat.clear.confirm")}
          </button>
          <button
            onClick={() => setShowConfig((v) => !v)}
            title={t("chat.popout.displaySettings")}
            className={cn(iconBtn, showConfig && "bg-surface-2 text-ink")}
          >
            <Settings2 className="size-4" />
          </button>
        </div>
      </div>

      {showConfig && (
        <div className="flex flex-col gap-3 border-b-2 border-border-soft bg-surface-2 px-2.5 py-2.5 text-xs">
          <div>
            <span className="mb-1.5 block font-bold uppercase tracking-wide text-ink-faint">
              {t("chat.display.section")}
            </span>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              <CfgToggle
                label={t("chat.display.emotes")}
                checked={view.emotes}
                onChange={(v) => setSettings({ chatShowEmotes: v })}
              />
              <CfgToggle
                label={t("chat.display.badges")}
                checked={view.badges}
                onChange={(v) => setSettings({ chatShowBadges: v })}
              />
              <CfgToggle
                label={t("chat.display.platform")}
                checked={view.platform}
                onChange={(v) => setSettings({ chatShowPlatform: v })}
              />
              <CfgToggle
                label={t("chat.display.source")}
                checked={view.source}
                onChange={(v) => setSettings({ chatShowSource: v })}
              />
              <CfgToggle
                label={t("chat.display.timestamps")}
                checked={view.timestamps}
                onChange={(v) => setSettings({ chatShowTimestamps: v })}
              />
              <CfgToggle
                label={t("chat.display.viewers")}
                checked={st?.chatShowViewers ?? true}
                onChange={(v) => setSettings({ chatShowViewers: v })}
              />
            </div>
          </div>
          <label className="flex items-center gap-2.5">
            <span className="shrink-0 font-semibold text-ink-muted">
              {t("chat.popout.chatFont")}
            </span>
            <Slider
              className="ml-auto max-w-44 flex-1"
              value={view.fontSize}
              min={8}
              max={44}
              onChange={(v) => setSettings({ chatFontSize: v })}
              suffix="px"
              aria-label={t("chat.display.chatFontSize")}
            />
          </label>
          <label className="flex items-center gap-2.5">
            <span className="shrink-0 font-semibold text-ink-muted">
              {t("chat.popout.alertFont")}
            </span>
            <Slider
              className="ml-auto max-w-44 flex-1"
              value={st?.alertFontSize ?? 14}
              min={8}
              max={44}
              onChange={(v) => setSettings({ alertFontSize: v })}
              suffix="px"
              aria-label={t("chat.display.alertFontSize")}
            />
          </label>
          {tab === "both" && (
            <div className="flex flex-col gap-2 border-t-2 border-border-soft pt-2.5">
              <span className="font-bold uppercase tracking-wide text-ink-faint">
                {t("chat.popout.bothLayout.section")}
              </span>
              <label className="flex items-center justify-between">
                <span className="font-semibold text-ink-muted">
                  {t("chat.popout.bothLayout.arrangement")}
                </span>
                <Select
                  className="w-32"
                  value={bothLayout}
                  options={layoutOpts(t)}
                  onChange={(v) =>
                    setSettings({ chatBothLayout: v as "auto" | "row" | "col" })
                  }
                />
              </label>
              <CfgToggle
                label={t("chat.popout.alertsFirst")}
                checked={alertsFirst}
                onChange={(v) => setSettings({ chatBothAlertsFirst: v })}
              />
            </div>
          )}
        </div>
      )}

      {tab === "both" ? (
        <div
          ref={containerRef}
          className={cn(
            "flex min-h-0 flex-1 overflow-hidden",
            BOTH_DIR[bothLayout],
          )}
        >
          {alertsFirst
            ? [alertsPanel, divider, chatPanel]
            : [chatPanel, divider, alertsPanel]}
        </div>
      ) : tab === "chat" ? (
        chatPanel
      ) : (
        <AlertsFeed
          alerts={alerts}
          className="flex-1"
          fontSize={st?.alertFontSize ?? 14}
        />
      )}

      {IS_TAURI && sendableSources.length > 0 && (
        <div className="flex shrink-0 items-center gap-1.5 border-t-2 border-border-soft px-2 py-1.5">
          {sendableSources.length > 1 && (
            <Select
              className="w-24 shrink-0"
              aria-label={t("chat.send.target.aria")}
              value={effectiveSendTo}
              options={[
                { value: "all", label: t("chat.send.target.all") },
                ...sendableSources.map((x) => ({
                  value: x.id,
                  label: srcLabel(x),
                })),
              ]}
              onChange={setSendTo}
            />
          )}
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void doSend();
              }
            }}
            placeholder={t("chat.send.placeholder")}
            aria-label={t("chat.send.placeholder")}
            className="h-9 flex-1"
          />
          <Button
            variant="primary"
            size="sm"
            loading={sending}
            disabled={!draft.trim() || sending || !canSend}
            onClick={doSend}
            aria-label={t("chat.send.button")}
            title={!canSend ? sendStatus : t("chat.send.button")}
          >
            {!sending && <Send className="size-4" />}
          </Button>
        </div>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "rounded px-2 py-0.5 font-display text-xs font-extrabold transition-colors",
        active ? "bg-brass text-brass-ink" : "text-ink-faint hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function CfgToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="font-semibold text-ink-muted">{label}</span>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </label>
  );
}

function WinBtn({
  children,
  onClick,
  label,
  danger,
}: {
  children: ReactNode;
  onClick: () => void;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "grid h-full w-9 place-items-center text-ink-muted transition-colors",
        danger
          ? "hover:bg-bad hover:text-white"
          : "hover:bg-surface-2 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
