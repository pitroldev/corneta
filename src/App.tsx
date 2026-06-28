import { useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useStore } from "./lib/store";
import { api, IS_TAURI } from "./lib/api";
import { toast } from "./lib/toast";
import { renderBrbSlatePng } from "./lib/brbSlate";
import { applyTheme } from "./lib/theme";
import { Sidebar, type Screen } from "./components/Sidebar";
import { ErrorBoundary } from "./components/ErrorBoundary";

const SCREENS: Screen[] = ["platforms", "encoding", "golive", "chat", "mesa", "reports", "about", "settings"];
import { TitleBar } from "./components/TitleBar";
import { LiveBar } from "./components/LiveBar";
import { Toaster } from "./components/Toaster";
import { Onboarding } from "./components/Onboarding";
import { Mascot, SoundWaves } from "./components/decor";
import { PlatformsScreen } from "./screens/PlatformsScreen";
import { EncodingScreen } from "./screens/EncodingScreen";
import { GoLiveScreen } from "./screens/GoLiveScreen";
import { ChatScreen } from "./screens/ChatScreen";
import { MesaScreen } from "./screens/MesaScreen";
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
  const bindAlertStatus = useStore((s) => s.bindAlertStatus);
  const bindChatAuth = useStore((s) => s.bindChatAuth);
  const bindAuthFlow = useStore((s) => s.bindAuthFlow);
  const setupOauth = useStore((s) => s.setupOauth);
  const leaks = useStore((s) => s.leaks);
  const censored = useStore((s) => s.censored);
  const liveState = useStore((s) => s.snapshot.state);
  const theme = useStore((s) => s.config?.settings.theme ?? "dark");

  // Anúncio do estado da transmissão pra leitor de tela (o resto é só cor/ponto).
  const liveLabel = censored
    ? "JÁ VOLTO no ar — um termo seu apareceu na tela"
    : liveState === "live"
      ? "No ar em todas as plataformas"
      : liveState === "starting"
        ? "Aguardando o OBS conectar"
        : liveState === "error"
          ? "Erro na transmissão"
          : "Fora do ar";
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
    void setupOauth();
    const unbind = bindEngine();
    const unbindChat = bindChat();
    const unbindAlerts = bindAlerts();
    const unbindViewers = bindViewers();
    const unbindGuardian = bindGuardian();
    const unbindAlertStatus = bindAlertStatus();
    const unbindChatAuth = bindChatAuth();
    const unbindAuthFlow = bindAuthFlow();
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
      unbindAlertStatus();
      unbindChatAuth();
      unbindAuthFlow();
      unbindShortcut();
    };
  }, [load, setupOauth, bindEngine, bindChat, bindAlerts, bindViewers, bindGuardian, bindAlertStatus, bindChatAuth, bindAuthFlow]);

  // Guardião: avisa por toast a cada novo vazamento detectado.
  const leakSeen = useRef(0);
  useEffect(() => {
    if (leaks.length > leakSeen.current) {
      const l = leaks[leaks.length - 1];
      toast.error(`🛡️ "${l.snippet}" apareceu na tela — cortei pro JÁ VOLTO`);
    }
    leakSeen.current = leaks.length;
  }, [leaks]);

  // D1: aplica o tema (dark/light). Na troca pela mão, a corneta "sopra" o tema novo
  // (ondas de latão saindo do clique — ver lib/theme); no 1º load aplica direto.
  const firstTheme = useRef(true);
  useEffect(() => {
    applyTheme(theme, !firstTheme.current);
    firstTheme.current = false;
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

  // Alt+1..7 troca de tela (ignora quando o foco está num campo de texto).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const i = "1234567".indexOf(e.key);
      if (i >= 0 && i < SCREENS.length) {
        e.preventDefault();
        navigate(SCREENS[i]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <MotionConfig reducedMotion="user">
    <div className="flex h-full flex-col overflow-hidden border border-border-soft">
      <TitleBar />

      <div className="sr-only" role="status" aria-live="polite">
        {liveLabel}
      </div>

      {censored && (
        <div className="flex items-center gap-3 border-b-2 border-bad bg-bad px-4 py-2 text-white">
          <span className="animate-pulse text-lg">🛑</span>
          <div className="min-w-0 flex-1">
            <div className="font-display text-sm font-extrabold leading-tight">
              JÁ VOLTO no ar
            </div>
            <div className="truncate text-xs text-white/85">
              Um termo seu apareceu na tela — a live volta sozinha quando ele sumir.
            </div>
          </div>
        </div>
      )}

      {!censored && <LiveBar onOpen={() => navigate("golive")} />}

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
                    {screen === "golive" && <GoLiveScreen onNavigate={navigate} />}
                    {screen === "chat" && <ChatScreen />}
                    {screen === "mesa" && <MesaScreen />}
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
    </MotionConfig>
  );
}
