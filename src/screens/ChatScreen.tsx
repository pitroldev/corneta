import * as RTabs from "@radix-ui/react-tabs";
import {
  AtSign,
  BadgeCheck,
  Bell,
  Clock,
  Eye,
  LogIn,
  PictureInPicture2,
  Plus,
  RefreshCw,
  Send,
  Settings2,
  Smile,
  Trash2,
  TriangleAlert,
  Tv2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AlertsFeed } from "../components/AlertsFeed";
import { ChatFeed, type ChatView } from "../components/ChatFeed";
import { LegalLink } from "../components/legal";
import { Modal } from "../components/Modal";
import { Select } from "../components/Select";
import { Slider } from "../components/Slider";
import { Tooltip } from "../components/Tooltip";
import {
  Button,
  Card,
  ExperimentalBadge,
  Input,
  PlatformGlyph,
  SectionTitle,
} from "../components/ui";
import { api, IS_TAURI } from "../lib/api";
import { sendStatusLine, srcLabel } from "../lib/chatSend";
import { bold, useI18n } from "../lib/i18n";
import { legalUrl } from "../lib/legal";
import { HAS_TWITCH_OAUTH } from "../lib/oauth";
import { useStore } from "../lib/store";
import { toast } from "../lib/toast";
import type {
  AlertSource,
  AlertSourceKind,
  ChatMessage,
  ChatPlatform,
  ChatSource,
} from "../lib/types";
import { cn, errMsg, uid } from "../lib/utils";
import {
  KickCredsForm,
  LoginRow,
  YoutubeCredsForm,
} from "./chat/AccountSettings";
import { AlertSourceCard } from "./chat/AlertSourceCard";
import {
  ALERT_META,
  alertSourceLabel,
  CHAT_PLATFORM_LABEL,
  CONFIG_TABS,
  ConfigTab,
  statusDot,
  statusExplain,
  statusLabel,
} from "./chat/constants";
import { OverlayCard } from "./chat/OverlaySettings";
import { FilterChip, splitAt, ToggleRow } from "./chat/primitives";
import { SourceCard, YoutubeApiKeyField } from "./chat/SourceCard";

export function ChatScreen() {
  const { t, fmt, locale } = useI18n();
  const config = useStore((s) => s.config);
  const setSettings = useStore((s) => s.setSettings);
  const messages = useStore((s) => s.chatMessages);
  const connected = useStore((s) => s.chatConnected);
  const statuses = useStore((s) => s.chatStatuses);
  const connectChat = useStore((s) => s.connectChat);
  const disconnectChat = useStore((s) => s.disconnectChat);
  const clearChat = useStore((s) => s.clearChat);
  const alerts = useStore((s) => s.alerts);
  const clearAlerts = useStore((s) => s.clearAlerts);
  const viewers = useStore((s) => s.viewers);
  const setAlertToken = useStore((s) => s.setAlertToken);
  const alertStatuses = useStore((s) => s.alertStatuses);
  const chatAuth = useStore((s) => s.chatAuth);
  const sendChat = useStore((s) => s.sendChat);
  const chatLogin = useStore((s) => s.chatLogin);
  const twitchLogin = useStore((s) => s.twitchLogin);
  const twitchLogout = useStore((s) => s.twitchLogout);
  const youtubeLogin = useStore((s) => s.youtubeLogin);
  const youtubeLogout = useStore((s) => s.youtubeLogout);
  const kickLogin = useStore((s) => s.kickLogin);
  const kickLogout = useStore((s) => s.kickLogout);
  const youtubeOauthReady = useStore((s) => s.youtubeOauthReady);
  const youtubeOauthModes = useStore((s) => s.youtubeOauthModes);
  const setYoutubeOauth = useStore((s) => s.setYoutubeOauth);
  const clearYoutubeOauth = useStore((s) => s.clearYoutubeOauth);
  const youtubeUseOfficial = useStore((s) => s.youtubeUseOfficial);
  const youtubeUseOwnCreds = useStore((s) => s.youtubeUseOwnCreds);
  const kickOauthReady = useStore((s) => s.kickOauthReady);
  const kickOauthModes = useStore((s) => s.kickOauthModes);
  const setKickOauth = useStore((s) => s.setKickOauth);
  const clearKickOauth = useStore((s) => s.clearKickOauth);
  const kickUseOfficial = useStore((s) => s.kickUseOfficial);
  const kickUseOwnCreds = useStore((s) => s.kickUseOwnCreds);
  const oauthBrokerError = useStore((s) => s.oauthBrokerError);
  const moderate = useStore((s) => s.moderate);
  const chatConfigRequest = useStore((s) => s.chatConfigRequest);
  const requestChatConfig = useStore((s) => s.requestChatConfig);

  const [showConfig, setShowConfig] = useState(false);
  const [configTab, setConfigTab] = useState<ConfigTab>("canais");
  const [adding, setAdding] = useState(false);
  const [addingAlert, setAddingAlert] = useState(false);
  const [showYoutubeByok, setShowYoutubeByok] = useState(false);
  const [showKickByok, setShowKickByok] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendTo, setSendTo] = useState("all");
  const [connecting, setConnecting] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [confirmClearChat, setConfirmClearChat] = useState(false);
  const [confirmClearAlerts, setConfirmClearAlerts] = useState(false);
  const [alertPulse, setAlertPulse] = useState(false);
  const [filter, setFilter] = useState<Record<ChatPlatform, boolean>>({
    twitch: true,
    youtube: true,
    kick: true,
    cinefy: true,
  });

  useEffect(() => {
    if (chatConfigRequest) {
      setConfigTab(chatConfigRequest as ConfigTab);
      setShowConfig(true);
      requestChatConfig(null);
    }
  }, [chatConfigRequest, requestChatConfig]);

  const showAlerts = config?.settings.chatShowAlertsPanel ?? false;
  // Do not auto-open on new alerts: reflow would interrupt reading during a live stream.
  const prevAlerts = useRef(alerts.length);
  useEffect(() => {
    if (alerts.length > prevAlerts.current && !showAlerts) setAlertPulse(true);
    prevAlerts.current = alerts.length;
  }, [alerts.length, showAlerts]);

  if (!config) return null;
  const s = config.settings;
  const sources = s.chatSources ?? [];
  const hasDup = (() => {
    const seen = new Set<string>();
    for (const x of sources)
      if (x.enabled) {
        if (seen.has(x.platform)) return true;
        seen.add(x.platform);
      }
    return false;
  })();
  const view: ChatView = {
    emotes: s.chatShowEmotes ?? true,
    badges: s.chatShowBadges ?? true,
    platform: s.chatShowPlatform ?? true,
    source: (s.chatShowSource ?? false) || hasDup,
    timestamps: s.chatShowTimestamps ?? false,
    fontSize: s.chatFontSize ?? 14,
  };
  const alertSources = s.alertSources ?? [];
  const configured =
    sources.some((x) => x.enabled && x.value.trim()) ||
    alertSources.some((x) => x.enabled && x.hasToken);
  const downAlertSources = Object.entries(alertStatuses)
    .filter(([, x]) => x.status === "error" || x.status === "disconnected")
    .map(([name]) => alertSourceLabel(name));
  const feedPlatforms = [
    ...new Set(
      sources.filter((x) => x.enabled && x.value.trim()).map((x) => x.platform),
    ),
  ];
  const showFilters = feedPlatforms.length > 1;
  const shown =
    !showFilters || feedPlatforms.every((platform) => filter[platform])
      ? messages
      : messages.filter((m) => filter[m.platform]);
  const allFilteredOut = messages.length > 0 && shown.length === 0;

  const addSource = (platform: ChatPlatform) =>
    setSettings({
      chatSources: [
        ...sources,
        { id: uid("src"), platform, value: "", name: "", enabled: true },
      ],
    });
  const updateSource = (id: string, patch: Partial<ChatSource>) =>
    setSettings({
      chatSources: sources.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    });
  const removeSource = async (id: string) => {
    try {
      await useStore.getState().clearChatSendToken(id);
      const current = useStore.getState().config?.settings.chatSources ?? [];
      setSettings({
        chatSources: current.filter((source) => source.id !== id),
      });
    } catch (error) {
      toast.error(errMsg(error));
    }
  };

  const addAlertSource = (kind: AlertSourceKind) =>
    setSettings({
      alertSources: [
        ...alertSources,
        { id: uid("alert"), kind, name: "", enabled: true },
      ],
    });
  const updateAlertSource = (id: string, patch: Partial<AlertSource>) =>
    setSettings({
      alertSources: alertSources.map((x) =>
        x.id === id ? { ...x, ...patch } : x,
      ),
    });
  const removeAlertSource = async (id: string) => {
    try {
      await useStore.getState().clearAlertToken(id);
      const current = useStore.getState().config?.settings.alertSources ?? [];
      setSettings({
        alertSources: current.filter((source) => source.id !== id),
      });
    } catch (error) {
      toast.error(errMsg(error));
    }
  };

  const twitchReady = chatLogin.twitch.state === "connected";
  const youtubeReady = chatLogin.youtube.state === "connected";
  const kickReady = chatLogin.kick.state === "connected";
  const sendableSources = sources.filter(
    (x) =>
      (x.platform === "twitch" && (x.hasSendToken || twitchReady)) ||
      (x.platform === "youtube" && youtubeReady) ||
      (x.platform === "kick" && kickReady),
  );
  const hasTwitchChannel = sources.some((x) => x.platform === "twitch");
  const hasYoutubeChannel = sources.some((x) => x.platform === "youtube");
  const hasKickChannel = sources.some((x) => x.platform === "kick");
  // Bootstrap or user-supplied credentials may enable YouTube and Kick without build-time fallbacks.
  const canLoginSomewhere =
    (hasTwitchChannel && HAS_TWITCH_OAUTH) ||
    hasYoutubeChannel ||
    hasKickChannel;
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
  const sendStatus = sendStatusLine(
    sendTargets,
    chatAuth,
    { twitch: twitchReady, youtube: youtubeReady, kick: kickReady },
    t,
  );

  const modeAction =
    (close: (open: boolean) => void) =>
    async (action: Promise<void>, ok?: string) => {
      try {
        await action;
        if (ok) toast.success(ok);
        close(false);
      } catch (e) {
        toast.error(errMsg(e));
      }
    };
  const youtubeMode = modeAction(setShowYoutubeByok);
  const kickMode = modeAction(setShowKickByok);
  const saveYoutubeOauth = async (id: string, secret: string) => {
    await setYoutubeOauth(id, secret);
    setShowYoutubeByok(false);
  };
  const saveKickOauth = async (id: string, secret: string) => {
    await setKickOauth(id, secret);
    setShowKickByok(false);
  };

  const doConnect = async () => {
    if (IS_TAURI && !configured) {
      setConfigTab("canais");
      setShowConfig(true);
      return;
    }
    setConnecting(true);
    try {
      await connectChat(t);
    } catch {
      toast.error(t("chat.error.connect"));
    } finally {
      setConnecting(false);
    }
  };
  // Restart source generations and alerts without clearing message history.
  const hasErrored = Object.values(statuses).some((x) => x.status === "error");
  const reconnect = async () => {
    setReconnecting(true);
    try {
      await connectChat(t);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setReconnecting(false);
    }
  };

  const sourceForMessage = (m: ChatMessage) =>
    sources.find((x) => x.platform === m.platform && srcLabel(x) === m.source);
  const modLevel = (m: ChatMessage): "full" | "delete" | "none" => {
    const src = sourceForMessage(m);
    if (!src) return "none";
    const myLogin = chatLogin.twitch.login?.toLowerCase();
    if (m.author === "você" || (myLogin && m.author.toLowerCase() === myLogin))
      return "none";
    if (src.platform === "twitch" && twitchReady) return "full";
    if (src.platform === "youtube" && youtubeReady) return "delete";
    if (src.platform === "kick" && kickReady) return "delete";
    return "none";
  };
  const onModerate = (m: ChatMessage, action: string) => {
    const src = sourceForMessage(m);
    if (!src) return;
    void moderate(src.id, action, {
      nativeId: m.nativeId,
      author: m.author,
      authorId: m.authorId,
    }).then(
      () =>
        toast.success(
          action === "delete"
            ? t("chat.mod.deleted")
            : action === "ban"
              ? t("chat.mod.banned")
              : t("chat.mod.timeout"),
        ),
      (e) => toast.error(errMsg(e)),
    );
  };

  const [privacyBefore, privacyAfter] = splitAt(
    t("chat.account.privacy.text"),
    "{link}",
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col">
      <SectionTitle
        kicker={t("chat.header.kicker")}
        title={t("chat.header.title")}
        subtitle={t("chat.header.subtitle")}
        right={
          <div className="flex items-center gap-2">
            {IS_TAURI && (
              <Button
                variant="subtle"
                size="sm"
                onClick={() => void api.openChatWindow()}
                title={t("chat.action.popout.title")}
              >
                <PictureInPicture2 className="size-4" />{" "}
                {t("chat.action.popout")}
              </Button>
            )}
            {connected ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void disconnectChat()}
              >
                <WifiOff className="size-4" /> {t("chat.action.disconnect")}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                loading={connecting}
                onClick={() => void doConnect()}
                title={
                  IS_TAURI && !configured
                    ? t("chat.action.connect.needChannel")
                    : undefined
                }
              >
                {!connecting && <Wifi className="size-4" />}{" "}
                {t("chat.action.connect")}
              </Button>
            )}
          </div>
        }
      />

      <Card className="mb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {Object.keys(statuses).length === 0 ? (
              <span className="text-sm font-semibold text-ink-muted">
                {connected
                  ? t("chat.status.connecting")
                  : configured
                    ? (s.chatAutoConnect ?? true)
                      ? t("chat.status.ready.auto")
                      : t("chat.status.ready")
                    : t("chat.status.empty")}
              </span>
            ) : (
              Object.entries(statuses).map(([source, st]) => (
                <Tooltip
                  key={source}
                  content={t("chat.status.tooltip", {
                    source,
                    explain: statusExplain(t, st.platform, st.status),
                  })}
                >
                  <button
                    type="button"
                    className="flex cursor-help items-center gap-1.5 text-sm"
                  >
                    <PlatformGlyph id={st.platform as ChatPlatform} size={16} />
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        statusDot(st.status),
                      )}
                      aria-hidden
                    />
                    <span className="text-ink-muted">{source}</span>
                    {st.status !== "connected" ? (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                        {statusLabel(t, st.status)}
                      </span>
                    ) : (
                      <span className="sr-only">
                        {statusLabel(t, st.status)}
                      </span>
                    )}
                  </button>
                </Tooltip>
              ))
            )}
            {connected && hasErrored && (
              <Button
                variant="subtle"
                size="sm"
                loading={reconnecting}
                onClick={() => void reconnect()}
                title={t("chat.action.reconnect.title")}
              >
                {!reconnecting && <RefreshCw className="size-3.5" />}{" "}
                {t("chat.action.reconnect")}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {viewers.total > 0 && (s.chatShowViewers ?? true) && (
              <button
                type="button"
                onClick={() => setSettings({ chatShowViewers: false })}
                className="flex items-center gap-1.5 text-sm font-bold text-ink-muted transition-colors hover:text-ink"
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
                <Eye className="size-4 text-brass" />
                {t("chat.viewers.count", { n: fmt.num(viewers.total) })}
              </button>
            )}
            <Button
              variant={configured ? "ghost" : "primary"}
              size="sm"
              onClick={() => setShowConfig(true)}
            >
              <Settings2 className="size-4" /> {t("chat.action.configure")}
            </Button>
          </div>
        </div>
      </Card>

      {showConfig && (
        <Modal
          title={t("chat.config.title")}
          onClose={() => setShowConfig(false)}
          className="max-w-2xl rounded-xl bg-surface p-5 pop"
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 id="chatcfg-title" className="text-xl">
              {t("chat.config.title")}
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowConfig(false)}
              aria-label={t("encoding.close")}
            >
              <X className="size-4" />
            </Button>
          </div>
          <RTabs.Root
            value={configTab}
            onValueChange={(v) => setConfigTab(v as ConfigTab)}
          >
            <RTabs.List className="mb-4 flex flex-wrap gap-2">
              {CONFIG_TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <RTabs.Trigger
                    key={tab.id}
                    value={tab.id}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 font-display text-sm font-bold transition",
                      "bg-surface-2 text-ink-muted hover:bg-surface-3 hover:text-ink",
                      "data-[state=active]:bg-brass data-[state=active]:text-brass-ink data-[state=active]:pop-brass",
                    )}
                  >
                    <Icon className="size-4" strokeWidth={2.4} />{" "}
                    {t(tab.labelKey)}
                  </RTabs.Trigger>
                );
              })}
            </RTabs.List>

            <RTabs.Content value="canais">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wide text-ink-faint">
                    {t("chat.channels.section")}
                  </span>
                  <Button
                    variant={adding ? "ghost" : "subtle"}
                    size="sm"
                    onClick={() => setAdding((v) => !v)}
                  >
                    {adding ? (
                      <X className="size-3.5" />
                    ) : (
                      <Plus className="size-3.5" />
                    )}
                    {adding ? t("chat.common.cancel") : t("chat.channels.add")}
                  </Button>
                </div>

                {adding && (
                  <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md bg-surface-2 p-2">
                    <span className="px-1 text-[11px] font-bold uppercase tracking-wide text-ink-faint">
                      {t("chat.channels.which")}
                    </span>
                    {(["twitch", "kick", "youtube", "cinefy"] as const).map(
                      (p) => (
                        <button
                          key={p}
                          onClick={() => {
                            addSource(p);
                            setAdding(false);
                          }}
                          className="flex items-center gap-1.5 rounded-md bg-surface px-2.5 py-1.5 text-xs font-bold ring-1 ring-border transition hover:-translate-y-px hover:text-ink"
                        >
                          <PlatformGlyph id={p} size={18} />
                          {CHAT_PLATFORM_LABEL[p]}
                          {p === "cinefy" && (
                            <ExperimentalBadge className="ml-0.5 scale-90" />
                          )}
                        </button>
                      ),
                    )}
                  </div>
                )}

                {sources.length === 0 ? (
                  <div className="rounded-md border-2 border-dashed border-border bg-surface-2 px-3 py-5 text-center text-sm text-ink-muted">
                    {bold(t, "chat.channels.empty")}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {sources.map((src) => (
                      <SourceCard
                        key={src.id}
                        src={src}
                        onChange={(p) => updateSource(src.id, p)}
                        onRemove={() => removeSource(src.id)}
                      />
                    ))}
                  </div>
                )}

                {/* Alert-only setups also auto-connect, so they must expose this toggle. */}
                {(sources.length > 0 || alertSources.length > 0) && (
                  <div className="mt-3 border-t border-border-soft pt-3">
                    <ToggleRow
                      icon={Wifi}
                      label={t("chat.autoconnect.label")}
                      hint={t("chat.autoconnect.hint")}
                      checked={s.chatAutoConnect ?? true}
                      onChange={(v) => setSettings({ chatAutoConnect: v })}
                    />
                  </div>
                )}

                {sources.some((x) => x.platform === "youtube") && (
                  <YoutubeApiKeyField
                    value={s.youtubeApiKey ?? ""}
                    onChange={(v) => setSettings({ youtubeApiKey: v })}
                  />
                )}
              </div>
            </RTabs.Content>

            <RTabs.Content value="alertas">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wide text-ink-faint">
                    {t("chat.alertsrc.section")}
                  </span>
                  <Button
                    variant={addingAlert ? "ghost" : "subtle"}
                    size="sm"
                    onClick={() => setAddingAlert((v) => !v)}
                  >
                    {addingAlert ? (
                      <X className="size-3.5" />
                    ) : (
                      <Plus className="size-3.5" />
                    )}
                    {addingAlert
                      ? t("chat.common.cancel")
                      : t("chat.alertsrc.add")}
                  </Button>
                </div>
                <p className="mb-2 text-[11px] text-ink-faint">
                  {bold(t, "chat.alertsrc.lede")}
                </p>

                {addingAlert && (
                  <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md bg-surface-2 p-2">
                    <span className="px-1 text-[11px] font-bold uppercase tracking-wide text-ink-faint">
                      {t("chat.channels.which")}
                    </span>
                    {(["streamlabs", "streamelements"] as const).map((k) => (
                      <button
                        key={k}
                        onClick={() => {
                          addAlertSource(k);
                          setAddingAlert(false);
                        }}
                        className="flex items-center gap-1.5 rounded-md bg-surface px-2.5 py-1.5 text-xs font-bold ring-1 ring-border transition hover:-translate-y-px hover:text-ink"
                      >
                        <Bell className="size-3.5 text-brass" />
                        {ALERT_META[k].label}
                      </button>
                    ))}
                  </div>
                )}

                {alertSources.length === 0 ? (
                  <div className="rounded-md border-2 border-dashed border-border bg-surface-2 px-3 py-4 text-center text-xs text-ink-muted">
                    {bold(t, "chat.alertsrc.empty")}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {alertSources.map((src) => (
                      <AlertSourceCard
                        key={src.id}
                        src={src}
                        status={
                          alertStatuses[src.name.trim() || src.kind]?.status
                        }
                        onChange={(p) => updateAlertSource(src.id, p)}
                        onRemove={() => removeAlertSource(src.id)}
                        onToken={(token) => setAlertToken(src.id, token)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </RTabs.Content>

            <RTabs.Content value="overlays">
              <OverlayCard settings={s} setSettings={setSettings} />
            </RTabs.Content>

            <RTabs.Content value="conta">
              {!IS_TAURI ? (
                <p className="text-xs text-ink-muted">
                  {t("chat.account.desktopOnly")}
                </p>
              ) : !hasTwitchChannel && !hasYoutubeChannel && !hasKickChannel ? (
                <p className="text-xs text-ink-muted">
                  {bold(t, "chat.account.needChannel")}
                </p>
              ) : (
                <>
                  {oauthBrokerError && (
                    <p className="mb-2 rounded-md border-2 border-warn/40 bg-warn/10 px-3 py-2 text-[11px] leading-relaxed text-ink-muted">
                      {t("chat.account.brokerError", {
                        error: oauthBrokerError,
                      })}
                    </p>
                  )}
                  {/* Keep data-use disclosure visible during authorization. */}
                  <p className="mb-2 text-[11px] leading-relaxed text-ink-faint">
                    {privacyBefore}
                    <LegalLink href={legalUrl(locale, "privacy")}>
                      {t("chat.account.privacy.link")}
                    </LegalLink>
                    {privacyAfter}
                  </p>
                  <div className="flex flex-col gap-2">
                    {hasTwitchChannel && (
                      <LoginRow
                        platform="twitch"
                        label="Twitch"
                        state={chatLogin.twitch}
                        enabled={HAS_TWITCH_OAUTH}
                        onLogin={twitchLogin}
                        onLogout={twitchLogout}
                      />
                    )}
                    {hasYoutubeChannel &&
                      (youtubeOauthReady ? (
                        <div className="flex flex-col gap-1">
                          <LoginRow
                            platform="youtube"
                            label="YouTube"
                            state={chatLogin.youtube}
                            enabled
                            onLogin={youtubeLogin}
                            onLogout={youtubeLogout}
                          />
                          <button
                            onClick={() =>
                              setShowYoutubeByok((value) => !value)
                            }
                            className="self-end text-[11px] font-semibold text-ink-faint hover:text-ink"
                          >
                            {showYoutubeByok
                              ? t("chat.account.byok.hide")
                              : t("chat.account.byok.show")}
                          </button>
                          {showYoutubeByok && (
                            <YoutubeCredsForm
                              onSave={saveYoutubeOauth}
                              modes={youtubeOauthModes}
                              onUseOfficial={() =>
                                void youtubeMode(
                                  youtubeUseOfficial(),
                                  t("chat.account.youtube.official.toast"),
                                )
                              }
                              onUseSaved={() =>
                                void youtubeMode(
                                  youtubeUseOwnCreds(),
                                  t("chat.account.youtube.ownCreds.toast"),
                                )
                              }
                              onForget={() =>
                                void youtubeMode(
                                  clearYoutubeOauth(),
                                  t("chat.account.youtube.forgot.toast"),
                                )
                              }
                            />
                          )}
                        </div>
                      ) : (
                        <YoutubeCredsForm
                          onSave={saveYoutubeOauth}
                          modes={youtubeOauthModes}
                          onUseSaved={() =>
                            void youtubeMode(
                              youtubeUseOwnCreds(),
                              t("chat.account.youtube.ownCreds.toast"),
                            )
                          }
                        />
                      ))}
                    {hasKickChannel &&
                      (kickOauthReady ? (
                        <div className="flex flex-col gap-1">
                          <LoginRow
                            platform="kick"
                            label="Kick"
                            state={chatLogin.kick}
                            enabled={kickOauthReady}
                            onLogin={kickLogin}
                            onLogout={kickLogout}
                          />
                          <button
                            onClick={() => setShowKickByok((value) => !value)}
                            className="self-end text-[11px] font-semibold text-ink-faint hover:text-ink"
                          >
                            {showKickByok
                              ? t("chat.account.byok.hide")
                              : t("chat.account.byok.show")}
                          </button>
                          {showKickByok && (
                            <KickCredsForm
                              onSave={saveKickOauth}
                              modes={kickOauthModes}
                              onUseOfficial={() =>
                                void kickMode(
                                  kickUseOfficial(),
                                  t("chat.account.kick.official.toast"),
                                )
                              }
                              onUseSaved={() =>
                                void kickMode(
                                  kickUseOwnCreds(),
                                  t("chat.account.kick.ownCreds.toast"),
                                )
                              }
                              onForget={() =>
                                void kickMode(
                                  clearKickOauth(),
                                  t("chat.account.kick.forgot.toast"),
                                )
                              }
                            />
                          )}
                        </div>
                      ) : (
                        <KickCredsForm
                          onSave={saveKickOauth}
                          modes={kickOauthModes}
                          onUseSaved={() =>
                            void kickMode(
                              kickUseOwnCreds(),
                              t("chat.account.kick.ownCreds.toast"),
                            )
                          }
                        />
                      ))}
                  </div>
                  <p className="mt-3 text-[11px] text-ink-faint">
                    {bold(t, "chat.account.footer")}
                  </p>
                </>
              )}
            </RTabs.Content>

            <RTabs.Content value="exibicao">
              <div>
                <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-ink-faint">
                  {t("chat.display.section")}
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <ToggleRow
                    icon={Smile}
                    label={t("chat.display.emotes")}
                    hint={t("chat.display.emotes.hint")}
                    checked={view.emotes}
                    onChange={(v) => setSettings({ chatShowEmotes: v })}
                  />
                  <ToggleRow
                    icon={BadgeCheck}
                    label={t("chat.display.badges")}
                    hint={t("chat.display.badges.hint")}
                    checked={view.badges}
                    onChange={(v) => setSettings({ chatShowBadges: v })}
                  />
                  <ToggleRow
                    icon={Tv2}
                    label={t("chat.display.platform")}
                    hint={t("chat.display.platform.hint")}
                    checked={view.platform}
                    onChange={(v) => setSettings({ chatShowPlatform: v })}
                  />
                  <ToggleRow
                    icon={AtSign}
                    label={t("chat.display.source")}
                    hint={t("chat.display.source.hint")}
                    checked={view.source}
                    onChange={(v) => setSettings({ chatShowSource: v })}
                  />
                  <ToggleRow
                    icon={Clock}
                    label={t("chat.display.timestamps")}
                    hint={t("chat.display.timestamps.hint")}
                    checked={view.timestamps}
                    onChange={(v) => setSettings({ chatShowTimestamps: v })}
                  />
                  <ToggleRow
                    icon={Eye}
                    label={t("chat.display.viewers")}
                    hint={t("chat.display.viewers.hint")}
                    checked={s.chatShowViewers ?? true}
                    onChange={(v) => setSettings({ chatShowViewers: v })}
                  />
                </div>
                <div className="mt-3 flex items-center gap-3 border-t border-border-soft pt-3">
                  <span className="shrink-0 text-sm font-semibold text-ink-muted">
                    {t("chat.display.chatFontSize")}
                  </span>
                  <Slider
                    className="ml-auto max-w-52 flex-1"
                    value={view.fontSize}
                    min={8}
                    max={44}
                    onChange={(v) => setSettings({ chatFontSize: v })}
                    suffix="px"
                    aria-label={t("chat.display.chatFontSize")}
                  />
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <span className="shrink-0 text-sm font-semibold text-ink-muted">
                    {t("chat.display.alertFontSize")}
                  </span>
                  <Slider
                    className="ml-auto max-w-52 flex-1"
                    value={s.alertFontSize ?? 14}
                    min={8}
                    max={44}
                    onChange={(v) => setSettings({ alertFontSize: v })}
                    suffix="px"
                    aria-label={t("chat.display.alertFontSize")}
                  />
                </div>
              </div>
            </RTabs.Content>
          </RTabs.Root>
        </Modal>
      )}

      <div className="mb-2 flex items-center gap-2">
        {showFilters &&
          feedPlatforms.map((p) => (
            <FilterChip
              key={p}
              id={p}
              label={CHAT_PLATFORM_LABEL[p]}
              on={filter[p]}
              onClick={() => setFilter((f) => ({ ...f, [p]: !f[p] }))}
            />
          ))}
        <Button
          variant={showAlerts ? "primary" : "ghost"}
          size="sm"
          className={cn("ml-auto", alertPulse && "animate-pulse text-brass")}
          onClick={() => {
            setAlertPulse(false);
            setSettings({ chatShowAlertsPanel: !showAlerts });
          }}
          title={alertPulse ? t("chat.alerts.newPulse") : undefined}
        >
          <Bell className="size-4" />{" "}
          {alerts.length > 0
            ? t("chat.alerts.button.count", { n: alerts.length })
            : t("chat.alerts.button")}
        </Button>
        <Button
          variant={confirmClearChat ? "danger" : "ghost"}
          size="sm"
          onClick={() => {
            if (!confirmClearChat) {
              setConfirmClearChat(true);
              setTimeout(() => setConfirmClearChat(false), 3000);
              return;
            }
            setConfirmClearChat(false);
            clearChat();
          }}
        >
          <Trash2 className="size-4" />{" "}
          {confirmClearChat ? t("chat.clear.confirm") : t("chat.clear")}
        </Button>
      </div>

      <div className="flex gap-3">
        <Card className="flex h-[54vh] flex-1 flex-col overflow-hidden p-0">
          <ChatFeed
            messages={shown}
            view={view}
            connected={connected}
            allFilteredOut={allFilteredOut}
            className="flex-1"
            onFontSize={(n) => setSettings({ chatFontSize: n })}
            modLevel={modLevel}
            onModerate={onModerate}
            disconnectedHint={
              configured ? t("chat.feed.hint.ready") : t("chat.feed.hint.setup")
            }
            emptyAction={
              configured ? (
                <Button
                  variant="primary"
                  size="sm"
                  loading={connecting}
                  onClick={() => void doConnect()}
                >
                  {!connecting && <Wifi className="size-4" />}{" "}
                  {t("chat.action.connect")}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setConfigTab("canais");
                    setShowConfig(true);
                  }}
                >
                  <Plus className="size-4" /> {t("chat.channels.add")}
                </Button>
              )
            }
          />
        </Card>
        {showAlerts && (
          <Card className="flex h-[54vh] w-72 shrink-0 flex-col overflow-hidden p-0">
            <div className="flex items-center justify-between border-b-2 border-border-soft px-3 py-2">
              <span className="flex items-center gap-1.5 font-display text-sm font-extrabold">
                <Bell className="size-4 text-brass" /> {t("chat.alerts.button")}
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
                className={cn(
                  "grid h-8 min-w-8 place-items-center rounded px-1 text-xs font-bold transition-colors",
                  confirmClearAlerts
                    ? "text-bad"
                    : "text-ink-faint hover:text-bad",
                )}
                title={
                  confirmClearAlerts
                    ? t("chat.alerts.clear.confirmTitle")
                    : t("chat.alerts.clear.title")
                }
                aria-label={
                  confirmClearAlerts ? undefined : t("chat.alerts.clear.title")
                }
              >
                {confirmClearAlerts ? (
                  t("chat.alerts.clear.confirmLabel")
                ) : (
                  <Trash2 className="size-3.5" />
                )}
              </button>
            </div>
            {downAlertSources.length > 0 && (
              <div
                role="status"
                className="flex flex-col gap-1 border-b-2 border-border-soft bg-warn/10 px-3 py-1.5 text-[11px] text-ink-muted"
              >
                {downAlertSources.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      setConfigTab("alertas");
                      setShowConfig(true);
                    }}
                    className="flex items-start gap-1.5 text-left font-semibold hover:underline"
                  >
                    <TriangleAlert className="mt-px size-3.5 shrink-0 text-warn" />
                    <span>{t("chat.alerts.sourceDown", { source: name })}</span>
                  </button>
                ))}
              </div>
            )}
            <AlertsFeed
              alerts={alerts}
              className="flex-1"
              fontSize={s.alertFontSize ?? 14}
            />
          </Card>
        )}
      </div>

      {IS_TAURI && sendableSources.length > 0 && (
        <div className="mt-3">
          <div className="flex items-center gap-2">
            {sendableSources.length > 1 && (
              <Select
                className="w-40 shrink-0"
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
              className="flex-1"
            />
            <Button
              variant="primary"
              loading={sending}
              disabled={!draft.trim() || sending || !canSend}
              onClick={doSend}
              title={!canSend ? sendStatus : undefined}
            >
              {!sending && <Send className="size-4" />} {t("chat.send.button")}
            </Button>
          </div>
          <div className="mt-1 px-0.5 text-[11px] text-ink-faint">
            {sendStatus}
          </div>
        </div>
      )}

      {IS_TAURI && sendableSources.length === 0 && canLoginSomewhere && (
        <button
          onClick={() => {
            setConfigTab("conta");
            setShowConfig(true);
          }}
          className="mt-3 flex w-full items-center gap-2 rounded-md bg-surface-2 px-3 py-2 text-sm text-ink-muted ring-1 ring-border transition-colors hover:text-ink"
        >
          <LogIn className="size-4 shrink-0 text-brass" />
          <span>{bold(t, "chat.login.prompt")}</span>
          <span className="ml-auto shrink-0 text-xs font-bold text-brass">
            {t("chat.login.prompt.cta")}
          </span>
        </button>
      )}
    </div>
  );
}
