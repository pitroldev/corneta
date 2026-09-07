import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { MotionConfig, motion } from "framer-motion";
import { FileText, RefreshCw } from "lucide-react";
import { downTargets, useStore } from "./lib/store";
import { api, IS_TAURI } from "./lib/api";
import { MESA_ENABLED } from "./lib/flags";
import { toast } from "./lib/toast";
import { brbSlateGeneration, renderBrbSlatePng } from "./lib/brbSlate";
import { runWhenIdle } from "./lib/idle";
import { applyTheme } from "./lib/theme";
import { useI18n, useT } from "./lib/i18n";
import {
  addStep,
  capture,
  flushTelemetry,
  setTelemetryLocale,
} from "./lib/telemetry";
import { Sidebar, type Screen } from "./components/Sidebar";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Button } from "./components/ui";

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
import { TelemetryConsentNotice } from "./components/TelemetryConsent";
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
  const t = useT();
  return (
    <div className="mx-auto max-w-3xl py-8" role="status" aria-live="polite">
      <div className="mb-5 flex items-center gap-3 text-sm font-bold text-ink-muted">
        <span className="size-2 animate-pulse rounded-full bg-brass" />
        {t("components.app.loading.screen")}
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
  const { t, tp, locale } = useI18n();
  const loaded = useStore((s) => s.loaded);
  const bootError = useStore((s) => s.bootError);
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
  const ingestLive = useStore((s) => s.snapshot.ingestLive ?? false);
  const down = useStore((s) => downTargets(s.snapshot));
  const theme = useStore((s) => s.config?.settings.theme ?? "dark");
  const brbSlateKind = useStore((s) => s.config?.settings.brbSlateKind);
  const appStarted = useRef(false);

  useEffect(() => {
    setTelemetryLocale(locale);
  }, [locale]);

  useEffect(() => {
    if (!loaded || appStarted.current) return;
    appStarted.current = true;
    addStep("app_ready");
  }, [loaded]);

  // Anúncio do estado da transmissão pra leitor de tela (o resto é só cor/ponto).
  // "Em todas as plataformas" só quando é verdade — com alguma fora, diz quantas (o mesmo
  // número do chip vermelho da LiveBar).
  const liveLabel = censored
    ? t("components.app.live.aria.censored")
    : liveState === "live"
      ? down > 0
        ? tp("components.app.live.aria.live.down", down)
        : t("components.app.live.aria.live")
      : liveState === "starting"
        ? t(
            ingestLive
              ? "components.app.live.aria.connectingTargets"
              : "components.app.live.aria.starting",
          )
        : liveState === "error"
          ? t("components.app.live.aria.error")
          : t("components.app.live.aria.stopped");
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
    if (!loaded) return;
    capture("screen_viewed", { screen_id: screen });
    addStep("screen_opened", { screen_id: screen });
  }, [loaded, screen]);

  useEffect(() => {
    const onClose = () => {
      void flushTelemetry(150);
    };
    window.addEventListener("beforeunload", onClose);
    return () => window.removeEventListener("beforeunload", onClose);
  }, []);

  useEffect(() => {
    void load(t);
    void setupOauth();
    const unbind = bindEngine(t);
    const unbindConfigSync = bindConfigSync();
    const unbindChat = bindChat();
    const unbindChatRunning = bindChatRunning();
    const unbindAlerts = bindAlerts();
    const unbindViewers = bindViewers();
    const unbindGuardian = bindGuardian();
    const unbindAlertStatus = bindAlertStatus();
    const unbindChatAuth = bindChatAuth();
    const unbindAuthFlow = bindAuthFlow(t);
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
    t,
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
      toast.error(t("components.app.leak.toast", { snippet: l.snippet }));
    }
    leakSeen.current = leaks.length;
  }, [leaks, t]);

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
  //
  // Depende do `locale`: o cartão vai AO AR com texto, então trocar o idioma
  // tem que redesenhar o PNG que está no disco (a generation carrega o idioma).
  useEffect(() => {
    if (!IS_TAURI || !loaded) return;
    const generation = brbSlateGeneration(locale);
    if (brbSlateKind && brbSlateKind !== "auto") return;
    let cancelled = false;
    let cancelIdle = () => {};
    void api
      .brbSlateNeedsRefresh(generation)
      .then((needsRefresh) => {
        if (!needsRefresh || cancelled) return;
        cancelIdle = runWhenIdle(() => {
          if (cancelled) return;
          void renderBrbSlatePng(t).then((b64) => {
            if (b64 && !cancelled)
              void api
                .saveBrbSlate(b64, generation)
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
  }, [loaded, brbSlateKind, locale, t]);

  // Cada tela começa no topo: o container de scroll é compartilhado, então um
  // scrollIntoView (ex.: "Fora do ar" → botão BORA) deixava as outras telas cortadas.
  const scrollRef = useRef<HTMLDivElement>(null);
  // ...e recebe o foco: sem isto, depois de Alt+N ou do clique na sidebar o leitor de
  // tela continuava no botão de onde saiu, sem saber que a tela mudou (WCAG 2.4.3).
  const screenRef = useRef<HTMLDivElement>(null);
  const screenChanged = useRef(false);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    // No 1º render não houve troca — focar aqui roubaria o foco do tour de boas-vindas.
    if (!screenChanged.current) {
      screenChanged.current = true;
      return;
    }
    screenRef.current?.focus({ preventScroll: true });
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
  }, []);

  // Avisos do gravador. Ficam aqui, e não numa tela, porque o streamer pode estar em
  // qualquer aba quando o disco enche — e porque nenhum deles é erro do MOTOR: a live
  // segue no ar em todos os casos. É informação, não alarme.
  useEffect(() => {
    return api.subscribeRecorder(({ kind, detail }) => {
      switch (kind) {
        case "diskFull":
          toast.error(t("recorder.toast.diskFull"));
          break;
        case "noDir":
          toast.error(t("recorder.toast.noDir"));
          break;
        case "resumed":
          toast.info(t("recorder.toast.resumed"));
          break;
        case "waitingSource":
          toast.info(t("recorder.toast.waitingSource"));
          break;
        // Desistir não pode ser definitivo: sem este botão a única saída era cortar a
        // live e recomeçar, que é justamente o que ninguém faz no ar.
        case "gaveUp":
          toast.errorAction(
            t("recorder.toast.gaveUp"),
            t("recorder.toast.retry"),
            () => {
              api
                .recordRetry()
                .then(() => toast.success(t("recorder.toast.retrying")))
                .catch((e: unknown) => toast.error(String(e)));
            },
          );
          break;
        case "estimatedAnchor":
          toast.info(t("recorder.toast.estimatedAnchor"));
          break;
        case "failed":
          toast.error(t("recorder.toast.failed", { error: detail ?? "" }));
          break;
        default:
      }
    });
  }, [t]);

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
        t("components.app.shortcut.taken", {
          // "CommandOrControl" é token do Tauri; na tela a pessoa lê "Ctrl".
          shortcut: liveShortcut.replace("CommandOrControl", "Ctrl"),
        }),
      );
    });
  }, [loaded, liveShortcut, t]);

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
                {t("components.app.censored.title")}
              </div>
              <div className="truncate text-xs text-white/85">
                {t("components.app.censored.body")}
              </div>
            </div>
          </div>
        )}

        <UpdateBanner />

        {/* Fica também com o JÁ VOLTO no ar: a faixa do Guardião diz o que aconteceu, a
            LiveBar segue com cronômetro, viewers, plataformas fora e o atalho pro painel. */}
        <LiveBar onOpen={() => navigate("golive")} />

        {!loaded ? (
          <div className="grid flex-1 place-items-center" role="status">
            <div className="flex flex-col items-center gap-4">
              <div
                className={
                  bootError
                    ? "grid size-16 place-items-center rounded-lg bg-brass text-brass-ink pop-brass"
                    : "grid size-16 animate-shout place-items-center rounded-lg bg-brass text-brass-ink pop-brass"
                }
              >
                <Mascot className="size-9" />
              </div>
              {bootError ? (
                <>
                  <p
                    role="alert"
                    className="max-w-sm text-center font-display text-sm font-bold text-ink"
                  >
                    {t("components.app.loading.error")}
                  </p>
                  <p
                    className="max-w-sm text-center text-xs text-ink-muted"
                    data-selectable
                  >
                    {bootError}
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => void load(t)}
                    >
                      <RefreshCw className="size-4" /> {t("golive.error.retry")}
                    </Button>
                    <Button
                      variant="subtle"
                      size="sm"
                      onClick={() => void api.openLogsDir()}
                    >
                      <FileText className="size-4" /> {t("golive.error.logs")}
                    </Button>
                  </div>
                </>
              ) : (
                <span className="font-display text-sm font-bold text-ink-muted">
                  {t("components.app.loading.boot")}
                </span>
              )}
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
                  ref={screenRef}
                  tabIndex={-1}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.11, ease: "easeOut" }}
                >
                  <ErrorBoundary screenId={screen}>
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
        <TelemetryConsentNotice />
      </div>
    </MotionConfig>
  );
}
