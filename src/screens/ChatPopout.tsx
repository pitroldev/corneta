import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Trash2, Wifi, WifiOff } from "lucide-react";
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
      <div className="grid h-screen place-items-center bg-panel">
        <div className="grid size-12 animate-shout place-items-center rounded-lg bg-brass text-brass-ink pop-brass">
          <Mascot className="size-7" />
        </div>
      </div>
    );
  }

  const iconBtn =
    "rounded p-1.5 text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink";

  return (
    <div className="flex h-screen flex-col bg-panel">
      <div className="flex items-center gap-2 border-b-2 border-border-soft px-2.5 py-2">
        <div className="grid size-6 shrink-0 place-items-center rounded bg-brass text-brass-ink">
          <Mascot className="size-4" />
        </div>
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
