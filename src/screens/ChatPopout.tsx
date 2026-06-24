import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Minus, Trash2, Wifi, WifiOff, X } from "lucide-react";
import { useStore } from "../lib/store";
import { cn } from "../lib/utils";
import { Mascot } from "../components/decor";
import { ChatFeed, type ChatView } from "../components/ChatFeed";
import { AlertsFeed } from "../components/AlertsFeed";

/** Versão compacta do chat para a janela flutuante (always-on-top). */
export function ChatPopout() {
  const config = useStore((s) => s.config);
  const loaded = useStore((s) => s.loaded);
  const messages = useStore((s) => s.chatMessages);
  const alerts = useStore((s) => s.alerts);
  const connected = useStore((s) => s.chatConnected);
  const connectChat = useStore((s) => s.connectChat);
  const disconnectChat = useStore((s) => s.disconnectChat);
  const clearChat = useStore((s) => s.clearChat);
  const clearAlerts = useStore((s) => s.clearAlerts);
  const load = useStore((s) => s.load);
  const bindChat = useStore((s) => s.bindChat);
  const bindAlerts = useStore((s) => s.bindAlerts);
  const theme = useStore((s) => s.config?.settings.theme ?? "dark");
  const [tab, setTab] = useState<"chat" | "alerts">("chat");

  // Setup próprio do popout (sem o motor/atalhos do app): config + chat + alertas.
  useEffect(() => {
    void load();
    const unbindChat = bindChat();
    const unbindAlerts = bindAlerts();
    return () => {
      unbindChat();
      unbindAlerts();
    };
  }, [load, bindChat, bindAlerts]);
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

      {/* Toolbar do chat: abas + conexão + limpar */}
      <div className="flex items-center gap-2 border-b-2 border-border-soft px-2 py-1.5">
        <div className="flex items-center gap-0.5 rounded-md bg-surface-2 p-0.5">
          <TabBtn active={tab === "chat"} onClick={() => setTab("chat")}>
            Chat
          </TabBtn>
          <TabBtn active={tab === "alerts"} onClick={() => setTab("alerts")}>
            Alertas{alerts.length > 0 ? ` ${alerts.length}` : ""}
          </TabBtn>
        </div>
        <div className="ml-auto flex items-center gap-1">
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
              onClick={() => void connectChat()}
              title="Conectar"
              className={iconBtn}
            >
              <Wifi className="size-4" />
            </button>
          )}
          <button
            onClick={() => (tab === "chat" ? clearChat() : clearAlerts())}
            title="Limpar"
            className={iconBtn}
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
      {tab === "chat" ? (
        <ChatFeed
          messages={messages}
          view={view}
          connected={connected}
          className="flex-1"
        />
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
