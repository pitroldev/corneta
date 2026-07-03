import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
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
  Share2,
  Download,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import { useStore } from "../lib/store";
import { PLATFORMS } from "../lib/platforms";
import { toast } from "../lib/toast";
import { cn } from "../lib/utils";
import type { SessionData, SessionMeta, SessionSummary } from "../lib/types";
import {
  analyze,
  bitrateSeries,
  chatRateSeries,
  cpuSeries,
  dropCachedSummary,
  getCachedSummary,
  gpuSeries,
  hasChat,
  hasObs,
  obsRenderSeries,
  parseSession,
  setCachedSummary,
  summarize,
  viewerSeries,
  type Highlight,
  type ProblemWindow,
  type ReportAnalysis,
  type ReportEvent,
} from "../lib/report";
import { LineChart, type ChartMarker } from "../components/LineChart";
import {
  Button,
  Card,
  EmptyState,
  PlatformGlyph,
  SectionTitle,
} from "../components/ui";
import { Modal } from "../components/Modal";
import {
  drawRecap,
  recapToBlob,
  RECAP_SIZE,
  type RecapData,
  type RecapStat,
} from "../lib/recap";

function fmtDur(sec: number): string {
  const total = Math.round(sec / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${m}min`;
}
// Com ano: "Live de 02/07" fica ambígua depois de um ano de uso.
const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
const fmtTime = (ms: number) =>
  new Date(ms).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
// Data local em ISO pro nome de arquivo — não colide com o do ano anterior.
const fmtDateFile = (ms: number) => {
  const d = new Date(ms);
  const p = (x: number) => x.toString().padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// Nomes dos modos como na tela Qualidade (nunca o enum interno).
const MODE_LABEL: Record<string, string> = {
  "per-platform": "Caprichado",
  passthrough: "Na lata",
  hybrid: "Esperto",
};

export function ReportsScreen() {
  const [sessions, setSessions] = useState<SessionMeta[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<Record<string, SessionSummary>>({});

  const markReportSeen = useStore((s) => s.markReportSeen);
  const refresh = () => api.listSessions().then(setSessions);
  useEffect(() => {
    void refresh();
    markReportSeen(); // abriu Relatórios → some o selo "NOVO"
  }, [markReportSeen]);

  // Resumos pros chips da lista: cache primeiro, o que faltar é computado em
  // background (uma sessão por vez, pra não ler todos os NDJSON de uma tacada).
  useEffect(() => {
    if (!sessions?.length) return;
    let alive = true;
    void (async () => {
      const cached: Record<string, SessionSummary> = {};
      const missing: string[] = [];
      for (const s of sessions) {
        const c = getCachedSummary(s.id);
        if (c) cached[s.id] = c;
        else missing.push(s.id);
      }
      if (alive) setSummaries(cached);
      for (const id of missing) {
        try {
          const raw = await api.readSession(id);
          if (!alive) return;
          const d = parseSession(raw);
          if (!d) continue;
          const sum = summarize(d, analyze(d));
          // Sessão ainda no ar (sem registro "end") mostra os chips mas NÃO entra
          // no cache — senão o resumo de meia live ficaria congelado pra sempre.
          if (d.meta.endedAt != null) setCachedSummary(id, sum);
          setSummaries((prev) => ({ ...prev, [id]: sum }));
        } catch {
          // sessão ilegível — segue sem chips
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [sessions]);

  if (selected) {
    // Lista vem ordenada da mais nova pra mais velha → a "última live" é a seguinte.
    const idx = sessions?.findIndex((s) => s.id === selected) ?? -1;
    const prevId = (idx >= 0 ? sessions?.[idx + 1]?.id : null) ?? null;
    return (
      <ReportDetail
        id={selected}
        prevId={prevId}
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
        subtitle="O retrato de cada live: o que travou e o que prendeu a galera."
        right={
          <Button
            variant="subtle"
            size="sm"
            onClick={() => void api.openSessionsDir()}
          >
            <FolderOpen className="size-4" /> Abrir pasta
          </Button>
        }
      />

      {sessions === null ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-lg bg-surface-2"
            />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState title="Nenhuma live ainda">
          Quando a live encerra, monto o relatório dela aqui.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {sessions.map((s) => (
            <SessionRow
              key={s.id}
              meta={s}
              summary={summaries[s.id]}
              onOpen={() => setSelected(s.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const TONE_DOT = { ok: "bg-ok", warn: "bg-warn", bad: "bg-bad" } as const;
const TONE_TEXT = { ok: "text-ok", warn: "text-warn", bad: "text-bad" } as const;

function SessionRow({
  meta,
  summary,
  onOpen,
}: {
  meta: SessionMeta;
  summary?: SessionSummary;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className="group flex items-center gap-4 rounded-lg border-2 border-border bg-surface px-4 py-3 text-left transition-colors hover:border-brass"
    >
      <div className="flex w-24 shrink-0 flex-col">
        <span className="font-display text-lg font-extrabold leading-none">
          {fmtDate(meta.startedAt)}
        </span>
        <span className="text-[11px] font-semibold text-ink-faint">
          {fmtTime(meta.startedAt)}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <span className="text-sm font-bold">
          {fmtDur(meta.durationSec)} no ar
        </span>
        <div className="flex items-center gap-1.5">
          {meta.platforms.map((p) => (
            <PlatformGlyph key={p.id} id={p.platformId} size={18} />
          ))}
          <span className="ml-1 text-xs text-ink-faint">
            {meta.platforms.map((p) => p.name).join(", ")}
          </span>
        </div>
      </div>
      {/* Como foi a live, sem precisar abrir: pico · chat · veredito */}
      {summary?.hasData && (
        <div className="hidden shrink-0 items-center gap-3 text-xs text-ink-muted sm:flex">
          {summary.peakViewers != null && (
            <span className="flex items-center gap-1" title="Pico de audiência">
              <Eye className="size-3.5" />
              <span className="tabular-nums">
                {summary.peakViewers.toLocaleString("pt-BR")}
              </span>
            </span>
          )}
          {summary.chatTotal != null && (
            <span className="flex items-center gap-1" title="Mensagens no chat">
              <MessageSquare className="size-3.5" />
              <span className="tabular-nums">
                {summary.chatTotal.toLocaleString("pt-BR")}
              </span>
            </span>
          )}
          <span
            className={cn(
              "flex items-center gap-1.5 font-semibold",
              TONE_TEXT[summary.verdictTone],
            )}
            title={
              summary.problemWindows === 0
                ? "Transmissão limpa"
                : "Trechos com problema — abra pra ver"
            }
          >
            <span
              className={cn("size-2 rounded-full", TONE_DOT[summary.verdictTone])}
            />
            {summary.problemWindows === 0
              ? "limpa"
              : `${summary.problemWindows} perrengue${summary.problemWindows > 1 ? "s" : ""}`}
          </span>
        </div>
      )}
      <ChevronRight className="size-5 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-brass" />
    </button>
  );
}

// Monta o pôster de recap a partir do relatório analisado.
function buildRecap(data: SessionData, a: ReportAnalysis): RecapData {
  const platforms = data.meta.platforms.map((p) => ({
    name: p.name,
    color:
      PLATFORMS[p.platformId as keyof typeof PLATFORMS]?.color ?? "#ffb323",
  }));
  const follows = a.alerts.byKind.follow ?? 0;
  const big: RecapStat[] = [];
  if (a.viewers.hasData)
    big.push({
      label: "pico de audiência",
      value: a.viewers.peak.toLocaleString("pt-BR"),
    });
  if (a.chat.hasData)
    big.push({
      label: "mensagens",
      value: a.chat.total.toLocaleString("pt-BR"),
    });
  const small: RecapStat[] = [];
  if (big.length > 0)
    small.push({ label: "tempo no ar", value: fmtDur(data.meta.durationSec) });
  if (a.viewers.hasData)
    small.push({
      label: "média",
      value: a.viewers.avg.toLocaleString("pt-BR"),
    });
  if (follows > 0)
    small.push({
      label: "novos seguidores",
      value: follows.toLocaleString("pt-BR"),
    });
  if (a.alerts.subs > 0)
    small.push({ label: "inscrições", value: String(a.alerts.subs) });
  if (a.alerts.bits > 0)
    small.push({ label: "bits", value: a.alerts.bits.toLocaleString("pt-BR") });
  if (a.alerts.raids > 0)
    small.push({ label: "raids", value: String(a.alerts.raids) });
  // Sem audiência nem chat → promove tempo no ar (e inscrições) pros heróis.
  if (big.length === 0) {
    big.push({ label: "tempo no ar", value: fmtDur(data.meta.durationSec) });
    if (a.alerts.subs > 0)
      big.push({ label: "inscrições", value: String(a.alerts.subs) });
  }
  const top = a.highlights[0]?.reason;
  const moment = top
    ? top.length > 44
      ? `${top.slice(0, 43)}…`
      : top
    : undefined;
  // não repete nos secundários um rótulo que já virou herói (ex.: "inscrições")
  const bigLabels = new Set(big.map((s) => s.label));
  return {
    brand: "CORNETA",
    date: fmtDate(data.meta.startedAt),
    title: `LIVE DE ${fmtDate(data.meta.startedAt)}`,
    subtitle: `${fmtDur(data.meta.durationSec)} · ${data.meta.platforms.map((p) => p.name).join(" · ")}`,
    big,
    small: small.filter((s) => !bigLabels.has(s.label)).slice(0, 4),
    moment,
    platforms,
    footer: "transmitido com Corneta — multistream num app só",
  };
}

function RecapModal({
  data,
  analysis,
  onClose,
}: {
  data: SessionData;
  analysis: ReportAnalysis;
  onClose: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    let raf = 0;
    // Desenha AGORA (com a fonte que tiver) e redesenha quando as fontes chegarem —
    // esperar `fonts.ready` antes do 1º traço deixava o pôster em branco se a
    // promise demorasse/pendurasse. Erro de desenho vira toast, não tela muda.
    const paint = () => {
      const el = ref.current;
      if (!el) {
        // Ref ainda não anexada (portal/animação do modal) — tenta no próximo frame.
        raf = requestAnimationFrame(paint);
        return;
      }
      const ctx = el.getContext("2d");
      if (!ctx) {
        toast.error("Não consegui desenhar o recap nesta máquina.");
        return;
      }
      try {
        const r = buildRecap(data, analysis);
        drawRecap(ctx, r);
        void (document.fonts?.ready ?? Promise.resolve()).then(() => {
          if (alive) drawRecap(ctx, r);
        });
      } catch (e) {
        toast.error(`O recap falhou ao desenhar: ${String(e).replace(/^Error:\s*/, "")}`);
      }
    };
    paint();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [data, analysis]);

  const copy = async () => {
    const el = ref.current;
    if (!el) return;
    try {
      const blob = await recapToBlob(el);
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      toast.success("Imagem copiada — cola no WhatsApp/Discord/Twitter 📋");
    } catch {
      toast.error("Não consegui copiar; use o Baixar PNG");
    }
  };
  const download = async () => {
    const el = ref.current;
    if (!el) return;
    const blob = await recapToBlob(el);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `corneta-live-${fmtDateFile(data.meta.startedAt)}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <Modal
      title="Recap da live"
      onClose={onClose}
      className="max-w-lg rounded-xl bg-surface p-5 pop"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xl">Recap pra postar</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>
      <canvas
        ref={ref}
        width={RECAP_SIZE}
        height={RECAP_SIZE}
        className="mb-3 w-full border-2 border-border-soft"
      />
      <div className="flex gap-2">
        <Button variant="primary" className="flex-1" onClick={copy}>
          <Copy className="size-4" /> Copiar imagem
        </Button>
        <Button variant="subtle" className="flex-1" onClick={download}>
          <Download className="size-4" /> Baixar PNG
        </Button>
      </div>
    </Modal>
  );
}

function ReportDetail({
  id,
  prevId,
  onBack,
  onDeleted,
}: {
  id: string;
  /** Sessão imediatamente anterior (pra comparar com a última live). */
  prevId: string | null;
  onBack: () => void;
  onDeleted: () => void;
}) {
  const [data, setData] = useState<SessionData | null | "loading">("loading");
  const [showRecap, setShowRecap] = useState(false);
  const [prevSummary, setPrevSummary] = useState<SessionSummary | null>(null);

  useEffect(() => {
    let alive = true;
    void api.readSession(id).then((raw) => {
      if (!alive) return;
      const d = parseSession(raw);
      setData(d);
      // Aproveita a leitura pra deixar o resumo desta live no cache — só de
      // sessão encerrada (a que ainda roda geraria um snapshot parcial eterno).
      if (d && d.meta.endedAt != null) setCachedSummary(id, summarize(d, analyze(d)));
    });
    return () => {
      alive = false;
    };
  }, [id]);

  // Resumo da live anterior: cache ou computa on-demand.
  useEffect(() => {
    setPrevSummary(null);
    if (!prevId) return;
    const cached = getCachedSummary(prevId);
    if (cached) {
      setPrevSummary(cached);
      return;
    }
    let alive = true;
    void api
      .readSession(prevId)
      .then((raw) => {
        if (!alive) return;
        const d = parseSession(raw);
        if (!d) return;
        const sum = summarize(d, analyze(d));
        if (d.meta.endedAt != null) setCachedSummary(prevId, sum);
        setPrevSummary(sum);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [prevId]);

  const remove = async () => {
    await api.deleteSession(id);
    dropCachedSummary(id);
    toast.info("Relatório excluído");
    onDeleted();
  };

  if (data === "loading") {
    return (
      <div className="mx-auto max-w-3xl">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" /> Voltar
        </Button>
        <div className="mt-4 flex flex-col gap-3">
          <div className="h-20 animate-pulse rounded-lg bg-surface-2" />
          <div className="h-16 animate-pulse rounded-lg bg-surface-2" />
          <div className="h-44 animate-pulse rounded-lg bg-surface-2" />
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-3xl">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" /> Voltar
        </Button>
        <Card className="mt-4 text-sm text-ink-muted">
          Não consegui ler esta sessão.
        </Card>
      </div>
    );
  }

  const a = analyze(data);
  const n = data.samples.length;
  const platColor = (pid: string) =>
    PLATFORMS[pid as keyof typeof PLATFORMS]?.color ?? "#ffb323";

  // Marcadores de evento (reconexão/erro) no eixo de tempo.
  const indexAt = (t: number) => {
    for (let i = 0; i < n; i++) if (data.samples[i].t >= t) return i;
    return Math.max(0, n - 1);
  };
  const markers: ChartMarker[] = a.events
    .filter((e) => e.kind === "reconnect" || e.kind === "error" || e.kind === "signal")
    .map((e) => ({
      index: indexAt(e.t),
      color: e.kind === "error" ? "#ef4444" : e.kind === "signal" ? "#a855f7" : "#f97316",
    }));

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
    const mm = Math.floor((s % 3600) / 60)
      .toString()
      .padStart(2, "0");
    const ss = (s % 60).toString().padStart(2, "0");
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  };
  // Eixo X dos gráficos: índice de amostra → tempo relativo (cada timeline tem a sua).
  const relAtSample = (i: number) =>
    rel(data.samples[Math.min(i, n - 1)]?.t ?? data.meta.startedAt);
  const relAtViewer = (i: number) =>
    rel(data.viewerSamples[Math.min(i, vN - 1)]?.t ?? data.meta.startedAt);

  // Delta vs a live anterior ("essa foi melhor que a última?").
  const delta = (
    cur: number,
    prev: number | null | undefined,
  ): { text: string; tone: "ok" | "bad" | "neutral" } | undefined => {
    if (prev == null || prev <= 0) return undefined;
    const pct = Math.round(((cur - prev) / prev) * 100);
    if (pct === 0) return { text: "igual à última live", tone: "neutral" };
    return {
      text: `${pct > 0 ? "+" : ""}${pct}% vs última live`,
      tone: pct > 0 ? "ok" : "bad",
    };
  };

  // Stats de engajamento pro topo.
  const heroStats: {
    label: string;
    value: string;
    accent?: boolean;
    sub?: { text: string; tone: "ok" | "bad" | "neutral" };
  }[] = [];
  if (a.viewers.hasData) {
    heroStats.push({
      label: "Pico de viewers",
      value: a.viewers.peak.toLocaleString("pt-BR"),
      accent: true,
      sub: delta(a.viewers.peak, prevSummary?.peakViewers),
    });
    heroStats.push({
      label: "Média",
      value: a.viewers.avg.toLocaleString("pt-BR"),
      sub: delta(a.viewers.avg, prevSummary?.avgViewers),
    });
  }
  if (a.alerts.subs > 0)
    heroStats.push({ label: "Inscrições", value: String(a.alerts.subs) });
  if (a.alerts.bits > 0)
    heroStats.push({
      label: "Bits",
      value: a.alerts.bits.toLocaleString("pt-BR"),
    });
  if (a.alerts.raids > 0)
    heroStats.push({
      label: "Raids",
      value: `${a.alerts.raids} · +${a.alerts.raidViewers}`,
    });
  if (a.chat.hasData)
    heroStats.push({
      label: "Mensagens",
      value: a.chat.total.toLocaleString("pt-BR"),
      sub: delta(a.chat.total, prevSummary?.chatTotal),
    });

  const tone =
    a.verdict.tone === "ok"
      ? "border-ok/40 bg-ok/10 text-ok"
      : a.verdict.tone === "warn"
        ? "border-warn/40 bg-warn/10 text-warn"
        : "border-bad/40 bg-bad/10 text-bad";
  const VIcon = a.verdict.tone === "ok" ? Check : AlertTriangle;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" /> Voltar
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="subtle" size="sm" onClick={() => setShowRecap(true)}>
            <Share2 className="size-4" /> Recap
          </Button>
          <DeleteButton onDelete={remove} />
        </div>
      </div>
      {showRecap && (
        <RecapModal
          data={data}
          analysis={a}
          onClose={() => setShowRecap(false)}
        />
      )}

      <div className="mb-1 font-display text-2xl font-extrabold">
        Live de {fmtDate(data.meta.startedAt)}
      </div>
      <div className="mb-4 text-sm text-ink-muted">
        {fmtDur(data.meta.durationSec)} · {fmtTime(data.meta.startedAt)}
        {data.meta.endedAt ? `–${fmtTime(data.meta.endedAt)}` : ""} ·{" "}
        {data.meta.platforms.map((p) => p.name).join(", ")} · modo{" "}
        {MODE_LABEL[data.meta.mode] ?? data.meta.mode}
      </div>

      {/* Painel de engajamento */}
      {heroStats.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {heroStats.map((s) => (
            <div
              key={s.label}
              className={cn(
                "rounded-lg border-2 px-3 py-2.5",
                s.accent
                  ? "border-brass bg-brass/10"
                  : "border-border-soft bg-surface-2",
              )}
            >
              <div className="font-display text-2xl font-extrabold leading-none tabular-nums">
                {s.value}
              </div>
              <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                {s.label}
              </div>
              {s.sub && (
                <div
                  className={cn(
                    "mt-0.5 text-[11px] font-semibold",
                    s.sub.tone === "ok"
                      ? "text-ok"
                      : s.sub.tone === "bad"
                        ? "text-bad"
                        : "text-ink-faint",
                  )}
                >
                  {s.sub.text}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Veredito */}
      <Card className={cn("mb-4 flex items-start gap-3 border-2", tone)}>
        <VIcon className="mt-0.5 size-5 shrink-0" />
        <div>
          <div className="font-display font-bold">{a.verdict.title}</div>
          <div className="text-sm text-ink-muted">{a.verdict.detail}</div>
        </div>
      </Card>

      {/* Retenção (audiência ao vivo) */}
      {a.viewers.hasData && vN > 1 && (
        <Card className="mb-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
            <Eye className="size-4" /> Audiência ao vivo (quanto da galera
            ficou)
          </h3>
          <LineChart
            series={[
              {
                label: "Assistindo",
                color: "#56e39b",
                values: viewerSeries(data),
              },
            ]}
            n={vN}
            markers={raidMarkers}
            formatValue={(v) => Math.round(v).toLocaleString("pt-BR")}
            formatX={relAtViewer}
          />
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
            <span>
              Pico{" "}
              <strong className="text-ink">
                {a.viewers.peak.toLocaleString("pt-BR")}
              </strong>
            </span>
            <span>
              Média{" "}
              <strong className="text-ink">
                {a.viewers.avg.toLocaleString("pt-BR")}
              </strong>
            </span>
            <span>
              Começo {a.viewers.start} → fim {a.viewers.end}
            </span>
            {raidMarkers.length > 0 && (
              <span className="text-[#7c9cff]">● raids</span>
            )}
          </div>
          {a.viewers.byPlatform.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {a.viewers.byPlatform.map((p) => (
                <span
                  key={`${p.platform}:${p.source}`}
                  className="flex items-center gap-1.5 rounded bg-surface-2 px-2 py-1 text-xs text-ink-muted"
                >
                  <PlatformGlyph id={p.platform} size={14} /> {p.source}:{" "}
                  <strong className="text-ink">
                    {p.peak.toLocaleString("pt-BR")}
                  </strong>
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
            <Scissors className="size-4 text-brass" /> Momentos de destaque (pra
            clipar)
          </h3>
          <div className="flex flex-col gap-1.5">
            {a.highlights.map((h, i) => (
              <HighlightRow key={i} h={h} time={rel(h.t)} />
            ))}
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">
            ⏱️ Os tempos contam do início da live — ache o minuto na gravação
            (VOD) pra cortar o clipe.
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
            series={[
              {
                label: "msgs/min",
                color: "#ffb323",
                values: chatRateSeries(data),
              },
            ]}
            n={n}
            markers={chatMarkers}
            formatValue={(v) => Math.round(v).toString()}
            formatX={relAtSample}
          />
          <div className="mt-2 text-xs text-ink-muted">
            Total{" "}
            <strong className="text-ink">
              {a.chat.total.toLocaleString("pt-BR")}
            </strong>{" "}
            · pico <strong className="text-ink">{a.chat.peakPerMin}/min</strong>{" "}
            · média {a.chat.avgPerMin}
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
              ) : null,
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
            formatValue={(v) => v.toFixed(1).replace(".", ",")}
            formatX={relAtSample}
          />
          {markers.length > 0 && (
            <div className="mt-2 flex gap-3 text-[11px] font-semibold text-ink-faint">
              <span className="text-[#f97316]">● reconexão</span>
              <span className="text-[#ef4444]">● erro</span>
              <span className="text-[#a855f7]">● sem sinal do OBS</span>
            </div>
          )}
        </Card>
      )}

      {/* Gráfico de CPU/GPU */}
      {n > 1 && (cpu.some((v) => v != null) || hasGpu) && (
        <Card className="mb-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
            <Cpu className="size-4" /> Carga da máquina (%)
          </h3>
          <LineChart
            series={machineSeries}
            n={n}
            yMax={100}
            formatValue={(v) => `${Math.round(v)}`}
            formatX={relAtSample}
            refLine={{ value: 92, label: "zona de perigo" }}
          />
        </Card>
      )}

      {/* OBS — render lag (encode/render) */}
      {n > 1 && hasObs(data) && (
        <Card className="mb-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
            <Activity className="size-4" /> OBS — atraso pra montar o quadro (ms)
          </h3>
          <LineChart
            series={[
              {
                label: "Render lag",
                color: "#a855f7",
                values: obsRenderSeries(data),
              },
            ]}
            n={n}
            markers={markers}
            formatValue={(v) => `${Math.round(v)}`}
            formatX={relAtSample}
          />
        </Card>
      )}

      {/* Resumo por plataforma */}
      <Card className="mb-4">
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
          Por plataforma
        </h3>
        <div className="flex flex-col gap-2">
          {a.perTarget.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 rounded-md bg-surface-2 px-3 py-2"
            >
              <PlatformGlyph id={t.platformId} size={22} />
              <span className="min-w-24 flex-1 font-display font-bold">
                {t.name}
              </span>
              <span className="text-xs text-ink-muted">
                ~{(t.avgBitrate / 1000).toFixed(1).replace(".", ",")} Mbps méd.
              </span>
              <span className="text-xs text-ink-muted">
                {t.maxDropped} quedas
              </span>
              <span
                className={cn(
                  "text-xs",
                  t.reconnects > 0 ? "text-warn" : "text-ink-faint",
                )}
              >
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
            <AlertTriangle className="size-4 text-warn" /> Trechos que deram
            problema
          </h3>
          <div className="flex flex-col gap-2">
            {a.windows.map((w, i) => (
              <WindowCard key={i} w={w} time={rel(w.tStart)} />
            ))}
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">
            ⏱️ Os tempos contam do início da live, pra achar o trecho no VOD.
          </p>
        </Card>
      )}

      {/* Linha do tempo de eventos */}
      <Card>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
          <Clock className="size-4" /> Eventos
        </h3>
        <div className="flex flex-col gap-1">
          {a.events.map((e, i) => (
            <EventRow key={i} e={e} time={rel(e.t)} />
          ))}
        </div>
      </Card>
    </div>
  );
}

function DeleteButton({ onDelete }: { onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <Button
      variant={confirm ? "danger" : "ghost"}
      size="sm"
      onClick={() => {
        if (!confirm) {
          setConfirm(true);
          setTimeout(() => setConfirm(false), 3000);
          return;
        }
        onDelete();
      }}
    >
      <Trash2 className="size-4" /> {confirm ? "Confirmar?" : "Excluir"}
    </Button>
  );
}

// Tempo relativo primário (acha no VOD), hora do relógio secundária.
function WindowCard({ w, time }: { w: ProblemWindow; time: string }) {
  return (
    <div className="rounded-md border border-warn/30 bg-warn/5 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-2 text-sm">
        <span className="font-display font-bold tabular-nums text-warn">
          {time}
        </span>
        <span className="text-xs text-ink-faint">
          ({fmtTime(w.tStart)} · {w.durationSec}s)
        </span>
        <span className="font-semibold">{w.cause}</span>
        <button
          onClick={() => {
            void navigator.clipboard?.writeText(time);
            toast.success("Tempo copiado");
          }}
          className="ml-auto rounded p-1 text-ink-faint transition-colors hover:bg-surface-3 hover:text-ink"
          title="Copiar tempo"
          aria-label="Copiar tempo"
        >
          <Copy className="size-3.5" />
        </button>
      </div>
      {w.signals.length > 0 && (
        <div className="mt-0.5 text-xs text-ink-muted">
          {w.signals.join(" · ")}
        </div>
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
  signal: "bg-bad",
};

// Mesmo relógio dos destaques/trechos (relativo ao início); hora real à direita.
function EventRow({ e, time }: { e: ReportEvent; time: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-16 shrink-0 text-xs font-semibold tabular-nums text-ink">
        {time}
      </span>
      <span className={cn("size-2 shrink-0 rounded-full", EVENT_DOT[e.kind])} />
      <span className="flex-1 text-ink-muted">{e.label}</span>
      <span className="text-[11px] tabular-nums text-ink-faint">
        {fmtTime(e.t)}
      </span>
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
      <span className="w-16 shrink-0 font-display font-extrabold tabular-nums text-ink">
        {time}
      </span>
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
