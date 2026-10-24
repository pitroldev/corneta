import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, m } from "framer-motion";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Eye,
  FileText,
  Loader2,
  MapPin,
  Plus,
  Radio,
  RefreshCw,
  Square,
  Zap,
} from "lucide-react";
import { useStore } from "../lib/store";
import { audienceTooltip, audienceTotal, showAudience } from "../lib/audience";
import { api, START_CANCELLED } from "../lib/api";
import { bandFit, estimate } from "../lib/estimates";
import { platformName } from "../lib/platforms";
import {
  joinNames,
  obsConfigured,
  youtubeAutoTargetId,
} from "../lib/readiness";
import { shortcutLabel } from "../lib/shortcuts";
import { announceMark } from "../lib/markMoment";
import { toast } from "../lib/toast";
import { updateBusy, useUpdate } from "../lib/updater";
import { useConfirm } from "../lib/useConfirm";
import { useNow } from "../lib/useNow";
import { useReadiness, useReadinessContext } from "../lib/useReadiness";
import { cn, errMsg, fmtUptime } from "../lib/utils";
import type { EngineState } from "../lib/types";
import { isUuid } from "../lib/telemetry-schema";
import type { Screen } from "../components/Sidebar";
import { rich, useI18n, useT } from "../lib/i18n";
import {
  Button,
  Card,
  CopyField,
  PlatformGlyph,
  SectionTitle,
} from "../components/ui";
import { ObsWizard } from "../components/ObsWizard";
import { ObsQualityGuide } from "../components/ObsQualityGuide";
import { modeTitleKey } from "../components/QualityModes";
import {
  ReadinessDrawer,
  ReadinessTiles,
  type ReadinessPanel,
} from "./golive/Readiness";
import { LiveCockpit } from "./golive/LiveCockpit";
import { StreamInfoCard } from "./golive/StreamInfoCard";
import { BrbNowButton } from "./golive/parts";

let prewarmedUpload = false;
// The preflight bypass lasts only for this process; persisting it would hide future OBS warnings.
let skippedPreflightOnce = false;

export function GoLiveScreen({
  onNavigate,
}: {
  onNavigate?: (s: Screen) => void;
}) {
  const t = useT();
  // Narrow subscriptions: per-target metrics arrive up to four times a second while live.
  const state = useStore((s) => s.snapshot.state);
  const ingestLive = useStore((s) => s.snapshot.ingestLive ?? false);
  const engineMessage = useStore((s) => s.snapshot.message);
  const errorId = useStore((s) => s.snapshot.errorId);
  const start = useStore((s) => s.start);
  const stop = useStore((s) => s.stop);
  const toggleTarget = useStore((s) => s.toggleTarget);
  const uploadMbps = useStore((s) => s.uploadMbps);
  const runUploadTest = useStore((s) => s.runUploadTest);
  const encoders = useStore((s) => s.encoders);
  const refreshEncoders = useStore((s) => s.refreshEncoders);
  const lastOperationId = useStore((s) => s.lastOperationId);
  const obs = useStore((s) => s.obs);
  const runObsCheck = useStore((s) => s.runObsCheck);

  const updating = useUpdate(updateBusy);
  const live = state === "live";
  const starting = state === "starting";
  const onAir = live || starting;
  const r = useReadiness();
  const signalLost = useStore((s) =>
    r.enabled.some(
      (target) => s.snapshot.targets[target.id]?.state === "signal-lost",
    ),
  );
  const blackScreen = useStore((s) => s.snapshot.blackScreen ?? false);

  // Initialize from the current state so remounting during a stream does not announce a new transition.
  const prevState = useRef<EngineState>(state);
  useEffect(() => {
    if (state === "live" && prevState.current !== "live") {
      toast.success(t("golive.toast.live"));
    }
    prevState.current = state;
  }, [state, t]);

  const [panel, setPanel] = useState<ReadinessPanel | null>(null);
  const [testing, setTesting] = useState(false);
  const [showObs, setShowObs] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    if (encoders.length === 0) void refreshEncoders();
  }, [encoders.length, refreshEncoders]);
  const runObs = () => runObsCheck(true);
  const onTest = async () => {
    setTesting(true);
    try {
      await runUploadTest();
    } catch {
      toast.error(t("golive.toast.uploadTestFailed"));
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => {
    if (prewarmedUpload || onAir || uploadMbps != null) return;
    prewarmedUpload = true;
    setTesting(true);
    runUploadTest()
      .catch(() => {})
      .finally(() => setTesting(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (onAir) return;
    void runObsCheck();
    const id = setInterval(() => void runObsCheck(), 6000);
    const onFocus = () => void runObsCheck();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onAir]);

  // Block duplicate clicks locally while config persistence delays the native starting snapshot.
  const [startBusy, setStartBusy] = useState(false);
  const [preflightWarn, setPreflightWarn] = useState(false);
  const doStart = async () => {
    if (startBusy) return;
    setPreflightWarn(false);
    setStartBusy(true);
    try {
      const obsRes = await start();
      if (obsRes === "obs-ok") toast.success(t("golive.toast.obsPlay"));
      else if (obsRes === "obs-failed")
        toast.action(
          t("golive.toast.obsPlayFailed"),
          t("golive.toast.obsPlayFailed.action"),
          () => setShowObs(true),
        );
      else toast.success(t("golive.toast.serverUp"));
    } catch (e) {
      const msg = errMsg(e);
      // Cancellation uses a stable backend code, independent of the active locale.
      if (!msg.includes(START_CANCELLED))
        toast.error(t("golive.toast.startFailed", { erro: msg }));
    } finally {
      setStartBusy(false);
    }
  };
  const onStart = () => {
    if (
      !skippedPreflightOnce &&
      obs !== null &&
      obs !== "loading" &&
      !obsConfigured(obs)
    ) {
      setPreflightWarn(true);
      return;
    }
    void doStart();
  };
  const skipPreflightThisRun = () => {
    skippedPreflightOnce = true;
    void doStart();
  };
  // Pending platforms are switched off (and say so) instead of blocking the ready ones.
  const startWithoutPending = () => {
    const names = r.pending.map(
      (p) => p.target.name || platformName(p.target.platformId, t),
    );
    r.pending.forEach((p) => toggleTarget(p.target.id));
    toast.info(t("golive.partial.turnedOff", { names: joinNames(names, t) }));
    onStart();
  };

  const [rescue, setRescue] = useState(false);
  useEffect(() => {
    if (!starting || ingestLive) {
      setRescue(false);
      return;
    }
    const id = setTimeout(() => {
      setRescue(true);
      void runObsCheck(true);
    }, 20000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingestLive, starting]);

  const onStop = async () => {
    await stop();
    toast.action(
      t("golive.toast.stopped"),
      t("golive.toast.stopped.action"),
      () => onNavigate?.("reports"),
    );
  };
  const onCancel = async () => {
    await stop();
    toast.info(t("golive.toast.canceled"));
  };

  const rescueHint =
    obs === null || obs === "loading"
      ? null
      : obs.authFailed
        ? t("golive.rescue.authFailed")
        : !obs.reachable
          ? t("golive.rescue.notReachable")
          : !obs.pointingAtCorneta
            ? t("golive.rescue.notPointing")
            : null;

  return (
    <div
      className={cn(
        "mx-auto transition-[max-width] duration-300",
        onAir ? "max-w-6xl" : "max-w-3xl",
      )}
    >
      <SectionTitle
        title={t("golive.header.title")}
        subtitle={t(
          live
            ? "golive.header.subtitle.live"
            : starting
              ? "golive.header.subtitle.starting"
              : "golive.header.subtitle",
        )}
      />

      {state === "error" && (
        <Card role="alert" className="mb-4 border-2 border-bad/40 bg-bad/10">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-bad" />
            <div>
              <div className="font-display font-bold text-bad">
                {t("golive.error.title")}
              </div>
              <div className="text-sm text-ink-muted" data-selectable>
                {engineMessage || t("golive.error.body")}
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={onStart}
              loading={startBusy}
              disabled={startBusy}
            >
              {!startBusy && <RefreshCw className="size-4" />}{" "}
              {t("golive.error.retry")}
            </Button>
            <Button variant="subtle" size="sm" onClick={() => setShowObs(true)}>
              <Zap className="size-4 text-brass" /> {t("golive.obs.fixForMe")}
            </Button>
            <Button
              variant="subtle"
              size="sm"
              onClick={() => void api.openLogsDir()}
            >
              <FileText className="size-4" /> {t("golive.error.logs")}
            </Button>
          </div>
          {lastOperationId && (
            <CopyField
              className="mt-3"
              label={t("golive.error.operationId")}
              value={lastOperationId}
              mono
            />
          )}
          {isUuid(errorId) && (
            <CopyField
              className="mt-2"
              label={t("golive.error.errorId")}
              value={errorId}
              mono
            />
          )}
        </Card>
      )}

      {!onAir ? (
        <div className="flex flex-col gap-4">
          <ReadinessTiles onOpen={setPanel} testing={testing} />
          <StreamInfoCard />
          <Destinations
            onFix={() => setPanel("platforms")}
            onAdd={() => onNavigate?.("platforms")}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {live && signalLost && (
            <AlertCard
              tone="bad"
              title={t("golive.signalLost.title")}
              body={t("golive.signalLost.body")}
            >
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowObs(true)}
              >
                <Zap className="size-4" /> {t("golive.obs.fixForMe")}
              </Button>
              <Button
                variant="subtle"
                size="sm"
                onClick={runObs}
                loading={obs === "loading"}
                disabled={obs === "loading"}
              >
                {obs !== "loading" && <RefreshCw className="size-4" />}{" "}
                {t("golive.obs.check")}
              </Button>
            </AlertCard>
          )}
          {live && blackScreen && !signalLost && (
            <AlertCard
              tone="bad"
              title={t("golive.blackScreen.title")}
              body={t("golive.blackScreen.body")}
            />
          )}
          {starting && !ingestLive && rescue && (
            <AlertCard
              tone="warn"
              title={t("golive.rescue.title")}
              body={
                <>
                  {rich(t, "golive.rescue.body", {
                    botao: (
                      <strong className="text-ink">
                        {t("golive.obs.startStreamingButton")}
                      </strong>
                    ),
                  })}{" "}
                  {rescueHint}
                </>
              }
            >
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowObs(true)}
              >
                <Zap className="size-4" /> {t("golive.obs.fixForMe")}
              </Button>
              <Button
                variant="subtle"
                size="sm"
                onClick={runObs}
                loading={obs === "loading"}
              >
                {obs !== "loading" && <RefreshCw className="size-4" />}{" "}
                {t("golive.obs.check")}
              </Button>
            </AlertCard>
          )}
          <LiveCockpit targets={r.enabled} onNavigate={onNavigate} />
          <StreamInfoCard />
        </div>
      )}

      <ActionBar
        updating={updating}
        startBusy={startBusy}
        preflightWarn={preflightWarn}
        onStart={onStart}
        onStartWithoutPending={startWithoutPending}
        onFix={(p) => setPanel(p)}
        onSetupObs={() => {
          setPreflightWarn(false);
          setShowObs(true);
        }}
        onSkipPreflight={skipPreflightThisRun}
        onDismissPreflight={() => setPreflightWarn(false)}
        onStop={onStop}
        onCancel={onCancel}
      />

      <ReadinessDrawer
        panel={panel}
        onClose={() => setPanel(null)}
        onNavigate={onNavigate}
        onSetupObs={() => setShowObs(true)}
        onRecheckObs={runObs}
        onGuide={() => setShowGuide(true)}
        onTest={() => void onTest()}
        testing={testing}
      />
      {showObs && (
        <ObsWizard
          onClose={() => {
            setShowObs(false);
            void runObs();
          }}
        />
      )}
      {showGuide && <ObsQualityGuide onClose={() => setShowGuide(false)} />}
    </div>
  );
}

function AlertCard({
  tone,
  title,
  body,
  children,
}: {
  tone: "bad" | "warn";
  title: string;
  body: ReactNode;
  children?: ReactNode;
}) {
  return (
    <m.div
      role="alert"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-lg border-2 p-5",
        tone === "bad"
          ? "border-bad/40 bg-bad/10"
          : "border-warn/40 bg-warn/10",
      )}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className={cn(
            "mt-0.5 size-5 shrink-0",
            tone === "bad" ? "text-bad" : "text-warn",
          )}
        />
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "font-display font-bold",
              tone === "bad" ? "text-bad" : "text-warn",
            )}
          >
            {title}
          </div>
          <div className="text-sm text-ink-muted">{body}</div>
        </div>
      </div>
      {children && (
        <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div>
      )}
    </m.div>
  );
}

/** Where the stream goes: one sticker per platform, with what each still needs. */
function Destinations({
  onFix,
  onAdd,
}: {
  onFix: () => void;
  onAdd: () => void;
}) {
  const t = useT();
  const targets = useStore((s) => s.config!.targets);
  const r = useReadiness();
  const ctx = useReadinessContext();
  const autoYoutube = youtubeAutoTargetId(targets, ctx);
  return (
    <Card className="py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-lg">{t("golive.destinations.title")}</h3>
        <button
          type="button"
          onClick={onFix}
          className="flex items-center gap-0.5 text-xs font-bold text-brass hover:underline"
        >
          {t("golive.destinations.manage")}{" "}
          <ChevronRight className="size-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {targets.map((target, i) => {
          const pending = r.pending.some((p) => p.target.id === target.id);
          const status = !target.enabled
            ? t("golive.destinations.off")
            : pending
              ? t("golive.destinations.pending")
              : target.id === autoYoutube && !target.hasKey
                ? t("golive.destinations.auto")
                : t("golive.destinations.ready");
          return (
            <m.button
              key={target.id}
              type="button"
              onClick={onFix}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.05 + i * 0.03, duration: 0.18 }}
              className={cn(
                "flex items-center gap-2.5 rounded-md border-2 bg-surface-2 py-1.5 pl-1.5 pr-3 text-left transition hover:-translate-y-0.5 hover:bg-surface-3",
                pending ? "border-warn/50" : "border-transparent",
                !target.enabled && "opacity-55",
              )}
            >
              <PlatformGlyph id={target.platformId} size={28} />
              <span className="flex flex-col leading-tight">
                <span className="font-display text-sm font-bold">
                  {target.name || platformName(target.platformId, t)}
                </span>
                <span
                  className={cn(
                    "flex items-center gap-1 text-xs",
                    pending
                      ? "font-semibold text-warn"
                      : target.enabled
                        ? "text-ok"
                        : "text-ink-faint",
                  )}
                >
                  {target.enabled && !pending && (
                    <Check className="size-3" strokeWidth={3} />
                  )}
                  {status}
                </span>
              </span>
            </m.button>
          );
        })}
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-2 rounded-md border-2 border-dashed border-border px-3 py-2 text-sm font-semibold text-ink-muted transition-colors hover:border-brass hover:text-ink"
        >
          <Plus className="size-4" /> {t("golive.destinations.add")}
        </button>
      </div>
    </Card>
  );
}

function ActionBar({
  updating,
  startBusy,
  preflightWarn,
  onStart,
  onStartWithoutPending,
  onFix,
  onSetupObs,
  onSkipPreflight,
  onDismissPreflight,
  onStop,
  onCancel,
}: {
  updating: boolean;
  startBusy: boolean;
  preflightWarn: boolean;
  onStart: () => void;
  onStartWithoutPending: () => void;
  onFix: (panel: ReadinessPanel) => void;
  onSetupObs: () => void;
  onSkipPreflight: () => void;
  onDismissPreflight: () => void;
  onStop: () => Promise<void>;
  onCancel: () => Promise<void>;
}) {
  const t = useT();
  const state = useStore((s) => s.snapshot.state);
  const ingestLive = useStore((s) => s.snapshot.ingestLive ?? false);
  const autoStartObs = useStore((s) => s.config!.settings.autoStartObs);
  const live = state === "live";
  const starting = state === "starting";

  return (
    <div className="sticky -bottom-8 z-10 mt-6 bg-bg pb-6 pt-3">
      <AnimatePresence>
        {preflightWarn && !live && !starting && (
          <m.div
            initial={{ opacity: 0, y: 8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: 8, height: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="mb-2 rounded-lg border-2 border-warn/40 bg-warn/10 p-3">
              <div className="flex items-center gap-2 text-sm font-bold text-warn">
                <AlertTriangle className="size-4 shrink-0" />{" "}
                {t("golive.preflight.title")}
              </div>
              <p className="mt-0.5 text-xs text-ink-muted">
                {t("golive.preflight.body")}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="primary" size="sm" onClick={onSetupObs}>
                  <Zap className="size-4" /> {t("golive.obs.fixForMe")}
                </Button>
                <Button variant="subtle" size="sm" onClick={onSkipPreflight}>
                  {t("golive.preflight.goAnyway")}
                </Button>
                <Button variant="ghost" size="sm" onClick={onDismissPreflight}>
                  {t("golive.cancel")}
                </Button>
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>
      <div
        className={cn(
          "flex min-h-[4.5rem] items-center gap-4 rounded-lg border-2 p-3 pl-4 pop transition-colors duration-300",
          live ? "border-live/50 bg-surface" : "border-border bg-surface",
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={live ? "live" : starting ? "starting" : "idle"}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2"
          >
            {live ? (
              <LiveControls onStop={onStop} />
            ) : starting ? (
              <>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Loader2 className="size-5 shrink-0 animate-spin text-brass" />
                  <div className="min-w-0">
                    <div className="font-display text-base font-extrabold">
                      {t(
                        ingestLive
                          ? "golive.starting.connectingTargets"
                          : "golive.starting.waiting",
                      )}
                    </div>
                    {!ingestLive && (
                      <p className="text-xs text-ink-muted">
                        {rich(
                          t,
                          autoStartObs
                            ? "golive.starting.autoObs"
                            : "golive.starting.manualObs",
                          {
                            botao: (
                              <strong className="text-ink">
                                {t("golive.obs.startStreamingButton")}
                              </strong>
                            ),
                          },
                        )}
                      </p>
                    )}
                  </div>
                </div>
                <Button variant="outline" onClick={() => void onCancel()}>
                  {t("golive.cancel")}
                </Button>
              </>
            ) : (
              <IdleControls
                updating={updating}
                startBusy={startBusy}
                onStart={onStart}
                onStartWithoutPending={onStartWithoutPending}
                onFix={onFix}
                onSetupObs={onSetupObs}
              />
            )}
          </m.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function StatusLine({
  tone,
  title,
  detail,
  action,
}: {
  tone: "ok" | "warn" | "bad";
  title: string;
  detail?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-md",
          tone === "ok"
            ? "bg-ok/15 text-ok"
            : tone === "warn"
              ? "bg-warn/15 text-warn"
              : "bg-bad/15 text-bad",
        )}
      >
        {tone === "ok" ? (
          <Check className="size-4" strokeWidth={2.8} />
        ) : (
          <AlertTriangle className="size-4" />
        )}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 font-display text-base font-extrabold leading-tight">
          {title}
          {action}
        </div>
        {detail && <p className="truncate text-xs text-ink-muted">{detail}</p>}
      </div>
    </div>
  );
}

function IdleControls({
  updating,
  startBusy,
  onStart,
  onStartWithoutPending,
  onFix,
  onSetupObs,
}: {
  updating: boolean;
  startBusy: boolean;
  onStart: () => void;
  onStartWithoutPending: () => void;
  onFix: (panel: ReadinessPanel) => void;
  onSetupObs: () => void;
}) {
  const { t, tp, fmt } = useI18n();
  const config = useStore((s) => s.config!);
  const obs = useStore((s) => s.obs);
  const uploadMbps = useStore((s) => s.uploadMbps);
  const r = useReadiness();
  const shortcut = config.settings.liveShortcut
    ? shortcutLabel(config.settings.liveShortcut)
    : null;
  const pendingNames = joinNames(
    r.pending.map((p) => p.target.name || platformName(p.target.platformId, t)),
    t,
  );
  const fixLink = (
    <button
      type="button"
      onClick={() => onFix("platforms")}
      className="text-sm font-bold text-brass hover:underline"
    >
      {t("golive.bar.fix")}
    </button>
  );

  let status: ReactNode;
  let canGo = false;
  let partial = false;
  if (updating) {
    status = <StatusLine tone="warn" title={t("golive.block.updating")} />;
  } else if (r.enabled.length === 0) {
    status = (
      <StatusLine
        tone="bad"
        title={t("golive.bar.noPlatform")}
        detail={t("golive.bar.noPlatform.detail")}
        action={fixLink}
      />
    );
  } else if (r.ready.length === 0) {
    status = (
      <StatusLine
        tone="warn"
        title={t("golive.bar.pending", { names: pendingNames })}
        detail={t("golive.bar.pending.detail")}
        action={fixLink}
      />
    );
  } else if (r.pending.length > 0) {
    canGo = true;
    partial = true;
    status = (
      <StatusLine
        tone="warn"
        title={t("golive.bar.pending", { names: pendingNames })}
        detail={t("golive.bar.partial.detail", { names: pendingNames })}
        action={fixLink}
      />
    );
  } else {
    canGo = true;
    const est = estimate(config);
    const fit = bandFit(est.uploadKbps, uploadMbps);
    const obsChecked = obs !== null && obs !== "loading";
    status =
      obsChecked && !obsConfigured(obs) ? (
        <StatusLine
          tone="warn"
          title={t("golive.bar.obs")}
          detail={t("golive.bar.obs.detail")}
          action={
            <button
              type="button"
              onClick={onSetupObs}
              className="text-sm font-bold text-brass hover:underline"
            >
              {t("golive.obs.fixForMe")}
            </button>
          }
        />
      ) : (
        <StatusLine
          tone={fit === "bad" ? "warn" : "ok"}
          title={t(
            fit === "bad" ? "golive.bar.readyTight" : "golive.bar.ready",
          )}
          detail={[
            tp("golive.bar.readyCount", r.ready.length),
            t(modeTitleKey(config.mode)),
            uploadMbps != null &&
              t("golive.bar.readyUpload", {
                need: fmt.dec(est.uploadKbps / 1000, 1),
                have: fmt.num(uploadMbps),
              }),
          ]
            .filter(Boolean)
            .join(" · ")}
        />
      );
  }

  return (
    <>
      {status}
      <Button
        variant="tomato"
        size="lg"
        className="shrink-0"
        disabled={!canGo || startBusy}
        loading={startBusy}
        onClick={partial ? onStartWithoutPending : onStart}
        aria-label={
          partial
            ? t("golive.cta.aria.partial", { names: pendingNames })
            : t("golive.cta.aria")
        }
      >
        {!startBusy && <Radio className="size-6" strokeWidth={2.5} />}
        <span className="flex flex-col items-start leading-none">
          <span>{t("golive.cta")}</span>
          {partial ? (
            <span className="mt-1 font-sans text-[11px] font-bold opacity-80">
              {t("golive.cta.without", { names: pendingNames })}
            </span>
          ) : (
            shortcut && (
              <span className="mt-1 font-sans text-[11px] font-bold opacity-70">
                {shortcut}
              </span>
            )
          )}
        </span>
      </Button>
    </>
  );
}

function LiveControls({ onStop }: { onStop: () => Promise<void> }) {
  const { t, fmt, locale } = useI18n();
  const startedAt = useStore((s) => s.snapshot.startedAt);
  const markShortcut = useStore((s) => s.config?.settings.markMomentShortcut);
  const viewers = useStore((s) => s.viewers);
  const onAirCount = useStore(
    (s) =>
      Object.values(s.snapshot.targets).filter(
        (x) => x.state === "live" || x.state === "brb",
      ).length,
  );
  const total = useStore(
    (s) => s.config?.targets.filter((x) => x.enabled).length ?? 0,
  );
  const now = useNow(true);
  const stopStep = useConfirm(3000, { minDelayMs: 400 });
  const onMark = async () => {
    try {
      announceMark(await api.markMoment(), { t, locale });
    } catch {
      /* Marker failures must not interrupt the active stream. */
    }
  };
  const onStopClick = () => {
    // minDelayMs requires a pause between clicks, so an accidental double-click cannot stop the stream.
    if (stopStep.confirm()) void onStop();
  };
  return (
    <>
      <div className="flex shrink-0 items-center gap-4">
        <span className="flex items-center gap-2 text-sm font-semibold text-ink-muted xl:hidden">
          <span className="live-dot size-2 rounded-full bg-live" />
          {t("golive.bar.liveCount", { live: onAirCount, total })}
        </span>
        <span className="hidden h-11 shrink-0 -rotate-1 items-center gap-2.5 rounded-md bg-live px-3.5 text-white pop-sm xl:flex">
          <span className="live-dot size-2.5 rounded-full bg-white" />
          <span className="font-display text-base font-extrabold uppercase tracking-wide">
            {t("golive.timer.onAir")}
          </span>
          <span className="font-display text-lg font-extrabold tabular-nums">
            {fmtUptime(startedAt ? (now - startedAt) / 1000 : 0)}
          </span>
        </span>
        {showAudience(viewers) && (
          <span
            className="hidden items-center gap-1.5 sm:flex"
            title={audienceTooltip(viewers.items, { t, fmt })}
          >
            <Eye className="size-4 text-ink-faint" />
            <span className="font-display text-xl font-extrabold leading-none tabular-nums">
              {audienceTotal(viewers, fmt)}
            </span>
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              {t("golive.viewers.label")}
            </span>
          </span>
        )}
      </div>
      <span className="flex-1" />
      <Button
        variant="subtle"
        onClick={() => void onMark()}
        title={
          markShortcut
            ? t("golive.marker.titleShortcut", {
                shortcut: shortcutLabel(markShortcut),
              })
            : t("golive.marker.title")
        }
      >
        <MapPin className="size-4" /> {t("golive.marker.button")}
      </Button>
      <BrbNowButton live size="md" />
      <Button
        variant="danger"
        onClick={onStopClick}
        className={cn(stopStep.armed && "bg-bad text-night hover:bg-bad")}
      >
        <Square className="size-4" />{" "}
        {stopStep.armed ? t("golive.stop.confirm") : t("golive.stop")}
      </Button>
    </>
  );
}
