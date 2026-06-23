import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Copy,
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
  X,
} from "lucide-react";
import { useStore } from "../lib/store";
import { api } from "../lib/api";
import { obsIngestUrl } from "../lib/factory";
import { estimate } from "../lib/estimates";
import { PLATFORMS } from "../lib/platforms";
import { toast } from "../lib/toast";
import { cn, fmtBitrate, fmtUptime, openExternal } from "../lib/utils";
import type { EngineState, ObsCheck, TargetState } from "../lib/types";
import { blockingIssues } from "../lib/validation";
import {
  Button,
  Card,
  PlatformGlyph,
  SectionTitle,
  Stat,
} from "../components/ui";
import { ObsWizard } from "../components/ObsWizard";

export function GoLiveScreen() {
  const config = useStore((s) => s.config)!;
  const snapshot = useStore((s) => s.snapshot);
  const start = useStore((s) => s.start);
  const stop = useStore((s) => s.stop);
  const uploadMbps = useStore((s) => s.uploadMbps);
  const runUploadTest = useStore((s) => s.runUploadTest);

  const state = snapshot.state;
  const live = state === "live";
  const starting = state === "starting";
  const enabled = config.targets.filter((t) => t.enabled);
  const problems = enabled
    .map((t) => ({ target: t, issues: blockingIssues(t) }))
    .filter((p) => p.issues.length > 0);
  const canStart = enabled.length > 0 && problems.length === 0;

  // Avisa quando o OBS realmente conecta (stopped/starting → live).
  const prevState = useRef<EngineState>("stopped");
  useEffect(() => {
    if (state === "live" && prevState.current !== "live") {
      toast.success("No ar! A corneta tá tocando 📣");
    }
    prevState.current = state;
  }, [state]);
  const est = estimate(config);
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

  const onStart = async () => {
    try {
      await start();
      toast.success(
        config.settings.autoStartObs
          ? "No ar! Se o OBS não começar sozinho, dê play nele 📣"
          : "Servidor no ar! Agora é só dar play no OBS 📣"
      );
    } catch (e) {
      toast.error(`Não rolou: ${e}`);
    }
  };
  const onStop = async () => {
    await stop();
    toast.info("Transmissão encerrada");
  };
  const onMark = async () => {
    try {
      await api.markMoment();
      toast.success("Momento marcado 📍 — aparece no relatório");
    } catch {
      /* sem sessão gravando */
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <SectionTitle
        kicker="Solta o som"
        title="Ao vivo"
        subtitle="Configure o OBS uma vez, confira a banda e entre no ar em todo lugar de uma tacada."
      />

      {state === "error" && snapshot.message && (
        <Card className="mb-4 flex items-start gap-3 border-2 border-bad/40 bg-bad/10">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-bad" />
          <div>
            <div className="font-display font-bold text-bad">
              Algo deu errado
            </div>
            <div className="text-sm text-ink-muted">{snapshot.message}</div>
          </div>
        </Card>
      )}

      <Card className="mb-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg">Liga no OBS</h3>
          <Button variant="outline" size="sm" onClick={() => setShowObs(true)}>
            <Zap className="size-4 text-brass" strokeWidth={2.6} /> Configurar
            sozinho
          </Button>
        </div>
        <p className="mb-3 text-xs text-ink-faint">
          No OBS:{" "}
          <strong className="text-ink-muted">
            Configurações → Transmissão → Serviço “Personalizado”
          </strong>{" "}
          e cole abaixo.
        </p>
        <div className="grid grid-cols-1 gap-2">
          <CopyField label="Servidor" value={obsIngestUrl(config.ingest)} />
          <CopyField
            label="Chave de transmissão"
            value={config.ingest.key}
            mono
          />
        </div>
        <p className="mt-3 text-xs text-ink-faint">
          Essa chave é local (OBS ↔ Corneta). As chaves das plataformas ficam no
          cofre do sistema.
        </p>
        <p className="mt-1.5 text-xs text-ink-faint">
          💡 No OBS, use{" "}
          <strong className="text-ink-muted">keyframe interval 2s</strong> e
          bitrate <strong className="text-ink-muted">CBR</strong> — o padrão que
          as plataformas pedem.
        </p>
      </Card>

      <Card className="mb-4 bg-surface-2">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg">
            <Gauge className="size-5 text-brass" /> Banda de upload
          </h3>
          <Button
            variant="subtle"
            size="sm"
            onClick={onTest}
            disabled={testing}
          >
            {testing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Wifi className="size-4" />
            )}
            {testing ? "Testando…" : "Testar meu upload"}
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Stat
            label="Precisa de"
            value={`${neededMbps.toFixed(1).replace(".", ",")} Mbps`}
            hint={`${est.enabledCount} plataformas`}
          />
          <Stat
            label="Seu upload"
            value={uploadMbps == null ? "—" : `${uploadMbps} Mbps`}
            tone={bandTone === "default" ? "default" : bandTone}
            hint={uploadMbps == null ? "rode o teste" : undefined}
          />
          <Stat
            label="Transcodes"
            value={est.transcodeCount}
            hint={`${est.copyCount} em cópia`}
          />
        </div>
        {uploadMbps != null && bandTone === "bad" && (
          <div className="mt-3 flex items-center gap-2 rounded-md bg-bad/15 px-3 py-2 text-sm font-semibold text-bad">
            <AlertTriangle className="size-4" />
            Teu upload pode não dar conta. Baixa o bitrate ou tira uma
            plataforma.
          </div>
        )}
      </Card>

      {problems.length > 0 && (
        <Card className="mb-4 bg-warn/10">
          <div className="flex items-center gap-2 text-sm font-bold text-warn">
            <AlertTriangle className="size-4" /> Resolva antes de iniciar:
          </div>
          <ul className="mt-1.5 space-y-1 text-sm text-ink-muted">
            {problems.map((p) => (
              <li key={p.target.id}>
                <strong className="text-ink">
                  {p.target.name || "(sem nome)"}
                </strong>
                : {p.issues.join(", ")}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {enabled.length === 0 && !live && !starting && (
        <Card className="mb-4 bg-surface-2 text-sm text-ink-muted">
          Nenhuma plataforma ativa. Vá em{" "}
          <strong className="text-ink">Plataformas</strong>, ative pelo menos
          uma e cole a chave.
        </Card>
      )}

      {!live && !starting && <Checkup />}

      <div className="mb-5">
        {starting ? (
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            onClick={onStop}
          >
            <Loader2 className="size-5 animate-spin" /> Aguardando o OBS
            conectar… (cancelar)
          </Button>
        ) : live ? (
          <Button
            variant="danger"
            size="lg"
            className="w-full"
            onClick={onStop}
          >
            <Square className="size-5" /> Cortar transmissão
          </Button>
        ) : (
          <Button
            variant="pop"
            size="lg"
            className="w-full"
            disabled={!canStart}
            onClick={onStart}
          >
            <Radio className="size-6" strokeWidth={2.5} /> BORA AO VIVO
          </Button>
        )}
        {starting && (
          <p className="mt-2 text-center text-xs text-ink-faint">
            No OBS, clique{" "}
            <strong className="text-ink-muted">Iniciar transmissão</strong> — a
            Corneta entra no ar sozinha.
          </p>
        )}
      </div>

      {(live || starting) && (
        <div className="mb-2 flex items-center justify-between gap-3">
          <LiveTimer startedAt={snapshot.startedAt} />
          <Button variant="subtle" size="sm" onClick={onMark} title="Cravar um marcador no relatório">
            <MapPin className="size-4" /> Marcar momento
          </Button>
        </div>
      )}

      {(live || starting) && (
        <Card className="mb-2 flex flex-wrap items-center gap-x-6 gap-y-2 bg-surface-2 py-3">
          <span className="text-xs font-bold uppercase tracking-wide text-ink-faint">
            Máquina
          </span>
          <Usage label="CPU" value={snapshot.cpu} />
          <Usage label="GPU" value={snapshot.gpu} />
        </Card>
      )}

      <AnimatePresence>
        {(live || starting) && (
          <div className="flex flex-col gap-2">
            {enabled.map((t, i) => {
              const st = snapshot.targets[t.id];
              return (
                <motion.div
                  key={t.id}
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
                    </div>
                    <div className="hidden gap-6 sm:flex">
                      <MiniStat
                        label="Bitrate"
                        value={fmtBitrate(st?.bitrateKbps ?? 0)}
                      />
                      <MiniStat label="FPS" value={String(st?.fps ?? 0)} />
                      <MiniStat
                        label="Quedas"
                        value={String(st?.droppedFrames ?? 0)}
                        tone={st && st.droppedFrames > 0 ? "warn" : "default"}
                      />
                      <MiniStat
                        label="No ar"
                        value={fmtUptime(st?.uptimeSec ?? 0)}
                      />
                    </div>
                    {PLATFORMS[t.platformId].liveUrl && (
                      <button
                        onClick={() => void openExternal(PLATFORMS[t.platformId].liveUrl!)}
                        className="rounded-md p-2 text-ink-faint transition-colors hover:bg-surface-3 hover:text-ink"
                        title="Abrir o canal na plataforma"
                        aria-label="Abrir o canal"
                      >
                        <ExternalLink className="size-4" />
                      </button>
                    )}
                    <button
                      onClick={() => void api.setTargetPaused(t.id, st?.state !== "paused")}
                      className={cn(
                        "rounded-md p-2 transition-colors hover:bg-surface-3",
                        st?.state === "paused" ? "text-brass" : "text-ink-faint hover:text-ink"
                      )}
                      title={st?.state === "paused" ? "Retomar" : "Pausar este destino"}
                      aria-label={st?.state === "paused" ? "Retomar" : "Pausar"}
                    >
                      {st?.state === "paused" ? <Play className="size-4" /> : <Pause className="size-4" />}
                    </button>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showObs && <ObsWizard onClose={() => setShowObs(false)} />}
      </AnimatePresence>
    </div>
  );
}

function LiveTimer({ startedAt }: { startedAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
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

function Checkup() {
  const config = useStore((s) => s.config)!;
  const encoders = useStore((s) => s.encoders);
  const uploadMbps = useStore((s) => s.uploadMbps);
  const enabled = config.targets.filter((t) => t.enabled);
  const needed = estimate(config).uploadKbps / 1000;
  const [obs, setObs] = useState<ObsCheck | "loading" | null>(null);

  const runObs = async () => {
    setObs("loading");
    try {
      setObs(await api.obsCheck());
    } catch (e) {
      setObs({ reachable: false, pointingAtCorneta: false, width: 0, height: 0, fps: 0, error: String(e) });
    }
  };

  return (
    <Card className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-lg">
          <ClipboardCheck className="size-5 text-brass" /> Check-up pré-live
        </h3>
        <Button variant="subtle" size="sm" onClick={runObs} disabled={obs === "loading"}>
          {obs === "loading" ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4 text-brass" />}
          Verificar OBS
        </Button>
      </div>
      <div className="flex flex-col gap-1.5">
        <CheckRow label="Encoder disponível" ok={encoders.some((e) => e.available)} />
        <CheckRow
          label="Chaves e URLs"
          ok={enabled.length > 0 && enabled.every((t) => blockingIssues(t).length === 0)}
          detail={enabled.length === 0 ? "nenhum destino ativo" : undefined}
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
                    : "clique em Configurar sozinho (tela Ao vivo)"
                }
              />
            )}
          </>
        )}
      </div>
      <p className="mt-2 text-xs text-ink-faint">💡 No OBS: keyframe 2s + bitrate CBR.</p>
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
  const Icon = ok ? Check : warn ? AlertTriangle : X;
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
  const map: Record<TargetState, { label: string; cls: string; dot: string }> =
    {
      idle: { label: "Aguardando", cls: "text-ink-faint", dot: "bg-ink-faint" },
      connecting: { label: "Conectando", cls: "text-warn", dot: "bg-warn" },
      live: { label: "No ar", cls: "text-ok", dot: "bg-live live-dot" },
      reconnecting: { label: "Reconectando", cls: "text-warn", dot: "bg-warn" },
      error: { label: "Erro", cls: "text-bad", dot: "bg-bad" },
      paused: { label: "Pausado", cls: "text-ink-muted", dot: "bg-ink-faint" },
    };
  const m = map[state];
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

function CopyField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copiado!");
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="flex items-center gap-2">
      <div className="w-44 text-xs font-bold uppercase tracking-wide text-ink-faint">
        {label}
      </div>
      <div
        data-selectable
        className={cn(
          "flex-1 truncate rounded-md bg-surface px-3 py-2 text-sm",
          mono && "font-mono",
        )}
      >
        {value}
      </div>
      <Button variant="subtle" size="sm" onClick={copy}>
        {copied ? (
          <Check className="size-4 text-ok" />
        ) : (
          <Copy className="size-4" />
        )}
        {copied ? "Copiado" : "Copiar"}
      </Button>
    </div>
  );
}
