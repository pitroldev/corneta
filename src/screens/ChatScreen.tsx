import { useEffect, useRef, useState, type ReactNode } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import {
  AtSign,
  BadgeCheck,
  Bell,
  Check,
  ChevronDown,
  ClipboardPaste,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  LogIn,
  MonitorPlay,
  Pencil,
  PictureInPicture2,
  Plus,
  RefreshCw,
  Send,
  Settings2,
  Smile,
  Trash2,
  Tv2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { api, IS_TAURI, type OverlayInfo } from "../lib/api";
import { useStore } from "../lib/store";
import { sendStatusLine, srcLabel, type Translate } from "../lib/chatSend";
import { bold, useI18n, useT, type MessageKey } from "../lib/i18n";
import { toast } from "../lib/toast";
import { cn, errMsg, openExternal, uid } from "../lib/utils";
import { normalizeChatChannel } from "../lib/chatChannel";
import { sanitizeApiKey, sanitizeToken } from "../lib/validation";
import * as RTabs from "@radix-ui/react-tabs";
import { HAS_TWITCH_OAUTH } from "../lib/oauth";
import { legalUrl } from "../lib/legal";
import { LegalLink } from "../components/legal";
import type {
  AlertSource,
  AlertSourceKind,
  AppSettings,
  ChatMessage,
  ChatPlatform,
  ChatSource,
} from "../lib/types";
import {
  Button,
  Card,
  ExperimentalBadge,
  Input,
  PlatformGlyph,
  SectionTitle,
  Toggle,
} from "../components/ui";
import { Select } from "../components/Select";
import { Slider } from "../components/Slider";
import { Tooltip } from "../components/Tooltip";
import { ChatFeed, type ChatView } from "../components/ChatFeed";
import { AlertsFeed } from "../components/AlertsFeed";
import { Modal } from "../components/Modal";

const PLATFORM_OPTS: { value: ChatPlatform; label: string }[] = [
  { value: "twitch", label: "Twitch" },
  { value: "kick", label: "Kick" },
  { value: "youtube", label: "YouTube" },
  { value: "cinefy", label: "Cinefy · experimental" },
];
const CHAT_PLATFORM_LABEL: Record<ChatPlatform, string> = {
  twitch: "Twitch",
  kick: "Kick",
  youtube: "YouTube",
  cinefy: "Cinefy",
};
const VALUE_LABEL: Record<ChatPlatform, MessageKey> = {
  twitch: "chat.source.value.twitch",
  kick: "chat.source.value.kick",
  youtube: "chat.source.value.youtube",
  cinefy: "chat.source.value.cinefy",
};
const PLACEHOLDER: Record<ChatPlatform, MessageKey> = {
  twitch: "chat.source.placeholder.twitch",
  kick: "chat.source.placeholder.kick",
  youtube: "chat.source.placeholder.youtube",
  cinefy: "chat.source.placeholder.cinefy",
};
const HINT: Record<ChatPlatform, MessageKey> = {
  twitch: "chat.source.hint.twitch",
  kick: "chat.source.hint.kick",
  youtube: "chat.source.hint.youtube",
  cinefy: "chat.source.hint.cinefy",
};

type ConfigTab = "canais" | "conta" | "alertas" | "overlays" | "exibicao";
const CONFIG_TABS: { id: ConfigTab; labelKey: MessageKey; icon: typeof Tv2 }[] =
  [
    { id: "canais", labelKey: "chat.config.tab.channels", icon: Tv2 },
    { id: "conta", labelKey: "chat.config.tab.account", icon: LogIn },
    { id: "alertas", labelKey: "chat.config.tab.alerts", icon: Bell },
    { id: "overlays", labelKey: "chat.config.tab.overlays", icon: MonitorPlay },
    { id: "exibicao", labelKey: "chat.config.tab.display", icon: Eye },
  ];

/** Parte a frase traduzida no ponto marcado (um `{buraco}` ou um nome de produto)
 *  pra encaixar um link no meio dela sem picar a chave em duas. */
function splitAt(text: string, mark: string): [string, string] {
  const i = text.indexOf(mark);
  return i < 0 ? [text, ""] : [text.slice(0, i), text.slice(i + mark.length)];
}

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

  // Deep-link de outra tela (ex.: teaser "Título da live" no Ao vivo) → abre o modal
  // já na aba pedida, e consome o pedido (mesmo padrão do settingsTab).
  useEffect(() => {
    if (chatConfigRequest) {
      setConfigTab(chatConfigRequest as ConfigTab);
      setShowConfig(true);
      requestChatConfig(null);
    }
  }, [chatConfigRequest, requestChatConfig]);

  // Painel de Alertas: preferência persistida (antes era estado local, esquecia toda visita).
  const showAlerts = config?.settings.chatShowAlertsPanel ?? false;
  // Alerta novo com o painel fechado → pulsa o botão (sem abrir sozinho: reflow no meio da live).
  const prevAlerts = useRef(alerts.length);
  useEffect(() => {
    if (alerts.length > prevAlerts.current && !showAlerts) setAlertPulse(true);
    prevAlerts.current = alerts.length;
  }, [alerts.length, showAlerts]);

  if (!config) return null;
  const s = config.settings;
  const sources = s.chatSources ?? [];
  // 2+ fontes da mesma plataforma (ex.: 2 Twitches) → mostra o nome do canal por padrão.
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
  // Plataformas que de fato entram no feed (fonte ligada e nomeada). Os chips de filtro
  // só fazem sentido com 2+ — com 1 só viram ruído (e o risco de filtrar sem religar).
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
  const removeSource = (id: string) =>
    setSettings({ chatSources: sources.filter((x) => x.id !== id) });

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
  const removeAlertSource = (id: string) => {
    void api.clearKey(`alert_${id}`);
    setSettings({ alertSources: alertSources.filter((x) => x.id !== id) });
  };

  // Envio: fontes capazes (token colado, conta Twitch logada, YouTube ou Kick logado).
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
  // YouTube e Kick podem receber configuração oficial pelo bootstrap ou credenciais próprias;
  // por isso continuam acessíveis mesmo quando o fallback público não veio no build.
  const canLoginSomewhere =
    (hasTwitchChannel && HAS_TWITCH_OAUTH) ||
    hasYoutubeChannel ||
    hasKickChannel;
  // Alvo efetivo do envio (guarda contra id morto no seletor).
  const sendValid =
    sendTo !== "all" && sendableSources.some((x) => x.id === sendTo);
  const effectiveSendTo = sendValid ? sendTo : "all";
  const sendTargets =
    effectiveSendTo === "all"
      ? sendableSources
      : sendableSources.filter((x) => x.id === effectiveSendTo);
  // Twitch só envia DEPOIS que o IRC autentica (chatAuth.ok); YouTube/Kick mandam via HTTP na hora.
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

  // Troca de modo de OAuth (oficial ↔ credenciais próprias) e o "esquecer". Fecha as opções
  // avançadas quando dá certo e MOSTRA o motivo quando a Corneta recusa — a recusa (ex.: login
  // oficial fora do ar) é justamente a informação que o streamer precisa ver.
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

  // Conectar (botão do topo e do estado vazio). Sem canal configurado, abre a config.
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
  // Religa as fontes do zero SEM apagar o histórico (o backend descarta a geração antiga).
  // Usa connectChat: limpa os status/auth antigos (senão uma fonte corrigida/removida fica
  // pra sempre com bolinha vermelha fantasma) e religa também os ALERTAS (token trocado
  // do Streamlabs/StreamElements só vale com o alerts_start de novo).
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

  // Moderação: acha a fonte de uma mensagem (rótulo+plataforma) e o nível permitido.
  const sourceForMessage = (m: ChatMessage) =>
    sources.find((x) => x.platform === m.platform && srcLabel(x) === m.source);
  const modLevel = (m: ChatMessage): "full" | "delete" | "none" => {
    const src = sourceForMessage(m);
    if (!src) return "none";
    const myLogin = chatLogin.twitch.login?.toLowerCase();
    // Não modera as próprias mensagens (eco / sua conta).
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

  // A frase da privacidade tem um LINK no meio: o dicionário guarda a frase
  // inteira com {link}, e aqui ela é partida pra caber o componente.
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
                <span
                  key={source}
                  className="flex items-center gap-1.5 text-sm"
                  title={t("chat.status.tooltip", {
                    source,
                    explain: statusExplain(t, st.platform, st.status),
                  })}
                >
                  <PlatformGlyph id={st.platform as ChatPlatform} size={16} />
                  <span
                    className={cn("size-2 rounded-full", statusDot(st.status))}
                    aria-hidden
                  />
                  <span className="text-ink-muted">{source}</span>
                  {st.status !== "connected" && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                      {statusLabel(t, st.status)}
                    </span>
                  )}
                </span>
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
              {/* Canais */}
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

                {/* Também com setup só-de-alertas: o auto-connect dispara com alertSources
                  (bindEngine), então o toggle pra desligar precisa aparecer nesse caso. */}
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
              {/* Fontes de alerta (Streamlabs / StreamElements) */}
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
              {/* Overlays pro OBS: alertas + chat como Browser Source (com emotes). */}
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
                  {/* Quando a nossa setup API não responde, o login oficial simplesmente não
                      aparece. Dizer o motivo evita o streamer achar que o app está quebrado. */}
                  {oauthBrokerError && (
                    <p className="mb-2 rounded-md border-2 border-warn/40 bg-warn/10 px-3 py-2 text-[11px] leading-relaxed text-ink-muted">
                      {t("chat.account.brokerError", {
                        error: oauthBrokerError,
                      })}
                    </p>
                  )}
                  {/* Divulgação NO MOMENTO da autorização. A Limited Use do Google exige
                      que o uso dos dados esteja claro antes ou durante o consentimento —
                      a política publicada satisfaz o "antes", isto satisfaz o "durante", e
                      é o que o revisor vê no vídeo de verificação. */}
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
                        onLogin={() => void twitchLogin()}
                        onLogout={() => void twitchLogout()}
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
                            onLogin={() => void youtubeLogin()}
                            onLogout={() => void youtubeLogout()}
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
                              onSave={(id, secret) => {
                                void youtubeMode(setYoutubeOauth(id, secret));
                              }}
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
                          onSave={(id, sec) =>
                            void youtubeMode(setYoutubeOauth(id, sec))
                          }
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
                            onLogin={() => void kickLogin()}
                            onLogout={() => void kickLogout()}
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
                              onSave={(id, secret) => {
                                void kickMode(setKickOauth(id, secret));
                              }}
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
                          onSave={(id, secret) =>
                            void kickMode(setKickOauth(id, secret))
                          }
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
              {/* Exibição */}
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
                  "text-xs font-bold transition-colors",
                  confirmClearAlerts
                    ? "text-bad"
                    : "text-ink-faint hover:text-bad",
                )}
                title={
                  confirmClearAlerts
                    ? t("chat.alerts.clear.confirmTitle")
                    : t("chat.alerts.clear.title")
                }
                aria-label={t("chat.alerts.clear.title")}
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

function FilterChip({
  label,
  id,
  on,
  onClick,
}: {
  label: string;
  id: ChatPlatform;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md border-2 px-2.5 py-1 text-xs font-bold transition-colors",
        on
          ? "border-brass bg-brass/10 text-ink"
          : "border-border bg-surface text-ink-faint hover:text-ink-muted",
      )}
    >
      <PlatformGlyph id={id} size={14} /> {label}
    </button>
  );
}

// Os `value` viajam crus na query string do overlay (?pos=, &scale=) — só o
// rótulo é texto de tela.
const overlayPosOpts = (t: Translate) => [
  { value: "top", label: t("chat.overlay.pos.top") },
  { value: "bottom", label: t("chat.overlay.pos.bottom") },
  { value: "center", label: t("chat.overlay.pos.center") },
  { value: "top-left", label: t("chat.overlay.pos.topLeft") },
  { value: "top-right", label: t("chat.overlay.pos.topRight") },
  { value: "bottom-left", label: t("chat.overlay.pos.bottomLeft") },
  { value: "bottom-right", label: t("chat.overlay.pos.bottomRight") },
];

const chatPosOpts = (t: Translate) => [
  { value: "bottom", label: t("chat.overlay.chatPos.bottom") },
  { value: "top", label: t("chat.overlay.chatPos.top") },
];

const scaleOpts = (t: Translate) => [
  { value: "sm", label: t("chat.overlay.scale.sm") },
  { value: "md", label: t("chat.overlay.scale.md") },
  { value: "lg", label: t("chat.overlay.scale.lg") },
];

/** Linha de opção: rótulo à esquerda, controle à direita. */
function OptRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-xs font-semibold text-ink-muted">
        {label}
      </span>
      {children}
    </div>
  );
}

/** Um overlay (alertas ou chat): URL + copiar + adicionar no OBS + testar + opções. */
function OverlayBlock({
  title,
  url,
  onTest,
  testMsg,
  children,
}: {
  title: string;
  url: string;
  onTest: () => Promise<void>;
  testMsg: string;
  children?: ReactNode;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard indisponível */
    }
  };
  const addToObs = () =>
    api
      .overlayObsAddSource(url)
      .then(() =>
        toast.success(
          t("chat.overlay.added.toast", { block: title.toLowerCase() }),
        ),
      )
      .catch((e) => toast.error(errMsg(e)));
  const test = () =>
    onTest()
      .then(() => toast.success(testMsg))
      .catch((e) => toast.error(errMsg(e)));
  return (
    <div className="rounded-md bg-surface-2/60 p-2.5 ring-1 ring-border">
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-brass">
        {title}
      </div>
      <div className="flex items-center gap-1.5">
        <code className="min-w-0 flex-1 truncate rounded-md bg-surface px-2.5 py-2 text-[11px] text-ink-muted ring-1 ring-border">
          {url}
        </code>
        <Button variant="subtle" size="sm" onClick={() => void copy()}>
          {copied ? (
            <Check className="size-3.5" />
          ) : (
            <Copy className="size-3.5" />
          )}
          {copied ? t("chat.common.copied") : t("chat.common.copy")}
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="subtle" size="sm" onClick={() => void addToObs()}>
          <Tv2 className="size-3.5" /> {t("chat.overlay.addToObs")}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void test()}>
          <Bell className="size-3.5" /> {t("chat.common.test")}
        </Button>
      </div>
      {children && (
        <div className="mt-2 flex flex-col gap-2 rounded-md bg-surface px-3 py-2">
          {children}
        </div>
      )}
      <p className="mt-1.5 text-[11px] text-ink-faint">
        {bold(t, "chat.overlay.reAddNote")}
      </p>
    </div>
  );
}

/** Overlays pro OBS: um servidor local serve alertas e chat (Browser Source), com emotes. */
function OverlayCard({
  settings,
  setSettings,
}: {
  settings: AppSettings;
  setSettings: (patch: Partial<AppSettings>) => void;
}) {
  const t = useT();
  const enabled = settings.overlayEnabled ?? false;
  const [info, setInfo] = useState<OverlayInfo | null>(null);
  const [busy, setBusy] = useState(false);

  // O backend sobe o servidor no boot quando ligado; aqui só buscamos as URLs pra exibir.
  useEffect(() => {
    if (!IS_TAURI || !enabled) return;
    let alive = true;
    api
      .overlayStatus()
      .then((i) => {
        if (alive && i) setInfo(i);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const alertUrl = info
    ? `${info.url}?sound=${(settings.overlaySound ?? true) ? 1 : 0}` +
      `&pos=${settings.overlayPosition || "top"}` +
      `&dur=${settings.overlayDurationSecs ?? 6}` +
      `&scale=${settings.overlayScale || "md"}` +
      `&follows=${(settings.overlayShowFollows ?? true) ? 1 : 0}`
    : "";
  const chatUrl = info
    ? `${info.chatUrl}?pos=${settings.overlayChatPosition || "bottom"}` +
      `&size=${settings.overlayChatSize ?? 22}` +
      `&max=${settings.overlayChatMax ?? 12}` +
      `&badges=${(settings.overlayChatBadges ?? true) ? 1 : 0}` +
      `&platform=${(settings.overlayChatPlatform ?? true) ? 1 : 0}` +
      `&nocmd=${(settings.overlayChatHideCommands ?? false) ? 1 : 0}` +
      `&fade=${settings.overlayChatFadeSecs ?? 0}`
    : "";

  const toggle = async (on: boolean) => {
    setSettings({ overlayEnabled: on });
    if (!IS_TAURI) return;
    setBusy(true);
    try {
      if (on) setInfo(await api.overlayStart());
      else {
        await api.overlayStop();
        setInfo(null);
      }
    } catch (e) {
      toast.error(errMsg(e));
      setSettings({ overlayEnabled: !on }); // reverte se não subiu (porta ocupada etc.)
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MonitorPlay className="size-4 text-brass" />
          <span className="text-xs font-bold uppercase tracking-wide text-ink-faint">
            {t("chat.overlay.section")}
          </span>
        </div>
        <Toggle
          checked={enabled}
          onChange={(v) => void toggle(v)}
          disabled={busy}
          label={t("chat.overlay.section")}
        />
      </div>
      <p className="mb-2 text-[11px] text-ink-faint">
        {bold(t, "chat.overlay.lede")}
      </p>

      {enabled &&
        (!IS_TAURI ? (
          <p className="text-xs text-ink-muted">
            {t("chat.account.desktopOnly")}
          </p>
        ) : !info ? (
          <div className="rounded-md border-2 border-dashed border-border bg-surface-2 px-3 py-3 text-center text-xs text-ink-muted">
            {busy ? t("chat.overlay.starting") : t("chat.overlay.reopenTab")}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <OverlayBlock
              title={t("chat.overlay.block.alerts")}
              url={alertUrl}
              onTest={() => api.overlayTest()}
              testMsg={t("chat.overlay.test.alerts")}
            >
              <OptRow label={t("chat.overlay.opt.position")}>
                <Select
                  className="w-40"
                  value={settings.overlayPosition || "top"}
                  options={overlayPosOpts(t)}
                  onChange={(v) => setSettings({ overlayPosition: v })}
                  aria-label={t("chat.overlay.aria.alertPosition")}
                />
              </OptRow>
              <OptRow label={t("chat.overlay.opt.size")}>
                <Select
                  className="w-40"
                  value={settings.overlayScale || "md"}
                  options={scaleOpts(t)}
                  onChange={(v) => setSettings({ overlayScale: v })}
                  aria-label={t("chat.overlay.aria.alertSize")}
                />
              </OptRow>
              <OptRow label={t("chat.overlay.opt.duration")}>
                <Slider
                  className="w-40"
                  value={settings.overlayDurationSecs ?? 6}
                  min={3}
                  max={15}
                  suffix="s"
                  onChange={(v) => setSettings({ overlayDurationSecs: v })}
                  aria-label={t("chat.overlay.opt.duration")}
                />
              </OptRow>
              <OptRow label={t("chat.overlay.opt.sound")}>
                <Toggle
                  checked={settings.overlaySound ?? true}
                  onChange={(v) => setSettings({ overlaySound: v })}
                  label={t("chat.overlay.opt.sound")}
                />
              </OptRow>
              <OptRow label={t("chat.overlay.opt.follows")}>
                <Toggle
                  checked={settings.overlayShowFollows ?? true}
                  onChange={(v) => setSettings({ overlayShowFollows: v })}
                  label={t("chat.overlay.opt.follows")}
                />
              </OptRow>
            </OverlayBlock>

            <OverlayBlock
              title={t("chat.overlay.block.chat")}
              url={chatUrl}
              onTest={() => api.overlayChatTest()}
              testMsg={t("chat.overlay.test.chat")}
            >
              <OptRow label={t("chat.overlay.opt.position")}>
                <Select
                  className="w-40"
                  value={settings.overlayChatPosition || "bottom"}
                  options={chatPosOpts(t)}
                  onChange={(v) => setSettings({ overlayChatPosition: v })}
                  aria-label={t("chat.overlay.aria.chatPosition")}
                />
              </OptRow>
              <OptRow label={t("chat.overlay.opt.fontSize")}>
                <Slider
                  className="w-40"
                  value={settings.overlayChatSize ?? 22}
                  min={12}
                  max={40}
                  suffix="px"
                  onChange={(v) => setSettings({ overlayChatSize: v })}
                  aria-label={t("chat.display.chatFontSize")}
                />
              </OptRow>
              <OptRow label={t("chat.overlay.opt.maxMessages")}>
                <Slider
                  className="w-40"
                  value={settings.overlayChatMax ?? 12}
                  min={3}
                  max={30}
                  onChange={(v) => setSettings({ overlayChatMax: v })}
                  aria-label={t("chat.overlay.aria.maxMessages")}
                />
              </OptRow>
              <OptRow label={t("chat.overlay.opt.fade")}>
                <Slider
                  className="w-40"
                  value={settings.overlayChatFadeSecs ?? 0}
                  min={0}
                  max={60}
                  suffix="s"
                  onChange={(v) => setSettings({ overlayChatFadeSecs: v })}
                  aria-label={t("chat.overlay.aria.fade")}
                />
              </OptRow>
              <OptRow label={t("chat.overlay.opt.badges")}>
                <Toggle
                  checked={settings.overlayChatBadges ?? true}
                  onChange={(v) => setSettings({ overlayChatBadges: v })}
                  label={t("chat.overlay.aria.badges")}
                />
              </OptRow>
              <OptRow label={t("chat.overlay.opt.platformIcon")}>
                <Toggle
                  checked={settings.overlayChatPlatform ?? true}
                  onChange={(v) => setSettings({ overlayChatPlatform: v })}
                  label={t("chat.overlay.opt.platformIcon")}
                />
              </OptRow>
              <OptRow label={t("chat.overlay.opt.hideCommands")}>
                <Toggle
                  checked={settings.overlayChatHideCommands ?? false}
                  onChange={(v) => setSettings({ overlayChatHideCommands: v })}
                  label={t("chat.overlay.aria.hideCommands")}
                />
              </OptRow>
            </OverlayBlock>
          </div>
        ))}
    </div>
  );
}

function ToggleRow({
  icon: Icon,
  label,
  hint,
  checked,
  onChange,
}: {
  icon: typeof Smile;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      className="flex items-center justify-between gap-2 rounded-md bg-surface-2 px-2.5 py-2"
      title={hint}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icon className="size-4 shrink-0 text-brass" />
        <span className="truncate text-sm font-semibold text-ink-muted">
          {label}
        </span>
      </span>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

const statusDot = (status: string) =>
  status === "connected"
    ? "bg-ok"
    : status === "error"
      ? "bg-bad"
      : status === "waiting"
        ? "bg-warn animate-pulse"
        : "bg-ink-faint";

const statusLabel = (t: Translate, status: string) =>
  status === "connected"
    ? t("chat.status.label.live")
    : status === "error"
      ? t("chat.status.label.dropped")
      : status === "waiting"
        ? t("chat.status.label.waiting")
        : t("chat.status.label.connecting");

// Tooltip com o PORQUÊ do status (o label sozinho parece travado/quebrado).
// O supervisor do backend já re-tenta sozinho com backoff — a dica avisa isso.
const statusExplain = (t: Translate, platform: string, status: string) => {
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

function SourceCard({
  src,
  onChange,
  onRemove,
}: {
  src: ChatSource;
  onChange: (patch: Partial<ChatSource>) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(() => !src.value.trim());
  const [confirmRemove, setConfirmRemove] = useState(false);
  const inputCls =
    "h-9 rounded-md border-2 border-border bg-surface px-2 text-sm font-medium text-ink outline-none focus:border-brass";
  const platLabel = CHAT_PLATFORM_LABEL[src.platform];
  return (
    <div
      className={cn(
        "rounded-md border-2 transition-opacity",
        src.enabled ? "bg-surface" : "bg-surface-2 opacity-60",
        src.value.trim() ? "border-border-soft" : "border-bad/50",
      )}
    >
      <Collapsible.Root open={open} onOpenChange={setOpen}>
        <div className="flex items-center gap-2 p-2.5">
          <PlatformGlyph id={src.platform} size={22} />
          <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
            <span className="shrink-0 font-display text-sm font-bold">
              {platLabel}
            </span>
            {src.platform === "cinefy" && (
              <ExperimentalBadge className="ml-1 scale-90" />
            )}
            {src.value.trim() ? (
              <span className="truncate text-xs text-ink-muted">
                · {src.value}
                {src.name ? ` (${src.name})` : ""}
              </span>
            ) : (
              <span className="shrink-0 text-xs font-semibold text-bad">
                · {t("chat.source.noChannel")}
              </span>
            )}
          </div>
          <Toggle
            checked={src.enabled}
            onChange={(v) => onChange({ enabled: v })}
            label={t("chat.source.toggle")}
          />
          <Collapsible.Trigger asChild>
            <button
              aria-label={
                open ? t("chat.source.collapse") : t("chat.source.expand")
              }
              className="grid size-8 shrink-0 place-items-center rounded-md text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <ChevronDown
                className={cn(
                  "size-5 transition-transform",
                  open && "rotate-180",
                )}
              />
            </button>
          </Collapsible.Trigger>
        </div>

        <Collapsible.Content className="flex flex-col gap-2 px-2.5 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
              {t("chat.source.platformLabel")}
            </span>
            <Select
              className="w-36"
              value={src.platform}
              options={PLATFORM_OPTS}
              onChange={(v) =>
                onChange({
                  platform: v as ChatPlatform,
                  // Re-limpa o valor pro formato da NOVA plataforma (ex.: @handle→login).
                  value: normalizeChatChannel(v as ChatPlatform, src.value),
                })
              }
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_11rem]">
            <label className="flex flex-col gap-1 text-[11px] font-semibold text-ink-faint">
              {t(VALUE_LABEL[src.platform])}
              <input
                value={src.value}
                placeholder={t(PLACEHOLDER[src.platform])}
                onChange={(e) => onChange({ value: e.target.value })}
                onBlur={(e) => {
                  // Ao sair do campo, limpa o que colou (URL/@/ID/subpágina) pro formato certo.
                  const clean = normalizeChatChannel(
                    src.platform,
                    e.target.value,
                  );
                  if (clean !== e.target.value) onChange({ value: clean });
                }}
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-semibold text-ink-faint">
              <span>
                {t("chat.source.nickname")}{" "}
                <span className="font-medium normal-case text-ink-faint/60">
                  {t("chat.source.nickname.optional")}
                </span>
              </span>
              <input
                value={src.name}
                placeholder={t("chat.source.nickname.placeholder")}
                onChange={(e) => onChange({ name: e.target.value })}
                className={inputCls}
              />
            </label>
          </div>
          <p className="text-[11px] text-ink-faint">{t(HINT[src.platform])}</p>
          <div className="flex justify-end border-t-2 border-border-soft pt-2.5">
            <Button
              variant={confirmRemove ? "danger" : "ghost"}
              size="sm"
              onClick={() => {
                if (confirmRemove) {
                  onRemove();
                  return;
                }
                setConfirmRemove(true);
                setTimeout(() => setConfirmRemove(false), 3000);
              }}
            >
              <Trash2 className="size-4" />
              {confirmRemove
                ? t("chat.common.removeConfirm")
                : t("chat.source.remove")}
            </Button>
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
    </div>
  );
}

// label e placeholder são nomes de produto e de campo dessas plataformas — só a
// dica é texto de tela.
const ALERT_META: Record<
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

// As chaves vêm do backend (alert://status) — só os rótulos são copy.
const ALERT_STATUS: Record<string, MessageKey> = {
  connected: "chat.alertsrc.status.live",
  error: "chat.alertsrc.status.error",
  disconnected: "chat.alertsrc.status.dropped",
};

// API key do YouTube: salva sozinha (onChange), mas ninguém saberia se presta — daí o
// "Verificar", que faz uma chamada barata à Data API e mostra ✓/motivo real do Google.
function YoutubeApiKeyField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useT();
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(
    null,
  );
  // Resultado envelhece: some ao editar a chave (senão um ✓ antigo fica mentindo).
  useEffect(() => setResult(null), [value]);
  const verify = async () => {
    if (!value.trim()) return;
    setTesting(true);
    setResult(null);
    try {
      setResult({ ok: true, msg: await api.youtubeKeyCheck(value.trim(), t) });
    } catch (e) {
      setResult({ ok: false, msg: errMsg(e) });
    } finally {
      setTesting(false);
    }
  };
  return (
    <label className="mt-2 flex flex-col gap-1.5 rounded-md border-2 border-border-soft bg-surface-2 p-2.5 text-[11px] font-semibold text-ink-faint">
      <span className="flex flex-wrap items-center gap-1.5">
        <PlatformGlyph id="youtube" size={14} />{" "}
        {t("chat.youtube.apikey.label")}
        <Tooltip content={t("chat.youtube.apikey.tooltip")}>
          <span className="cursor-help font-medium normal-case text-ink-faint/80 underline decoration-dotted underline-offset-2">
            {t("chat.youtube.apikey.optional")}
          </span>
        </Tooltip>
      </span>
      <div className="flex items-center gap-2">
        <input
          value={value}
          placeholder={t("chat.youtube.apikey.placeholder")}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => {
            const clean = sanitizeApiKey(e.target.value);
            if (clean !== e.target.value) onChange(clean);
          }}
          className="h-9 flex-1 rounded-md border-2 border-border bg-surface px-2 text-sm font-medium text-ink outline-none focus:border-brass"
        />
        <Button
          variant="subtle"
          size="sm"
          className="h-9 shrink-0"
          disabled={!value.trim() || testing}
          onClick={verify}
        >
          <Wifi className="size-3.5" />{" "}
          {testing
            ? t("chat.youtube.apikey.checking")
            : t("chat.youtube.apikey.check")}
        </Button>
      </div>
      {result && (
        <span
          className={cn(
            "font-bold normal-case",
            result.ok ? "text-ok" : "text-bad",
          )}
        >
          {result.ok ? "✓" : "✕"} {result.msg}
        </span>
      )}
    </label>
  );
}

function AlertSourceCard({
  src,
  status,
  onChange,
  onRemove,
  onToken,
}: {
  src: AlertSource;
  status?: string;
  onChange: (patch: Partial<AlertSource>) => void;
  onRemove: () => void;
  onToken: (token: string) => Promise<void>;
}) {
  const t = useT();
  const meta = ALERT_META[src.kind];
  const [open, setOpen] = useState(() => !src.hasToken);
  const [editing, setEditing] = useState(false);
  const [token, setToken] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const showInput = !src.hasToken || editing;

  const save = async () => {
    const clean = sanitizeToken(token);
    if (!clean) return;
    await onToken(clean);
    setToken("");
    setEditing(false);
    toast.success(t("chat.alertsrc.tokenStored.toast"));
  };
  const paste = async () => {
    try {
      const pasted = await navigator.clipboard.readText();
      if (pasted) setToken(sanitizeToken(pasted));
    } catch {
      /* área de transferência bloqueada */
    }
  };

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);
  // O resultado do teste envelhece: some ao trocar o token (o card volta pro modo input).
  useEffect(() => setTestResult(null), [src.hasToken, editing]);
  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult({ ok: true, msg: await api.alertTest(src.id, t) });
    } catch (e) {
      setTestResult({ ok: false, msg: errMsg(e) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-md border-2 transition-opacity",
        src.enabled ? "bg-surface" : "bg-surface-2 opacity-60",
        src.hasToken ? "border-border-soft" : "border-bad/50",
      )}
    >
      <Collapsible.Root open={open} onOpenChange={setOpen}>
        <div className="flex items-center gap-2 p-2.5">
          <div className="grid size-7 shrink-0 place-items-center rounded-md bg-surface-2 text-brass">
            <Bell className="size-4" />
          </div>
          <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
            <span className="shrink-0 font-display text-sm font-bold">
              {meta.label}
            </span>
            {src.hasToken ? (
              <span className="truncate text-xs text-ink-muted">
                ·{" "}
                {status
                  ? ALERT_STATUS[status]
                    ? t(ALERT_STATUS[status])
                    : status
                  : t("chat.alertsrc.tokenSaved")}
              </span>
            ) : (
              <span className="shrink-0 text-xs font-semibold text-bad">
                · {t("chat.alertsrc.noToken")}
              </span>
            )}
          </div>
          <Toggle
            checked={src.enabled}
            onChange={(v) => onChange({ enabled: v })}
            label={t("chat.source.toggle")}
          />
          <Collapsible.Trigger asChild>
            <button
              aria-label={
                open ? t("chat.alertsrc.collapse") : t("chat.alertsrc.expand")
              }
              className="grid size-8 shrink-0 place-items-center rounded-md text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <ChevronDown
                className={cn(
                  "size-5 transition-transform",
                  open && "rotate-180",
                )}
              />
            </button>
          </Collapsible.Trigger>
        </div>

        <Collapsible.Content className="flex flex-col gap-2 px-2.5 pb-2.5">
          {showInput ? (
            <div className="flex items-center gap-2">
              <Input
                type="password"
                autoFocus
                placeholder={meta.placeholder}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && token.trim() && void save()
                }
                className="flex-1"
              />
              <Button variant="subtle" size="sm" onClick={paste}>
                <ClipboardPaste className="size-4" /> {t("chat.common.paste")}
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!token.trim()}
                onClick={save}
              >
                {t("chat.common.save")}
              </Button>
              {editing && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(false)}
                >
                  <X className="size-4" />
                </Button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2">
              <Check className="size-4 text-ok" strokeWidth={2.6} />
              <span className="text-sm font-semibold">
                {t("chat.alertsrc.tokenStored.chip")}
              </span>
              <div className="ml-auto flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={test}
                  disabled={testing}
                >
                  <Wifi className="size-3.5" />{" "}
                  {testing ? t("chat.common.testing") : t("chat.common.test")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setToken("");
                    setEditing(true);
                  }}
                >
                  <Pencil className="size-3.5" /> {t("chat.alertsrc.replace")}
                </Button>
              </div>
            </div>
          )}
          {testResult && (
            <span
              className={cn(
                "text-[11px] font-bold",
                testResult.ok ? "text-ok" : "text-bad",
              )}
            >
              {testResult.ok ? "✓" : "✕"} {testResult.msg}
            </span>
          )}
          <p className="text-[11px] text-ink-faint">{t(meta.hintKey)}</p>
          <div className="flex justify-end border-t-2 border-border-soft pt-2.5">
            <Button
              variant={confirmRemove ? "danger" : "ghost"}
              size="sm"
              onClick={() => {
                if (confirmRemove) {
                  onRemove();
                  return;
                }
                setConfirmRemove(true);
                setTimeout(() => setConfirmRemove(false), 3000);
              }}
            >
              <Trash2 className="size-4" />
              {confirmRemove
                ? t("chat.common.removeConfirm")
                : t("chat.alertsrc.remove")}
            </Button>
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
    </div>
  );
}

// BYOK do YouTube: cada usuário cria as credenciais do Google dele e cola aqui (cofre).
// Assim cada um tem a própria cota — sem limite/verificação compartilhados.
/** Quais caminhos de login existem numa plataforma, e qual está em uso. */
type ByokModes = {
  officialReady: boolean;
  ownCreds: boolean;
  usingOwnCreds: boolean;
};

/**
 * Ações de modo do BYOK. Ficam separadas do "esquecer credenciais" de propósito: trocar pro
 * login oficial não apaga nada (e a Corneta recusa a troca se o oficial não estiver de pé), então
 * nenhum clique aqui consegue deixar a plataforma sem nenhum jeito de logar.
 */
function ByokModeActions({
  modes,
  onUseOfficial,
  onUseSaved,
  onForget,
}: {
  modes?: ByokModes;
  onUseOfficial?: () => void;
  onUseSaved?: () => void;
  onForget?: () => void;
}) {
  const t = useT();
  if (!modes) return null;
  const back = modes.ownCreds && !modes.usingOwnCreds;
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      {modes.usingOwnCreds && onUseOfficial && (
        <button
          onClick={onUseOfficial}
          className="text-[11px] font-bold text-brass hover:underline"
        >
          {t("chat.byok.useOfficial")}
        </button>
      )}
      {back && onUseSaved && (
        <button
          onClick={onUseSaved}
          className="text-[11px] font-bold text-brass hover:underline"
        >
          {t("chat.byok.useSaved")}
        </button>
      )}
      {/* Esquecer é destrutivo: só aparece quando o oficial pode assumir no lugar. */}
      {modes.ownCreds && modes.officialReady && onForget && (
        <button
          onClick={onForget}
          className="text-[11px] font-semibold text-ink-faint hover:text-danger hover:underline"
        >
          {t("chat.byok.forget")}
        </button>
      )}
      {modes.usingOwnCreds && !modes.officialReady && (
        <span className="text-[11px] text-ink-faint">
          {t("chat.byok.officialDown")}
        </span>
      )}
    </div>
  );
}

function YoutubeCredsForm({
  onSave,
  modes,
  onUseOfficial,
  onUseSaved,
  onForget,
}: {
  onSave: (clientId: string, clientSecret: string) => void;
  modes?: ByokModes;
  onUseOfficial?: () => void;
  onUseSaved?: () => void;
  onForget?: () => void;
}) {
  const t = useT();
  const [id, setId] = useState("");
  const [secret, setSecret] = useState("");
  const [guide, setGuide] = useState(false);
  const can = id.trim() !== "" && secret.trim() !== "";
  const save = () => {
    if (!can) return;
    onSave(sanitizeToken(id), sanitizeToken(secret));
    setId("");
    setSecret("");
    toast.success(t("chat.youtube.creds.saved.toast"));
  };
  // O passo 1 tem um LINK no meio da frase; "Google Cloud Console" é nome de
  // produto e sai igual nos dois idiomas, então dá pra cortar a frase nele.
  const [step1Before, step1After] = splitAt(
    t("chat.youtube.guide.step1"),
    "Google Cloud Console",
  );
  return (
    <div className="rounded-md border-2 border-border-soft bg-surface-2 p-2.5">
      <div className="mb-2 flex items-center gap-2">
        <PlatformGlyph id="youtube" size={20} />
        <span className="font-display text-sm font-bold">YouTube</span>
        <button
          onClick={() => setGuide((v) => !v)}
          className="ml-auto text-xs font-bold text-brass hover:underline"
        >
          {guide
            ? t("chat.youtube.creds.guide.hide")
            : t("chat.youtube.creds.guide.show")}
        </button>
      </div>

      <ByokModeActions
        modes={modes}
        onUseOfficial={onUseOfficial}
        onUseSaved={onUseSaved}
        onForget={onForget}
      />

      {guide && (
        <>
          <ol className="mb-2.5 list-decimal space-y-2 rounded-md bg-surface px-5 py-3 text-[11px] leading-relaxed text-ink-muted marker:font-bold marker:text-brass">
            <li>
              {step1Before}
              <button
                onClick={() =>
                  void openExternal(
                    "https://console.cloud.google.com/projectcreate",
                  )
                }
                className="font-bold text-brass hover:underline"
              >
                Google Cloud Console
              </button>
              {step1After}
            </li>
            {/* Os negritos são os rótulos que a pessoa vai caçar na tela do
                Google — vêm marcados no dicionário porque em cada idioma o
                rótulo é outro e cai em outro lugar da frase. */}
            <li>{bold(t, "chat.youtube.guide.step2")}</li>
            <li>{bold(t, "chat.youtube.guide.step3")}</li>
            <li>{bold(t, "chat.youtube.guide.step4")}</li>
            <li>{bold(t, "chat.youtube.guide.step5")}</li>
            <li>{bold(t, "chat.youtube.guide.step6")}</li>
            <li>{bold(t, "chat.youtube.guide.step7")}</li>
          </ol>
          <p className="mb-2.5 rounded-md border-2 border-warn/40 bg-warn/10 px-3 py-2 text-[11px] leading-relaxed text-ink-muted">
            <strong className="text-ink">
              {t("chat.youtube.guide.warn.label")}
            </strong>{" "}
            {bold(t, "chat.youtube.guide.warn.text")}
          </p>
        </>
      )}

      <div className="flex flex-col gap-2">
        <Input
          name="youtube-client-id"
          autoComplete="off"
          placeholder="Client ID"
          value={id}
          onChange={(e) => setId(e.target.value)}
        />
        <div className="flex items-center gap-2">
          <Input
            type="password"
            name="youtube-client-secret"
            autoComplete="off"
            placeholder="Client Secret"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && can && save()}
            className="flex-1"
          />
          <Button variant="primary" size="sm" disabled={!can} onClick={save}>
            {t("chat.common.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function KickCredsForm({
  onSave,
  modes,
  onUseOfficial,
  onUseSaved,
  onForget,
}: {
  onSave: (clientId: string, clientSecret: string) => void;
  modes?: ByokModes;
  onUseOfficial?: () => void;
  onUseSaved?: () => void;
  onForget?: () => void;
}) {
  const t = useT();
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const canSave = clientId.trim() !== "" && clientSecret.trim() !== "";
  const save = () => {
    if (!canSave) return;
    onSave(sanitizeToken(clientId), sanitizeToken(clientSecret));
    setClientId("");
    setClientSecret("");
    toast.success(t("chat.kick.creds.saved.toast"));
  };
  return (
    <div className="rounded-md border-2 border-border-soft bg-surface-2 p-2.5">
      <div className="mb-2 flex items-center gap-2">
        <PlatformGlyph id="kick" size={20} />
        <span className="font-display text-sm font-bold">Kick</span>
        <button
          className="ml-auto text-xs font-bold text-brass hover:underline"
          onClick={() =>
            void openExternal("https://kick.com/settings/developer")
          }
        >
          {t("chat.kick.creds.openDeveloper")}
        </button>
      </div>
      <p className="mb-2 text-[11px] text-ink-muted">
        {bold(t, "chat.kick.creds.redirect")}
      </p>
      <ByokModeActions
        modes={modes}
        onUseOfficial={onUseOfficial}
        onUseSaved={onUseSaved}
        onForget={onForget}
      />
      <div className="flex flex-col gap-2">
        <Input
          name="kick-client-id"
          autoComplete="off"
          placeholder="Client ID"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
        />
        <div className="flex items-center gap-2">
          <Input
            name="kick-client-secret"
            autoComplete="off"
            type="password"
            placeholder="Client Secret"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && canSave && save()}
            className="flex-1"
          />
          <Button
            variant="primary"
            size="sm"
            disabled={!canSave}
            onClick={save}
          >
            {t("chat.common.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Linha de login OAuth: abre o navegador e acompanha device flow ou callback loopback.
/** Passo numerado do fluxo de login (bolinha com o número). */
function StepNum({ n }: { n: number }) {
  return (
    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brass text-[11px] font-extrabold text-brass-ink">
      {n}
    </span>
  );
}

function LoginRow({
  platform,
  label,
  state,
  enabled,
  onLogin,
  onLogout,
}: {
  platform: ChatPlatform;
  label: string;
  state: {
    state: string;
    login?: string;
    userCode?: string;
    verifyUri?: string;
    verifyUriComplete?: string;
    message?: string;
  };
  enabled: boolean;
  onLogin: () => void;
  onLogout: () => void;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const openPage = () => {
    const url = state.verifyUriComplete || state.verifyUri;
    if (url) void openExternal(url);
  };
  const copyCode = async () => {
    if (!state.userCode) return;
    try {
      await navigator.clipboard.writeText(state.userCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard indisponível */
    }
  };
  return (
    <div className="rounded-md border-2 border-border-soft bg-surface-2 p-2.5">
      <div className="flex items-center gap-2">
        <PlatformGlyph id={platform} size={20} />
        <span className="font-display text-sm font-bold">{label}</span>
        {state.state === "connected" && (
          <span className="truncate text-xs font-semibold text-ok">
            ·{" "}
            {state.login
              ? t("chat.loginrow.signedInAs", { login: state.login })
              : t("chat.loginrow.signedIn")}
          </span>
        )}
        {state.state === "error" && (
          <span className="truncate text-xs text-bad">· {state.message}</span>
        )}
        <div className="ml-auto shrink-0">
          {!enabled ? (
            <span className="text-[11px] text-ink-faint">
              {t("chat.loginrow.unavailable")}
            </span>
          ) : state.state === "connected" ? (
            <Button variant="ghost" size="sm" onClick={onLogout}>
              {t("chat.loginrow.signout")}
            </Button>
          ) : (
            <Button
              variant="subtle"
              size="sm"
              loading={state.state === "code"}
              disabled={state.state === "code"}
              onClick={onLogin}
            >
              <LogIn className="size-3.5" /> {t("chat.loginrow.signin")}
            </Button>
          )}
        </div>
      </div>
      {state.state === "code" &&
        (state.userCode && !state.verifyUriComplete ? (
          // Fallback BYOK do Google sem URL pré-preenchida: guiamos copiar → colar → autorizar.
          <div className="mt-2 rounded-md bg-brass/5 px-3 py-2.5 ring-1 ring-brass/25">
            <div className="mb-2 text-xs font-bold text-ink">
              {t("chat.loginrow.device.title")}
            </div>
            <div className="flex flex-col gap-2 text-xs text-ink-muted">
              <div className="flex flex-wrap items-center gap-2">
                <StepNum n={1} />
                <span className="shrink-0">
                  {t("chat.loginrow.device.step1")}
                </span>
                <span className="select-all rounded bg-brass px-2 py-0.5 font-mono text-sm font-extrabold tracking-widest text-brass-ink">
                  {state.userCode}
                </span>
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={() => void copyCode()}
                >
                  {copied ? (
                    <Check className="size-3.5" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                  {copied ? t("chat.common.copied") : t("chat.common.copy")}
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StepNum n={2} />
                <span className="shrink-0">
                  {t("chat.loginrow.device.step2")}
                </span>
                <Button variant="subtle" size="sm" onClick={openPage}>
                  <ExternalLink className="size-3.5" />{" "}
                  {t("chat.loginrow.device.openPage")}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <StepNum n={3} />
                <span>
                  {t("chat.loginrow.device.step3")}{" "}
                  <span className="text-ink-faint">
                    {t("chat.loginrow.device.waitingParens")}
                  </span>
                </span>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-ink-faint">
              {t("chat.loginrow.device.note")}
            </p>
          </div>
        ) : (
          // Twitch, YouTube oficial ou Kick: abrir e autorizar. Mostra o código como referência
          // quando houver (a Twitch pede para conferi-lo).
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-surface px-2.5 py-2 text-xs text-ink-muted">
            <span>{t("chat.loginrow.browser.note")}</span>
            {state.userCode && (
              <span className="rounded bg-brass px-2 py-0.5 font-mono text-sm font-extrabold tracking-widest text-brass-ink">
                {state.userCode}
              </span>
            )}
            <Button
              variant="subtle"
              size="sm"
              className="ml-auto"
              onClick={openPage}
            >
              <ExternalLink className="size-3.5" />{" "}
              {t("chat.loginrow.browser.openAgain")}
            </Button>
            <span className="text-ink-faint">{t("chat.loginrow.waiting")}</span>
          </div>
        ))}
    </div>
  );
}
