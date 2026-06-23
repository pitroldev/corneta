import { useEffect } from "react";
import { Trash2, Wifi, WifiOff } from "lucide-react";
import { useStore } from "../lib/store";
import { Mascot } from "../components/decor";
import { ChatFeed, type ChatView } from "../components/ChatFeed";

/** Versão compacta do chat para a janela flutuante (always-on-top). */
export function ChatPopout() {
  const config = useStore((s) => s.config);
  const loaded = useStore((s) => s.loaded);
  const messages = useStore((s) => s.chatMessages);
  const connected = useStore((s) => s.chatConnected);
  const connectChat = useStore((s) => s.connectChat);
  const disconnectChat = useStore((s) => s.disconnectChat);
  const clearChat = useStore((s) => s.clearChat);
  const load = useStore((s) => s.load);
  const bindChat = useStore((s) => s.bindChat);
  const theme = useStore((s) => s.config?.settings.theme ?? "dark");

  // Setup próprio do popout (sem o motor/atalhos do app): carrega config + ouve o chat.
  useEffect(() => {
    void load();
    const unbind = bindChat();
    return () => unbind();
  }, [load, bindChat]);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  if (!loaded || !config) {
    return (
      <div className="grid h-screen place-items-center bg-panel">
        <div className="grid size-12 animate-shout place-items-center rounded-lg bg-brass text-brass-ink pop-brass">
          <Mascot className="size-7" />
        </div>
      </div>
    );
  }

  const s = config.settings;
  const view: ChatView = {
    emotes: s.chatShowEmotes ?? true,
    badges: s.chatShowBadges ?? true,
    platform: s.chatShowPlatform ?? true,
    source: s.chatShowSource ?? false,
    timestamps: s.chatShowTimestamps ?? false,
    fontSize: s.chatFontSize ?? "md",
  };

  const iconBtn = "rounded p-1.5 text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink";

  return (
    <div className="flex h-screen flex-col bg-panel">
      <div className="flex items-center gap-2 border-b-2 border-border-soft px-3 py-2">
        <div className="grid size-6 place-items-center rounded bg-brass text-brass-ink">
          <Mascot className="size-4" />
        </div>
        <span className="font-display text-sm font-extrabold">Chat</span>
        <div className="ml-auto flex items-center gap-1">
          {connected ? (
            <button onClick={() => void disconnectChat()} title="Desconectar" className={iconBtn}>
              <WifiOff className="size-4" />
            </button>
          ) : (
            <button onClick={() => void connectChat()} title="Conectar" className={iconBtn}>
              <Wifi className="size-4" />
            </button>
          )}
          <button onClick={clearChat} title="Limpar" className={iconBtn}>
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
      <ChatFeed messages={messages} view={view} connected={connected} className="flex-1" />
    </div>
  );
}
