import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useStore } from "./lib/store";
import { api, IS_TAURI } from "./lib/api";
import { toast } from "./lib/toast";
import { renderBrbSlatePng } from "./lib/brbSlate";
import { Sidebar, type Screen } from "./components/Sidebar";
import { ErrorBoundary } from "./components/ErrorBoundary";

const SCREENS: Screen[] = ["platforms", "encoding", "golive", "chat", "reports", "about", "settings"];
import { TitleBar } from "./components/TitleBar";
import { Toaster } from "./components/Toaster";
import { Onboarding } from "./components/Onboarding";
import { Mascot, SoundWaves } from "./components/decor";
import { PlatformsScreen } from "./screens/PlatformsScreen";
import { EncodingScreen } from "./screens/EncodingScreen";
import { GoLiveScreen } from "./screens/GoLiveScreen";
import { ChatScreen } from "./screens/ChatScreen";
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
  const bindGuardian = useStore((s) => s.bindGuardian);
  const leaks = useStore((s) => s.leaks);
  const censored = useStore((s) => s.censored);
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
    const unbindGuardian = bindGuardian();
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
      unbindGuardian();
      unbindShortcut();
    };
  }, [load, bindEngine, bindChat, bindAlerts, bindViewers, bindGuardian]);

  // Guardião: avisa por toast a cada novo vazamento detectado.
  const leakSeen = useRef(0);
  useEffect(() => {
    if (leaks.length > leakSeen.current) {
      const l = leaks[leaks.length - 1];
      toast.error(`⚠️ Possível vazamento na tela: ${l.label}`);
    }
    leakSeen.current = leaks.length;
  }, [leaks]);

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

  // Cada tela começa no topo: o container de scroll é compartilhado, então um
  // scrollIntoView (ex.: "Fora do ar" → botão BORA) deixava as outras telas cortadas.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [screen]);

  return (
    <div className="flex h-full flex-col overflow-hidden border border-border-soft">
      <TitleBar />

      {censored && (
        <div className="flex items-center gap-3 border-b-2 border-bad bg-bad px-4 py-2 text-white">
          <span className="animate-pulse text-lg">🛑</span>
          <div className="min-w-0 flex-1">
            <div className="font-display text-sm font-extrabold leading-tight">
              Censurando ao vivo
            </div>
            <div className="truncate text-xs text-white/85">
              Tarja cobrindo um segredo detectado na tela — some sozinho quando ele sair.
            </div>
          </div>
        </div>
      )}

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

            <div
              ref={scrollRef}
              id="screen-scroll"
              className="h-full overflow-y-auto px-8 py-8 [scrollbar-gutter:stable]"
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={screen}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                >
                  <ErrorBoundary>
                    {screen === "platforms" && <PlatformsScreen />}
                    {screen === "encoding" && <EncodingScreen />}
                    {screen === "golive" && <GoLiveScreen />}
                    {screen === "chat" && <ChatScreen />}
                    {screen === "reports" && <ReportsScreen />}
                    {screen === "about" && <AboutScreen />}
                    {screen === "settings" && <SettingsScreen />}
                  </ErrorBoundary>
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
