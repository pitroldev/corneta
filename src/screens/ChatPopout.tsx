import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Bell, Eye, Minus, Settings2, Trash2, Wifi, WifiOff, X } from "lucide-react";
import { useStore } from "../lib/store";
import { cn } from "../lib/utils";
import { Mascot } from "../components/decor";
import { Toggle } from "../components/ui";
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
  const bindAlerts = useStore((s) => s.bindAlerts);
  const bindViewers = useStore((s) => s.bindViewers);
  const theme = useStore((s) => s.config?.settings.theme ?? "dark");
  const [tab, setTab] = useState<"chat" | "alerts" | "both">("chat");
  const [showConfig, setShowConfig] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  // Setup próprio do popout (sem o motor/atalhos do app): config + chat + alertas + viewers.
  useEffect(() => {
    void load();
    const unbindChat = bindChat();
    const unbindAlerts = bindAlerts();
    const unbindViewers = bindViewers();
    return () => {
      unbindChat();
      unbindAlerts();
      unbindViewers();
    };
  }, [load, bindChat, bindAlerts, bindViewers]);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

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
  const configured = (st?.chatSources ?? []).some((x) => x.enabled && x.value.trim());
  const containerRef = useRef<HTMLDivElement>(null);
  // Posição do divisor (local pra arrastar suave; persiste no fim do drag).
  const [split, setSplit] = useState(35);
  useEffect(() => {
    if (st?.chatBothSplit != null) setSplit(st.chatBothSplit);
  }, [st?.chatBothSplit]);

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
          onClick={clearAlerts}
          title="Limpar alertas"
          aria-label="Limpar alertas"
          className="text-ink-faint transition-colors hover:text-bad"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      <AlertsFeed alerts={alerts} className="min-h-0 flex-1" />
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
          <WinBtn onClick={closeWin} label="Fechar" danger>
            <X className="size-3.5" strokeWidth={2.4} />
          </WinBtn>
        </div>
      </div>

      {/* Toolbar: abas + viewers + conexão + limpar + config */}
      <div className="flex items-center gap-1.5 border-b-2 border-border-soft px-2 py-1.5">
        <div className="flex items-center gap-0.5 rounded-md bg-surface-2 p-0.5">
          <TabBtn active={tab === "chat"} onClick={() => setTab("chat")}>
            Chat
          </TabBtn>
          <TabBtn active={tab === "alerts"} onClick={() => setTab("alerts")}>
            Alertas{alerts.length > 0 ? ` ${alerts.length}` : ""}
          </TabBtn>
          <TabBtn active={tab === "both"} onClick={() => setTab("both")}>
            Ambos
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
                  .map((i) => `${i.source}: ${(i.viewers ?? 0).toLocaleString("pt-BR")}`)
                  .join("\n") + "\nClique pra esconder (volta na config)"
              }
            >
              <Eye className="size-3.5 text-brass" />
              {viewers.total.toLocaleString("pt-BR")}
            </button>
          )}
          {connected ? (
            <button onClick={() => void disconnectChat()} title="Desconectar" className={iconBtn}>
              <WifiOff className="size-4" />
            </button>
          ) : (
            <button
              onClick={() => {
                if (configured) void connectChat();
              }}
              disabled={!configured}
              title={configured ? "Conectar" : "Configure os canais na janela principal da Corneta"}
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
            title={confirmClear ? "Clique pra confirmar" : "Limpar"}
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
              <CfgToggle label="Emotes" checked={view.emotes} onChange={(v) => setSettings({ chatShowEmotes: v })} />
              <CfgToggle label="Badges" checked={view.badges} onChange={(v) => setSettings({ chatShowBadges: v })} />
              <CfgToggle label="Plataforma" checked={view.platform} onChange={(v) => setSettings({ chatShowPlatform: v })} />
              <CfgToggle label="Canal" checked={view.source} onChange={(v) => setSettings({ chatShowSource: v })} />
              <CfgToggle label="Horário" checked={view.timestamps} onChange={(v) => setSettings({ chatShowTimestamps: v })} />
              <CfgToggle label="Quem assiste" checked={st?.chatShowViewers ?? true} onChange={(v) => setSettings({ chatShowViewers: v })} />
            </div>
          </div>
          <label className="flex items-center gap-2.5">
            <span className="shrink-0 font-semibold text-ink-muted">Tamanho da fonte</span>
            <Slider
              className="ml-auto max-w-44 flex-1"
              value={view.fontSize}
              min={11}
              max={26}
              onChange={(v) => setSettings({ chatFontSize: v })}
              suffix="px"
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
                  onChange={(v) => setSettings({ chatBothLayout: v as "auto" | "row" | "col" })}
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
          className={cn("flex min-h-0 flex-1 overflow-hidden", BOTH_DIR[bothLayout])}
        >
          {alertsFirst
            ? [alertsPanel, divider, chatPanel]
            : [chatPanel, divider, alertsPanel]}
        </div>
      ) : tab === "chat" ? (
        chatPanel
      ) : (
        <AlertsFeed alerts={alerts} className="flex-1" />
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
        danger ? "hover:bg-bad hover:text-white" : "hover:bg-surface-2 hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}
