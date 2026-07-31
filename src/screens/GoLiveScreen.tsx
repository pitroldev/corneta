import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import * as Collapsible from "@radix-ui/react-collapsible";
import {
  Check,
  Radio,
  Square,
  Gauge,
  Wifi,
  Zap,
  AlertTriangle,
  Loader2,
  Pause,
  Play,
  ClipboardCheck,
  MapPin,
  ExternalLink,
  Eye,
  Shield,
  RefreshCw,
  FileText,
  ChevronDown,
  Megaphone,
} from "lucide-react";
import { useStore } from "../lib/store";
import { api, START_CANCELLED } from "../lib/api";
import { obsIngestUrl } from "../lib/factory";
import { bandFit, effectiveAction, estimate } from "../lib/estimates";
import { PLATFORMS } from "../lib/platforms";
import { toast } from "../lib/toast";
import { cn, errMsg, fmtUptime, openExternal } from "../lib/utils";
import type { EngineState, ObsCheck, TargetState } from "../lib/types";
import type { Screen } from "../components/Sidebar";
import { blockingIssues } from "../lib/validation";
import { rich, useI18n, useT } from "../lib/i18n";
import {
  Badge,
  Button,
  Card,
  CopyField,
  ExperimentalBadge,
  PlatformGlyph,
  SectionTitle,
} from "../components/ui";
import { ObsWizard } from "../components/ObsWizard";
import { ObsQualityGuide } from "../components/ObsQualityGuide";
import { FirstLiveChecklist } from "../components/FirstLiveChecklist";

let prewarmedUpload = false;
// "Liga no OBS" auto-abre UMA vez por execução do app (module-level: useRef resetava a
// cada troca de tela e o acordeão reabria em toda visita).
let autoOpenedObsOnce = false;
// Quem transmite sem OBS local (fonte RTMP externa) dispensa o pré-voo pra sempre.
const SKIP_PREFLIGHT_FLAG = "corneta.skipObsPreflight";

export function GoLiveScreen({
  onNavigate,
}: {
  onNavigate?: (s: Screen) => void;
}) {
  const { t, fmt } = useI18n();
  const config = useStore((s) => s.config)!;
  const snapshot = useStore((s) => s.snapshot);
  const viewers = useStore((s) => s.viewers);
  const start = useStore((s) => s.start);
  const stop = useStore((s) => s.stop);
  const toggleTarget = useStore((s) => s.toggleTarget);
  const uploadMbps = useStore((s) => s.uploadMbps);
  const runUploadTest = useStore((s) => s.runUploadTest);
  const encoders = useStore((s) => s.encoders);
  const refreshEncoders = useStore((s) => s.refreshEncoders);
  const goLiveFocus = useStore((s) => s.goLiveFocus);
  const setGoLiveFocus = useStore((s) => s.setGoLiveFocus);
  const setSettingsTab = useStore((s) => s.setSettingsTab);
  const openSecurity = () => {
    setSettingsTab("seguranca");
    onNavigate?.("settings");
  };

  const state = snapshot.state;
  const live = state === "live";
  const starting = state === "starting";
  const enabled = useMemo(
    () => config.targets.filter((target) => target.enabled),
    [config.targets],
  );
  const problems = useMemo(
    () =>
      enabled
        .map((target) => ({ target, issues: blockingIssues(target, t) }))
        .filter((p) => p.issues.length > 0),
    [enabled, t],
  );
  const canStart = enabled.length > 0 && problems.length === 0;
  // Motivo do BORA estar travado (pra leitor de tela e legenda — o tooltip nativo
  // não dispara em botão desabilitado).
  const blockReason =
    enabled.length === 0
      ? t("golive.block.noPlatform")
      : problems.length > 0
        ? t("golive.block.fixTarget", {
            nome: problems[0].target.name || t("golive.target.noName"),
            problemas: problems[0].issues.join(", "),
          })
        : "";

  // Avisa quando o OBS realmente conecta (stopped/starting → live).
  // Inicia com o estado ATUAL: se a tela montar já "live" (voltou pra aba
  // durante a transmissão), não é transição — não re-dispara o toast.
  const prevState = useRef<EngineState>(state);
  useEffect(() => {
    if (state === "live" && prevState.current !== "live") {
      toast.success(t("golive.toast.live"));
    }
    prevState.current = state;
  }, [state, t]);

  useEffect(() => {
    if (goLiveFocus) setGoLiveFocus(false);
  }, [goLiveFocus, setGoLiveFocus]);

  const est = useMemo(() => estimate(config), [config]);
  const neededMbps = est.uploadKbps / 1000;

  // Mesma régua da tela Qualidade (bandFit, margem 1.2x) — antes cada tela media diferente.
  const fit = bandFit(est.uploadKbps, uploadMbps);
  const bandTone = fit === "unknown" ? "default" : fit;

  const [testing, setTesting] = useState(false);
  const [showObs, setShowObs] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [obsOpen, setObsOpen] = useState(false);

  useEffect(() => {
    if (encoders.length === 0) void refreshEncoders();
  }, [encoders.length, refreshEncoders]);
  // Estado do OBS vem do store (compartilhado com o checklist/Configurações, cache de 5s).
  const obs = useStore((s) => s.obs);
  const runObsCheck = useStore((s) => s.runObsCheck);
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

  // Pré-aquece a medição de banda na 1ª visita (fora do ar) pra a tela já chegar pronta.
  useEffect(() => {
    if (prewarmedUpload || live || starting || uploadMbps != null) return;
    prewarmedUpload = true;
    setTesting(true);
    runUploadTest()
      .catch(() => {})
      .finally(() => setTesting(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fora do ar, o status do OBS se mantém FRESCO (a cada 6s + no foco da janela) — o badge
  // "não configurado" mentia depois que o usuário abria o OBS.
  useEffect(() => {
    if (live || starting) return;
    void runObsCheck();
    const id = setInterval(() => void runObsCheck(), 6000);
    const onFocus = () => void runObsCheck();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, starting]);

  // "Liga no OBS" abre SOZINHO (uma vez por execução) quando o primeiro check dá "não
  // configurado" — a ação mais importante do primeiro uso nascia escondida num acordeão.
  useEffect(() => {
    if (autoOpenedObsOnce) return;
    if (
      obs !== null &&
      obs !== "loading" &&
      !(obs.reachable && obs.pointingAtCorneta)
    ) {
      autoOpenedObsOnce = true;
      setObsOpen(true);
    }
  }, [obs]);

  // Guarda contra duplo clique: o snapshot "starting" demora a voltar do
  // backend (o start() ainda salva a config antes do IPC), então trava local.
  const [startBusy, setStartBusy] = useState(false);
  // Pré-voo: OBS sabidamente fora do lugar no clique do BORA → oferece o conserto antes.
  const [preflightWarn, setPreflightWarn] = useState(false);
  const doStart = async () => {
    if (startBusy) return;
    setPreflightWarn(false);
    setStartBusy(true);
    try {
      const obsRes = await start();
      // O toast conta a VERDADE do momento — "No ar!" só sai na transição real (efeito acima).
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
      // Cancelou no meio do setup? Sem toast de erro — quem cancelou já sabe o
      // que fez. O backend devolve um CÓDIGO nesse caso, não uma frase, então a
      // comparação sobrevive a qualquer idioma.
      if (!msg.includes(START_CANCELLED))
        toast.error(t("golive.toast.startFailed", { erro: msg }));
    } finally {
      setStartBusy(false);
    }
  };
  const onStart = () => {
    let skipPreflight = false;
    try {
      skipPreflight = localStorage.getItem(SKIP_PREFLIGHT_FLAG) === "1";
    } catch {
      /* ignore */
    }
    if (
      !skipPreflight &&
      obs !== null &&
      obs !== "loading" &&
      !(obs.reachable && obs.pointingAtCorneta)
    ) {
      setPreflightWarn(true);
      return;
    }
    void doStart();
  };
  // "Ir assim mesmo" = este fluxo não usa OBS local (fonte externa) — não naga de novo.
  const skipPreflightForever = () => {
    try {
      localStorage.setItem(SKIP_PREFLIGHT_FLAG, "1");
    } catch {
      /* ignore */
    }
    void doStart();
  };
  // Socorro do limbo: 20s em "starting" sem OBS conectar → card de resgate com diagnóstico.
  const [rescue, setRescue] = useState(false);
  useEffect(() => {
    if (!starting) {
      setRescue(false);
      return;
    }
    const id = setTimeout(() => {
      setRescue(true);
      void runObsCheck(true);
    }, 20000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [starting]);

  // Cortar uma live de verdade → confirmação em 2 cliques (era a ÚNICA ação destrutiva do
  // app sem confirmação — e mora exatamente onde ficava o BORA) → relatório fresquinho.
  const [confirmStop, setConfirmStop] = useState(false);
  const confirmStopAt = useRef(0);
  const onStop = async () => {
    await stop();
    toast.action(
      t("golive.toast.stopped"),
      t("golive.toast.stopped.action"),
      () => onNavigate?.("reports"),
    );
  };
  const onStopClick = () => {
    if (!confirmStop) {
      setConfirmStop(true);
      confirmStopAt.current = Date.now();
      setTimeout(() => setConfirmStop(false), 3000);
      return;
    }
    // Duplo-clique acidental derrotaria a confirmação — o 2º clique só vale com uma
    // pausa humana depois do 1º.
    if (Date.now() - confirmStopAt.current < 400) return;
    setConfirmStop(false);
    void onStop();
  };
  // Cancelar antes de ficar no ar (não gerou live).
  const onCancel = async () => {
    await stop();
    toast.info(t("golive.toast.canceled"));
  };
  const onMark = async () => {
    try {
      await api.markMoment();
      toast.success(t("golive.toast.markerSaved"));
    } catch {
      /* sem sessão gravando */
    }
  };

  const obsConfigured =
    obs !== null && obs !== "loading" && obs.reachable && obs.pointingAtCorneta;
  const obsStatus =
    obs === null || obs === "loading"
      ? { tone: "neutral" as const, label: t("golive.obs.status.checking") }
      : obsConfigured
        ? { tone: "ok" as const, label: t("golive.obs.status.ok") }
        : obs.reachable
          ? { tone: "warn" as const, label: t("golive.obs.status.notPointing") }
          : { tone: "bad" as const, label: t("golive.obs.status.missing") };
  const bandColor =
    bandTone === "ok"
      ? "text-ok"
      : bandTone === "warn"
        ? "text-warn"
        : bandTone === "bad"
          ? "text-bad"
          : "text-ink";

  return (
    <div className="mx-auto max-w-3xl">
      <SectionTitle
        kicker={t("golive.header.kicker")}
        title={t("golive.header.title")}
        subtitle={t("golive.header.subtitle")}
      />

      {!live && !starting && (
        <FirstLiveChecklist onSetupObs={() => setShowObs(true)} />
      )}

      {state === "error" && (
        <Card className="mb-4 border-2 border-bad/40 bg-bad/10">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-bad" />
            <div>
              <div className="font-display font-bold text-bad">
                {t("golive.error.title")}
              </div>
              <div className="text-sm text-ink-muted" data-selectable>
                {snapshot.message || t("golive.error.body")}
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
        </Card>
      )}

      {/* Título + categoria pra todas as plataformas logadas, de uma tacada. */}
      <StreamInfoCard />

      {/* ---- BANCADA DE SETUP (some quando já está no ar) ---- */}
      {!live && (
        <Card className="mb-4">
          <Collapsible.Root open={obsOpen} onOpenChange={setObsOpen}>
            <Collapsible.Trigger className="group flex w-full items-center gap-2.5 text-left">
              <h3 className="text-lg">{t("golive.obs.section.title")}</h3>
              <Badge tone={obsStatus.tone}>{obsStatus.label}</Badge>
              <ChevronDown className="ml-auto size-4 shrink-0 text-ink-faint transition-transform group-data-[state=open]:rotate-180" />
            </Collapsible.Trigger>
            <Collapsible.Content className="mt-3">
              <div className="mb-3 flex items-start justify-between gap-3">
                <p className="text-xs text-ink-faint">
                  {rich(t, "golive.obs.hint", {
                    caminho: (
                      <strong className="text-ink-muted">
                        {t("golive.obs.hint.path")}
                      </strong>
                    ),
                  })}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setShowObs(true)}
                >
                  <Zap className="size-4 text-brass" strokeWidth={2.6} />{" "}
                  {t("golive.obs.fixForMe")}
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <CopyField
                  label={t("golive.obs.field.server")}
                  value={obsIngestUrl(config.ingest)}
                />
                <CopyField
                  label={t("golive.obs.field.key")}
                  value={config.ingest.key}
                  mono
                />
              </div>
              <p className="mt-3 text-xs text-ink-faint">
                {t("golive.obs.key.note")}
              </p>
              <button
                onClick={() => setShowGuide(true)}
                className="mt-2 flex items-center gap-1.5 text-xs font-bold text-brass hover:underline"
              >
                <Gauge className="size-3.5" /> {t("golive.obs.qualityGuide")}
              </button>
            </Collapsible.Content>
          </Collapsible.Root>
        </Card>
      )}

      {!live && (
        <Card className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 bg-surface-2 py-3">
          <span className="flex items-center gap-2">
            <Gauge className="size-4 text-brass" />
            <span className="text-sm font-semibold text-ink-muted">
              {t("golive.band.title")}
            </span>
          </span>
          <span className="text-sm">
            <span
              className={cn(
                "font-display text-lg font-extrabold tabular-nums",
                bandColor,
              )}
            >
              {uploadMbps == null ? "—" : fmt.num(uploadMbps)}
            </span>
            <span className="text-ink-faint">
              {" "}
              / {fmt.dec(neededMbps, 1)} Mbps
            </span>
          </span>
          {uploadMbps != null && bandTone === "bad" ? (
            <button
              onClick={() => onNavigate?.("encoding")}
              className="text-xs font-bold text-bad hover:underline"
            >
              {t("golive.band.tooTight")}
            </button>
          ) : uploadMbps != null && bandTone === "warn" ? (
            <button
              onClick={() => onNavigate?.("encoding")}
              className="text-xs font-bold text-warn hover:underline"
            >
              {t("golive.band.atEdge")}
            </button>
          ) : null}
          <Button
            variant="subtle"
            size="sm"
            className="ml-auto"
            onClick={onTest}
            loading={testing}
            disabled={testing || starting}
            title={starting ? t("golive.band.test.disabledTitle") : undefined}
          >
            {!testing && <Wifi className="size-4" />}
            {testing ? t("golive.band.testing") : t("golive.band.test")}
          </Button>
        </Card>
      )}

      {!live && !starting && problems.length > 0 && (
        <Card className="mb-4 bg-warn/10">
          <div className="flex items-center gap-2 text-sm font-bold text-warn">
            <AlertTriangle className="size-4" /> {t("golive.problems.title")}
          </div>
          <ul className="mt-1.5 space-y-1.5 text-sm text-ink-muted">
            {problems.map((p) => (
              <li
                key={p.target.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1"
              >
                <span>
                  <strong className="text-ink">
                    {p.target.name || t("golive.target.noName")}
                  </strong>
                  : {p.issues.join(", ")}
                </span>
                {/* A saída fica a 1 clique — antes o usuário travava numa plataforma que nunca tocou. */}
                <button
                  onClick={() => onNavigate?.("platforms")}
                  className="text-xs font-bold text-brass hover:underline"
                >
                  {t("golive.problems.pasteKey")}
                </button>
                <button
                  onClick={() => {
                    toggleTarget(p.target.id);
                    toast.info(
                      t("golive.problems.turnedOff.toast", {
                        nome: p.target.name,
                      }),
                    );
                  }}
                  className="text-xs font-bold text-ink-faint hover:text-ink hover:underline"
                >
                  {t("golive.problems.turnOff")}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!live && !starting && enabled.length === 0 && (
        <Card className="mb-4 bg-surface-2 text-sm text-ink-muted">
          {rich(t, "golive.empty.noPlatforms", {
            // Nome da tela — a chave é da área de Plataformas de propósito, pra
            // as duas telas dizerem a mesma palavra.
            plataformas: (
              <strong className="text-ink">{t("platforms.title")}</strong>
            ),
          })}
        </Card>
      )}

      {!live && !starting && (
        <Checkup
          obs={obs}
          onRecheck={runObs}
          onGuide={() => setShowGuide(true)}
        />
      )}

      {/* Confirma a rede de proteção ANTES do BORA (e durante, lá embaixo). */}
      {!live && !starting && <SecurityPanel onAdjust={openSecurity} />}

      {/* ---- SALA DE GUERRA (sobe pro topo quando está no ar) ---- */}
      {(live || starting) && (
        <>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <LiveTimer startedAt={snapshot.startedAt} live={live} />
              {viewers.total > 0 && (
                <span className="flex items-center gap-1.5">
                  <Eye className="size-4 text-ink-faint" />
                  <span className="font-display text-2xl font-extrabold leading-none tabular-nums">
                    {fmt.num(viewers.total)}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                    {t("golive.viewers.label")}
                  </span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <BrbNowButton live={live} />
              <Button
                variant="subtle"
                size="sm"
                onClick={onMark}
                disabled={!live}
                title={
                  live ? t("golive.marker.title") : t("golive.onlyWhenLive")
                }
              >
                <MapPin className="size-4" /> {t("golive.marker.button")}
              </Button>
            </div>
          </div>

          {/* O sinal do OBS SUMIU no meio da live (sem JÁ VOLTO): urgência máxima. */}
          {live &&
            enabled.some(
              (t) => snapshot.targets[t.id]?.state === "signal-lost",
            ) && (
              <Card className="mb-2 border-2 border-bad/40 bg-bad/10">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 size-5 shrink-0 text-bad" />
                  <div className="min-w-0 flex-1">
                    <div className="font-display font-bold text-bad">
                      {t("golive.signalLost.title")}
                    </div>
                    <div className="text-sm text-ink-muted">
                      {t("golive.signalLost.body")}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
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
                  <Badge tone={obsStatus.tone}>
                    {t("golive.obs.badge", { status: obsStatus.label })}
                  </Badge>
                </div>
              </Card>
            )}

          {/* Resgate do limbo: 20s aguardando o OBS sem sinal → diagnóstico e saída. */}
          {starting && rescue && (
            <Card className="mb-2 border-2 border-warn/40 bg-warn/10">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warn" />
                <div className="min-w-0 flex-1">
                  <div className="font-display font-bold text-warn">
                    {t("golive.rescue.title")}
                  </div>
                  <div className="text-sm text-ink-muted">
                    {rich(t, "golive.rescue.body", {
                      botao: (
                        <strong className="text-ink">
                          {t("golive.obs.startStreamingButton")}
                        </strong>
                      ),
                    })}{" "}
                    {obs !== null && obs !== "loading" && !obs.reachable
                      ? t("golive.rescue.notReachable")
                      : obs !== null &&
                          obs !== "loading" &&
                          !obs.pointingAtCorneta
                        ? t("golive.rescue.notPointing")
                        : null}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
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
              </div>
            </Card>
          )}

          <Card className="mb-2 flex flex-wrap items-center gap-x-6 gap-y-2 bg-surface-2 py-3">
            <span className="text-xs font-bold uppercase tracking-wide text-ink-faint">
              {t("golive.machine.label")}
            </span>
            <Usage label="CPU" value={snapshot.cpu} />
            <Usage label="GPU" value={snapshot.gpu} />
          </Card>

          <SecurityPanel onAdjust={openSecurity} />

          <div className="mb-4 flex flex-col gap-2">
            <AnimatePresence>
              {enabled.map((target, i) => {
                const st = snapshot.targets[target.id];
                const paused = st?.state === "paused";
                // Métricas só quando há transmissão de verdade — semear com o preset fazia
                // um destino travado parecer saudável ("6.0 Mbps / 60 FPS" sem nada fluindo).
                const flowing = st?.state === "live" || st?.state === "brb";
                return (
                  <motion.div
                    key={target.id}
                    layout
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{
                      delay: i * 0.05,
                      type: "spring",
                      stiffness: 320,
                      damping: 28,
                    }}
                  >
                    <Card className="flex items-center gap-4 bg-surface-2 py-3">
                      <PlatformGlyph id={target.platformId} size={36} />
                      <div className="min-w-32 flex-1">
                        <div className="font-display font-bold">
                          {target.name}
                        </div>
                        <StatePill state={st?.state ?? "idle"} />
                        {st?.message && (
                          <div className="mt-0.5 text-[11px] text-bad">
                            {st.message}
                          </div>
                        )}
                        {st?.state === "error" && (
                          <div className="mt-0.5 flex flex-wrap gap-x-3">
                            {/* Retry sem cortar a live: o backend relê a chave do cofre. */}
                            <button
                              onClick={() =>
                                void api
                                  .retryTarget(target.id)
                                  .catch((e) => toast.error(errMsg(e)))
                              }
                              className="text-[11px] font-bold text-brass hover:underline"
                            >
                              {t("golive.target.retry")}
                            </button>
                            <button
                              onClick={() => onNavigate?.("platforms")}
                              className="text-[11px] font-bold text-brass hover:underline"
                            >
                              {t("golive.target.swapKey")}
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="hidden gap-6 sm:flex">
                        <MiniStat
                          label={t("golive.stat.bitrate")}
                          value={
                            flowing ? fmt.bitrate(st?.bitrateKbps ?? 0) : "—"
                          }
                        />
                        <MiniStat
                          label={t("golive.stat.fps")}
                          value={flowing ? String(st?.fps ?? 0) : "—"}
                        />
                        <MiniStat
                          label={t("golive.stat.drops")}
                          value={flowing ? String(st?.droppedFrames ?? 0) : "—"}
                          tone={
                            flowing && st && st.droppedFrames > 0
                              ? "warn"
                              : "default"
                          }
                        />
                        <MiniStat
                          label={t("golive.stat.uptime")}
                          value={flowing ? fmtUptime(st?.uptimeSec ?? 0) : "—"}
                        />
                      </div>
                      {/* Em telas estreitas mantém ao menos Bitrate + Quedas. */}
                      <div className="flex gap-4 sm:hidden">
                        <MiniStat
                          label={t("golive.stat.bitrate")}
                          value={
                            flowing ? fmt.bitrate(st?.bitrateKbps ?? 0) : "—"
                          }
                        />
                        <MiniStat
                          label={t("golive.stat.drops")}
                          value={flowing ? String(st?.droppedFrames ?? 0) : "—"}
                          tone={
                            flowing && st && st.droppedFrames > 0
                              ? "warn"
                              : "default"
                          }
                        />
                      </div>
                      {PLATFORMS[target.platformId].liveUrl && (
                        <button
                          onClick={() =>
                            void openExternal(
                              PLATFORMS[target.platformId].liveUrl!,
                            )
                          }
                          className="grid size-9 place-items-center rounded-md text-ink-faint transition-colors hover:bg-surface-3 hover:text-ink"
                          title={t("golive.target.openChannel.title")}
                          aria-label={t("golive.target.openChannel.aria", {
                            nome: target.name,
                          })}
                        >
                          <ExternalLink className="size-4" />
                        </button>
                      )}
                      <button
                        onClick={() =>
                          void api.setTargetPaused(target.id, !paused)
                        }
                        className={cn(
                          "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-bold uppercase tracking-wide transition-colors",
                          paused
                            ? "bg-brass/15 text-brass hover:bg-brass/25"
                            : "bg-surface-3 text-ink-muted hover:text-ink",
                        )}
                        title={
                          paused
                            ? t("golive.target.resume.title")
                            : t("golive.target.pause.title")
                        }
                      >
                        {paused ? (
                          <Play className="size-3.5" />
                        ) : (
                          <Pause className="size-3.5" />
                        )}
                        {paused
                          ? t("golive.target.resume")
                          : t("golive.target.pause")}
                      </button>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </>
      )}

      {/* ---- BOTÃO PRINCIPAL (rodapé fixo) ---- */}
      <div className="sticky -bottom-8 z-10 mt-4 border-t-2 border-border bg-bg pb-3 pt-3">
        {/* Pré-voo: o OBS não está pronto — avisa SEM bloquear (dá pra ir assim mesmo). */}
        {preflightWarn && !live && !starting && (
          <div className="mb-2 rounded-md border-2 border-warn/40 bg-warn/10 p-3">
            <div className="flex items-center gap-2 text-sm font-bold text-warn">
              <AlertTriangle className="size-4 shrink-0" />{" "}
              {t("golive.preflight.title")}
            </div>
            <p className="mt-0.5 text-xs text-ink-muted">
              {t("golive.preflight.body")}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setPreflightWarn(false);
                  setShowObs(true);
                }}
              >
                <Zap className="size-4" /> {t("golive.obs.fixForMe")}
              </Button>
              <Button variant="subtle" size="sm" onClick={skipPreflightForever}>
                {t("golive.preflight.goAnyway")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPreflightWarn(false)}
              >
                {t("golive.cancel")}
              </Button>
            </div>
          </div>
        )}
        {starting ? (
          // Status ≠ ação: o rodapé inteiro era um botãozão de cancelar — o clique ansioso
          // (costume herdado do BORA no mesmo lugar) matava a inicialização.
          <div className="flex items-stretch gap-2">
            <div className="flex h-14 flex-1 items-center justify-center gap-2.5 rounded-md bg-surface-2 font-display text-lg font-bold text-ink-muted">
              <Loader2 className="size-5 animate-spin" />{" "}
              {t("golive.starting.waiting")}
            </div>
            <Button variant="outline" size="lg" onClick={onCancel}>
              {t("golive.cancel")}
            </Button>
          </div>
        ) : live ? (
          <Button
            variant="danger"
            size="lg"
            className="w-full"
            onClick={onStopClick}
          >
            <Square className="size-5" />{" "}
            {confirmStop ? t("golive.stop.confirm") : t("golive.stop")}
          </Button>
        ) : (
          <Button
            variant="tomate"
            size="lg"
            className="w-full"
            disabled={!canStart || startBusy}
            loading={startBusy}
            onClick={onStart}
            aria-label={
              canStart
                ? t("golive.cta.aria")
                : t("golive.cta.aria.blocked", { motivo: blockReason })
            }
          >
            {!startBusy && <Radio className="size-6" strokeWidth={2.5} />}{" "}
            {t("golive.cta")}
          </Button>
        )}
        {starting && (
          <p className="mt-2 text-center text-xs text-ink-faint">
            {rich(
              t,
              config.settings.autoStartObs
                ? "golive.starting.autoObs"
                : "golive.starting.manualObs",
              {
                botao: (
                  <strong className="text-ink-muted">
                    {t("golive.obs.startStreamingButton")}
                  </strong>
                ),
              },
            )}
          </p>
        )}
        {!live && !starting && !canStart && blockReason && (
          <p className="mt-2 text-center text-xs text-ink-faint">
            {blockReason}
          </p>
        )}
      </div>

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

/** "JÁ VOLTO agora": pausa manual (banheiro/água) — slate no ar com o mic mudo, sem parar
 *  o OBS nem derrubar nada. Só funciona quando a live subiu com o JÁ VOLTO/Guardião armado
 *  (é o compositor que segura o truque); desarmado, mostra o caminho pra armar. */
function BrbNowButton({ live }: { live: boolean }) {
  const t = useT();
  const settings = useStore((s) => s.config!.settings);
  const forced = useStore((s) => s.snapshot.forcedBrb ?? false);
  const [busy, setBusy] = useState(false);
  const armed = settings.brbEnabled || settings.guardianEnabled;

  // Com o slate manual NO AR, o botão "Voltei!" nunca some — mesmo que o streamer desarme
  // o JÁ VOLTO nas Configurações no meio da live (senão o aviso ficava preso sem saída).
  if (!armed && !forced) {
    return live ? (
      <span className="max-w-52 text-right text-[11px] leading-tight text-ink-faint">
        {rich(t, "golive.brb.armHint", {
          // Nome próprio, sem glosa: quem lê isto já viu a glosa no painel
          // "Seu segurança" logo acima.
          jaVolto: (
            <strong className="text-ink-muted">
              {t("golive.bar.protection.brb")}
            </strong>
          ),
        })}
      </span>
    ) : null;
  }

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.setForceBrb(!forced);
      toast.success(
        forced ? t("golive.brb.toast.back") : t("golive.brb.toast.on"),
      );
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant={forced ? "tomate" : "subtle"}
      size="sm"
      onClick={toggle}
      disabled={!live || busy}
      title={
        live
          ? forced
            ? t("golive.brb.title.back")
            : t("golive.brb.title.on")
          : t("golive.onlyWhenLive")
      }
    >
      {forced ? <Play className="size-4" /> : <Pause className="size-4" />}
      {forced ? t("golive.brb.back") : t("golive.brb.now")}
    </Button>
  );
}

const PLAT_LABEL: Record<string, string> = {
  twitch: "Twitch",
  youtube: "YouTube",
  kick: "Kick",
};

/** Define título (+jogo) da live em todas as plataformas logadas de uma vez. */
function StreamInfoCard() {
  const t = useT();
  const chatLogin = useStore((s) => s.chatLogin);
  const settings = useStore((s) => s.config!.settings);
  const setSettings = useStore((s) => s.setSettings);
  const requestNavigate = useStore((s) => s.requestNavigate);
  const requestChatConfig = useStore((s) => s.requestChatConfig);
  const ready = {
    twitch: chatLogin.twitch.state === "connected",
    youtube: chatLogin.youtube.state === "connected",
    kick: chatLogin.kick.state === "connected",
  };
  const targets = (["twitch", "youtube", "kick"] as const).filter(
    (p) => ready[p],
  );
  const [title, setTitleLocal] = useState(settings.streamTitle ?? "");
  const [game, setGame] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Record<
    string,
    { ok: boolean; error?: string; warn?: string }
  > | null>(null);

  // Teaser: sem conta logada o recurso era INVISÍVEL — e a chave pra destravar (login)
  // morava escondida em Chat → Configurar → Conta. Agora ele se apresenta e leva até lá.
  if (targets.length === 0) {
    return (
      <Card className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h3 className="flex items-center gap-2 text-lg">
          <Megaphone className="size-5 text-brass" />{" "}
          {t("golive.streamInfo.title")}
        </h3>
        <p className="min-w-48 flex-1 text-xs text-ink-faint">
          {t("golive.streamInfo.teaser")}
        </p>
        <Button
          variant="subtle"
          size="sm"
          onClick={() => {
            requestChatConfig("conta");
            requestNavigate("chat");
          }}
        >
          {t("golive.streamInfo.signIn")}
        </Button>
      </Card>
    );
  }

  // O título é lembrado entre sessões — alimenta o broadcast automático do YouTube.
  const persistTitle = () => {
    const trimmed = title.trim();
    if (trimmed !== settings.streamTitle) setSettings({ streamTitle: trimmed });
  };
  const onTitle = (v: string) => {
    setTitleLocal(v);
    setResults(null);
  };
  const onGame = (v: string) => {
    setGame(v);
    setResults(null);
  };

  const apply = async () => {
    if (busy) return;
    if (!title.trim()) {
      toast.error(t("golive.streamInfo.needTitle"));
      return;
    }
    persistTitle();
    setBusy(true);
    setResults(null);
    try {
      const r = await api.setStreamInfo(title.trim(), game.trim() || undefined);
      setResults(r);
      const okN = Object.values(r).filter((x) => x.ok).length;
      const total = Object.keys(r).length;
      if (okN === total)
        toast.success(t("golive.streamInfo.applied", { n: okN }));
      else toast.error(t("golive.streamInfo.partial", { ok: okN, total }));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mb-4">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-2 text-lg">
          <Megaphone className="size-5 text-brass" />{" "}
          {t("golive.streamInfo.title")}
        </h3>
        <div className="ml-auto flex items-center gap-1.5">
          {targets.map((p) => (
            <span
              key={p}
              className="flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-bold text-ink-muted"
            >
              <PlatformGlyph id={p} size={13} /> {PLAT_LABEL[p]}
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <input
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          onBlur={persistTitle}
          onKeyDown={(e) =>
            e.key === "Enter" && !busy && title.trim() && void apply()
          }
          placeholder={t("golive.streamInfo.title.placeholder")}
          maxLength={140}
          className="h-10 rounded-md border-2 border-border bg-surface px-3 text-sm font-medium text-ink outline-none focus:border-brass"
        />
        <div className="flex gap-2">
          <input
            value={game}
            onChange={(e) => onGame(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" && !busy && title.trim() && void apply()
            }
            placeholder={t("golive.streamInfo.game.placeholder")}
            className="h-10 flex-1 rounded-md border-2 border-border bg-surface px-3 text-sm font-medium text-ink outline-none focus:border-brass"
          />
          <Button
            variant="primary"
            onClick={apply}
            loading={busy}
            disabled={busy || !title.trim()}
          >
            {!busy && <Megaphone className="size-4" />}{" "}
            {t("golive.streamInfo.apply")}
          </Button>
        </div>
      </div>
      {results && (
        <div className="mt-2.5 flex flex-col gap-1">
          {Object.entries(results).map(([p, r]) => (
            <div key={p} className="flex min-w-0 items-center gap-1.5 text-xs">
              {!r.ok ? (
                <AlertTriangle className="size-3.5 shrink-0 text-bad" />
              ) : r.warn ? (
                <AlertTriangle className="size-3.5 shrink-0 text-warn" />
              ) : (
                <Check
                  className="size-3.5 shrink-0 text-ok"
                  strokeWidth={2.6}
                />
              )}
              <span className="shrink-0 font-semibold">
                {PLAT_LABEL[p] ?? p}
              </span>
              {!r.ok && <span className="truncate text-bad">· {r.error}</span>}
              {r.ok && r.warn && (
                <span className="truncate text-warn">· {r.warn}</span>
              )}
            </div>
          ))}
        </div>
      )}
      {ready.youtube && (
        <>
          <button
            onClick={() =>
              setSettings({ youtubeAutoLive: !settings.youtubeAutoLive })
            }
            className="mt-2.5 flex w-full items-center gap-2 rounded-md bg-surface-2 px-2.5 py-2 text-left"
          >
            <span
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded border-2 transition-colors",
                settings.youtubeAutoLive
                  ? "border-brass bg-brass text-brass-ink"
                  : "border-border text-transparent",
              )}
            >
              <Check className="size-3.5" strokeWidth={3} />
            </span>
            <span className="text-xs leading-snug">
              <strong className="text-ink">
                {t("golive.streamInfo.youtubeAuto.title")}
              </strong>
              <span className="text-ink-faint">
                {t("golive.streamInfo.youtubeAuto.desc")}
              </span>
            </span>
          </button>
          <p className="mt-1.5 text-[11px] text-ink-faint">
            {rich(t, "golive.streamInfo.youtubeNote", {
              // Sem chave pro substantivo solto ("título"): o destaque cita o
              // rótulo do campo logo acima, que é a mesma coisa por extenso.
              titulo: (
                <strong className="text-ink-muted">
                  {t("golive.streamInfo.title")}
                </strong>
              ),
            })}
          </p>
        </>
      )}
    </Card>
  );
}

/** Painel "Seu segurança": Guardião / JÁ VOLTO / Auto-bitrate visíveis e confirmáveis. */
function SecurityPanel({ onAdjust }: { onAdjust: () => void }) {
  const t = useT();
  const settings = useStore((s) => s.config!.settings);
  const watchCount = settings.guardianWatchlist.filter(
    (term) => term.trim().length >= 3,
  ).length;
  const items = [
    {
      on: settings.guardianEnabled && watchCount > 0,
      label: t("golive.security.guardian.label"),
      desc: settings.guardianEnabled
        ? watchCount > 0
          ? t("golive.security.guardian.watching", { n: watchCount })
          : t("golive.security.guardian.noTerms")
        : t("golive.security.disabled"),
      experimental: true,
      // Experimental fica oculto aqui no Ao vivo até ser ligado nas Configurações.
      show: settings.guardianEnabled,
    },
    {
      on: settings.brbEnabled,
      label: t("golive.security.brb.label"),
      desc: settings.brbEnabled
        ? t("golive.security.brb.desc")
        : t("golive.security.disabled"),
      experimental: false,
      show: true,
    },
    {
      on: settings.autoBitrate,
      label: t("golive.security.bitrate.label"),
      desc: settings.autoBitrate
        ? t("golive.security.bitrate.desc")
        : t("golive.security.disabled"),
      experimental: false,
      show: true,
    },
    {
      on: settings.loudnessNormalize,
      label: t("golive.security.loudness.label"),
      desc: t("golive.security.loudness.desc"),
      experimental: false,
      show: settings.loudnessNormalize, // opt-in → só aparece quando ligado
    },
  ].filter((it) => it.show);
  return (
    <Card accent className="mb-2 bg-surface-2">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-lg">
          <Shield className="size-5 text-brass" /> {t("golive.security.title")}
        </h3>
        <Button variant="ghost" size="sm" onClick={onAdjust}>
          {t("golive.security.adjust")}
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        {items.map((it) => (
          <div key={it.label} className="flex items-center gap-2 text-sm">
            <Badge tone={it.on ? "brass" : "neutral"}>
              {it.on ? t("golive.security.armed") : t("golive.security.off")}
            </Badge>
            <span className="font-semibold">{it.label}</span>
            {it.experimental && <ExperimentalBadge />}
            <span className="text-xs text-ink-faint">· {it.desc}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function LiveTimer({
  startedAt,
  live,
}: {
  startedAt: number | null;
  live: boolean;
}) {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!live) {
    return (
      <div className="flex items-center gap-2 text-info">
        <span className="size-2.5 rounded-full bg-info animate-pulse" />
        <span className="font-display text-sm font-bold uppercase tracking-wide">
          {t("golive.timer.waiting")}
        </span>
      </div>
    );
  }
  const secs = startedAt ? (now - startedAt) / 1000 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="size-2.5 rounded-full bg-live live-dot" />
      <span className="font-display text-2xl font-extrabold leading-none tabular-nums">
        {fmtUptime(secs)}
      </span>
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
        {t("golive.timer.onAir")}
      </span>
    </div>
  );
}

function Checkup({
  obs,
  onRecheck,
  onGuide,
}: {
  obs: ObsCheck | "loading" | null;
  onRecheck: () => void;
  onGuide?: () => void;
}) {
  const { t, fmt } = useI18n();
  const config = useStore((s) => s.config)!;
  const encoders = useStore((s) => s.encoders);
  const uploadMbps = useStore((s) => s.uploadMbps);
  const enabled = config.targets.filter((target) => target.enabled);
  const neededKbps = estimate(config).uploadKbps;
  const needed = neededKbps / 1000;
  // Mesma régua (margem 1.2x) das telas Qualidade e Banda — o check-up dava verde
  // exatamente onde as outras telas diziam "no limite".
  const upFit = bandFit(neededKbps, uploadMbps);

  return (
    <Card className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-lg">
          <ClipboardCheck className="size-5 text-brass" />{" "}
          {t("golive.checkup.title")}
        </h3>
        <Button
          variant="subtle"
          size="sm"
          onClick={onRecheck}
          loading={obs === "loading"}
          disabled={obs === "loading"}
        >
          {obs !== "loading" && <Zap className="size-4 text-brass" />}
          {t("golive.obs.check")}
        </Button>
      </div>
      <div className="flex flex-col gap-1.5">
        <CheckRow
          label={t("golive.checkup.encoder")}
          ok={encoders.some((e) => e.available)}
          warn={encoders.length === 0}
          detail={
            encoders.length === 0 ? t("golive.checkup.checking") : undefined
          }
        />
        <CheckRow
          label={t("golive.checkup.keys")}
          ok={
            enabled.length > 0 &&
            enabled.every((target) => blockingIssues(target, t).length === 0)
          }
          detail={
            enabled.length === 0 ? t("golive.checkup.keys.none") : undefined
          }
        />
        <CheckRow
          label={t("golive.checkup.upload")}
          ok={upFit === "ok"}
          warn={upFit === "unknown" || upFit === "warn"}
          detail={
            upFit === "unknown"
              ? t("golive.checkup.upload.untested")
              : t(
                  upFit === "warn"
                    ? "golive.checkup.upload.detail.tight"
                    : "golive.checkup.upload.detail",
                  {
                    atual: fmt.num(uploadMbps ?? 0),
                    necessario: fmt.dec(needed, 1),
                  },
                )
          }
        />
        {obs && obs !== "loading" && (
          <>
            <CheckRow
              label={t("golive.checkup.obsConnected")}
              ok={obs.reachable}
              warn={!obs.reachable}
              detail={
                obs.reachable ? undefined : t("golive.checkup.obsConnected.fix")
              }
            />
            {obs.reachable && (
              <CheckRow
                label={t("golive.checkup.obsPointing")}
                ok={obs.pointingAtCorneta}
                warn={!obs.pointingAtCorneta}
                detail={
                  obs.pointingAtCorneta
                    ? `${obs.width}×${obs.height} · ${Math.round(obs.fps)}fps`
                    : t("golive.checkup.obsPointing.fix")
                }
              />
            )}
          </>
        )}
      </div>
      {/* Só quando algum destino recebe o vídeo DO OBS como saiu (cópia) — em transcode a
          Corneta já força GOP 2s/CBR e a dica viraria ruído. E agora diz ONDE fica. */}
      {enabled.some(
        (target) => effectiveAction(config.mode, target) === "copy",
      ) && (
        <p className="mt-2 text-xs text-ink-faint">
          {rich(t, "golive.checkup.tip", {
            caminho: (
              <strong className="text-ink-muted">
                {t("golive.checkup.tip.path")}
              </strong>
            ),
            taxa: (
              <strong className="text-ink-muted">
                {t("golive.checkup.tip.rateControl")}
              </strong>
            ),
            keyframe: (
              <strong className="text-ink-muted">
                {t("golive.checkup.tip.keyframe")}
              </strong>
            ),
          })}{" "}
          {onGuide && (
            <button
              onClick={onGuide}
              className="font-bold text-brass hover:underline"
            >
              {t("golive.checkup.tip.guide")}
            </button>
          )}
        </p>
      )}
    </Card>
  );
}

function CheckRow({
  label,
  ok,
  warn,
  detail,
}: {
  label: string;
  ok?: boolean;
  warn?: boolean;
  detail?: string;
}) {
  const Icon = ok ? Check : warn ? AlertTriangle : Square;
  const cls = ok ? "text-ok" : warn ? "text-warn" : "text-bad";
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
      <Icon className={cn("size-4 shrink-0", cls)} strokeWidth={2.4} />
      <span className="font-semibold">{label}</span>
      {detail && <span className="text-xs text-ink-faint">· {detail}</span>}
    </div>
  );
}

function StatePill({ state }: { state: TargetState }) {
  const t = useT();
  // As CHAVES são o enum que vem do backend — só o `label` é texto de tela.
  const map: Record<TargetState, { label: string; cls: string; dot: string }> =
    {
      idle: {
        label: t("golive.state.idle"),
        cls: "text-ink-faint",
        dot: "bg-ink-faint",
      },
      connecting: {
        label: t("golive.state.connecting"),
        cls: "text-warn",
        dot: "bg-warn",
      },
      live: {
        label: t("golive.state.live"),
        cls: "text-ok",
        dot: "bg-live live-dot",
      },
      reconnecting: {
        label: t("golive.state.reconnecting"),
        cls: "text-warn",
        dot: "bg-warn",
      },
      error: { label: t("golive.state.error"), cls: "text-bad", dot: "bg-bad" },
      paused: {
        label: t("golive.state.paused"),
        cls: "text-ink-muted",
        dot: "bg-ink-faint",
      },
      waiting: {
        label: t("golive.state.waiting"),
        cls: "text-info",
        dot: "bg-info animate-pulse",
      },
      "signal-lost": {
        label: t("golive.state.signalLost"),
        cls: "text-bad",
        dot: "bg-bad animate-pulse",
      },
      brb: {
        label: t("golive.state.brb"),
        cls: "text-brass",
        dot: "bg-brass animate-pulse",
      },
      censor: {
        label: t("golive.state.censor"),
        cls: "text-bad",
        dot: "bg-bad animate-pulse",
      },
    };
  const m = map[state] ?? map.idle;
  return (
    <span
      className={cn(
        "mt-0.5 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide",
        m.cls,
      )}
    >
      <span className={cn("size-2 rounded-full", m.dot)} /> {m.label}
    </span>
  );
}

function MiniStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warn";
}) {
  return (
    <div className="text-right">
      <div className="text-[10px] font-bold uppercase tracking-wide text-ink-faint">
        {label}
      </div>
      <div
        className={cn(
          "font-display text-base font-extrabold tabular-nums",
          tone === "warn" ? "text-warn" : "text-ink",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Usage({ label, value }: { label: string; value?: number }) {
  const pct = value ?? 0;
  const tone = pct > 85 ? "bg-bad" : pct > 60 ? "bg-warn" : "bg-ok";
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
        {label}
      </span>
      <div className="h-2 w-24 overflow-hidden rounded-sm bg-surface">
        <div
          className={cn("h-full rounded-sm", tone)}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <span className="w-12 font-display text-sm font-bold tabular-nums">
        {value == null ? "—" : `${value}%`}
      </span>
    </div>
  );
}
