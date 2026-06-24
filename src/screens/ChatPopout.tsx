import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Bell, Eye, Minus, Settings2, Trash2, Wifi, WifiOff, X } from "lucide-react";
import { useStore } from "../lib/store";
import { cn } from "../lib/utils";
import { Mascot } from "../components/decor";
import { Toggle } from "../components/ui";
import { Select } from "../components/Select";
import { ChatFeed, type ChatView } from "../components/ChatFeed";
import { AlertsFeed } from "../components/AlertsFeed";

// Layout do modo "Ambos" — classes literais (Tailwind precisa vê-las no código).
const BOTH_DIR: Record<string, string> = {
  auto: "flex-col sm:flex-row",
  row: "flex-row",
  col: "flex-col",
};
const BOTH_DIVIDE: Record<string, string> = {
  auto: "divide-y-2 sm:divide-x-2 sm:divide-y-0",
  row: "divide-x-2",
  col: "divide-y-2",
};
const BOTH_ALERTS_SIZE: Record<string, string> = {
  auto: "max-h-[45%] shrink-0 sm:max-h-none sm:w-72",
  row: "w-72 shrink-0",
  col: "max-h-[45%] shrink-0",
};
const FONT_OPTS = [
  { value: "sm", label: "Pequeno" },
  { value: "md", label: "Médio" },
  { value: "lg", label: "Grande" },
];
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
      fontSize: st?.chatFontSize ?? "md",
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

  const alertsPanel = (
    <div key="alerts" className={cn("flex flex-col overflow-hidden", BOTH_ALERTS_SIZE[bothLayout])}>
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
      className="min-h-0 flex-1"
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
          {viewers.total > 0 && (
            <span
              className="flex items-center gap-1 px-0.5 text-xs font-bold text-ink-muted"
              title={viewers.items
                .filter((i) => i.live)
                .map((i) => `${i.source}: ${(i.viewers ?? 0).toLocaleString("pt-BR")}`)
                .join("\n")}
            >
              <Eye className="size-3.5 text-brass" />
              {viewers.total.toLocaleString("pt-BR")}
            </span>
          )}
          {connected ? (
            <button onClick={() => void disconnectChat()} title="Desconectar" className={iconBtn}>
              <WifiOff className="size-4" />
            </button>
          ) : (
            <button onClick={() => void connectChat()} title="Conectar" className={iconBtn}>
              <Wifi className="size-4" />
            </button>
          )}
          <button
            onClick={() => (tab === "alerts" ? clearAlerts() : clearChat())}
            title="Limpar"
            className={iconBtn}
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
            </div>
          </div>
          <label className="flex items-center justify-between">
            <span className="font-semibold text-ink-muted">Tamanho da fonte</span>
            <Select
              className="w-28"
              value={view.fontSize}
              options={FONT_OPTS}
              onChange={(v) => setSettings({ chatFontSize: v as "sm" | "md" | "lg" })}
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
          className={cn(
            "flex min-h-0 flex-1 overflow-hidden divide-border-soft",
            BOTH_DIR[bothLayout],
            BOTH_DIVIDE[bothLayout],
          )}
        >
          {alertsFirst ? [alertsPanel, chatPanel] : [chatPanel, alertsPanel]}
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
