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
import { sendStatusLine, srcLabel } from "../lib/chatSend";
import { toast } from "../lib/toast";
import { cn, errMsg, openExternal, uid } from "../lib/utils";
import { normalizeChatChannel } from "../lib/chatChannel";
import { sanitizeApiKey, sanitizeToken } from "../lib/validation";
import * as RTabs from "@radix-ui/react-tabs";
import { HAS_TWITCH_OAUTH } from "../lib/oauth";
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

const PLATFORM_OPTS = [
  { value: "twitch", label: "Twitch" },
  { value: "kick", label: "Kick" },
  { value: "youtube", label: "YouTube" },
];
const VALUE_LABEL: Record<string, string> = {
  twitch: "Canal",
  kick: "Nome no link",
  youtube: "Canal",
};
const PLACEHOLDER: Record<string, string> = {
  twitch: "ex.: pitrol",
  kick: "ex.: xqc",
  youtube: "ex.: @seucanal",
};
const HINT: Record<string, string> = {
  twitch: "Só o nome do canal — o que vem depois de twitch.tv/.",
  kick: "O nome que aparece no link: kick.com/SEUNOME. Às vezes a Kick bloqueia a leitura e não conecta.",
  youtube: "Seu canal (@handle, URL ou ID).",
};

type ConfigTab = "canais" | "conta" | "alertas" | "overlays" | "exibicao";
const CONFIG_TABS: { id: ConfigTab; label: string; icon: typeof Tv2 }[] = [
  { id: "canais", label: "Canais", icon: Tv2 },
  { id: "conta", label: "Conta", icon: LogIn },
  { id: "alertas", label: "Alertas", icon: Bell },
  { id: "overlays", label: "Overlays", icon: MonitorPlay },
  { id: "exibicao", label: "Exibição", icon: Eye },
];

export function ChatScreen() {
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
  const setYoutubeOauth = useStore((s) => s.setYoutubeOauth);
  const clearYoutubeOauth = useStore((s) => s.clearYoutubeOauth);
  const kickOauthReady = useStore((s) => s.kickOauthReady);
  const setKickOauth = useStore((s) => s.setKickOauth);
  const clearKickOauth = useStore((s) => s.clearKickOauth);
  const moderate = useStore((s) => s.moderate);
  const chatConfigRequest = useStore((s) => s.chatConfigRequest);
  const requestChatConfig = useStore((s) => s.requestChatConfig);

  const [showConfig, setShowConfig] = useState(false);
  const [configTab, setConfigTab] = useState<ConfigTab>("canais");
  const [adding, setAdding] = useState(false);
  const [addingAlert, setAddingAlert] = useState(false);
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
    !showFilters || (filter.twitch && filter.youtube && filter.kick)
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
  // Pode habilitar envio/moderação? Twitch/Kick precisam do client_id shippado; YouTube é sempre
  // configurável (cada um cola as credenciais do Google — BYOK).
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
    const t = draft.trim();
    if (!t) return;
    setSending(true);
    try {
      await sendChat(
        t,
        sendTargets.map((x) => x.id),
      );
      setDraft("");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSending(false);
    }
  };
  const sendStatus = sendStatusLine(sendTargets, chatAuth, {
    twitch: twitchReady,
    youtube: youtubeReady,
    kick: kickReady,
  });

  // Conectar (botão do topo e do estado vazio). Sem canal configurado, abre a config.
  const doConnect = async () => {
    if (IS_TAURI && !configured) {
      setConfigTab("canais");
      setShowConfig(true);
      return;
    }
    setConnecting(true);
    try {
      await connectChat();
    } catch {
      toast.error("Não consegui conectar o chat — confira os canais.");
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
      await connectChat();
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
            ? "Mensagem apagada"
            : action === "ban"
              ? "Usuário banido"
              : "Timeout aplicado",
        ),
      (e) => toast.error(errMsg(e)),
    );
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col">
      <SectionTitle
        kicker="A galera junta"
        title="Chat unificado"
        subtitle="Twitch, Kick e YouTube no mesmo feed — até 2 Twitches."
        right={
          <div className="flex items-center gap-2">
            {IS_TAURI && (
              <Button
                variant="subtle"
                size="sm"
                onClick={() => void api.openChatWindow()}
                title="Uma janelinha do chat que fica por cima de tudo."
              >
                <PictureInPicture2 className="size-4" /> Janela flutuante
              </Button>
            )}
            {connected ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void disconnectChat()}
              >
                <WifiOff className="size-4" /> Desconectar
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                loading={connecting}
                onClick={() => void doConnect()}
                title={
                  IS_TAURI && !configured
                    ? "Adicione um canal primeiro"
                    : undefined
                }
              >
                {!connecting && <Wifi className="size-4" />} Conectar
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
                  ? "conectando…"
                  : configured
                    ? (s.chatAutoConnect ?? true)
                      ? "Tudo pronto — conecte, ou entre no ar que eu ligo sozinho"
                      : "Tudo pronto — é só conectar"
                    : "Adicione um canal pra ver o chat aqui"}
              </span>
            ) : (
              Object.entries(statuses).map(([source, st]) => (
                <span
                  key={source}
                  className="flex items-center gap-1.5 text-sm"
                  title={`${source}: ${statusExplain(st.platform, st.status)}`}
                >
                  <PlatformGlyph id={st.platform as ChatPlatform} size={16} />
                  <span
                    className={cn("size-2 rounded-full", statusDot(st.status))}
                    aria-hidden
                  />
                  <span className="text-ink-muted">{source}</span>
                  {st.status !== "connected" && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                      {statusLabel(st.status)}
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
                title="Religa as fontes que caíram."
              >
                {!reconnecting && <RefreshCw className="size-3.5" />} Reconectar
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
                    .map(
                      (i) =>
                        `${i.source}: ${(i.viewers ?? 0).toLocaleString("pt-BR")}`,
                    )
                    .join("\n") + "\nClique pra esconder (volta na config)"
                }
              >
                <Eye className="size-4 text-brass" />
                {viewers.total.toLocaleString("pt-BR")} assistindo
              </button>
            )}
            <Button
              variant={configured ? "ghost" : "primary"}
              size="sm"
              onClick={() => setShowConfig(true)}
            >
              <Settings2 className="size-4" /> Configurar
            </Button>
          </div>
        </div>
      </Card>

      {showConfig && (
        <Modal
          title="Configurar o chat"
          onClose={() => setShowConfig(false)}
          className="max-w-2xl rounded-xl bg-surface p-5 pop"
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 id="chatcfg-title" className="text-xl">
              Configurar o chat
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
              {CONFIG_TABS.map((t) => {
                const Icon = t.icon;
                return (
                  <RTabs.Trigger
                    key={t.id}
                    value={t.id}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 font-display text-sm font-bold transition",
                      "bg-surface-2 text-ink-muted hover:bg-surface-3 hover:text-ink",
                      "data-[state=active]:bg-brass data-[state=active]:text-brass-ink data-[state=active]:pop-brass",
                    )}
                  >
                    <Icon className="size-4" strokeWidth={2.4} /> {t.label}
                  </RTabs.Trigger>
                );
              })}
            </RTabs.List>

            <RTabs.Content value="canais">
              {/* Canais */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wide text-ink-faint">
                    Canais
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
                    {adding ? "Cancelar" : "Adicionar canal"}
                  </Button>
                </div>

                {adding && (
                  <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md bg-surface-2 p-2">
                    <span className="px-1 text-[11px] font-bold uppercase tracking-wide text-ink-faint">
                      De qual?
                    </span>
                    {(["twitch", "kick", "youtube"] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() => {
                          addSource(p);
                          setAdding(false);
                        }}
                        className="flex items-center gap-1.5 rounded-md bg-surface px-2.5 py-1.5 text-xs font-bold ring-1 ring-border transition hover:-translate-y-px hover:text-ink"
                      >
                        <PlatformGlyph id={p} size={18} />
                        {p === "twitch"
                          ? "Twitch"
                          : p === "kick"
                            ? "Kick"
                            : "YouTube"}
                      </button>
                    ))}
                  </div>
                )}

                {sources.length === 0 ? (
                  <div className="rounded-md border-2 border-dashed border-border bg-surface-2 px-3 py-5 text-center text-sm text-ink-muted">
                    Nenhum canal ainda. Adicione um da{" "}
                    <strong className="text-ink">Twitch</strong>,{" "}
                    <strong className="text-ink">Kick</strong> ou{" "}
                    <strong className="text-ink">YouTube</strong> — pode repetir
                    a mesma (ex.: 2 Twitches).
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
                      label="Conectar o chat sozinho quando eu entrar no ar"
                      hint="Sem clicar em Conectar toda live."
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
                    Fontes de alerta
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
                    {addingAlert ? "Cancelar" : "Adicionar fonte"}
                  </Button>
                </div>
                <p className="mb-2 text-[11px] text-ink-faint">
                  Cole o token do{" "}
                  <strong className="text-ink">Streamlabs</strong> ou{" "}
                  <strong className="text-ink">StreamElements</strong> — as
                  doações caem no feed de Alertas.
                </p>

                {addingAlert && (
                  <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md bg-surface-2 p-2">
                    <span className="px-1 text-[11px] font-bold uppercase tracking-wide text-ink-faint">
                      De qual?
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
                    Nenhuma fonte de alerta. Adicione{" "}
                    <strong className="text-ink">Streamlabs</strong> ou{" "}
                    <strong className="text-ink">StreamElements</strong> pra ver
                    doações.
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
                        onToken={(t) => setAlertToken(src.id, t)}
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
                  Disponível no app instalado.
                </p>
              ) : !hasTwitchChannel && !hasYoutubeChannel && !hasKickChannel ? (
                <p className="text-xs text-ink-muted">
                  Adicione um canal da{" "}
                  <strong className="text-ink">Twitch</strong>,{" "}
                  <strong className="text-ink">YouTube</strong> ou{" "}
                  <strong className="text-ink">Kick</strong> na aba Canais pra
                  logar.
                </p>
              ) : (
                <>
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
                            onClick={() => void clearYoutubeOauth()}
                            className="self-end text-[11px] font-semibold text-ink-faint hover:text-ink"
                          >
                            trocar credenciais do Google
                          </button>
                        </div>
                      ) : (
                        <YoutubeCredsForm
                          onSave={(id, sec) => void setYoutubeOauth(id, sec)}
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
                            onClick={() => void clearKickOauth()}
                            className="self-end text-[11px] font-semibold text-ink-faint hover:text-ink"
                          >
                            trocar credenciais da Kick
                          </button>
                        </div>
                      ) : (
                        <KickCredsForm
                          onSave={(id, secret) => void setKickOauth(id, secret)}
                        />
                      ))}
                  </div>
                  <p className="mt-3 text-[11px] text-ink-faint">
                    Entre pra <strong className="text-ink">enviar</strong> e{" "}
                    <strong className="text-ink">moderar</strong>.
                  </p>
                </>
              )}
            </RTabs.Content>

            <RTabs.Content value="exibicao">
              {/* Exibição */}
              <div>
                <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-ink-faint">
                  O que mostrar no feed
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <ToggleRow
                    icon={Smile}
                    label="Emotes"
                    hint="figurinhas no lugar do :código:"
                    checked={view.emotes}
                    onChange={(v) => setSettings({ chatShowEmotes: v })}
                  />
                  <ToggleRow
                    icon={BadgeCheck}
                    label="Badges"
                    hint="selos de sub/mod/VIP"
                    checked={view.badges}
                    onChange={(v) => setSettings({ chatShowBadges: v })}
                  />
                  <ToggleRow
                    icon={Tv2}
                    label="Plataforma"
                    hint="de qual site veio"
                    checked={view.platform}
                    onChange={(v) => setSettings({ chatShowPlatform: v })}
                  />
                  <ToggleRow
                    icon={AtSign}
                    label="Canal"
                    hint="útil com 2+ do mesmo site"
                    checked={view.source}
                    onChange={(v) => setSettings({ chatShowSource: v })}
                  />
                  <ToggleRow
                    icon={Clock}
                    label="Horário"
                    hint="hora da mensagem"
                    checked={view.timestamps}
                    onChange={(v) => setSettings({ chatShowTimestamps: v })}
                  />
                  <ToggleRow
                    icon={Eye}
                    label="Quem assiste"
                    hint="contador de espectadores"
                    checked={s.chatShowViewers ?? true}
                    onChange={(v) => setSettings({ chatShowViewers: v })}
                  />
                </div>
                <div className="mt-3 flex items-center gap-3 border-t border-border-soft pt-3">
                  <span className="shrink-0 text-sm font-semibold text-ink-muted">
                    Tamanho da fonte do chat
                  </span>
                  <Slider
                    className="ml-auto max-w-52 flex-1"
                    value={view.fontSize}
                    min={8}
                    max={44}
                    onChange={(v) => setSettings({ chatFontSize: v })}
                    suffix="px"
                    aria-label="Tamanho da fonte do chat"
                  />
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <span className="shrink-0 text-sm font-semibold text-ink-muted">
                    Tamanho da fonte dos alertas
                  </span>
                  <Slider
                    className="ml-auto max-w-52 flex-1"
                    value={s.alertFontSize ?? 14}
                    min={8}
                    max={44}
                    onChange={(v) => setSettings({ alertFontSize: v })}
                    suffix="px"
                    aria-label="Tamanho da fonte dos alertas"
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
              label={
                p === "twitch" ? "Twitch" : p === "kick" ? "Kick" : "YouTube"
              }
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
          title={alertPulse ? "Chegou alerta novo!" : undefined}
        >
          <Bell className="size-4" /> Alertas
          {alerts.length > 0 ? ` (${alerts.length})` : ""}
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
          {confirmClearChat ? "Limpar mesmo?" : "Limpar"}
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
              configured
                ? "Tudo pronto — é só clicar em Conectar."
                : "Adicione um canal (Twitch, Kick ou YouTube) e clique em Conectar."
            }
            emptyAction={
              configured ? (
                <Button
                  variant="primary"
                  size="sm"
                  loading={connecting}
                  onClick={() => void doConnect()}
                >
                  {!connecting && <Wifi className="size-4" />} Conectar
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
                  <Plus className="size-4" /> Adicionar canal
                </Button>
              )
            }
          />
        </Card>
        {showAlerts && (
          <Card className="flex h-[54vh] w-72 shrink-0 flex-col overflow-hidden p-0">
            <div className="flex items-center justify-between border-b-2 border-border-soft px-3 py-2">
              <span className="flex items-center gap-1.5 font-display text-sm font-extrabold">
                <Bell className="size-4 text-brass" /> Alertas
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
                  confirmClearAlerts ? "Clique pra confirmar" : "Limpar alertas"
                }
                aria-label="Limpar alertas"
              >
                {confirmClearAlerts ? (
                  "Limpar?"
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
                  { value: "all", label: "Todas" },
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
              placeholder="Manda no chat…"
              className="flex-1"
            />
            <Button
              variant="primary"
              loading={sending}
              disabled={!draft.trim() || sending || !canSend}
              onClick={doSend}
              title={!canSend ? sendStatus : undefined}
            >
              {!sending && <Send className="size-4" />} Enviar
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
          <span>
            Entre na sua conta pra <strong className="text-ink">enviar</strong>{" "}
            e <strong className="text-ink">moderar</strong>
          </span>
          <span className="ml-auto shrink-0 text-xs font-bold text-brass">
            Configurar →
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

const OVERLAY_POS_OPTS = [
  { value: "top", label: "Em cima" },
  { value: "bottom", label: "Embaixo" },
  { value: "center", label: "No centro" },
  { value: "top-left", label: "Canto sup. esquerdo" },
  { value: "top-right", label: "Canto sup. direito" },
  { value: "bottom-left", label: "Canto inf. esquerdo" },
  { value: "bottom-right", label: "Canto inf. direito" },
];

const CHAT_POS_OPTS = [
  { value: "bottom", label: "Embaixo (sobe)" },
  { value: "top", label: "Em cima (desce)" },
];

const SCALE_OPTS = [
  { value: "sm", label: "Pequeno" },
  { value: "md", label: "Médio" },
  { value: "lg", label: "Grande" },
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
      .then(() => toast.success(`Overlay de ${title.toLowerCase()} no OBS 📺`))
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
          {copied ? "Copiado" : "Copiar"}
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="subtle" size="sm" onClick={() => void addToObs()}>
          <Tv2 className="size-3.5" /> Adicionar no OBS
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void test()}>
          <Bell className="size-3.5" /> Testar
        </Button>
      </div>
      {children && (
        <div className="mt-2 flex flex-col gap-2 rounded-md bg-surface px-3 py-2">
          {children}
        </div>
      )}
      <p className="mt-1.5 text-[11px] text-ink-faint">
        Mudou uma opção? Clique{" "}
        <strong className="text-ink">Adicionar no OBS</strong> de novo (ou
        atualize a URL da fonte lá).
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
            Overlays pro OBS
          </span>
        </div>
        <Toggle
          checked={enabled}
          onChange={(v) => void toggle(v)}
          disabled={busy}
          label="Overlays pro OBS"
        />
      </div>
      <p className="mb-2 text-[11px] text-ink-faint">
        Servidor local que joga os <strong className="text-ink">alertas</strong>{" "}
        e o <strong className="text-ink">chat</strong> (com emotes) no OBS.
        Adicione a URL como <strong className="text-ink">Browser Source</strong>{" "}
        — uma vez só.
      </p>

      {enabled &&
        (!IS_TAURI ? (
          <p className="text-xs text-ink-muted">Disponível no app instalado.</p>
        ) : !info ? (
          <div className="rounded-md border-2 border-dashed border-border bg-surface-2 px-3 py-3 text-center text-xs text-ink-muted">
            {busy
              ? "Ligando o overlay…"
              : "Overlay ligado — reabra esta aba pra ver as URLs."}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <OverlayBlock
              title="Alertas"
              url={alertUrl}
              onTest={() => api.overlayTest()}
              testMsg="Mandei um alerta de teste — olha no OBS 📣"
            >
              <OptRow label="Posição">
                <Select
                  className="w-40"
                  value={settings.overlayPosition || "top"}
                  options={OVERLAY_POS_OPTS}
                  onChange={(v) => setSettings({ overlayPosition: v })}
                  aria-label="Posição do overlay de alertas"
                />
              </OptRow>
              <OptRow label="Tamanho">
                <Select
                  className="w-40"
                  value={settings.overlayScale || "md"}
                  options={SCALE_OPTS}
                  onChange={(v) => setSettings({ overlayScale: v })}
                  aria-label="Tamanho do overlay de alertas"
                />
              </OptRow>
              <OptRow label="Tempo na tela">
                <Slider
                  className="w-40"
                  value={settings.overlayDurationSecs ?? 6}
                  min={3}
                  max={15}
                  suffix="s"
                  onChange={(v) => setSettings({ overlayDurationSecs: v })}
                  aria-label="Tempo na tela"
                />
              </OptRow>
              <OptRow label="Som ao aparecer">
                <Toggle
                  checked={settings.overlaySound ?? true}
                  onChange={(v) => setSettings({ overlaySound: v })}
                  label="Som ao aparecer"
                />
              </OptRow>
              <OptRow label="Mostrar seguidores">
                <Toggle
                  checked={settings.overlayShowFollows ?? true}
                  onChange={(v) => setSettings({ overlayShowFollows: v })}
                  label="Mostrar seguidores"
                />
              </OptRow>
            </OverlayBlock>

            <OverlayBlock
              title="Chat"
              url={chatUrl}
              onTest={() => api.overlayChatTest()}
              testMsg="Mandei uma mensagem de teste — olha no OBS 💬"
            >
              <OptRow label="Posição">
                <Select
                  className="w-40"
                  value={settings.overlayChatPosition || "bottom"}
                  options={CHAT_POS_OPTS}
                  onChange={(v) => setSettings({ overlayChatPosition: v })}
                  aria-label="Posição do overlay de chat"
                />
              </OptRow>
              <OptRow label="Tamanho da fonte">
                <Slider
                  className="w-40"
                  value={settings.overlayChatSize ?? 22}
                  min={12}
                  max={40}
                  suffix="px"
                  onChange={(v) => setSettings({ overlayChatSize: v })}
                  aria-label="Tamanho da fonte do chat"
                />
              </OptRow>
              <OptRow label="Máx. de mensagens">
                <Slider
                  className="w-40"
                  value={settings.overlayChatMax ?? 12}
                  min={3}
                  max={30}
                  onChange={(v) => setSettings({ overlayChatMax: v })}
                  aria-label="Máximo de mensagens"
                />
              </OptRow>
              <OptRow label="Sumir após (0 = nunca)">
                <Slider
                  className="w-40"
                  value={settings.overlayChatFadeSecs ?? 0}
                  min={0}
                  max={60}
                  suffix="s"
                  onChange={(v) => setSettings({ overlayChatFadeSecs: v })}
                  aria-label="Sumir após"
                />
              </OptRow>
              <OptRow label="Selos (mod/sub)">
                <Toggle
                  checked={settings.overlayChatBadges ?? true}
                  onChange={(v) => setSettings({ overlayChatBadges: v })}
                  label="Selos"
                />
              </OptRow>
              <OptRow label="Ícone da plataforma">
                <Toggle
                  checked={settings.overlayChatPlatform ?? true}
                  onChange={(v) => setSettings({ overlayChatPlatform: v })}
                  label="Ícone da plataforma"
                />
              </OptRow>
              <OptRow label="Esconder comandos (!)">
                <Toggle
                  checked={settings.overlayChatHideCommands ?? false}
                  onChange={(v) => setSettings({ overlayChatHideCommands: v })}
                  label="Esconder comandos"
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

const statusLabel = (status: string) =>
  status === "connected"
    ? "no ar"
    : status === "error"
      ? "caiu"
      : status === "waiting"
        ? "aguardando"
        : "conectando";

// Tooltip com o PORQUÊ do status (o label sozinho parece travado/quebrado).
// O supervisor do backend já re-tenta sozinho com backoff — a dica avisa isso.
const statusExplain = (platform: string, status: string) => {
  if (status === "connected") return "no ar";
  if (status === "waiting")
    return platform === "youtube"
      ? "esperando sua live do YouTube começar — conecto sozinho quando ela subir"
      : "esperando a live começar — conecto sozinho quando ela subir";
  if (status === "error") {
    if (platform === "kick")
      return "caiu — às vezes a Kick bloqueia a leitura; tô tentando de novo sozinho";
    if (platform === "youtube")
      return "caiu — confira o canal (@handle ou URL); tô tentando de novo sozinho";
    return "caiu — confira o nome do canal; tô tentando de novo sozinho";
  }
  return "conectando…";
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
  const [open, setOpen] = useState(() => !src.value.trim());
  const [confirmRemove, setConfirmRemove] = useState(false);
  const inputCls =
    "h-9 rounded-md border-2 border-border bg-surface px-2 text-sm font-medium text-ink outline-none focus:border-brass";
  const platLabel =
    src.platform === "twitch"
      ? "Twitch"
      : src.platform === "kick"
        ? "Kick"
        : "YouTube";
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
            {src.value.trim() ? (
              <span className="truncate text-xs text-ink-muted">
                · {src.value}
                {src.name ? ` (${src.name})` : ""}
              </span>
            ) : (
              <span className="shrink-0 text-xs font-semibold text-bad">
                · sem canal
              </span>
            )}
          </div>
          <Toggle
            checked={src.enabled}
            onChange={(v) => onChange({ enabled: v })}
            label="ligado"
          />
          <Collapsible.Trigger asChild>
            <button
              aria-label={open ? "Recolher canal" : "Expandir canal"}
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
              Plataforma
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
              {VALUE_LABEL[src.platform]}
              <input
                value={src.value}
                placeholder={PLACEHOLDER[src.platform]}
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
                Apelido{" "}
                <span className="font-medium normal-case text-ink-faint/60">
                  (opcional)
                </span>
              </span>
              <input
                value={src.name}
                placeholder="ex.: Pitrol"
                onChange={(e) => onChange({ name: e.target.value })}
                className={inputCls}
              />
            </label>
          </div>
          <p className="text-[11px] text-ink-faint">{HINT[src.platform]}</p>
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
              {confirmRemove ? "Remover mesmo?" : "Remover canal"}
            </Button>
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
    </div>
  );
}

const ALERT_META: Record<
  AlertSourceKind,
  { label: string; placeholder: string; hint: string }
> = {
  streamlabs: {
    label: "Streamlabs",
    placeholder: "Socket API Token",
    hint: 'Streamlabs → Account Settings → API Settings → "Your Socket API Token". Pega doações, follows, subs e bits.',
  },
  streamelements: {
    label: "StreamElements",
    placeholder: "JWT Token",
    hint: 'StreamElements → seu perfil → Channels → "Show secrets" → JWT Token. ⚠️ Expira a cada ~2 semanas — é só colar de novo.',
  },
};

const ALERT_STATUS: Record<string, string> = {
  connected: "no ar",
  error: "erro",
  disconnected: "caiu",
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
      setResult({ ok: true, msg: await api.youtubeKeyCheck(value.trim()) });
    } catch (e) {
      setResult({ ok: false, msg: errMsg(e) });
    } finally {
      setTesting(false);
    }
  };
  return (
    <label className="mt-2 flex flex-col gap-1.5 rounded-md border-2 border-border-soft bg-surface-2 p-2.5 text-[11px] font-semibold text-ink-faint">
      <span className="flex flex-wrap items-center gap-1.5">
        <PlatformGlyph id="youtube" size={14} /> Chave da API do YouTube
        <Tooltip content="Sem ela a Corneta já lê o chat. Com ela você ganha a contagem de “assistindo” do YouTube.">
          <span className="cursor-help font-medium normal-case text-ink-faint/80 underline decoration-dotted underline-offset-2">
            · opcional (bom ter)
          </span>
        </Tooltip>
      </span>
      <div className="flex items-center gap-2">
        <input
          value={value}
          placeholder="cole sua API key (Data API v3)"
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
          <Wifi className="size-3.5" /> {testing ? "Verificando…" : "Verificar"}
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
  const meta = ALERT_META[src.kind];
  const [open, setOpen] = useState(() => !src.hasToken);
  const [editing, setEditing] = useState(false);
  const [token, setToken] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const showInput = !src.hasToken || editing;

  const save = async () => {
    const t = sanitizeToken(token);
    if (!t) return;
    await onToken(t);
    setToken("");
    setEditing(false);
    toast.success("Token guardado no cofre 🔒");
  };
  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) setToken(sanitizeToken(t));
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
      setTestResult({ ok: true, msg: await api.alertTest(src.id) });
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
                · {status ? (ALERT_STATUS[status] ?? status) : "token salvo"}
              </span>
            ) : (
              <span className="shrink-0 text-xs font-semibold text-bad">
                · sem token
              </span>
            )}
          </div>
          <Toggle
            checked={src.enabled}
            onChange={(v) => onChange({ enabled: v })}
            label="ligado"
          />
          <Collapsible.Trigger asChild>
            <button
              aria-label={open ? "Recolher fonte" : "Expandir fonte"}
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
                <ClipboardPaste className="size-4" /> Colar
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!token.trim()}
                onClick={save}
              >
                Salvar
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
              <span className="text-sm font-semibold">Token no cofre</span>
              <div className="ml-auto flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={test}
                  disabled={testing}
                >
                  <Wifi className="size-3.5" />{" "}
                  {testing ? "Testando…" : "Testar"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setToken("");
                    setEditing(true);
                  }}
                >
                  <Pencil className="size-3.5" /> Trocar
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
          <p className="text-[11px] text-ink-faint">{meta.hint}</p>
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
              {confirmRemove ? "Remover mesmo?" : "Remover fonte"}
            </Button>
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
    </div>
  );
}

// BYOK do YouTube: cada usuário cria as credenciais do Google dele e cola aqui (cofre).
// Assim cada um tem a própria cota — sem limite/verificação compartilhados.
function YoutubeCredsForm({
  onSave,
}: {
  onSave: (clientId: string, clientSecret: string) => void;
}) {
  const [id, setId] = useState("");
  const [secret, setSecret] = useState("");
  const [guide, setGuide] = useState(false);
  const can = id.trim() !== "" && secret.trim() !== "";
  const save = () => {
    if (!can) return;
    onSave(sanitizeToken(id), sanitizeToken(secret));
    setId("");
    setSecret("");
    toast.success("Credenciais do YouTube no cofre 🔒");
  };
  return (
    <div className="rounded-md border-2 border-border-soft bg-surface-2 p-2.5">
      <div className="mb-2 flex items-center gap-2">
        <PlatformGlyph id="youtube" size={20} />
        <span className="font-display text-sm font-bold">YouTube</span>
        <button
          onClick={() => setGuide((v) => !v)}
          className="ml-auto text-xs font-bold text-brass hover:underline"
        >
          {guide ? "ocultar guia" : "como conseguir?"}
        </button>
      </div>

      {guide && (
        <>
          <ol className="mb-2.5 list-decimal space-y-2 rounded-md bg-surface px-5 py-3 text-[11px] leading-relaxed text-ink-muted marker:font-bold marker:text-brass">
            <li>
              Abra o{" "}
              <button
                onClick={() =>
                  void openExternal(
                    "https://console.cloud.google.com/projectcreate",
                  )
                }
                className="font-bold text-brass hover:underline"
              >
                Google Cloud Console
              </button>{" "}
              e crie um projeto (dê qualquer nome, ex.: “Corneta”). Quando
              terminar, confira lá no topo se o projeto novo é o que está
              selecionado.
            </li>
            <li>
              No menu{" "}
              <strong className="text-ink">
                ☰ → APIs e serviços → Biblioteca
              </strong>
              , busque por{" "}
              <strong className="text-ink">YouTube Data API v3</strong> e clique
              em <strong className="text-ink">Ativar</strong>.
            </li>
            <li>
              Ainda em <strong className="text-ink">APIs e serviços</strong>,
              procure por{" "}
              <strong className="text-ink">Tela de permissão OAuth</strong> (nas
              versões novas isso aparece como{" "}
              <strong className="text-ink">Público-alvo</strong> ou{" "}
              <strong className="text-ink">Branding</strong>). Se pedir o{" "}
              <strong className="text-ink">Tipo de usuário</strong>, escolha{" "}
              <strong className="text-ink">Externo</strong> e siga.
            </li>
            <li>
              Preencha os{" "}
              <strong className="text-ink">campos obrigatórios</strong>:{" "}
              <strong className="text-ink">Nome do app</strong> (o que quiser),{" "}
              <strong className="text-ink">E-mail de suporte do usuário</strong>{" "}
              (o seu e-mail) e, mais pra baixo,{" "}
              <strong className="text-ink">
                E-mail de contato do desenvolvedor
              </strong>{" "}
              (o seu e-mail de novo). Salve e continue.
            </li>
            <li>
              Procure a seção{" "}
              <strong className="text-ink">Usuários de teste</strong> (fica na
              aba <strong className="text-ink">Público-alvo</strong> /
              “Audience”) e{" "}
              <strong className="text-ink">
                adicione o e-mail da sua conta do YouTube
              </strong>
              . Sem isso o login nem funciona.
            </li>
            <li>
              Em{" "}
              <strong className="text-ink">
                Credenciais → Criar credenciais → ID do cliente OAuth
              </strong>
              , escolha o tipo{" "}
              <strong className="text-ink">
                TVs e dispositivos de entrada limitada
              </strong>{" "}
              e crie.
            </li>
            <li>
              Copie o <strong className="text-ink">Client ID</strong> e o{" "}
              <strong className="text-ink">Client Secret</strong> e cole aqui
              embaixo. ↓
            </li>
          </ol>
          <p className="mb-2.5 rounded-md border-2 border-warn/40 bg-warn/10 px-3 py-2 text-[11px] leading-relaxed text-ink-muted">
            <strong className="text-ink">⚠️ Importante:</strong> enquanto o app
            ficar em modo{" "}
            <strong className="text-ink">“Teste” (Testing)</strong> — o normal,
            sem passar pela verificação do Google — o login do YouTube{" "}
            <strong className="text-ink">expira a cada ~7 dias</strong>. Quando
            cair, é só voltar aqui e clicar em{" "}
            <strong className="text-ink">Entrar</strong> de novo. Por isso o
            passo de se colocar como{" "}
            <strong className="text-ink">Usuário de teste</strong> é obrigatório
            (publicar/verificar o app é opcional e bem mais burocrático).
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
            Salvar
          </Button>
        </div>
      </div>
    </div>
  );
}

function KickCredsForm({
  onSave,
}: {
  onSave: (clientId: string, clientSecret: string) => void;
}) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const canSave = clientId.trim() !== "" && clientSecret.trim() !== "";
  const save = () => {
    if (!canSave) return;
    onSave(sanitizeToken(clientId), sanitizeToken(clientSecret));
    setClientId("");
    setClientSecret("");
    toast.success("Credenciais da Kick no cofre 🔒");
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
          abrir Developer
        </button>
      </div>
      <p className="mb-2 text-[11px] text-ink-muted">
        Use o redirect <strong>http://localhost:7395/callback</strong>. O
        segredo fica somente no cofre do sistema.
      </p>
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
            Salvar
          </Button>
        </div>
      </div>
    </div>
  );
}

// Linha de login OAuth (Twitch/YouTube): entrar no navegador (device flow) pra enviar/moderar.
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
            · logado{state.login ? ` como @${state.login}` : ""}
          </span>
        )}
        {state.state === "error" && (
          <span className="truncate text-xs text-bad">· {state.message}</span>
        )}
        <div className="ml-auto shrink-0">
          {!enabled ? (
            <span className="text-[11px] text-ink-faint">
              indisponível nesta versão
            </span>
          ) : state.state === "connected" ? (
            <Button variant="ghost" size="sm" onClick={onLogout}>
              Sair
            </Button>
          ) : (
            <Button
              variant="subtle"
              size="sm"
              loading={state.state === "code"}
              disabled={state.state === "code"}
              onClick={onLogin}
            >
              <LogIn className="size-3.5" /> Entrar
            </Button>
          )}
        </div>
      </div>
      {state.state === "code" &&
        (state.userCode && !state.verifyUriComplete ? (
          // Device flow SEM URL pré-preenchida (YouTube/Google): guiamos copiar → colar →
          // autorizar de forma explícita — era a maior fonte de confusão.
          <div className="mt-2 rounded-md bg-brass/5 px-3 py-2.5 ring-1 ring-brass/25">
            <div className="mb-2 text-xs font-bold text-ink">
              Falta 1 passo — autorizar no navegador:
            </div>
            <div className="flex flex-col gap-2 text-xs text-ink-muted">
              <div className="flex flex-wrap items-center gap-2">
                <StepNum n={1} />
                <span className="shrink-0">Copie o código</span>
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
                  {copied ? "Copiado" : "Copiar"}
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StepNum n={2} />
                <span className="shrink-0">Cole na página que abrimos</span>
                <Button variant="subtle" size="sm" onClick={openPage}>
                  <ExternalLink className="size-3.5" /> Abrir a página
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <StepNum n={3} />
                <span>
                  Autorize e pronto — a Corneta entra sozinha.{" "}
                  <span className="text-ink-faint">(aguardando…)</span>
                </span>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-ink-faint">
              Já copiamos o código e abrimos a página do Google pra você — é só
              colar e autorizar.
            </p>
          </div>
        ) : (
          // Twitch (a URL já pré-preenche o código) ou Kick (sem código): abrir + autorizar.
          // Mostra o código como referência quando houver (a Twitch pede pra conferir).
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-surface px-2.5 py-2 text-xs text-ink-muted">
            <span>Abrimos a autorização no navegador — é só confirmar.</span>
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
              <ExternalLink className="size-3.5" /> Abrir de novo
            </Button>
            <span className="text-ink-faint">aguardando…</span>
          </div>
        ))}
    </div>
  );
}
