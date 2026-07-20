import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
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
import { IS_TAURI } from "../lib/api";
import { useStore } from "../lib/store";
import { sendStatusLine, srcLabel } from "../lib/chatSend";
import { toast } from "../lib/toast";
import { cn, errMsg } from "../lib/utils";
import { Mascot } from "../components/decor";
import { Button, Input, Toggle } from "../components/ui";
import { Select } from "../components/Select";
import { Slider } from "../components/Slider";
import { ChatFeed, type ChatView } from "../components/ChatFeed";
import { AlertsFeed } from "../components/AlertsFeed";

// Layout do modo "Ambos" — classes literais (Tailwind precisa vê-las no código).
// "auto" só vira lado a lado a partir de ~820px de largura da janela.
const BOTH_DIR: Record<string, string> = {
  auto: "flex-col min-[820px]:flex-row",
  row: "flex-row",
  col: "flex-col",
};
// Barra do divisor: horizontal (empilhado) vs vertical (lado a lado), com cursor.
const DIVIDER_CLS: Record<string, string> = {
  auto: "h-1.5 w-full cursor-row-resize min-[820px]:h-auto min-[820px]:w-1.5 min-[820px]:cursor-col-resize",
  row: "w-1.5 cursor-col-resize",
  col: "h-1.5 w-full cursor-row-resize",
};
const LAYOUT_OPTS = [
  { value: "auto", label: "Automático" },
  { value: "row", label: "Lado a lado" },
  { value: "col", label: "Empilhado" },
];

/** Versão compacta do chat para a janela flutuante (always-on-top). */
export function ChatPopout() {
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

  // Setup próprio do popout (sem o motor/atalhos do app): config + chat + alertas + viewers.
  useEffect(() => {
    void load();
    void setupOauth();
    const unbindChat = bindChat();
    const unbindChatRunning = bindChatRunning();
    const unbindConfigSync = bindConfigSync();
    const unbindAlerts = bindAlerts();
    const unbindViewers = bindViewers();
    const unbindChatAuth = bindChatAuth();
    const unbindAuthFlow = bindAuthFlow();
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
  ]);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  // Estado maximizado da janela: sincroniza no mount e a cada resize (o usuário pode
  // maximizar arrastando pra borda, não só pelo botão).
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
        /* fora do Tauri */
      }
    })();
    return () => {
      alive = false;
      unlisten?.();
    };
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
  // Canais se configuram na janela principal — aqui só dá pra ligar se já houver.
  // Fonte de alerta com token também conta (mesmo critério da ChatScreen): quem só tem
  // Streamlabs/StreamElements consegue conectar os alertas por aqui.
  const configured =
    (st?.chatSources ?? []).some((x) => x.enabled && x.value.trim()) ||
    (st?.alertSources ?? []).some((x) => x.enabled && x.hasToken);
  const containerRef = useRef<HTMLDivElement>(null);
  // Posição do divisor (local pra arrastar suave; persiste no fim do drag).
  const [split, setSplit] = useState(35);
  useEffect(() => {
    if (st?.chatBothSplit != null) setSplit(st.chatBothSplit);
  }, [st?.chatBothSplit]);
  // Última aba escolhida persiste (default "both" — ordem Ambos→Chat→Alertas é decisão de produto).
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

  // Troca de aba: aplica na hora e persiste (a janelinha reabre onde o streamer deixou).
  const pickTab = (t: "chat" | "alerts" | "both") => {
    setTab(t);
    setSettings({ chatPopoutTab: t });
  };

  // Envio pelo "modo janela": espelha a ChatScreen — fontes capazes conforme login/token.
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
  // Twitch só envia depois que o IRC autentica (chatAuth.ok); YouTube/Kick mandam via HTTP.
  const canSend = sendTargets.some((x) =>
    x.platform === "youtube"
      ? youtubeReady
      : x.platform === "kick"
        ? kickReady
        : !!chatAuth[x.id]?.ok,
  );
  // Mesmo texto da tela principal — aqui vira title do Enviar desabilitado (espaço curto).
  const sendStatus = sendStatusLine(sendTargets, chatAuth, {
    twitch: twitchReady,
    youtube: youtubeReady,
    kick: kickReady,
  });
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

  // Arraste do divisor: redimensiona o painel de alertas (% do container no eixo ativo).
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
      setSettings({ chatBothSplit: latest }); // persiste só no fim
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
          <Bell className="size-3.5 text-brass" /> Alertas
          {alerts.length > 0 ? ` ${alerts.length}` : ""}
        </span>
        <button
          onClick={() => {
            // Registro das doações da live — misclick não pode apagar: confirma em 2 cliques.
            if (!confirmClearAlerts) {
              setConfirmClearAlerts(true);
              setTimeout(() => setConfirmClearAlerts(false), 3000);
              return;
            }
            setConfirmClearAlerts(false);
            clearAlerts();
          }}
          title={confirmClearAlerts ? "Clique pra confirmar" : "Limpar alertas"}
          aria-label="Limpar alertas"
          className={cn(
            "transition-colors",
            confirmClearAlerts
              ? "text-xs font-bold text-bad"
              : "text-ink-faint hover:text-bad",
          )}
        >
          {confirmClearAlerts ? "Limpar?" : <Trash2 className="size-3.5" />}
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
          ? "Clique em Conectar pra puxar o chat."
          : "Configure os canais na janela principal da Corneta e conecte por aqui."
      }
      emptyAction={
        configured ? (
          <Button
            variant="primary"
            size="sm"
            onClick={() => void connectChat()}
          >
            <Wifi className="size-4" /> Conectar
          </Button>
        ) : undefined
      }
    />
  );
  const divider = (
    <div
      key="divider"
      onPointerDown={onDividerDown}
      title="Arraste pra redimensionar"
      className={cn(
        "shrink-0 bg-border-soft transition-colors hover:bg-brass",
        DIVIDER_CLS[bothLayout],
      )}
    />
  );

  return (
    <div className="flex h-screen flex-col border border-border-soft bg-panel">
      {/* Titlebar custom (arrastável) + controles da janela */}
      <div
        data-tauri-drag-region
        className="flex h-8 shrink-0 items-center gap-2 border-b border-border-soft pl-2 select-none"
      >
        <div
          data-tauri-drag-region
          className="pointer-events-none grid size-5 place-items-center rounded bg-brass text-brass-ink"
        >
          <Mascot className="size-3.5" />
        </div>
        <span
          data-tauri-drag-region
          className="pointer-events-none font-display text-xs font-extrabold"
        >
          Chat da Corneta
        </span>
        <div className="ml-auto flex h-full">
          <WinBtn onClick={minimize} label="Minimizar">
            <Minus className="size-3.5" strokeWidth={2.4} />
          </WinBtn>
          <WinBtn
            onClick={toggleMaximize}
            label={maximized ? "Restaurar" : "Maximizar"}
          >
            {maximized ? (
              <Minimize2 className="size-3.5" strokeWidth={2.4} />
            ) : (
              <Maximize2 className="size-3.5" strokeWidth={2.4} />
            )}
          </WinBtn>
          <WinBtn onClick={closeWin} label="Fechar" danger>
            <X className="size-3.5" strokeWidth={2.4} />
          </WinBtn>
        </div>
      </div>

      {/* Toolbar: abas + viewers + conexão + limpar + config */}
      <div className="flex items-center gap-1.5 border-b-2 border-border-soft px-2 py-1.5">
        <div className="flex items-center gap-0.5 rounded-md bg-surface-2 p-0.5">
          <TabBtn active={tab === "both"} onClick={() => pickTab("both")}>
            Ambos
          </TabBtn>
          <TabBtn active={tab === "chat"} onClick={() => pickTab("chat")}>
            Chat
          </TabBtn>
          <TabBtn active={tab === "alerts"} onClick={() => pickTab("alerts")}>
            Alertas{alerts.length > 0 ? ` ${alerts.length}` : ""}
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
                  .map(
                    (i) =>
                      `${i.source}: ${(i.viewers ?? 0).toLocaleString("pt-BR")}`,
                  )
                  .join("\n") + "\nClique pra esconder (volta na config)"
              }
            >
              <Eye className="size-3.5 text-brass" />
              {viewers.total.toLocaleString("pt-BR")}
            </button>
          )}
          {connected ? (
            <button
              onClick={() => void disconnectChat()}
              title="Desconectar"
              className={iconBtn}
            >
              <WifiOff className="size-4" />
            </button>
          ) : (
            <button
              onClick={() => {
                if (configured) void connectChat();
              }}
              disabled={!configured}
              title={
                configured
                  ? "Conectar"
                  : "Configure os canais na janela principal da Corneta"
              }
              className={cn(iconBtn, !configured && "opacity-40")}
            >
              <Wifi className="size-4" />
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
            // Em "Ambos" a lixeira limpa SÓ o chat (os alertas têm a própria, no painel).
            title={
              confirmClear
                ? "Clique pra confirmar"
                : tab === "alerts"
                  ? "Limpar alertas"
                  : "Limpar chat"
            }
            className={cn(iconBtn, confirmClear && "text-bad")}
          >
            <Trash2 className="size-4" />
          </button>
          <button
            onClick={() => setShowConfig((v) => !v)}
            title="Configurar exibição"
            className={cn(iconBtn, showConfig && "bg-surface-2 text-ink")}
          >
            <Settings2 className="size-4" />
          </button>
        </div>
      </div>

      {/* Painel de configuração da exibição */}
      {showConfig && (
        <div className="flex flex-col gap-3 border-b-2 border-border-soft bg-surface-2 px-2.5 py-2.5 text-xs">
          <div>
            <span className="mb-1.5 block font-bold uppercase tracking-wide text-ink-faint">
              O que mostrar no feed
            </span>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              <CfgToggle
                label="Emotes"
                checked={view.emotes}
                onChange={(v) => setSettings({ chatShowEmotes: v })}
              />
              <CfgToggle
                label="Badges"
                checked={view.badges}
                onChange={(v) => setSettings({ chatShowBadges: v })}
              />
              <CfgToggle
                label="Plataforma"
                checked={view.platform}
                onChange={(v) => setSettings({ chatShowPlatform: v })}
              />
              <CfgToggle
                label="Canal"
                checked={view.source}
                onChange={(v) => setSettings({ chatShowSource: v })}
              />
              <CfgToggle
                label="Horário"
                checked={view.timestamps}
                onChange={(v) => setSettings({ chatShowTimestamps: v })}
              />
              <CfgToggle
                label="Quem assiste"
                checked={st?.chatShowViewers ?? true}
                onChange={(v) => setSettings({ chatShowViewers: v })}
              />
            </div>
          </div>
          <label className="flex items-center gap-2.5">
            <span className="shrink-0 font-semibold text-ink-muted">
              Fonte do chat
            </span>
            <Slider
              className="ml-auto max-w-44 flex-1"
              value={view.fontSize}
              min={8}
              max={44}
              onChange={(v) => setSettings({ chatFontSize: v })}
              suffix="px"
              aria-label="Tamanho da fonte do chat"
            />
          </label>
          <label className="flex items-center gap-2.5">
            <span className="shrink-0 font-semibold text-ink-muted">
              Fonte dos alertas
            </span>
            <Slider
              className="ml-auto max-w-44 flex-1"
              value={st?.alertFontSize ?? 14}
              min={8}
              max={44}
              onChange={(v) => setSettings({ alertFontSize: v })}
              suffix="px"
              aria-label="Tamanho da fonte dos alertas"
            />
          </label>
          {tab === "both" && (
            <div className="flex flex-col gap-2 border-t-2 border-border-soft pt-2.5">
              <span className="font-bold uppercase tracking-wide text-ink-faint">
                Layout do “Ambos”
              </span>
              <label className="flex items-center justify-between">
                <span className="font-semibold text-ink-muted">Disposição</span>
                <Select
                  className="w-32"
                  value={bothLayout}
                  options={LAYOUT_OPTS}
                  onChange={(v) =>
                    setSettings({ chatBothLayout: v as "auto" | "row" | "col" })
                  }
                />
              </label>
              <CfgToggle
                label="Alertas antes do chat"
                checked={alertsFirst}
                onChange={(v) => setSettings({ chatBothAlertsFirst: v })}
              />
            </div>
          )}
        </div>
      )}

      {/* Feed */}
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

      {/* Barra de composição (modo janela): só com fonte enviável (login/token). */}
      {IS_TAURI && sendableSources.length > 0 && (
        <div className="flex shrink-0 items-center gap-1.5 border-t-2 border-border-soft px-2 py-1.5">
          {sendableSources.length > 1 && (
            <Select
              className="w-24 shrink-0"
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
            className="h-9 flex-1"
          />
          <Button
            variant="primary"
            size="sm"
            loading={sending}
            disabled={!draft.trim() || sending || !canSend}
            onClick={doSend}
            aria-label="Enviar"
            title={!canSend ? sendStatus : "Enviar"}
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
