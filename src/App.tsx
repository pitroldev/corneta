import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useStore } from "./lib/store";
import { api, IS_TAURI } from "./lib/api";
import { renderBrbSlatePng } from "./lib/brbSlate";
import { Sidebar, type Screen } from "./components/Sidebar";

const SCREENS: Screen[] = ["platforms", "encoding", "golive", "chat", "reports", "about", "settings"];
import { TitleBar } from "./components/TitleBar";
import { Toaster } from "./components/Toaster";
import { Onboarding } from "./components/Onboarding";
import { Mascot, SoundWaves } from "./components/decor";
import { PlatformsScreen } from "./screens/PlatformsScreen";
import { EncodingScreen } from "./screens/EncodingScreen";
import { GoLiveScreen } from "./screens/GoLiveScreen";
import { ChatScreen } from "./screens/ChatScreen";
import { ChatPopout } from "./screens/ChatPopout";
import { ReportsScreen } from "./screens/ReportsScreen";
import { AboutScreen } from "./screens/AboutScreen";
import { SettingsScreen } from "./screens/SettingsScreen";

export default function App() {
  const loaded = useStore((s) => s.loaded);
  const load = useStore((s) => s.load);
  const bindEngine = useStore((s) => s.bindEngine);
  const bindChat = useStore((s) => s.bindChat);
  const bindAlerts = useStore((s) => s.bindAlerts);
  const bindViewers = useStore((s) => s.bindViewers);
  const theme = useStore((s) => s.config?.settings.theme ?? "dark");
  const [screen, setScreen] = useState<Screen>(() => {
    try {
      const stored = localStorage.getItem("corneta.screen") as Screen | null;
      return stored && SCREENS.includes(stored) ? stored : "platforms";
    } catch {
      return "platforms";
    }
  });
  // D3: lembra a última tela aberta.
  const navigate = (s: Screen) => {
    setScreen(s);
    try {
      localStorage.setItem("corneta.screen", s);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    void load();
    const unbind = bindEngine();
    const unbindChat = bindChat();
    const unbindAlerts = bindAlerts();
    const unbindViewers = bindViewers();
    // C1: atalho global começar/parar (alterna conforme o estado atual).
    const unbindShortcut = api.subscribeShortcut(() => {
      const s = useStore.getState();
      const st = s.snapshot.state;
      if (st === "live" || st === "starting") void s.stop();
      else void s.start();
    });
    return () => {
      unbind();
      unbindChat();
      unbindAlerts();
      unbindViewers();
      unbindShortcut();
    };
  }, [load, bindEngine, bindChat, bindAlerts, bindViewers]);

  // D1: aplica o tema (dark/light) no documento.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Gera o slate "JÁ VOLTO" e salva no disco (o FFmpeg usa quando o sinal cai).
  useEffect(() => {
    if (!IS_TAURI) return;
    void renderBrbSlatePng().then((b64) => {
      if (b64) void api.saveBrbSlate(b64);
    });
  }, []);

  // Janela flutuante só-chat (aberta via open_chat_window com #chat-popout).
  if (typeof window !== "undefined" && window.location.hash === "#chat-popout") {
    return <ChatPopout />;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden border border-border-soft">
      <TitleBar />

      {!loaded ? (
        <div className="grid flex-1 place-items-center">
          <div className="grid size-16 animate-shout place-items-center rounded-lg bg-brass text-brass-ink pop-brass">
            <Mascot className="size-9" />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <Sidebar screen={screen} onNavigate={navigate} />

          <main className="relative flex-1 overflow-hidden">
            <SoundWaves className="pointer-events-none absolute -bottom-20 -right-16 size-80 text-brass/[0.05]" />

            <div className="h-full overflow-y-auto px-8 py-8 [scrollbar-gutter:stable]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={screen}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                >
                  {screen === "platforms" && <PlatformsScreen />}
                  {screen === "encoding" && <EncodingScreen />}
                  {screen === "golive" && <GoLiveScreen />}
                  {screen === "chat" && <ChatScreen />}
                  {screen === "reports" && <ReportsScreen />}
                  {screen === "about" && <AboutScreen />}
                  {screen === "settings" && <SettingsScreen />}
                </motion.div>
              </AnimatePresence>
            </div>
          </main>
        </div>
      )}

      <Toaster />
      <Onboarding onStart={() => navigate("platforms")} />
    </div>
  );
}
