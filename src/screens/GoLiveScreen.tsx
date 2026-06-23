import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Copy, Check, Radio, Square, Gauge, Wifi, Zap, AlertTriangle, KeyRound, Loader2,
} from "lucide-react";
import { useStore } from "../lib/store";
import { obsIngestUrl } from "../lib/factory";
import { estimate } from "../lib/estimates";
import { IS_TAURI } from "../lib/api";
import { toast } from "../lib/toast";
import { cn, fmtBitrate, fmtUptime } from "../lib/utils";
import type { EngineState, TargetState } from "../lib/types";
import { Button, Card, PlatformGlyph, SectionTitle, Stat } from "../components/ui";

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
  const missingKeys = enabled.filter((t) => !t.hasKey);

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
    uploadMbps == null ? "default" : uploadMbps >= neededMbps * 1.2 ? "ok" : uploadMbps >= neededMbps ? "warn" : "bad";

  const [testing, setTesting] = useState(false);
  const onTest = async () => {
    setTesting(true);
    try {
      await runUploadTest();
    } finally {
      setTesting(false);
    }
  };

  const onStart = async () => {
    try {
      await start();
      toast.success("Servidor no ar! Agora é só dar play no OBS 📣");
    } catch (e) {
      toast.error(`Não rolou: ${e}`);
    }
  };
  const onStop = async () => {
    await stop();
    toast.info("Transmissão encerrada");
  };

  return (
    <div className="mx-auto max-w-3xl">
      <SectionTitle
        kicker="Solta o som"
        title="Ao vivo"
        subtitle="Configure o OBS uma vez, confira a banda e entre no ar em todo lugar de uma tacada."
      />

      <Card className="mb-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg">Liga no OBS</h3>
          <Button variant="outline" size="sm" onClick={obsAutoConfigure}>
            <Zap className="size-4 text-brass" strokeWidth={2.6} /> Configurar sozinho
          </Button>
        </div>
        <p className="mb-3 text-xs text-ink-faint">
          No OBS: <strong className="text-ink-muted">Configurações → Transmissão → Serviço “Personalizado”</strong> e cole abaixo.
        </p>
        <div className="grid grid-cols-1 gap-2">
          <CopyField label="Servidor" value={obsIngestUrl(config.ingest)} />
          <CopyField label="Chave de transmissão" value={config.ingest.key} mono />
        </div>
        <p className="mt-3 text-xs text-ink-faint">
          Essa chave é local (OBS ↔ Corneta). As chaves das plataformas ficam no cofre do sistema.
        </p>
      </Card>

      <Card className="mb-4 bg-surface-2">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg">
            <Gauge className="size-5 text-brass" /> Banda de upload
          </h3>
          <Button variant="subtle" size="sm" onClick={onTest} disabled={testing}>
            {testing ? <Loader2 className="size-4 animate-spin" /> : <Wifi className="size-4" />}
            {testing ? "Testando…" : "Testar meu upload"}
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Precisa de" value={`${neededMbps.toFixed(1).replace(".", ",")} Mbps`} hint={`${est.enabledCount} plataformas`} />
          <Stat
            label="Seu upload"
            value={uploadMbps == null ? "—" : `${uploadMbps} Mbps`}
            tone={bandTone === "default" ? "default" : bandTone}
            hint={uploadMbps == null ? "rode o teste" : undefined}
          />
          <Stat label="Transcodes" value={est.transcodeCount} hint={`${est.copyCount} em cópia`} />
        </div>
        {uploadMbps != null && bandTone === "bad" && (
          <div className="mt-3 flex items-center gap-2 rounded-md bg-bad/15 px-3 py-2 text-sm font-semibold text-bad">
            <AlertTriangle className="size-4" />
            Teu upload pode não dar conta. Baixa o bitrate ou tira uma plataforma.
          </div>
        )}
      </Card>

      {missingKeys.length > 0 && (
        <Card className="mb-4 flex items-center gap-3 bg-warn/10">
          <KeyRound className="size-5 text-warn" />
          <span className="text-sm text-ink-muted">
            {missingKeys.length} plataforma(s) ativa(s) sem chave: <strong className="text-ink">{missingKeys.map((t) => t.name).join(", ")}</strong>.
          </span>
        </Card>
      )}

      <div className="mb-5">
        {starting ? (
          <Button variant="outline" size="lg" className="w-full" onClick={onStop}>
            <Loader2 className="size-5 animate-spin" /> Aguardando o OBS conectar… (cancelar)
          </Button>
        ) : live ? (
          <Button variant="danger" size="lg" className="w-full" onClick={onStop}>
            <Square className="size-5" /> Cortar transmissão
          </Button>
        ) : (
          <Button variant="pop" size="lg" className="w-full" disabled={enabled.length === 0} onClick={onStart}>
            <Radio className="size-6" strokeWidth={2.5} /> BORA AO VIVO
          </Button>
        )}
        {starting && (
          <p className="mt-2 text-center text-xs text-ink-faint">
            No OBS, clique <strong className="text-ink-muted">Iniciar transmissão</strong> — a Corneta entra no ar sozinha.
          </p>
        )}
      </div>

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
                  transition={{ delay: i * 0.05, type: "spring", stiffness: 320, damping: 28 }}
                >
                  <Card className="flex items-center gap-4 bg-surface-2 py-3">
                    <PlatformGlyph id={t.platformId} size={36} />
                    <div className="min-w-32 flex-1">
                      <div className="font-display font-bold">{t.name}</div>
                      <StatePill state={st?.state ?? "idle"} />
                      {st?.message && (
                        <div className="mt-0.5 max-w-xs truncate text-[11px] text-bad" title={st.message}>
                          {st.message}
                        </div>
                      )}
                    </div>
                    <div className="hidden gap-6 sm:flex">
                      <MiniStat label="Bitrate" value={fmtBitrate(st?.bitrateKbps ?? 0)} />
                      <MiniStat label="FPS" value={String(st?.fps ?? 0)} />
                      <MiniStat label="Quedas" value={String(st?.droppedFrames ?? 0)} tone={st && st.droppedFrames > 0 ? "warn" : "default"} />
                      <MiniStat label="No ar" value={fmtUptime(st?.uptimeSec ?? 0)} />
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </AnimatePresence>
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
  };
  const m = map[state];
  return (
    <span className={cn("mt-0.5 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide", m.cls)}>
      <span className={cn("size-2 rounded-full", m.dot)} /> {m.label}
    </span>
  );
}

function MiniStat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warn" }) {
  return (
    <div className="text-right">
      <div className="text-[10px] font-bold uppercase tracking-wide text-ink-faint">{label}</div>
      <div className={cn("font-display text-base font-extrabold tabular-nums", tone === "warn" ? "text-warn" : "text-ink")}>{value}</div>
    </div>
  );
}

function CopyField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
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
      <div className="w-44 text-xs font-bold uppercase tracking-wide text-ink-faint">{label}</div>
      <div
        data-selectable
        className={cn("flex-1 truncate rounded-md bg-surface px-3 py-2 text-sm", mono && "font-mono")}
      >
        {value}
      </div>
      <Button variant="subtle" size="sm" onClick={copy}>
        {copied ? <Check className="size-4 text-ok" /> : <Copy className="size-4" />}
        {copied ? "Copiado" : "Copiar"}
      </Button>
    </div>
  );
}

async function obsAutoConfigure() {
  if (!IS_TAURI) {
    toast.info("No app instalado, a Corneta acha o OBS aberto e preenche tudo sozinha (obs-websocket).");
    return;
  }
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("obs_autoconfigure")
    .then(() => toast.success("OBS configurado!"))
    .catch((e) => toast.error(`Não rolou configurar o OBS: ${e}`));
}
