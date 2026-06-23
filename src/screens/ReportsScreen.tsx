import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  FolderOpen,
  Trash2,
  Activity,
  Cpu,
  Clock,
} from "lucide-react";
import { api } from "../lib/api";
import { PLATFORMS } from "../lib/platforms";
import { toast } from "../lib/toast";
import { cn } from "../lib/utils";
import type { SessionData, SessionMeta } from "../lib/types";
import {
  analyze,
  bitrateSeries,
  cpuSeries,
  gpuSeries,
  parseSession,
  type ProblemWindow,
  type ReportEvent,
} from "../lib/report";
import { LineChart, type ChartMarker } from "../components/LineChart";
import { Button, Card, PlatformGlyph, SectionTitle } from "../components/ui";

function fmtDur(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${m}min`;
}
const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const fmtTime = (ms: number) =>
  new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export function ReportsScreen() {
  const [sessions, setSessions] = useState<SessionMeta[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const refresh = () => api.listSessions().then(setSessions);
  useEffect(() => {
    void refresh();
  }, []);

  if (selected) {
    return (
      <ReportDetail
        id={selected}
        onBack={() => setSelected(null)}
        onDeleted={() => {
          setSelected(null);
          void refresh();
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <SectionTitle
        kicker="Depois da live"
        title="Relatórios"
        subtitle="O que rolou em cada transmissão — pra diagnosticar travamentos com calma, sem mexer no ar."
        right={
          <Button variant="subtle" size="sm" onClick={() => void api.openSessionsDir()}>
            <FolderOpen className="size-4" /> Abrir pasta
          </Button>
        }
      />

      {sessions === null ? (
        <Card className="text-sm text-ink-muted">Carregando…</Card>
      ) : sessions.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 bg-surface-2 py-10 text-center">
          <Activity className="size-8 text-ink-faint" />
          <div className="font-display text-lg font-bold">Nenhuma transmissão ainda</div>
          <div className="max-w-sm text-sm text-ink-muted">
            Quando você entrar ao vivo, a Corneta grava tudo e o relatório aparece aqui ao encerrar.
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {sessions.map((s) => (
            <SessionRow key={s.id} meta={s} onOpen={() => setSelected(s.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function SessionRow({ meta, onOpen }: { meta: SessionMeta; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="group flex items-center gap-4 rounded-lg border-2 border-border bg-surface px-4 py-3 text-left transition-colors hover:border-brass"
    >
      <div className="flex w-20 shrink-0 flex-col">
        <span className="font-display text-lg font-extrabold leading-none">{fmtDate(meta.startedAt)}</span>
        <span className="text-[11px] font-semibold text-ink-faint">{fmtTime(meta.startedAt)}</span>
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <span className="text-sm font-bold">{fmtDur(meta.durationSec)} no ar</span>
        <div className="flex items-center gap-1.5">
          {meta.platforms.map((p) => (
            <PlatformGlyph key={p.id} id={p.platformId} size={18} />
          ))}
          <span className="ml-1 text-xs text-ink-faint">
            {meta.platforms.map((p) => p.name).join(", ")}
          </span>
        </div>
      </div>
      <ChevronRight className="size-5 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-brass" />
    </button>
  );
}

function ReportDetail({
  id,
  onBack,
  onDeleted,
}: {
  id: string;
  onBack: () => void;
  onDeleted: () => void;
}) {
  const [data, setData] = useState<SessionData | null | "loading">("loading");

  useEffect(() => {
    let alive = true;
    void api.readSession(id).then((raw) => {
      if (!alive) return;
      setData(parseSession(raw));
    });
    return () => {
      alive = false;
    };
  }, [id]);

  const remove = async () => {
    await api.deleteSession(id);
    toast.info("Relatório excluído");
    onDeleted();
  };

  if (data === "loading") {
    return (
      <div className="mx-auto max-w-3xl">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" /> Voltar
        </Button>
        <Card className="mt-4 text-sm text-ink-muted">Carregando o relatório…</Card>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-3xl">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" /> Voltar
        </Button>
        <Card className="mt-4 text-sm text-ink-muted">Não consegui ler esta sessão.</Card>
      </div>
    );
  }

  const a = analyze(data);
  const n = data.samples.length;
  const platColor = (pid: string) => PLATFORMS[pid as keyof typeof PLATFORMS]?.color ?? "#ffb323";

  // Marcadores de evento (reconexão/erro) no eixo de tempo.
  const indexAt = (t: number) => {
    for (let i = 0; i < n; i++) if (data.samples[i].t >= t) return i;
    return Math.max(0, n - 1);
  };
  const markers: ChartMarker[] = a.events
    .filter((e) => e.kind === "reconnect" || e.kind === "error")
    .map((e) => ({ index: indexAt(e.t), color: e.kind === "error" ? "#ef4444" : "#f97316" }));

  const bitrateSeriesData = data.meta.platforms.map((p) => ({
    label: p.name,
    color: platColor(p.platformId),
    values: bitrateSeries(data, p.id).map((v) => (v == null ? null : v / 1000)),
  }));

  const cpu = cpuSeries(data);
  const gpu = gpuSeries(data);
  const hasGpu = gpu.some((v) => v != null);
  const machineSeries = [
    { label: "CPU", color: "#ff7a45", values: cpu },
    ...(hasGpu ? [{ label: "GPU", color: "#56b3ff", values: gpu }] : []),
  ];

  const tone =
    a.verdict.tone === "ok"
      ? "border-ok/40 bg-ok/10 text-ok"
      : a.verdict.tone === "warn"
        ? "border-warn/40 bg-warn/10 text-warn"
        : "border-bad/40 bg-bad/10 text-bad";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" /> Voltar
        </Button>
        <Button variant="ghost" size="sm" onClick={remove}>
          <Trash2 className="size-4" /> Excluir
        </Button>
      </div>

      <div className="mb-1 font-display text-2xl font-extrabold">
        Live de {fmtDate(data.meta.startedAt)}
      </div>
      <div className="mb-4 text-sm text-ink-muted">
        {fmtDur(data.meta.durationSec)} · {fmtTime(data.meta.startedAt)}
        {data.meta.endedAt ? `–${fmtTime(data.meta.endedAt)}` : ""} ·{" "}
        {data.meta.platforms.map((p) => p.name).join(", ")} · modo {data.meta.mode}
      </div>

      {/* Veredito */}
      <Card className={cn("mb-4 flex items-start gap-3 border-2", tone)}>
        <AlertTriangle className="mt-0.5 size-5 shrink-0" />
        <div>
          <div className="font-display font-bold">{a.verdict.title}</div>
          <div className="text-sm text-ink-muted">{a.verdict.detail}</div>
        </div>
      </Card>

      {/* Gráfico de bitrate por plataforma */}
      {n > 1 && (
        <Card className="mb-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
            <Activity className="size-4" /> Bitrate por plataforma (Mbps)
          </h3>
          <LineChart
            series={bitrateSeriesData}
            n={n}
            markers={markers}
            formatValue={(v) => v.toFixed(1)}
          />
        </Card>
      )}

      {/* Gráfico de CPU/GPU */}
      {n > 1 && (cpu.some((v) => v != null) || hasGpu) && (
        <Card className="mb-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
            <Cpu className="size-4" /> Máquina (%)
          </h3>
          <LineChart
            series={machineSeries}
            n={n}
            yMax={100}
            formatValue={(v) => `${Math.round(v)}`}
          />
        </Card>
      )}

      {/* Resumo por plataforma */}
      <Card className="mb-4">
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-faint">Por plataforma</h3>
        <div className="flex flex-col gap-2">
          {a.perTarget.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-md bg-surface-2 px-3 py-2">
              <PlatformGlyph id={t.platformId} size={22} />
              <span className="min-w-24 flex-1 font-display font-bold">{t.name}</span>
              <span className="text-xs text-ink-muted">~{(t.avgBitrate / 1000).toFixed(1)} Mbps méd.</span>
              <span className="text-xs text-ink-muted">{t.maxDropped} quedas</span>
              <span className={cn("text-xs", t.reconnects > 0 ? "text-warn" : "text-ink-faint")}>
                {t.reconnects} reconex.
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Janelas problemáticas */}
      {a.windows.length > 0 && (
        <Card className="mb-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
            <AlertTriangle className="size-4 text-warn" /> Janelas problemáticas
          </h3>
          <div className="flex flex-col gap-2">
            {a.windows.map((w, i) => (
              <WindowCard key={i} w={w} />
            ))}
          </div>
        </Card>
      )}

      {/* Linha do tempo de eventos */}
      <Card>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
          <Clock className="size-4" /> Eventos
        </h3>
        <div className="flex flex-col gap-1">
          {a.events.map((e, i) => (
            <EventRow key={i} e={e} />
          ))}
        </div>
      </Card>
    </div>
  );
}

function WindowCard({ w }: { w: ProblemWindow }) {
  return (
    <div className="rounded-md border border-warn/30 bg-warn/5 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-2 text-sm">
        <span className="font-display font-bold text-warn">{fmtTime(w.tStart)}</span>
        <span className="text-xs text-ink-faint">({w.durationSec}s)</span>
        <span className="font-semibold">{w.cause}</span>
      </div>
      {w.signals.length > 0 && (
        <div className="mt-0.5 text-xs text-ink-muted">{w.signals.join(" · ")}</div>
      )}
      <div className="mt-1 text-xs text-ink">→ {w.advice}</div>
    </div>
  );
}

const EVENT_DOT: Record<ReportEvent["kind"], string> = {
  start: "bg-ok",
  end: "bg-ink-faint",
  reconnect: "bg-warn",
  error: "bg-bad",
  recover: "bg-ok",
  cpu: "bg-warn",
};

function EventRow({ e }: { e: ReportEvent }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-12 shrink-0 text-xs tabular-nums text-ink-faint">{fmtTime(e.t)}</span>
      <span className={cn("size-2 shrink-0 rounded-full", EVENT_DOT[e.kind])} />
      <span className="text-ink-muted">{e.label}</span>
    </div>
  );
}
