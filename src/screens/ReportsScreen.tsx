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
  Eye,
  MessageSquare,
  Copy,
  Scissors,
} from "lucide-react";
import { api } from "../lib/api";
import { PLATFORMS } from "../lib/platforms";
import { toast } from "../lib/toast";
import { cn } from "../lib/utils";
import type { SessionData, SessionMeta } from "../lib/types";
import {
  analyze,
  bitrateSeries,
  chatRateSeries,
  cpuSeries,
  gpuSeries,
  hasChat,
  hasObs,
  obsRenderSeries,
  parseSession,
  viewerSeries,
  type Highlight,
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

  // Retenção (viewers) — timeline própria; marca raids (costumam dar pico).
  const vN = data.viewerSamples.length;
  const viewerIndexAt = (t: number) => {
    for (let i = 0; i < vN; i++) if (data.viewerSamples[i].t >= t) return i;
    return Math.max(0, vN - 1);
  };
  const raidMarkers: ChartMarker[] = data.alertEvents
    .filter((e) => e.kind === "raid")
    .map((e) => ({ index: viewerIndexAt(e.t), color: "#7c9cff" }));
  const chatMarkers: ChartMarker[] = a.highlights
    .filter((h) => h.kind === "chat")
    .map((h) => ({ index: indexAt(h.t), color: "#ffb323" }));

  // Tempo relativo ao início (pra achar/clipar no VOD).
  const rel = (t: number) => {
    const s = Math.max(0, Math.round((t - data.meta.startedAt) / 1000));
    const h = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
    const ss = (s % 60).toString().padStart(2, "0");
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  };

  // Stats de engajamento pro topo.
  const heroStats: { label: string; value: string; accent?: boolean }[] = [];
  if (a.viewers.hasData) {
    heroStats.push({ label: "Pico de viewers", value: a.viewers.peak.toLocaleString("pt-BR"), accent: true });
    heroStats.push({ label: "Média", value: a.viewers.avg.toLocaleString("pt-BR") });
  }
  if (a.alerts.subs > 0) heroStats.push({ label: "Inscrições", value: String(a.alerts.subs) });
  if (a.alerts.bits > 0) heroStats.push({ label: "Bits", value: a.alerts.bits.toLocaleString("pt-BR") });
  if (a.alerts.raids > 0)
    heroStats.push({ label: "Raids", value: `${a.alerts.raids} · +${a.alerts.raidViewers}` });
  if (a.chat.hasData) heroStats.push({ label: "Mensagens", value: a.chat.total.toLocaleString("pt-BR") });

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

      {/* Painel de engajamento */}
      {heroStats.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {heroStats.map((s) => (
            <div
              key={s.label}
              className={cn(
                "rounded-lg border-2 px-3 py-2.5",
                s.accent ? "border-brass bg-brass/10" : "border-border-soft bg-surface-2"
              )}
            >
              <div className="font-display text-2xl font-extrabold leading-none tabular-nums">
                {s.value}
              </div>
              <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Veredito */}
      <Card className={cn("mb-4 flex items-start gap-3 border-2", tone)}>
        <AlertTriangle className="mt-0.5 size-5 shrink-0" />
        <div>
          <div className="font-display font-bold">{a.verdict.title}</div>
          <div className="text-sm text-ink-muted">{a.verdict.detail}</div>
        </div>
      </Card>

      {/* Retenção (audiência ao vivo) */}
      {a.viewers.hasData && vN > 1 && (
        <Card className="mb-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
            <Eye className="size-4" /> Audiência ao vivo (retenção)
          </h3>
          <LineChart
            series={[{ label: "Assistindo", color: "#56e39b", values: viewerSeries(data) }]}
            n={vN}
            markers={raidMarkers}
            formatValue={(v) => Math.round(v).toLocaleString("pt-BR")}
          />
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
            <span>
              Pico <strong className="text-ink">{a.viewers.peak.toLocaleString("pt-BR")}</strong>
            </span>
            <span>
              Média <strong className="text-ink">{a.viewers.avg.toLocaleString("pt-BR")}</strong>
            </span>
            <span>
              Começo {a.viewers.start} → fim {a.viewers.end}
            </span>
            {raidMarkers.length > 0 && <span className="text-[#7c9cff]">● raids</span>}
          </div>
          {a.viewers.byPlatform.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {a.viewers.byPlatform.map((p) => (
                <span
                  key={`${p.platform}:${p.source}`}
                  className="flex items-center gap-1.5 rounded bg-surface-2 px-2 py-1 text-xs text-ink-muted"
                >
                  <PlatformGlyph id={p.platform} size={14} /> {p.source}:{" "}
                  <strong className="text-ink">{p.peak.toLocaleString("pt-BR")}</strong>
                </span>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Momentos de destaque (clipes sugeridos) */}
      {a.highlights.length > 0 && (
        <Card className="mb-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
            <Scissors className="size-4 text-brass" /> Momentos de destaque (pra clipar)
          </h3>
          <div className="flex flex-col gap-1.5">
            {a.highlights.map((h, i) => (
              <HighlightRow key={i} h={h} time={rel(h.t)} />
            ))}
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">
            ⏱️ Tempos relativos ao início da live — use no seu VOD pra cortar o clipe.
          </p>
        </Card>
      )}

      {/* Atividade do chat */}
      {hasChat(data) && n > 1 && (
        <Card className="mb-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
            <MessageSquare className="size-4" /> Atividade do chat (msgs/min)
          </h3>
          <LineChart
            series={[{ label: "msgs/min", color: "#ffb323", values: chatRateSeries(data) }]}
            n={n}
            markers={chatMarkers}
            formatValue={(v) => Math.round(v).toString()}
          />
          <div className="mt-2 text-xs text-ink-muted">
            Total <strong className="text-ink">{a.chat.total.toLocaleString("pt-BR")}</strong> · pico{" "}
            <strong className="text-ink">{a.chat.peakPerMin}/min</strong> · média {a.chat.avgPerMin}
            /min
          </div>
        </Card>
      )}

      {/* Resumo dos alertas */}
      {a.alerts.hasData && (
        <Card className="mb-4">
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
            Alertas da live
          </h3>
          <div className="flex flex-wrap gap-2">
            {ALERT_LABELS.map(([k, label, emoji]) =>
              a.alerts.byKind[k] ? (
                <span
                  key={k}
                  className="flex items-center gap-1.5 rounded-md bg-surface-2 px-2.5 py-1.5 text-sm"
                >
                  <span>{emoji}</span> <strong>{a.alerts.byKind[k]}</strong>{" "}
                  <span className="text-ink-muted">{label}</span>
                </span>
              ) : null
            )}
            {a.alerts.bits > 0 && (
              <span className="flex items-center gap-1.5 rounded-md bg-surface-2 px-2.5 py-1.5 text-sm">
                💎 <strong>{a.alerts.bits.toLocaleString("pt-BR")}</strong>{" "}
                <span className="text-ink-muted">bits no total</span>
              </span>
            )}
          </div>
          {a.alerts.topRaid && a.alerts.topRaid.amount > 0 && (
            <div className="mt-2 text-xs text-ink-muted">
              🚀 Maior raid:{" "}
              <strong className="text-ink">{a.alerts.topRaid.user}</strong> (+
              {Math.round(a.alerts.topRaid.amount)})
            </div>
          )}
        </Card>
      )}

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

      {/* OBS — render lag (encode/render) */}
      {n > 1 && hasObs(data) && (
        <Card className="mb-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
            <Activity className="size-4" /> OBS — render lag (ms)
          </h3>
          <LineChart
            series={[{ label: "Render lag", color: "#a855f7", values: obsRenderSeries(data) }]}
            n={n}
            markers={markers}
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
  marker: "bg-brass",
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

const ALERT_LABELS: [string, string, string][] = [
  ["sub", "inscrições", "⭐"],
  ["resub", "resubs", "🔁"],
  ["subgift", "gifts", "🎁"],
  ["member", "membros", "🏅"],
  ["superchat", "super chats", "💬"],
  ["raid", "raids", "🚀"],
  ["follow", "follows", "💜"],
];

const HL_ICON: Record<Highlight["kind"], string> = {
  chat: "💬",
  raid: "🚀",
  viewers: "📈",
  alert: "🎉",
};

function HighlightRow({ h, time }: { h: Highlight; time: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-md bg-surface-2 px-3 py-2">
      <span className="text-lg leading-none">{HL_ICON[h.kind]}</span>
      <span className="w-16 shrink-0 font-display font-extrabold tabular-nums text-ink">{time}</span>
      <span className="flex-1 text-sm text-ink-muted">{h.reason}</span>
      <button
        onClick={() => {
          void navigator.clipboard?.writeText(time);
          toast.success("Tempo copiado");
        }}
        className="rounded p-1 text-ink-faint transition-colors hover:bg-surface-3 hover:text-ink"
        title="Copiar tempo"
        aria-label="Copiar tempo"
      >
        <Copy className="size-3.5" />
      </button>
    </div>
  );
}
