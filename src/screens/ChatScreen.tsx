import { useMemo, useState } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import {
  AtSign,
  BadgeCheck,
  Bell,
  Check,
  ChevronDown,
  ClipboardPaste,
  Clock,
  Eye,
  ExternalLink,
  LogIn,
  Pencil,
  Plus,
  Send,
  Settings2,
  Smile,
  Trash2,
  Tv2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { api, IS_TAURI } from "../lib/api";
import { useStore } from "../lib/store";
import { toast } from "../lib/toast";
import { cn, openExternal, uid } from "../lib/utils";
import * as RTabs from "@radix-ui/react-tabs";
import { HAS_KICK_OAUTH, HAS_TWITCH_OAUTH } from "../lib/oauth";
import type { AlertSource, AlertSourceKind, ChatMessage, ChatPlatform, ChatSource } from "../lib/types";
import { Button, Card, Input, PlatformGlyph, SectionTitle, Toggle } from "../components/ui";
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
  twitch: "Só o nome do canal (o que vem depois de twitch.tv/) — sem link inteiro nem login.",
  kick: "O nome que aparece no link: kick.com/SEUNOME. Às vezes a Kick bloqueia a leitura e não conecta.",
  youtube: "Seu canal (@handle, URL ou ID). A Corneta acha a live e lê o chat sozinha — sem colar link.",
};

type ConfigTab = "canais" | "conta" | "alertas" | "exibicao";
const CONFIG_TABS: { id: ConfigTab; label: string; icon: typeof Tv2 }[] = [
  { id: "canais", label: "Canais", icon: Tv2 },
  { id: "conta", label: "Conta", icon: LogIn },
  { id: "alertas", label: "Alertas", icon: Bell },
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
  const moderate = useStore((s) => s.moderate);

  const [showConfig, setShowConfig] = useState(false);
  const [configTab, setConfigTab] = useState<ConfigTab>("canais");
  const [adding, setAdding] = useState(false);
  const [addingAlert, setAddingAlert] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendTo, setSendTo] = useState("all");
  const [showAlerts, setShowAlerts] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [confirmClearChat, setConfirmClearChat] = useState(false);
  const [confirmClearAlerts, setConfirmClearAlerts] = useState(false);
  const [filter, setFilter] = useState<Record<ChatPlatform, boolean>>({
    twitch: true,
    youtube: true,
    kick: true,
  });

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
  const view: ChatView = useMemo(
    () => ({
      emotes: s.chatShowEmotes ?? true,
      badges: s.chatShowBadges ?? true,
      platform: s.chatShowPlatform ?? true,
      source: (s.chatShowSource ?? false) || hasDup,
      timestamps: s.chatShowTimestamps ?? false,
      fontSize: s.chatFontSize ?? 14,
    }),
    [
      s.chatShowEmotes,
      s.chatShowBadges,
      s.chatShowPlatform,
      s.chatShowSource,
      s.chatShowTimestamps,
      s.chatFontSize,
      hasDup,
    ]
  );
  const alertSources = s.alertSources ?? [];
  const configured =
    sources.some((x) => x.enabled && x.value.trim()) ||
    alertSources.some((x) => x.enabled && x.hasToken);
  // Plataformas que de fato entram no feed (fonte ligada e nomeada). Os chips de filtro
  // só fazem sentido com 2+ — com 1 só viram ruído (e o risco de filtrar sem religar).
  const feedPlatforms = [
    ...new Set(sources.filter((x) => x.enabled && x.value.trim()).map((x) => x.platform)),
  ];
  const showFilters = feedPlatforms.length > 1;
  const shown = useMemo(
    () =>
      !showFilters || (filter.twitch && filter.youtube && filter.kick)
        ? messages
        : messages.filter((m) => filter[m.platform]),
    [messages, filter, showFilters],
  );
  const allFilteredOut = messages.length > 0 && shown.length === 0;

  const addSource = (platform: ChatPlatform) =>
    setSettings({
      chatSources: [...sources, { id: uid("src"), platform, value: "", name: "", enabled: true }],
    });
  const updateSource = (id: string, patch: Partial<ChatSource>) =>
    setSettings({ chatSources: sources.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const removeSource = (id: string) =>
    setSettings({ chatSources: sources.filter((x) => x.id !== id) });

  const addAlertSource = (kind: AlertSourceKind) =>
    setSettings({
      alertSources: [...alertSources, { id: uid("alert"), kind, name: "", enabled: true }],
    });
  const updateAlertSource = (id: string, patch: Partial<AlertSource>) =>
    setSettings({ alertSources: alertSources.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
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
    (hasTwitchChannel && HAS_TWITCH_OAUTH) || hasYoutubeChannel || (hasKickChannel && HAS_KICK_OAUTH);
  // Rótulo da fonte igual ao backend (value quando o nome é só espaço) — pra casar moderação.
  const srcLabel = (x: ChatSource) => (x.name.trim() === "" ? x.value : x.name);
  // Alvo efetivo do envio (guarda contra id morto no seletor).
  const sendValid = sendTo !== "all" && sendableSources.some((x) => x.id === sendTo);
  const effectiveSendTo = sendValid ? sendTo : "all";
  const sendTargets =
    effectiveSendTo === "all" ? sendableSources : sendableSources.filter((x) => x.id === effectiveSendTo);
  // Twitch só envia DEPOIS que o IRC autentica (chatAuth.ok); YouTube/Kick mandam via HTTP na hora.
  const canSend = sendTargets.some((x) =>
    x.platform === "youtube" ? youtubeReady : x.platform === "kick" ? kickReady : !!chatAuth[x.id]?.ok,
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
      toast.error(String(e).replace("Error: ", ""));
    } finally {
      setSending(false);
    }
  };
  const sendStatusLine = () =>
    sendTargets
      .map((x) => {
        const label = srcLabel(x);
        if (x.platform === "youtube") return youtubeReady ? "YouTube logado" : `${label}: entre no YouTube`;
        if (x.platform === "kick") return kickReady ? "Kick logado" : `${label}: entre no Kick`;
        const a = chatAuth[x.id];
        if (a?.ok) return `logado como @${a.login}`;
        if (twitchReady) return `${label}: reconecte o chat pra logar`;
        if (a && !a.ok) return `${label}: token de envio inválido`;
        return `${label}: conecte o chat pra logar`;
      })
      .join(" · ");

  // Moderação: acha a fonte de uma mensagem (rótulo+plataforma) e o nível permitido.
  const sourceForMessage = (m: ChatMessage) =>
    sources.find((x) => x.platform === m.platform && srcLabel(x) === m.source);
  const modLevel = (m: ChatMessage): "full" | "delete" | "none" => {
    const src = sourceForMessage(m);
    if (!src) return "none";
    const myLogin = chatLogin.twitch.login?.toLowerCase();
    // Não modera as próprias mensagens (eco / sua conta).
    if (m.author === "você" || (myLogin && m.author.toLowerCase() === myLogin)) return "none";
    if (src.platform === "twitch" && twitchReady) return "full";
    if (src.platform === "youtube" && youtubeReady) return "delete";
    if (src.platform === "kick" && kickReady) return "delete";
    return "none";
  };
  const onModerate = (m: ChatMessage, action: string) => {
    const src = sourceForMessage(m);
    if (!src) return;
    void moderate(src.id, action, { nativeId: m.nativeId, author: m.author, authorId: m.authorId }).then(
      () =>
        toast.success(
          action === "delete" ? "Mensagem apagada" : action === "ban" ? "Usuário banido" : "Timeout aplicado",
        ),
      (e) => toast.error(String(e).replace("Error: ", "")),
    );
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col">
      <SectionTitle
        kicker="A galera junta"
        title="Chat unificado"
        subtitle="Twitch, Kick e YouTube no mesmo feed (até 2 Twitches!) — com emotes, selos, de onde veio cada mensagem e o que foi apagado."
        right={
          <div className="flex items-center gap-2">
            {IS_TAURI && (
              <Button variant="subtle" size="sm" onClick={() => void api.openChatWindow()}>
                <ExternalLink className="size-4" /> Janela
              </Button>
            )}
            {connected ? (
              <Button variant="outline" size="sm" onClick={() => void disconnectChat()}>
                <WifiOff className="size-4" /> Desconectar
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                loading={connecting}
                onClick={async () => {
                  if (IS_TAURI && !configured) {
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
                }}
                title={IS_TAURI && !configured ? "Adicione um canal primeiro" : undefined}
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
                    ? "Tudo pronto — é só conectar"
                    : "Adicione um canal pra ver o chat aqui"}
              </span>
            ) : (
              Object.entries(statuses).map(([source, st]) => (
                <span
                  key={source}
                  className="flex items-center gap-1.5 text-sm"
                  title={`${source}: ${statusLabel(st.status)}`}
                >
                  <PlatformGlyph id={st.platform as ChatPlatform} size={16} />
                  <span className={cn("size-2 rounded-full", statusDot(st.status))} aria-hidden />
                  <span className="text-ink-muted">{source}</span>
                  {st.status !== "connected" && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                      {statusLabel(st.status)}
                    </span>
                  )}
                </span>
              ))
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
                    .map((i) => `${i.source}: ${(i.viewers ?? 0).toLocaleString("pt-BR")}`)
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
            <Button variant="ghost" size="sm" onClick={() => setShowConfig(false)}>
              <X className="size-4" />
            </Button>
          </div>
          <RTabs.Root value={configTab} onValueChange={(v) => setConfigTab(v as ConfigTab)}>
            <RTabs.List className="mb-4 flex flex-wrap gap-2">
              {CONFIG_TABS.map((t) => {
                const Icon = t.icon;
                return (
                  <RTabs.Trigger
                    key={t.id}
                    value={t.id}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 font-display text-sm font-bold transition-all",
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
                  {adding ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
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
                      className="flex items-center gap-1.5 rounded-md bg-surface px-2.5 py-1.5 text-xs font-bold ring-1 ring-border transition-all hover:-translate-y-px hover:text-ink"
                    >
                      <PlatformGlyph id={p} size={18} />
                      {p === "twitch" ? "Twitch" : p === "kick" ? "Kick" : "YouTube"}
                    </button>
                  ))}
                </div>
              )}

              {sources.length === 0 ? (
                <div className="rounded-md border-2 border-dashed border-border bg-surface-2 px-3 py-5 text-center text-sm text-ink-muted">
                  Nenhum canal ainda. Adicione um da <strong className="text-ink">Twitch</strong>,{" "}
                  <strong className="text-ink">Kick</strong> ou{" "}
                  <strong className="text-ink">YouTube</strong> pra ver o chat aqui — pode repetir a mesma (ex.: 2 Twitches).
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

              {sources.some((x) => x.platform === "youtube") && (
                <label className="mt-2 flex flex-col gap-1 rounded-md border-2 border-border-soft bg-surface-2 p-2.5 text-[11px] font-semibold text-ink-faint">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <PlatformGlyph id="youtube" size={14} /> Chave da API do YouTube
                    <Tooltip
                      content="Sem ela a Corneta já lê o chat direto. Com ela você ganha a contagem de “assistindo” do YouTube e uma reserva, caso a leitura direta falhe."
                    >
                      <span className="cursor-help font-medium normal-case text-ink-faint/80 underline decoration-dotted underline-offset-2">
                        · opcional (bom ter)
                      </span>
                    </Tooltip>
                  </span>
                  <input
                    value={s.youtubeApiKey ?? ""}
                    placeholder="cole sua API key (Data API v3)"
                    onChange={(e) => setSettings({ youtubeApiKey: e.target.value })}
                    className="h-9 rounded-md border-2 border-border bg-surface px-2 text-sm font-medium text-ink outline-none focus:border-brass"
                  />
                </label>
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
                  {addingAlert ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
                  {addingAlert ? "Cancelar" : "Adicionar fonte"}
                </Button>
              </div>
              <p className="mb-2 text-[11px] text-ink-faint">
                Cole o token do <strong className="text-ink">Streamlabs</strong> ou{" "}
                <strong className="text-ink">StreamElements</strong> — as doações caem no feed de Alertas.
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
                      className="flex items-center gap-1.5 rounded-md bg-surface px-2.5 py-1.5 text-xs font-bold ring-1 ring-border transition-all hover:-translate-y-px hover:text-ink"
                    >
                      <Bell className="size-3.5 text-brass" />
                      {ALERT_META[k].label}
                    </button>
                  ))}
                </div>
              )}

              {alertSources.length === 0 ? (
                <div className="rounded-md border-2 border-dashed border-border bg-surface-2 px-3 py-4 text-center text-xs text-ink-muted">
                  Nenhuma fonte de alerta. Adicione <strong className="text-ink">Streamlabs</strong> ou{" "}
                  <strong className="text-ink">StreamElements</strong> pra ver doações no feed de Alertas.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {alertSources.map((src) => (
                    <AlertSourceCard
                      key={src.id}
                      src={src}
                      status={alertStatuses[src.name.trim() || src.kind]?.status}
                      onChange={(p) => updateAlertSource(src.id, p)}
                      onRemove={() => removeAlertSource(src.id)}
                      onToken={(t) => setAlertToken(src.id, t)}
                    />
                  ))}
                </div>
              )}
            </div>
            </RTabs.Content>

            <RTabs.Content value="conta">
              {!IS_TAURI ? (
                <p className="text-xs text-ink-muted">Disponível no app instalado.</p>
              ) : !hasTwitchChannel && !hasYoutubeChannel && !hasKickChannel ? (
                <p className="text-xs text-ink-muted">
                  Adicione um canal da <strong className="text-ink">Twitch</strong>,{" "}
                  <strong className="text-ink">YouTube</strong> ou <strong className="text-ink">Kick</strong>{" "}
                  na aba Canais pra logar.
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
                        <YoutubeCredsForm onSave={(id, sec) => void setYoutubeOauth(id, sec)} />
                      ))}
                    {hasKickChannel && (
                      <LoginRow
                        platform="kick"
                        label="Kick"
                        state={chatLogin.kick}
                        enabled={HAS_KICK_OAUTH}
                        onLogin={() => void kickLogin()}
                        onLogout={() => void kickLogout()}
                      />
                    )}
                  </div>
                  <p className="mt-3 text-[11px] text-ink-faint">
                    Entre pra <strong className="text-ink">enviar</strong> e{" "}
                    <strong className="text-ink">moderar</strong>. O chat reconecta sozinho ao logar.
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
                <ToggleRow icon={Smile} label="Emotes" hint="figurinhas no lugar do :código:" checked={view.emotes} onChange={(v) => setSettings({ chatShowEmotes: v })} />
                <ToggleRow icon={BadgeCheck} label="Badges" hint="selos de sub/mod/VIP" checked={view.badges} onChange={(v) => setSettings({ chatShowBadges: v })} />
                <ToggleRow icon={Tv2} label="Plataforma" hint="de qual site veio" checked={view.platform} onChange={(v) => setSettings({ chatShowPlatform: v })} />
                <ToggleRow icon={AtSign} label="Canal" hint="útil com 2+ do mesmo site" checked={view.source} onChange={(v) => setSettings({ chatShowSource: v })} />
                <ToggleRow icon={Clock} label="Horário" hint="hora da mensagem" checked={view.timestamps} onChange={(v) => setSettings({ chatShowTimestamps: v })} />
                <ToggleRow icon={Eye} label="Quem assiste" hint="contador de espectadores" checked={s.chatShowViewers ?? true} onChange={(v) => setSettings({ chatShowViewers: v })} />
              </div>
              <div className="mt-3 flex items-center gap-3 border-t border-border-soft pt-3">
                <span className="shrink-0 text-sm font-semibold text-ink-muted">Tamanho da fonte</span>
                <Slider
                  className="ml-auto max-w-52 flex-1"
                  value={view.fontSize}
                  min={11}
                  max={26}
                  onChange={(v) => setSettings({ chatFontSize: v })}
                  suffix="px"
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
              label={p === "twitch" ? "Twitch" : p === "kick" ? "Kick" : "YouTube"}
              on={filter[p]}
              onClick={() => setFilter((f) => ({ ...f, [p]: !f[p] }))}
            />
          ))}
        <Button
          variant={showAlerts ? "primary" : "ghost"}
          size="sm"
          className="ml-auto"
          onClick={() => setShowAlerts((v) => !v)}
        >
          <Bell className="size-4" /> Alertas{alerts.length > 0 ? ` (${alerts.length})` : ""}
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
          <Trash2 className="size-4" /> {confirmClearChat ? "Limpar mesmo?" : "Limpar"}
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
                  confirmClearAlerts ? "text-bad" : "text-ink-faint hover:text-bad"
                )}
                title={confirmClearAlerts ? "Clique pra confirmar" : "Limpar alertas"}
                aria-label="Limpar alertas"
              >
                {confirmClearAlerts ? "Limpar?" : <Trash2 className="size-3.5" />}
              </button>
            </div>
            <AlertsFeed alerts={alerts} className="flex-1" />
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
                  ...sendableSources.map((x) => ({ value: x.id, label: srcLabel(x) })),
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
            >
              {!sending && <Send className="size-4" />} Enviar
            </Button>
          </div>
          <div className="mt-1 px-0.5 text-[11px] text-ink-faint">{sendStatusLine()}</div>
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
            Entre na sua conta pra <strong className="text-ink">enviar</strong> e{" "}
            <strong className="text-ink">moderar</strong>
          </span>
          <span className="ml-auto shrink-0 text-xs font-bold text-brass">Configurar →</span>
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
          : "border-border bg-surface text-ink-faint hover:text-ink-muted"
      )}
    >
      <PlatformGlyph id={id} size={14} /> {label}
    </button>
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
        <span className="truncate text-sm font-semibold text-ink-muted">{label}</span>
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
  const platLabel = src.platform === "twitch" ? "Twitch" : src.platform === "kick" ? "Kick" : "YouTube";
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
            <span className="shrink-0 font-display text-sm font-bold">{platLabel}</span>
            {src.value.trim() ? (
              <span className="truncate text-xs text-ink-muted">
                · {src.value}
                {src.name ? ` (${src.name})` : ""}
              </span>
            ) : (
              <span className="shrink-0 text-xs font-semibold text-bad">· sem canal</span>
            )}
          </div>
          <Toggle checked={src.enabled} onChange={(v) => onChange({ enabled: v })} label="ligado" />
          <Collapsible.Trigger asChild>
            <button
              aria-label={open ? "Recolher canal" : "Expandir canal"}
              className="grid size-8 shrink-0 place-items-center rounded-md text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <ChevronDown className={cn("size-5 transition-transform", open && "rotate-180")} />
            </button>
          </Collapsible.Trigger>
        </div>

        <Collapsible.Content className="flex flex-col gap-2 px-2.5 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">Plataforma</span>
            <Select
              className="w-36"
              value={src.platform}
              options={PLATFORM_OPTS}
              onChange={(v) => onChange({ platform: v as ChatPlatform })}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_11rem]">
            <label className="flex flex-col gap-1 text-[11px] font-semibold text-ink-faint">
              {VALUE_LABEL[src.platform]}
              <input
                value={src.value}
                placeholder={PLACEHOLDER[src.platform]}
                onChange={(e) => onChange({ value: e.target.value })}
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-semibold text-ink-faint">
              <span>
                Apelido <span className="font-medium normal-case text-ink-faint/60">(opcional)</span>
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

const ALERT_META: Record<AlertSourceKind, { label: string; placeholder: string; hint: string }> = {
  streamlabs: {
    label: "Streamlabs",
    placeholder: "Socket API Token",
    hint: 'Streamlabs → Account Settings → API Settings → "Your Socket API Token". Pega doações, follows, subs e bits que você centraliza no Streamlabs.',
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
    const t = token.trim();
    if (!t) return;
    await onToken(t);
    setToken("");
    setEditing(false);
    toast.success("Token guardado no cofre 🔒");
  };
  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) setToken(t.trim());
    } catch {
      /* área de transferência bloqueada */
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
            <span className="shrink-0 font-display text-sm font-bold">{meta.label}</span>
            {src.hasToken ? (
              <span className="truncate text-xs text-ink-muted">
                · {status ? ALERT_STATUS[status] ?? status : "token salvo"}
              </span>
            ) : (
              <span className="shrink-0 text-xs font-semibold text-bad">· sem token</span>
            )}
          </div>
          <Toggle checked={src.enabled} onChange={(v) => onChange({ enabled: v })} label="ligado" />
          <Collapsible.Trigger asChild>
            <button
              aria-label={open ? "Recolher fonte" : "Expandir fonte"}
              className="grid size-8 shrink-0 place-items-center rounded-md text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <ChevronDown className={cn("size-5 transition-transform", open && "rotate-180")} />
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
                onKeyDown={(e) => e.key === "Enter" && token.trim() && void save()}
                className="flex-1"
              />
              <Button variant="subtle" size="sm" onClick={paste}>
                <ClipboardPaste className="size-4" /> Colar
              </Button>
              <Button variant="primary" size="sm" disabled={!token.trim()} onClick={save}>
                Salvar
              </Button>
              {editing && (
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                  <X className="size-4" />
                </Button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2">
              <Check className="size-4 text-ok" strokeWidth={2.6} />
              <span className="text-sm font-semibold">Token no cofre</span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => {
                  setToken("");
                  setEditing(true);
                }}
              >
                <Pencil className="size-3.5" /> Trocar
              </Button>
            </div>
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
function YoutubeCredsForm({ onSave }: { onSave: (clientId: string, clientSecret: string) => void }) {
  const [id, setId] = useState("");
  const [secret, setSecret] = useState("");
  const [guide, setGuide] = useState(false);
  const can = id.trim() !== "" && secret.trim() !== "";
  const save = () => {
    if (!can) return;
    onSave(id.trim(), secret.trim());
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
        <ol className="mb-2.5 list-decimal space-y-2 rounded-md bg-surface px-5 py-3 text-[11px] leading-relaxed text-ink-muted marker:font-bold marker:text-brass">
          <li>
            Abra o{" "}
            <button
              onClick={() => void openExternal("https://console.cloud.google.com/projectcreate")}
              className="font-bold text-brass hover:underline"
            >
              Google Cloud Console
            </button>{" "}
            e crie um projeto.
          </li>
          <li>
            Em <strong className="text-ink">APIs e Serviços → Biblioteca</strong>, procure e ative a{" "}
            <strong className="text-ink">YouTube Data API v3</strong>.
          </li>
          <li>
            Em <strong className="text-ink">Tela de permissão OAuth</strong>: escolha{" "}
            <strong className="text-ink">External</strong> e adicione seu e-mail em{" "}
            <strong className="text-ink">Usuários de teste</strong>.
          </li>
          <li>
            Em <strong className="text-ink">Credenciais → Criar credenciais → ID do cliente OAuth</strong>,
            escolha o tipo <strong className="text-ink">TVs e dispositivos de entrada limitada</strong>.
          </li>
          <li>Copie o Client ID e o Client Secret e cole abaixo. ↓</li>
        </ol>
      )}

      <div className="flex flex-col gap-2">
        <Input placeholder="Client ID" value={id} onChange={(e) => setId(e.target.value)} />
        <div className="flex items-center gap-2">
          <Input
            type="password"
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

// Linha de login OAuth (Twitch/YouTube): entrar no navegador (device flow) pra enviar/moderar.
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
  state: { state: string; login?: string; userCode?: string; verifyUri?: string; message?: string };
  enabled: boolean;
  onLogin: () => void;
  onLogout: () => void;
}) {
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
        {state.state === "error" && <span className="truncate text-xs text-bad">· {state.message}</span>}
        <div className="ml-auto shrink-0">
          {!enabled ? (
            <span className="text-[11px] text-ink-faint">configure no .env</span>
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
      {state.state === "code" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-surface px-2.5 py-2 text-xs text-ink-muted">
          <span>Abrimos o navegador — {state.userCode ? "confirme com o código:" : "é só autorizar."}</span>
          {state.userCode && (
            <span className="rounded bg-brass px-2 py-0.5 font-mono text-sm font-extrabold tracking-widest text-brass-ink">
              {state.userCode}
            </span>
          )}
          <span className="text-ink-faint">aguardando…</span>
          <button
            onClick={() => state.verifyUri && void openExternal(state.verifyUri)}
            className="ml-auto text-[11px] font-semibold text-brass hover:underline"
          >
            não abriu? abrir
          </button>
        </div>
      )}
    </div>
  );
}

