import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { MotionConfig, motion } from "framer-motion";
import { useStore } from "./lib/store";
import { api, IS_TAURI } from "./lib/api";
import { MESA_ENABLED } from "./lib/flags";
import { toast } from "./lib/toast";
import { BRB_SLATE_GENERATION, renderBrbSlatePng } from "./lib/brbSlate";
import { runWhenIdle } from "./lib/idle";
import { applyTheme } from "./lib/theme";
import { Sidebar, type Screen } from "./components/Sidebar";
import { ErrorBoundary } from "./components/ErrorBoundary";

// Ordem = numeração dos atalhos Alt+1..N (espelha a sidebar: jornada primeiro, depois
// utilitários). Configurações vem antes de Sobre — é a tela recorrente.
const SCREENS: Screen[] = [
  "platforms",
  "encoding",
  "golive",
  "chat",
  ...(MESA_ENABLED ? (["mesa"] as Screen[]) : []),
  "reports",
  "settings",
  "about",
];
import { TitleBar } from "./components/TitleBar";
import { UpdateBanner } from "./components/UpdateBanner";
import { LiveBar } from "./components/LiveBar";
import { Toaster } from "./components/Toaster";
import { Onboarding } from "./components/Onboarding";
import { Mascot, SoundWaves } from "./components/decor";
import { PlatformsScreen } from "./screens/PlatformsScreen";
const loadEncodingScreen = () =>
  import("./screens/EncodingScreen").then((m) => ({
    default: m.EncodingScreen,
  }));
const EncodingScreen = lazy(loadEncodingScreen);
const loadGoLiveScreen = () =>
  import("./screens/GoLiveScreen").then((m) => ({ default: m.GoLiveScreen }));
const GoLiveScreen = lazy(loadGoLiveScreen);
const loadChatScreen = () =>
  import("./screens/ChatScreen").then((m) => ({ default: m.ChatScreen }));
const ChatScreen = lazy(loadChatScreen);
const loadMesaScreen = () =>
  import("./screens/MesaScreen").then((m) => ({ default: m.MesaScreen }));
const MesaScreen = lazy(loadMesaScreen);
const loadReportsScreen = () =>
  import("./screens/ReportsScreen").then((m) => ({ default: m.ReportsScreen }));
const ReportsScreen = lazy(loadReportsScreen);
const loadAboutScreen = () =>
  import("./screens/AboutScreen").then((m) => ({ default: m.AboutScreen }));
const AboutScreen = lazy(loadAboutScreen);
const loadSettingsScreen = () =>
  import("./screens/SettingsScreen").then((m) => ({
    default: m.SettingsScreen,
  }));
const SettingsScreen = lazy(loadSettingsScreen);

const SCREEN_PRELOADERS: Partial<Record<Screen, () => Promise<unknown>>> = {
  encoding: loadEncodingScreen,
  golive: loadGoLiveScreen,
  chat: loadChatScreen,
  mesa: loadMesaScreen,
  reports: loadReportsScreen,
  settings: loadSettingsScreen,
  about: loadAboutScreen,
};

function preloadScreen(screen: Screen) {
  void SCREEN_PRELOADERS[screen]?.();
}

function ScreenLoading() {
  return (
    <div className="mx-auto max-w-3xl py-8" role="status" aria-live="polite">
      <div className="mb-5 flex items-center gap-3 text-sm font-bold text-ink-muted">
        <span className="size-2 animate-pulse rounded-full bg-brass" />
        Afinando esta tela…
      </div>
      <div className="space-y-3" aria-hidden>
        <div className="h-8 w-2/5 animate-pulse rounded-sm bg-surface-3" />
        <div className="h-24 animate-pulse rounded-md bg-surface-2" />
        <div className="h-16 animate-pulse rounded-md bg-surface-2" />
      </div>
    </div>
  );
}

export default function App() {
  const loaded = useStore((s) => s.loaded);
  const load = useStore((s) => s.load);
  const bindEngine = useStore((s) => s.bindEngine);
  const bindConfigSync = useStore((s) => s.bindConfigSync);
  const bindChat = useStore((s) => s.bindChat);
  const bindChatRunning = useStore((s) => s.bindChatRunning);
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
  const brbSlateKind = useStore((s) => s.config?.settings.brbSlateKind);

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
    preloadScreen(s);
    setScreen(s);
    try {
      localStorage.setItem("corneta.screen", s);
    } catch {
      /* ignore */
    }
  };

  // A última tela lembrada baixa em paralelo ao config; hover/foco cuida das próximas.
  useEffect(() => preloadScreen(screen), [screen]);

  useEffect(() => {
    void load();
    void setupOauth();
    const unbind = bindEngine();
    const unbindConfigSync = bindConfigSync();
    const unbindChat = bindChat();
    const unbindChatRunning = bindChatRunning();
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
      unbindConfigSync();
      unbindChat();
      unbindChatRunning();
      unbindAlerts();
      unbindViewers();
      unbindGuardian();
      unbindAlertStatus();
      unbindChatAuth();
      unbindAuthFlow();
      unbindShortcut();
    };
  }, [
    load,
    setupOauth,
    bindEngine,
    bindConfigSync,
    bindChat,
    bindChatRunning,
    bindAlerts,
    bindViewers,
    bindGuardian,
    bindAlertStatus,
    bindChatAuth,
    bindAuthFlow,
  ]);

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

  // Gera o slate "JÁ VOLTO" e salva no disco — SÓ no modo "auto" (tela gerada). Se o usuário
  // escolheu uma imagem/vídeo custom (image/video), NÃO sobrescreve. Espera o config carregar
  // (`loaded`) pra não regerar por engano enquanto a kind ainda é desconhecida.
  useEffect(() => {
    if (!IS_TAURI || !loaded) return;
    if (brbSlateKind && brbSlateKind !== "auto") return;
    let cancelled = false;
    let cancelIdle = () => {};
    void api
      .brbSlateNeedsRefresh(BRB_SLATE_GENERATION)
      .then((needsRefresh) => {
        if (!needsRefresh || cancelled) return;
        cancelIdle = runWhenIdle(() => {
          if (cancelled) return;
          void renderBrbSlatePng().then((b64) => {
            if (b64 && !cancelled)
              void api
                .saveBrbSlate(b64, BRB_SLATE_GENERATION)
                .catch((error) =>
                  console.warn(
                    "Não foi possível atualizar o slate padrão",
                    error,
                  ),
                );
          });
        });
      })
      .catch((error) =>
        console.warn("Não foi possível verificar o slate padrão", error),
      );
    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [loaded, brbSlateKind]);

  // Cada tela começa no topo: o container de scroll é compartilhado, então um
  // scrollIntoView (ex.: "Fora do ar" → botão BORA) deixava as outras telas cortadas.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [screen]);

  // Alt+1..8 troca de tela (ignora quando o foco está num campo de texto).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      )
        return;
      const i = "12345678".indexOf(e.key);
      if (i >= 0 && i < SCREENS.length) {
        e.preventDefault();
        navigate(SCREENS[i]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep-link global: qualquer tela pede navegação pelo store (ex.: "Configurar chat" em Plataformas).
  const navRequest = useStore((s) => s.navRequest);
  const requestNavigate = useStore((s) => s.requestNavigate);
  useEffect(() => {
    if (navRequest && SCREENS.includes(navRequest as Screen)) {
      navigate(navRequest as Screen);
      requestNavigate(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navRequest]);

  // Atalho global: registra no boot COM feedback — se outro programa já usa a combinação,
  // o streamer fica sabendo agora, não no meio da live com um atalho morto.
  const liveShortcut = useStore((s) => s.config?.settings.liveShortcut);
  const shortcutBootDone = useRef(false);
  useEffect(() => {
    if (!IS_TAURI || !loaded || shortcutBootDone.current) return;
    shortcutBootDone.current = true;
    if (!liveShortcut) return;
    api.registerShortcut(liveShortcut).catch(() => {
      toast.error(
        `Seu atalho ${liveShortcut.replace("CommandOrControl", "Ctrl")} já está em uso por outro programa — troque em Configurações → Atalho global.`,
      );
    });
  }, [loaded, liveShortcut]);

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
                Um termo seu apareceu na tela — a live volta sozinha quando ele
                sumir.
              </div>
            </div>
          </div>
        )}

        <UpdateBanner />

        {!censored && <LiveBar onOpen={() => navigate("golive")} />}

        {!loaded ? (
          <div className="grid flex-1 place-items-center" role="status">
            <div className="flex flex-col items-center gap-4">
              <div className="grid size-16 animate-shout place-items-center rounded-lg bg-brass text-brass-ink pop-brass">
                <Mascot className="size-9" />
              </div>
              <span className="font-display text-sm font-bold text-ink-muted">
                Abrindo sua bancada…
              </span>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            <Sidebar
              screen={screen}
              onNavigate={navigate}
              onPreload={preloadScreen}
            />

            <main className="relative flex-1 overflow-hidden">
              <SoundWaves className="pointer-events-none absolute -bottom-20 -right-16 size-80 text-brass/[0.05]" />

              <div
                ref={scrollRef}
                id="screen-scroll"
                className="h-full overflow-y-auto px-8 py-8 [scrollbar-gutter:stable]"
              >
                <motion.div
                  key={screen}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.11, ease: "easeOut" }}
                >
                  <ErrorBoundary>
                    <Suspense fallback={<ScreenLoading />}>
                      {screen === "platforms" && <PlatformsScreen />}
                      {screen === "encoding" && <EncodingScreen />}
                      {screen === "golive" && (
                        <GoLiveScreen onNavigate={navigate} />
                      )}
                      {screen === "chat" && <ChatScreen />}
                      {screen === "mesa" && MESA_ENABLED && <MesaScreen />}
                      {screen === "reports" && <ReportsScreen />}
                      {screen === "about" && <AboutScreen />}
                      {screen === "settings" && <SettingsScreen />}
                    </Suspense>
                  </ErrorBoundary>
                </motion.div>
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
