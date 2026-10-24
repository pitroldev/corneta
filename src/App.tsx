import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { MotionConfig, m } from "framer-motion";
import { FileText, RefreshCw, Shield } from "lucide-react";
import { downTargets, useStore } from "./lib/store";
import { api, IS_TAURI, type ShortcutAction } from "./lib/api";
import { errMsg } from "./lib/utils";
import { MESA_ENABLED } from "./lib/flags";
import { toast } from "./lib/toast";
import { brbSlateGeneration, renderBrbSlatePng } from "./lib/brbSlate";
import { announceMark } from "./lib/markMoment";
import { runWhenIdle } from "./lib/idle";
import { applyTheme } from "./lib/theme";
import { useI18n, useT } from "./lib/i18n";
import {
  addStep,
  capture,
  flushTelemetry,
  setTelemetryLocale,
} from "./lib/telemetry";
import { NAV_ORDER, Sidebar, type Screen } from "./components/Sidebar";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Button } from "./components/ui";

// The sidebar's visual order defines the Alt+N shortcuts.
const SCREENS: Screen[] = NAV_ORDER;
import { TitleBar } from "./components/TitleBar";
import { UpdateBanner } from "./components/UpdateBanner";
import { LiveBar } from "./components/LiveBar";
import { GuardianStatus } from "./components/GuardianStatus";
import { shortcutErrorKey } from "./lib/shortcuts";
import { Toaster } from "./components/Toaster";
import { Onboarding } from "./components/Onboarding";
import { TelemetryConsentNotice } from "./components/TelemetryConsent";
import { Mascot, SoundWaves } from "./components/decor";
const loadPlatformsScreen = () =>
  import("./screens/PlatformsScreen").then((m) => ({
    default: m.PlatformsScreen,
  }));
const PlatformsScreen = lazy(loadPlatformsScreen);
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
  platforms: loadPlatformsScreen,
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
  const guardianStatus = useStore((s) => s.snapshot.guardianStatus);
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
      return stored && SCREENS.includes(stored) ? stored : "golive";
    } catch {
      return "golive";
    }
  });
  const navigate = (s: Screen) => {
    preloadScreen(s);
    setScreen(s);
    try {
      localStorage.setItem("corneta.screen", s);
    } catch {
      /* Storage may be unavailable; navigation remains usable. */
    }
  };

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
    const unbindShortcut = api.subscribeShortcut((action) => {
      const s = useStore.getState();
      const st = s.snapshot.state;
      if (action === "toggleLive") {
        if (st === "live" || st === "starting") void s.stop();
        else void s.start();
        return;
      }
      // Moment and BRB keys act only on a running live, like their buttons.
      if (st !== "live") return;
      if (action === "markMoment") {
        api.markMoment().then(
          (marks) => announceMark(marks, { t, locale }),
          () => undefined,
        );
        return;
      }
      const forced = s.snapshot.forcedBrb ?? false;
      api.setForceBrb(!forced).then(
        () =>
          toast.success(
            t(forced ? "golive.brb.toast.back" : "golive.brb.toast.on"),
          ),
        (error: unknown) => toast.error(errMsg(error)),
      );
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
    locale,
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

  const leakSeen = useRef(0);
  useEffect(() => {
    if (leaks.length > leakSeen.current) {
      const l = leaks[leaks.length - 1];
      toast.error(t("components.app.leak.toast", { snippet: l.snippet }));
    }
    leakSeen.current = leaks.length;
  }, [leaks, t]);

  const firstTheme = useRef(true);
  useEffect(() => {
    applyTheme(theme, !firstTheme.current);
    firstTheme.current = false;
  }, [theme]);

  // Generate a slate only after config loads and only in auto mode; never overwrite custom media.
  // Locale changes must regenerate the on-air image, not just interface labels.
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
                  console.warn("Could not update the default slate", error),
                );
          });
        });
      })
      .catch((error) =>
        console.warn("Could not check the default slate", error),
      );
    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [loaded, brbSlateKind, locale, t]);

  // Reset the shared scroll container on navigation.
  const scrollRef = useRef<HTMLDivElement>(null);
  // Move focus to the new screen so keyboard and screen-reader navigation follows the route.
  const screenRef = useRef<HTMLDivElement>(null);
  const screenChanged = useRef(false);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    // Do not steal initial focus from onboarding.
    if (!screenChanged.current) {
      screenChanged.current = true;
      return;
    }
    screenRef.current?.focus({ preventScroll: true });
  }, [screen]);

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

  // Recorder notices belong in the shell because users may be on any screen when recording fails.
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

  const setupOpen = useStore((s) => s.setupOpen);
  const requestChatConfig = useStore((s) => s.requestChatConfig);
  const navRequest = useStore((s) => s.navRequest);
  const requestNavigate = useStore((s) => s.requestNavigate);
  useEffect(() => {
    if (navRequest && SCREENS.includes(navRequest as Screen)) {
      navigate(navRequest as Screen);
      requestNavigate(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navRequest]);

  const liveShortcut = useStore((s) => s.config?.settings.liveShortcut);
  const markMomentShortcut = useStore(
    (s) => s.config?.settings.markMomentShortcut,
  );
  const brbShortcut = useStore((s) => s.config?.settings.brbShortcut);
  const shortcutBootDone = useRef(false);
  useEffect(() => {
    if (!IS_TAURI || !loaded || shortcutBootDone.current) return;
    shortcutBootDone.current = true;
    const boot: [string | undefined, ShortcutAction][] = [
      [liveShortcut, "toggleLive"],
      [markMomentShortcut, "markMoment"],
      [brbShortcut, "brb"],
    ];
    for (const [shortcut, action] of boot) {
      if (!shortcut) continue;
      api.registerShortcut(shortcut, action).catch((error: unknown) => {
        toast.error(t(shortcutErrorKey(error)));
      });
    }
  }, [loaded, liveShortcut, markMomentShortcut, brbShortcut, t]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex h-full flex-col overflow-hidden border border-border-soft">
        <TitleBar />

        <div className="sr-only" role="status" aria-live="polite">
          {liveLabel}
        </div>

        <GuardianStatus status={guardianStatus} />
        {censored &&
          guardianStatus !== "unavailable" &&
          guardianStatus !== "starting" && (
            <div className="flex items-start gap-3 border-b border-border bg-surface-2 px-4 py-2 text-ink">
              <Shield
                aria-hidden="true"
                className="size-5 shrink-0 text-warn"
              />
              <div className="min-w-0 flex-1">
                <div className="font-display text-sm font-extrabold leading-tight">
                  {t("components.app.censored.title")}
                </div>
                <div className="mt-1 max-w-[72ch] text-sm leading-relaxed text-ink-muted">
                  {t("components.app.censored.body")}
                </div>
              </div>
            </div>
          )}

        <UpdateBanner />

        {/* The Live screen shows the same status in its own bar. */}
        {screen !== "golive" && <LiveBar onOpen={() => navigate("golive")} />}

        {!loaded ? (
          <div className="grid flex-1 place-items-center" role="status">
            <div className="flex flex-col items-center gap-4">
              <div
                className={
                  bootError
                    ? "brand-tile grid size-16 place-items-center rounded-lg bg-brass text-brass-ink"
                    : "brand-tile grid size-16 animate-shout place-items-center rounded-lg bg-brass text-brass-ink"
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
          <div className="flex min-h-0 flex-1" inert={setupOpen}>
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
                <m.div
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
                </m.div>
              </div>
            </main>
          </div>
        )}

        <Toaster />
        <Onboarding
          onDone={(next) => {
            if (next === "chat") requestChatConfig("canais");
            navigate(next);
          }}
        />
        <TelemetryConsentNotice />
      </div>
    </MotionConfig>
  );
}
