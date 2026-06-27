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
} from "lucide-react";
import { useStore } from "../lib/store";
import { api } from "../lib/api";
import { obsIngestUrl } from "../lib/factory";
import { estimate } from "../lib/estimates";
import { PLATFORMS } from "../lib/platforms";
import { toast } from "../lib/toast";
import { cn, fmtBitrate, fmtUptime, openExternal } from "../lib/utils";
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

let prewarmedUpload = false;

export function GoLiveScreen({ onNavigate }: { onNavigate?: (s: Screen) => void }) {
  const config = useStore((s) => s.config)!;
  const snapshot = useStore((s) => s.snapshot);
  const viewers = useStore((s) => s.viewers);
  const start = useStore((s) => s.start);
  const stop = useStore((s) => s.stop);
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
        ? `Resolva ${problems[0].target.name || "(sem nome)"}: ${problems[0].issues.join(", ")}.`
        : "";

  // Avisa quando o OBS realmente conecta (stopped/starting → live).
  const prevState = useRef<EngineState>("stopped");
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

  const bandTone =
    uploadMbps == null
      ? "default"
      : uploadMbps >= neededMbps * 1.2
        ? "ok"
        : uploadMbps >= neededMbps
          ? "warn"
          : "bad";

  const [testing, setTesting] = useState(false);
  const [showObs, setShowObs] = useState(false);
  const [obsOpen, setObsOpen] = useState(false);
  const [obs, setObs] = useState<ObsCheck | "loading" | null>(null);
  const runObs = async () => {
    setObs("loading");
    try {
      setObs(await api.obsCheck());
    } catch (e) {
      setObs({ reachable: false, pointingAtCorneta: false, width: 0, height: 0, fps: 0, error: String(e) });
    }
  };
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

  useEffect(() => {
    if (!live && !starting) void runObs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onStart = async () => {
    try {
      await start();
      toast.success(
        config.settings.autoStartObs
          ? "No ar! Se o OBS não começar sozinho, dê play nele 📣"
          : "Servidor no ar! Agora é só dar play no OBS 📣",
      );
    } catch (e) {
      toast.error(`Não rolou: ${e}`);
    }
  };
  // Cortar uma live de verdade → puxa pro relatório fresquinho.
  const onStop = async () => {
    await stop();
    toast.action("Cortou! Tá fora do ar 👋", "Ver relatório", () => onNavigate?.("reports"));
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
            <Button variant="primary" size="sm" onClick={onStart}>
              <RefreshCw className="size-4" /> Tentar de novo
            </Button>
            <Button variant="subtle" size="sm" onClick={() => setShowObs(true)}>
              <Zap className="size-4 text-brass" /> Configurar OBS
            </Button>
            <Button variant="subtle" size="sm" onClick={() => void api.openLogsDir()}>
              <FileText className="size-4" /> Ver logs
            </Button>
          </div>
        </Card>
      )}

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
                  e cole os dois campos abaixo — é por aqui que o OBS manda o vídeo pra mim.
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
                Essa chave é só entre o OBS e a Corneta, aqui no seu PC — não é de nenhuma plataforma. As das plataformas ficam no cofre do sistema.
              </p>
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
            <span className="text-xs font-bold text-warn">no limite</span>
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
          <ul className="mt-1.5 space-y-1 text-sm text-ink-muted">
            {problems.map((p) => (
              <li key={p.target.id}>
                <strong className="text-ink">{p.target.name || "(sem nome)"}</strong>:{" "}
                {p.issues.join(", ")}
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

      {!live && !starting && <Checkup obs={obs} onRecheck={runObs} />}

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
                          <div
                            className="mt-0.5 max-w-xs truncate text-[11px] text-bad"
                            title={st.message}
                          >
                            {st.message}
                          </div>
                        )}
                        {st?.state === "error" && (
                          <button
                            onClick={() => onNavigate?.("platforms")}
                            className="mt-0.5 text-[11px] font-bold text-brass hover:underline"
                          >
                            Resolver →
                          </button>
                        )}
                      </div>
                      <div className="hidden gap-6 sm:flex">
                        <MiniStat label="Bitrate" value={fmtBitrate(st?.bitrateKbps ?? 0)} />
                        <MiniStat label="FPS" value={String(st?.fps ?? 0)} />
                        <MiniStat
                          label="Quedas"
                          value={String(st?.droppedFrames ?? 0)}
                          tone={st && st.droppedFrames > 0 ? "warn" : "default"}
                        />
                        <MiniStat label="No ar" value={fmtUptime(st?.uptimeSec ?? 0)} />
                      </div>
                      {/* Em telas estreitas mantém ao menos Bitrate + Quedas. */}
                      <div className="flex gap-4 sm:hidden">
                        <MiniStat label="Bitrate" value={fmtBitrate(st?.bitrateKbps ?? 0)} />
                        <MiniStat
                          label="Quedas"
                          value={String(st?.droppedFrames ?? 0)}
                          tone={st && st.droppedFrames > 0 ? "warn" : "default"}
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
                        title={paused ? "Retomar este destino" : "Pausar este destino"}
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
        {starting ? (
          <Button variant="outline" size="lg" className="w-full" onClick={onCancel}>
            <Loader2 className="size-5 animate-spin" /> Aguardando o OBS conectar… (cancelar)
          </Button>
        ) : live ? (
          <Button variant="danger" size="lg" className="w-full" onClick={onStop}>
            <Square className="size-5" /> Cortar transmissão
          </Button>
        ) : (
          <Button
            variant="tomate"
            size="lg"
            className="w-full"
            disabled={!canStart}
            onClick={onStart}
            aria-label={canStart ? "Bora ao vivo" : `Bora ao vivo (travado: ${blockReason})`}
          >
            <Radio className="size-6" strokeWidth={2.5} /> BORA AO VIVO
          </Button>
        )}
        {starting && (
          <p className="mt-2 text-center text-xs text-ink-faint">
            No OBS, clique <strong className="text-ink-muted">Iniciar transmissão</strong> — a Corneta
            entra no ar sozinha.
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
    </div>
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
      desc: settings.brbEnabled ? "se o sinal do OBS cair, põe um aviso no ar e segura a live" : "desligado",
      experimental: false,
      show: true,
    },
    {
      on: settings.autoBitrate,
      label: "Auto-bitrate",
      desc: settings.autoBitrate ? "baixa o bitrate (a qualidade) se a internet apertar" : "desligado",
      experimental: false,
      show: true,
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
}: {
  obs: ObsCheck | "loading" | null;
  onRecheck: () => void;
}) {
  const config = useStore((s) => s.config)!;
  const encoders = useStore((s) => s.encoders);
  const uploadMbps = useStore((s) => s.uploadMbps);
  const enabled = config.targets.filter((t) => t.enabled);
  const needed = estimate(config).uploadKbps / 1000;

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
          ok={uploadMbps != null && uploadMbps >= needed}
          warn={uploadMbps == null}
          detail={
            uploadMbps == null
              ? "rode o teste em Banda de upload"
              : `${uploadMbps} / ${needed.toFixed(1).replace(".", ",")} Mbps`
          }
        />
        {obs && obs !== "loading" && (
          <>
            <CheckRow
              label="OBS conectado (obs-websocket)"
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
      <p className="mt-2 text-xs text-ink-faint">
        💡 No OBS: keyframe (quadro-base) a cada <strong className="text-ink-muted">2s</strong> e bitrate{" "}
        <strong className="text-ink-muted">CBR</strong> (taxa constante de dados) — é o que as plataformas pedem pra não travar.
      </p>
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
