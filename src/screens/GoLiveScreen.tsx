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
import { api } from "../lib/api";
import { obsIngestUrl } from "../lib/factory";
import { bandFit, effectiveAction, estimate } from "../lib/estimates";
import { PLATFORMS } from "../lib/platforms";
import { toast } from "../lib/toast";
import { cn, errMsg, fmtBitrate, fmtUptime, openExternal } from "../lib/utils";
import type { EngineState, ObsCheck, TargetState } from "../lib/types";
import type { Screen } from "../components/Sidebar";
import { blockingIssues } from "../lib/validation";
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

export function GoLiveScreen({ onNavigate }: { onNavigate?: (s: Screen) => void }) {
  const config = useStore((s) => s.config)!;
  const snapshot = useStore((s) => s.snapshot);
  const viewers = useStore((s) => s.viewers);
  const start = useStore((s) => s.start);
  const stop = useStore((s) => s.stop);
  const toggleTarget = useStore((s) => s.toggleTarget);
  const uploadMbps = useStore((s) => s.uploadMbps);
  const runUploadTest = useStore((s) => s.runUploadTest);
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
    () => config.targets.filter((t) => t.enabled),
    [config.targets],
  );
  const problems = useMemo(
    () =>
      enabled
        .map((t) => ({ target: t, issues: blockingIssues(t) }))
        .filter((p) => p.issues.length > 0),
    [enabled],
  );
  const canStart = enabled.length > 0 && problems.length === 0;
  // Motivo do BORA estar travado (pra leitor de tela e legenda — o tooltip nativo
  // não dispara em botão desabilitado).
  const blockReason =
    enabled.length === 0
      ? "Ative ao menos uma plataforma em Plataformas."
      : problems.length > 0
        ? `Resolva ${problems[0].target.name || "(sem nome)"}: ${problems[0].issues.join(", ")} — cole a chave ou desligue a plataforma.`
        : "";

  // Avisa quando o OBS realmente conecta (stopped/starting → live).
  // Inicia com o estado ATUAL: se a tela montar já "live" (voltou pra aba
  // durante a transmissão), não é transição — não re-dispara o toast.
  const prevState = useRef<EngineState>(state);
  useEffect(() => {
    if (state === "live" && prevState.current !== "live") {
      toast.success("No ar! A corneta tá tocando 📣");
    }
    prevState.current = state;
  }, [state]);

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
  // Estado do OBS vem do store (compartilhado com o checklist/Configurações, cache de 5s).
  const obs = useStore((s) => s.obs);
  const runObsCheck = useStore((s) => s.runObsCheck);
  const runObs = () => runObsCheck(true);
  const onTest = async () => {
    setTesting(true);
    try {
      await runUploadTest();
    } catch {
      toast.error("Não consegui medir o upload — sem internet?");
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
    if (obs !== null && obs !== "loading" && !(obs.reachable && obs.pointingAtCorneta)) {
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
      if (obsRes === "obs-ok") toast.success("Mandei o OBS transmitir — entrando no ar… 📣");
      else if (obsRes === "obs-failed")
        toast.action("Não consegui dar play no OBS — dê play manualmente.", "Configurar OBS", () =>
          setShowObs(true),
        );
      else toast.success("Servidor no ar! Agora é só dar play no OBS 📣");
    } catch (e) {
      const msg = errMsg(e);
      // "Início cancelado" = o próprio usuário cancelou no meio do setup — sem drama.
      if (!msg.includes("Início cancelado")) toast.error(`Não rolou: ${msg}`);
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
    toast.action("Cortou! Tá fora do ar 👋", "Ver relatório", () => onNavigate?.("reports"));
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
    toast.info("Cancelado");
  };
  const onMark = async () => {
    try {
      await api.markMoment();
      toast.success("Momento marcado 📍 — aparece no relatório");
    } catch {
      /* sem sessão gravando */
    }
  };

  const obsConfigured =
    obs !== null && obs !== "loading" && obs.reachable && obs.pointingAtCorneta;
  const obsStatus =
    obs === null || obs === "loading"
      ? { tone: "neutral" as const, label: "verificando…" }
      : obsConfigured
        ? { tone: "ok" as const, label: "configurado" }
        : obs.reachable
          ? { tone: "warn" as const, label: "falta apontar pra cá" }
          : { tone: "bad" as const, label: "não configurado" };
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
        kicker="Solta o som"
        title="Ao vivo"
        subtitle="Liga o OBS uma vez, vê se a internet aguenta e entra no ar em todo lugar — de uma tacada."
      />

      {!live && !starting && <FirstLiveChecklist onSetupObs={() => setShowObs(true)} />}

      {state === "error" && (
        <Card className="mb-4 border-2 border-bad/40 bg-bad/10">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-bad" />
            <div>
              <div className="font-display font-bold text-bad">Algo deu errado</div>
              <div className="text-sm text-ink-muted" data-selectable>
                {snapshot.message || "A transmissão parou. Veja os logs ou tente de novo."}
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={onStart} loading={startBusy} disabled={startBusy}>
              {!startBusy && <RefreshCw className="size-4" />} Tentar de novo
            </Button>
            <Button variant="subtle" size="sm" onClick={() => setShowObs(true)}>
              <Zap className="size-4 text-brass" /> Configura pra mim
            </Button>
            <Button variant="subtle" size="sm" onClick={() => void api.openLogsDir()}>
              <FileText className="size-4" /> Ver logs
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
              <h3 className="text-lg">Liga no OBS</h3>
              <Badge tone={obsStatus.tone}>{obsStatus.label}</Badge>
              <ChevronDown className="ml-auto size-4 shrink-0 text-ink-faint transition-transform group-data-[state=open]:rotate-180" />
            </Collapsible.Trigger>
            <Collapsible.Content className="mt-3">
              <div className="mb-3 flex items-start justify-between gap-3">
                <p className="text-xs text-ink-faint">
                  No OBS:{" "}
                  <strong className="text-ink-muted">
                    Configurações → Transmissão → Serviço “Personalizado”
                  </strong>{" "}
                  e cole os dois campos abaixo.
                </p>
                <Button variant="outline" size="sm" className="shrink-0" onClick={() => setShowObs(true)}>
                  <Zap className="size-4 text-brass" strokeWidth={2.6} /> Configura pra mim
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <CopyField label="Servidor" value={obsIngestUrl(config.ingest)} />
                <CopyField label="Chave de transmissão" value={config.ingest.key} mono />
              </div>
              <p className="mt-3 text-xs text-ink-faint">
                Essa chave é só entre o OBS e a Corneta — não é de nenhuma plataforma.
              </p>
              <button
                onClick={() => setShowGuide(true)}
                className="mt-2 flex items-center gap-1.5 text-xs font-bold text-brass hover:underline"
              >
                <Gauge className="size-3.5" /> Qual a melhor qualidade pro OBS? Guia rápido →
              </button>
            </Collapsible.Content>
          </Collapsible.Root>
        </Card>
      )}

      {!live && (
        <Card className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 bg-surface-2 py-3">
          <span className="flex items-center gap-2">
            <Gauge className="size-4 text-brass" />
            <span className="text-sm font-semibold text-ink-muted">Banda de upload</span>
          </span>
          <span className="text-sm">
            <span className={cn("font-display text-lg font-extrabold tabular-nums", bandColor)}>
              {uploadMbps == null ? "—" : uploadMbps}
            </span>
            <span className="text-ink-faint"> / {neededMbps.toFixed(1).replace(".", ",")} Mbps</span>
          </span>
          {uploadMbps != null && bandTone === "bad" ? (
            <button
              onClick={() => onNavigate?.("encoding")}
              className="text-xs font-bold text-bad hover:underline"
            >
              não dá conta — ajustar qualidade
            </button>
          ) : uploadMbps != null && bandTone === "warn" ? (
            <button
              onClick={() => onNavigate?.("encoding")}
              className="text-xs font-bold text-warn hover:underline"
            >
              no limite — dar uma folga
            </button>
          ) : null}
          <Button
            variant="subtle"
            size="sm"
            className="ml-auto"
            onClick={onTest}
            loading={testing}
            disabled={testing || starting}
            title={starting ? "Espera entrar no ar pra não competir pela banda" : undefined}
          >
            {!testing && <Wifi className="size-4" />}
            {testing ? "Testando…" : "Testar"}
          </Button>
        </Card>
      )}

      {!live && !starting && problems.length > 0 && (
        <Card className="mb-4 bg-warn/10">
          <div className="flex items-center gap-2 text-sm font-bold text-warn">
            <AlertTriangle className="size-4" /> Resolva antes de iniciar:
          </div>
          <ul className="mt-1.5 space-y-1.5 text-sm text-ink-muted">
            {problems.map((p) => (
              <li key={p.target.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>
                  <strong className="text-ink">{p.target.name || "(sem nome)"}</strong>:{" "}
                  {p.issues.join(", ")}
                </span>
                {/* A saída fica a 1 clique — antes o usuário travava numa plataforma que nunca tocou. */}
                <button
                  onClick={() => onNavigate?.("platforms")}
                  className="text-xs font-bold text-brass hover:underline"
                >
                  Colar a chave →
                </button>
                <button
                  onClick={() => {
                    toggleTarget(p.target.id);
                    toast.info(`${p.target.name} desligada — religue em Plataformas.`);
                  }}
                  className="text-xs font-bold text-ink-faint hover:text-ink hover:underline"
                >
                  Desligar esta plataforma
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!live && !starting && enabled.length === 0 && (
        <Card className="mb-4 bg-surface-2 text-sm text-ink-muted">
          Nenhuma plataforma ativa. Vá em <strong className="text-ink">Plataformas</strong>, ative pelo
          menos uma e cole a chave.
        </Card>
      )}

      {!live && !starting && (
        <Checkup obs={obs} onRecheck={runObs} onGuide={() => setShowGuide(true)} />
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
                    {viewers.total.toLocaleString("pt-BR")}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                    assistindo
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
                title={live ? "Cravar um marcador no relatório" : "Disponível quando estiver no ar"}
              >
                <MapPin className="size-4" /> Marcar momento
              </Button>
            </div>
          </div>

          {/* O sinal do OBS SUMIU no meio da live (sem JÁ VOLTO): urgência máxima. */}
          {live && enabled.some((t) => snapshot.targets[t.id]?.state === "signal-lost") && (
            <Card className="mb-2 border-2 border-bad/40 bg-bad/10">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-bad" />
                <div className="min-w-0 flex-1">
                  <div className="font-display font-bold text-bad">
                    O sinal do OBS sumiu — sua live está SEM IMAGEM
                  </div>
                  <div className="text-sm text-ink-muted">
                    Pros espectadores a tela congelou. Confira o OBS (fechou? parou de transmitir?) —
                    quando o sinal voltar, eu retomo sozinha.
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button variant="primary" size="sm" onClick={() => setShowObs(true)}>
                  <Zap className="size-4" /> Configura pra mim
                </Button>
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={runObs}
                  loading={obs === "loading"}
                  disabled={obs === "loading"}
                >
                  {obs !== "loading" && <RefreshCw className="size-4" />} Verificar OBS
                </Button>
                <Badge tone={obsStatus.tone}>OBS: {obsStatus.label}</Badge>
              </div>
            </Card>
          )}

          {/* Resgate do limbo: 20s aguardando o OBS sem sinal → diagnóstico e saída. */}
          {starting && rescue && (
            <Card className="mb-2 border-2 border-warn/40 bg-warn/10">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warn" />
                <div className="min-w-0 flex-1">
                  <div className="font-display font-bold text-warn">O OBS ainda não conectou</div>
                  <div className="text-sm text-ink-muted">
                    Ele está aberto? Deu <strong className="text-ink">Iniciar transmissão</strong>?{" "}
                    {obs !== null && obs !== "loading" && !obs.reachable
                      ? "Não achei o OBS por aqui — parece fechado ou sem o WebSocket ligado."
                      : obs !== null && obs !== "loading" && !obs.pointingAtCorneta
                        ? "Achei o OBS, mas ele não está apontando pra Corneta."
                        : null}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="primary" size="sm" onClick={() => setShowObs(true)}>
                  <Zap className="size-4" /> Configura pra mim
                </Button>
                <Button variant="subtle" size="sm" onClick={runObs} loading={obs === "loading"}>
                  {obs !== "loading" && <RefreshCw className="size-4" />} Verificar OBS
                </Button>
              </div>
            </Card>
          )}

          <Card className="mb-2 flex flex-wrap items-center gap-x-6 gap-y-2 bg-surface-2 py-3">
            <span className="text-xs font-bold uppercase tracking-wide text-ink-faint">Máquina</span>
            <Usage label="CPU" value={snapshot.cpu} />
            <Usage label="GPU" value={snapshot.gpu} />
          </Card>

          <SecurityPanel onAdjust={openSecurity} />

          <div className="mb-4 flex flex-col gap-2">
            <AnimatePresence>
              {enabled.map((t, i) => {
                const st = snapshot.targets[t.id];
                const paused = st?.state === "paused";
                // Métricas só quando há transmissão de verdade — semear com o preset fazia
                // um destino travado parecer saudável ("6.0 Mbps / 60 FPS" sem nada fluindo).
                const flowing = st?.state === "live" || st?.state === "brb";
                return (
                  <motion.div
                    key={t.id}
                    layout
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: i * 0.05, type: "spring", stiffness: 320, damping: 28 }}
                  >
                    <Card className="flex items-center gap-4 bg-surface-2 py-3">
                      <PlatformGlyph id={t.platformId} size={36} />
                      <div className="min-w-32 flex-1">
                        <div className="font-display font-bold">{t.name}</div>
                        <StatePill state={st?.state ?? "idle"} />
                        {st?.message && (
                          <div className="mt-0.5 text-[11px] text-bad">{st.message}</div>
                        )}
                        {st?.state === "error" && (
                          <div className="mt-0.5 flex flex-wrap gap-x-3">
                            {/* Retry sem cortar a live: o backend relê a chave do cofre. */}
                            <button
                              onClick={() =>
                                void api
                                  .retryTarget(t.id)
                                  .catch((e) => toast.error(errMsg(e)))
                              }
                              className="text-[11px] font-bold text-brass hover:underline"
                            >
                              Tentar de novo
                            </button>
                            <button
                              onClick={() => onNavigate?.("platforms")}
                              className="text-[11px] font-bold text-brass hover:underline"
                            >
                              Trocar a chave →
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="hidden gap-6 sm:flex">
                        <MiniStat label="Bitrate" value={flowing ? fmtBitrate(st?.bitrateKbps ?? 0) : "—"} />
                        <MiniStat label="FPS" value={flowing ? String(st?.fps ?? 0) : "—"} />
                        <MiniStat
                          label="Quedas"
                          value={flowing ? String(st?.droppedFrames ?? 0) : "—"}
                          tone={flowing && st && st.droppedFrames > 0 ? "warn" : "default"}
                        />
                        <MiniStat label="No ar" value={flowing ? fmtUptime(st?.uptimeSec ?? 0) : "—"} />
                      </div>
                      {/* Em telas estreitas mantém ao menos Bitrate + Quedas. */}
                      <div className="flex gap-4 sm:hidden">
                        <MiniStat label="Bitrate" value={flowing ? fmtBitrate(st?.bitrateKbps ?? 0) : "—"} />
                        <MiniStat
                          label="Quedas"
                          value={flowing ? String(st?.droppedFrames ?? 0) : "—"}
                          tone={flowing && st && st.droppedFrames > 0 ? "warn" : "default"}
                        />
                      </div>
                      {PLATFORMS[t.platformId].liveUrl && (
                        <button
                          onClick={() => void openExternal(PLATFORMS[t.platformId].liveUrl!)}
                          className="grid size-9 place-items-center rounded-md text-ink-faint transition-colors hover:bg-surface-3 hover:text-ink"
                          title="Abrir o canal na plataforma"
                          aria-label={`Abrir o canal de ${t.name}`}
                        >
                          <ExternalLink className="size-4" />
                        </button>
                      )}
                      <button
                        onClick={() => void api.setTargetPaused(t.id, !paused)}
                        className={cn(
                          "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-bold uppercase tracking-wide transition-colors",
                          paused
                            ? "bg-brass/15 text-brass hover:bg-brass/25"
                            : "bg-surface-3 text-ink-muted hover:text-ink",
                        )}
                        title={paused ? "Retomar esta plataforma" : "Pausar esta plataforma"}
                      >
                        {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
                        {paused ? "Retomar" : "Pausar"}
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
              <AlertTriangle className="size-4 shrink-0" /> O OBS ainda não está apontando pra cá
            </div>
            <p className="mt-0.5 text-xs text-ink-muted">
              Dá pra entrar no ar mesmo assim — a live só começa quando o OBS mandar o vídeo.
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
                <Zap className="size-4" /> Configura pra mim
              </Button>
              <Button variant="subtle" size="sm" onClick={skipPreflightForever}>
                Ir assim mesmo
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setPreflightWarn(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
        {starting ? (
          // Status ≠ ação: o rodapé inteiro era um botãozão de cancelar — o clique ansioso
          // (costume herdado do BORA no mesmo lugar) matava a inicialização.
          <div className="flex items-stretch gap-2">
            <div className="flex h-14 flex-1 items-center justify-center gap-2.5 rounded-md bg-surface-2 font-display text-lg font-bold text-ink-muted">
              <Loader2 className="size-5 animate-spin" /> Aguardando o OBS conectar…
            </div>
            <Button variant="outline" size="lg" onClick={onCancel}>
              Cancelar
            </Button>
          </div>
        ) : live ? (
          <Button variant="danger" size="lg" className="w-full" onClick={onStopClick}>
            <Square className="size-5" />{" "}
            {confirmStop ? "Cortar mesmo? (clica de novo)" : "Cortar transmissão"}
          </Button>
        ) : (
          <Button
            variant="tomate"
            size="lg"
            className="w-full"
            disabled={!canStart || startBusy}
            loading={startBusy}
            onClick={onStart}
            aria-label={canStart ? "Bora ao vivo" : `Bora ao vivo (travado: ${blockReason})`}
          >
            {!startBusy && <Radio className="size-6" strokeWidth={2.5} />} BORA AO VIVO
          </Button>
        )}
        {starting && (
          <p className="mt-2 text-center text-xs text-ink-faint">
            {config.settings.autoStartObs ? (
              <>
                Chamei o OBS pra transmitir — se em alguns segundos nada mudar aqui, dê{" "}
                <strong className="text-ink-muted">Iniciar transmissão</strong> nele.
              </>
            ) : (
              <>
                No OBS, clique <strong className="text-ink-muted">Iniciar transmissão</strong> — a
                Corneta entra no ar sozinha.
              </>
            )}
          </p>
        )}
        {!live && !starting && !canStart && blockReason && (
          <p className="mt-2 text-center text-xs text-ink-faint">{blockReason}</p>
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
  const settings = useStore((s) => s.config!.settings);
  const forced = useStore((s) => s.snapshot.forcedBrb ?? false);
  const [busy, setBusy] = useState(false);
  const armed = settings.brbEnabled || settings.guardianEnabled;

  // Com o slate manual NO AR, o botão "Voltei!" nunca some — mesmo que o streamer desarme
  // o JÁ VOLTO nas Configurações no meio da live (senão o aviso ficava preso sem saída).
  if (!armed && !forced) {
    return live ? (
      <span className="max-w-52 text-right text-[11px] leading-tight text-ink-faint">
        Quer pausa com um clique? Arme o <strong className="text-ink-muted">JÁ VOLTO</strong> nas
        Configurações pra próxima live.
      </span>
    ) : null;
  }

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.setForceBrb(!forced);
      toast.success(forced ? "Voltou! Conteúdo no ar de novo 📣" : "JÁ VOLTO no ar — pode ir tranquilo, o mic tá mudo");
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
            ? "Tira o aviso do ar e volta pro seu conteúdo"
            : "Põe a tela “JÁ VOLTO” no ar (com o mic mudo)"
          : "Disponível quando estiver no ar"
      }
    >
      {forced ? <Play className="size-4" /> : <Pause className="size-4" />}
      {forced ? "Voltei!" : "JÁ VOLTO agora"}
    </Button>
  );
}

const PLAT_LABEL: Record<string, string> = { twitch: "Twitch", youtube: "YouTube", kick: "Kick" };

/** Define título (+jogo) da live em todas as plataformas logadas de uma vez. */
function StreamInfoCard() {
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
  const targets = (["twitch", "youtube", "kick"] as const).filter((p) => ready[p]);
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
          <Megaphone className="size-5 text-brass" /> Título da live
        </h3>
        <p className="min-w-48 flex-1 text-xs text-ink-faint">
          Entre na sua conta e defina o título (e o jogo) de todas as plataformas daqui — sem
          abrir Studio nem dashboard.
        </p>
        <Button
          variant="subtle"
          size="sm"
          onClick={() => {
            requestChatConfig("conta");
            requestNavigate("chat");
          }}
        >
          Entrar na conta →
        </Button>
      </Card>
    );
  }

  // O título é lembrado entre sessões — alimenta o broadcast automático do YouTube.
  const persistTitle = () => {
    const t = title.trim();
    if (t !== settings.streamTitle) setSettings({ streamTitle: t });
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
      toast.error("Digite um título");
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
      if (okN === total) toast.success(`Título atualizado em ${okN} plataforma${okN > 1 ? "s" : ""} 📣`);
      else toast.error(`${okN}/${total} ok — veja os detalhes`);
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
          <Megaphone className="size-5 text-brass" /> Título da live
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
          onKeyDown={(e) => e.key === "Enter" && !busy && title.trim() && void apply()}
          placeholder="Título da transmissão (vale pra todas)"
          maxLength={140}
          className="h-10 rounded-md border-2 border-border bg-surface px-3 text-sm font-medium text-ink outline-none focus:border-brass"
        />
        <div className="flex gap-2">
          <input
            value={game}
            onChange={(e) => onGame(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && title.trim() && void apply()}
            placeholder="Jogo / categoria (opcional)"
            className="h-10 flex-1 rounded-md border-2 border-border bg-surface px-3 text-sm font-medium text-ink outline-none focus:border-brass"
          />
          <Button variant="primary" onClick={apply} loading={busy} disabled={busy || !title.trim()}>
            {!busy && <Megaphone className="size-4" />} Aplicar
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
                <Check className="size-3.5 shrink-0 text-ok" strokeWidth={2.6} />
              )}
              <span className="shrink-0 font-semibold">{PLAT_LABEL[p] ?? p}</span>
              {!r.ok && <span className="truncate text-bad">· {r.error}</span>}
              {r.ok && r.warn && <span className="truncate text-warn">· {r.warn}</span>}
            </div>
          ))}
        </div>
      )}
      {ready.youtube && (
        <>
          <button
            onClick={() => setSettings({ youtubeAutoLive: !settings.youtubeAutoLive })}
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
              <strong className="text-ink">YouTube automático</strong>
              <span className="text-ink-faint">
                {" "}
                — a Corneta cria a transmissão no BORA AO VIVO, sem abrir o Studio.
              </span>
            </span>
          </button>
          <p className="mt-1.5 text-[11px] text-ink-faint">
            No YouTube dá pra mudar só o <strong className="text-ink-muted">título</strong> (não o jogo).
          </p>
        </>
      )}
    </Card>
  );
}

/** Painel "Seu segurança": Guardião / JÁ VOLTO / Auto-bitrate visíveis e confirmáveis. */
function SecurityPanel({ onAdjust }: { onAdjust: () => void }) {
  const settings = useStore((s) => s.config!.settings);
  const watchCount = settings.guardianWatchlist.filter((t) => t.trim().length >= 3).length;
  const items = [
    {
      on: settings.guardianEnabled && watchCount > 0,
      label: "Guardião",
      desc: settings.guardianEnabled
        ? watchCount > 0
          ? `vigiando ${watchCount} termo${watchCount > 1 ? "s" : ""}`
          : "ligado, mas sem termos — adicione um"
        : "desligado",
      experimental: true,
      // Experimental fica oculto aqui no Ao vivo até ser ligado nas Configurações.
      show: settings.guardianEnabled,
    },
    {
      on: settings.brbEnabled,
      label: "JÁ VOLTO",
      desc: settings.brbEnabled ? "se o sinal do OBS cair, o aviso entra no ar sem a live piscar" : "desligado",
      experimental: false,
      show: true,
    },
    {
      on: settings.autoBitrate,
      label: "Auto-bitrate",
      desc: settings.autoBitrate ? "baixa a qualidade se a internet apertar" : "desligado",
      experimental: false,
      show: true,
    },
    {
      on: settings.loudnessNormalize,
      label: "Normalizador de áudio",
      desc: "acertando seu volume automaticamente",
      experimental: false,
      show: settings.loudnessNormalize, // opt-in → só aparece quando ligado
    },
  ].filter((it) => it.show);
  return (
    <Card accent className="mb-2 bg-surface-2">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-lg">
          <Shield className="size-5 text-brass" /> Seu segurança
        </h3>
        <Button variant="ghost" size="sm" onClick={onAdjust}>
          Ajustar
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        {items.map((it) => (
          <div key={it.label} className="flex items-center gap-2 text-sm">
            <Badge tone={it.on ? "brass" : "neutral"}>{it.on ? "Armado" : "Off"}</Badge>
            <span className="font-semibold">{it.label}</span>
            {it.experimental && <ExperimentalBadge />}
            <span className="text-xs text-ink-faint">· {it.desc}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function LiveTimer({ startedAt, live }: { startedAt: number | null; live: boolean }) {
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
          Aguardando sinal do OBS…
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
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">no ar</span>
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
  const config = useStore((s) => s.config)!;
  const encoders = useStore((s) => s.encoders);
  const uploadMbps = useStore((s) => s.uploadMbps);
  const enabled = config.targets.filter((t) => t.enabled);
  const neededKbps = estimate(config).uploadKbps;
  const needed = neededKbps / 1000;
  // Mesma régua (margem 1.2x) das telas Qualidade e Banda — o check-up dava verde
  // exatamente onde as outras telas diziam "no limite".
  const upFit = bandFit(neededKbps, uploadMbps);

  return (
    <Card className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-lg">
          <ClipboardCheck className="size-5 text-brass" /> Check-up pré-live
        </h3>
        <Button variant="subtle" size="sm" onClick={onRecheck} loading={obs === "loading"} disabled={obs === "loading"}>
          {obs !== "loading" && <Zap className="size-4 text-brass" />}
          Verificar OBS
        </Button>
      </div>
      <div className="flex flex-col gap-1.5">
        <CheckRow label="Encoder disponível" ok={encoders.some((e) => e.available)} />
        <CheckRow
          label="Chaves e URLs"
          ok={enabled.length > 0 && enabled.every((t) => blockingIssues(t).length === 0)}
          detail={enabled.length === 0 ? "nenhuma plataforma ativa" : undefined}
        />
        <CheckRow
          label="Upload"
          ok={upFit === "ok"}
          warn={upFit === "unknown" || upFit === "warn"}
          detail={
            upFit === "unknown"
              ? "rode o teste em Banda de upload"
              : `${uploadMbps} / ${needed.toFixed(1).replace(".", ",")} Mbps${upFit === "warn" ? " · no limite" : ""}`
          }
        />
        {obs && obs !== "loading" && (
          <>
            <CheckRow
              label="OBS conectado"
              ok={obs.reachable}
              warn={!obs.reachable}
              detail={
                obs.reachable
                  ? undefined
                  : "ative em Ferramentas → Configurações do Servidor WebSocket (e a senha em Configurações, se houver)"
              }
            />
            {obs.reachable && (
              <CheckRow
                label="OBS apontando pra Corneta"
                ok={obs.pointingAtCorneta}
                warn={!obs.pointingAtCorneta}
                detail={
                  obs.pointingAtCorneta
                    ? `${obs.width}×${obs.height} · ${Math.round(obs.fps)}fps`
                    : "clique em Configura pra mim (tela Ao vivo)"
                }
              />
            )}
          </>
        )}
      </div>
      {/* Só quando algum destino recebe o vídeo DO OBS como saiu (cópia) — em transcode a
          Corneta já força GOP 2s/CBR e a dica viraria ruído. E agora diz ONDE fica. */}
      {enabled.some((t) => effectiveAction(config.mode, t) === "copy") && (
        <p className="mt-2 text-xs text-ink-faint">
          💡 No OBS, em <strong className="text-ink-muted">Configurações → Saída</strong>: no modo
          Simples já está certo — relaxa. No modo Avançado, confira{" "}
          <strong className="text-ink-muted">Controle de taxa: CBR</strong> e{" "}
          <strong className="text-ink-muted">Intervalo de quadro-chave: 2 s</strong> — é o que as
          plataformas pedem pra não travar.{" "}
          {onGuide && (
            <button onClick={onGuide} className="font-bold text-brass hover:underline">
              Ver o guia completo →
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
  const map: Record<TargetState, { label: string; cls: string; dot: string }> = {
    idle: { label: "Aguardando", cls: "text-ink-faint", dot: "bg-ink-faint" },
    connecting: { label: "Conectando", cls: "text-warn", dot: "bg-warn" },
    live: { label: "No ar", cls: "text-ok", dot: "bg-live live-dot" },
    reconnecting: { label: "Reconectando", cls: "text-warn", dot: "bg-warn" },
    error: { label: "Erro", cls: "text-bad", dot: "bg-bad" },
    paused: { label: "Pausado", cls: "text-ink-muted", dot: "bg-ink-faint" },
    waiting: { label: "Aguardando sinal", cls: "text-info", dot: "bg-info animate-pulse" },
    "signal-lost": { label: "SEM SINAL DO OBS", cls: "text-bad", dot: "bg-bad animate-pulse" },
    brb: { label: "JÁ VOLTO no ar", cls: "text-brass", dot: "bg-brass animate-pulse" },
    censor: { label: "Censurado", cls: "text-bad", dot: "bg-bad animate-pulse" },
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
      <div className="text-[10px] font-bold uppercase tracking-wide text-ink-faint">{label}</div>
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
      <span className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">{label}</span>
      <div className="h-2 w-24 overflow-hidden rounded-sm bg-surface">
        <div className={cn("h-full rounded-sm", tone)} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="w-12 font-display text-sm font-bold tabular-nums">
        {value == null ? "—" : `${value}%`}
      </span>
    </div>
  );
}
