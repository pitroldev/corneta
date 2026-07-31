import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Play,
  Copy,
  Scissors,
  Share2,
  Download,
  FileText,
  Table2,
  Braces,
  Users,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import { useStore } from "../lib/store";
import { PLATFORMS } from "../lib/platforms";
import { toast } from "../lib/toast";
import { cn, errMsg } from "../lib/utils";
import type {
  ReplayChatGap,
  ReplayChatMessage,
  SessionData,
  SessionMeta,
  SessionSummary,
} from "../lib/types";
import { fractionalIndexAt } from "../lib/replay";
import {
  ReplayPlayer,
  type ReplayTick,
  type SeekRequest,
} from "../components/ReplayPlayer";
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
  chatRateSeriesFor,
  obsRenderSeries,
  parseChatSession,
  parseSession,
  setCachedSummary,
  summarize,
  viewerSeries,
  viewerSeriesFor,
  type ChannelBreakdown,
  type ChannelStats,
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
import { anonymize } from "../lib/export/anonymize";
import { historyCsv, seriesCsv, type HistoryRow } from "../lib/export/csv";
import { reportHtml } from "../lib/export/html";
import { reportJson } from "../lib/export/json";
import {
  fileStamp,
  rich,
  useI18n,
  useT,
  type Fmt,
  type I18n,
  type MessageKey,
} from "../lib/i18n";

// Nomes dos modos como na tela Qualidade (nunca o enum interno). A CHAVE do mapa
// é o valor gravado no meta da sessão — só o rótulo é texto de tela.
const MODE_KEY: Record<string, MessageKey> = {
  "per-platform": "reports.mode.perPlatform",
  passthrough: "reports.mode.passthrough",
  hybrid: "reports.mode.hybrid",
};

const platColor = (pid: string) =>
  PLATFORMS[pid as keyof typeof PLATFORMS]?.color ?? "#ffb323";

/** Clareia um `#rrggbb` em direção ao branco (k = 0..1). */
function lighten(hex: string, k: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m || k <= 0) return hex;
  const n = parseInt(m[1], 16);
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((c) =>
      Math.round(c + (255 - c) * Math.min(k, 0.75))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** Cor de cada canal no gráfico e na barra de fatia.
 *
 *  Duas contas da MESMA plataforma têm a mesma cor de marca — e era exatamente esse o
 *  caso que a segregação por canal veio resolver. Da segunda em diante o tom clareia,
 *  senão as duas séries do gráfico viram uma linha só. */
function channelColors(channels: ChannelStats[]): Record<string, string> {
  const nth: Record<string, number> = {};
  const out: Record<string, string> = {};
  for (const c of channels) {
    const i = nth[c.platform] ?? 0;
    nth[c.platform] = i + 1;
    out[c.key] = lighten(platColor(c.platform), i * 0.3);
  }
  return out;
}

export function ReportsScreen() {
  const t = useT();
  const [sessions, setSessions] = useState<SessionMeta[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<Record<string, SessionSummary>>(
    {},
  );

  const markReportSeen = useStore((s) => s.markReportSeen);
  // Estável entre renders: sem o `useCallback`, `refresh` nasce nova a cada
  // render e não pode entrar nas dependências do efeito abaixo — que é
  // justamente o que o lint cobra.
  const refresh = useCallback(() => api.listSessions(t).then(setSessions), [t]);
  useEffect(() => {
    void refresh();
    markReportSeen(); // abriu Relatórios → some o selo "NOVO"
  }, [markReportSeen, refresh]);

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
          const d = parseSession(raw, t);
          if (!d) continue;
          const sum = summarize(d, analyze(d, t));
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
  }, [sessions, t]);

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
        kicker={t("reports.list.kicker")}
        title={t("reports.list.title")}
        subtitle={t("reports.list.subtitle")}
        right={
          <div className="flex items-center gap-2">
            {sessions && sessions.length > 0 && (
              <HistoryCsvButton sessions={sessions} />
            )}
            <Button
              variant="subtle"
              size="sm"
              onClick={() => void api.openSessionsDir()}
            >
              <FolderOpen className="size-4" /> {t("reports.list.openFolder")}
            </Button>
          </div>
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
        <EmptyState title={t("reports.list.empty.title")}>
          {t("reports.list.empty.body")}
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

/** CSV do histórico: uma linha por live, pra acompanhar a evolução em planilha.
 *
 *  Lê e analisa cada sessão na hora, uma por vez. O resumo cacheado não serve: ele
 *  guarda 5 campos e a planilha quer 15 (seguidores, bits, raids, veredito…). Uma
 *  de cada vez porque o pico de memória vira o tamanho do MAIOR NDJSON em vez da
 *  soma de todos — 50 lives de 4h dariam dezenas de MB de uma vez. */
function HistoryCsvButton({ sessions }: { sessions: SessionMeta[] }) {
  const i18n = useI18n();
  const { t } = i18n;
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const rows: HistoryRow[] = [];
      let ilegiveis = 0;
      for (const meta of sessions) {
        try {
          const d = parseSession(await api.readSession(meta.id), t);
          if (!d) {
            ilegiveis++;
            continue;
          }
          // O `meta` da lista tem o fim estimado pelo mtime; o do arquivo é o real.
          rows.push({ meta: { ...meta, ...d.meta }, analysis: analyze(d, t) });
        } catch {
          ilegiveis++;
        }
      }
      if (!rows.length) {
        toast.error(t("reports.history.error.none"));
        return;
      }
      const ok = await api.saveTextFile({
        // A DATA continua ISO — ordena sozinha no explorador e não muda com o
        // idioma. Só a palavra do nome segue o idioma.
        name: `${t("reports.file.history")}-${fileStamp(Date.now())}.csv`,
        label: t("reports.download.csv.label"),
        ext: "csv",
        content: historyCsv(rows, i18n),
      });
      if (ok)
        toast.success(
          ilegiveis > 0
            ? t("reports.history.ok.some", {
                n: rows.length,
                bad: ilegiveis,
              })
            : t("reports.history.ok.all", { n: rows.length }),
        );
    } catch (e) {
      toast.error(t("reports.history.error.save", { err: errMsg(e) }));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      variant="subtle"
      size="sm"
      disabled={busy}
      onClick={() => void run()}
    >
      <Table2 className="size-4" />{" "}
      {busy ? t("reports.history.busy") : t("reports.history.button")}
    </Button>
  );
}

const TONE_DOT = { ok: "bg-ok", warn: "bg-warn", bad: "bg-bad" } as const;
const TONE_TEXT = {
  ok: "text-ok",
  warn: "text-warn",
  bad: "text-bad",
} as const;

function SessionRow({
  meta,
  summary,
  onOpen,
}: {
  meta: SessionMeta;
  summary?: SessionSummary;
  onOpen: () => void;
}) {
  const { t, tp, fmt } = useI18n();
  return (
    <button
      onClick={onOpen}
      className="group flex items-center gap-4 rounded-lg border-2 border-border bg-surface px-4 py-3 text-left transition-colors hover:border-brass"
    >
      <div className="flex w-24 shrink-0 flex-col">
        <span className="font-display text-lg font-extrabold leading-none">
          {fmt.date(meta.startedAt)}
        </span>
        <span className="text-[11px] font-semibold text-ink-faint">
          {fmt.time(meta.startedAt)}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <span className="text-sm font-bold">
          {t("reports.row.onAir", { dur: fmt.dur(meta.durationSec) })}
        </span>
        <div className="flex items-center gap-1.5">
          {meta.platforms.map((p) => (
            <PlatformGlyph key={p.id} id={p.platformId} size={18} />
          ))}
          <span className="ml-1 text-xs text-ink-faint">
            {meta.platforms.map((p) => p.name).join(", ")}
          </span>
          {/* Selo de gravação. Sem ele, o replay seria uma feature escondida: quem gravou
              três lives não teria como saber QUAL delas dá pra assistir sem abrir uma a
              uma. É a única pista na lista de que existe vídeo do outro lado. */}
          {meta.hasVideo && (
            <span
              className="ml-1 flex items-center gap-1 rounded bg-brass/15 px-1.5 py-0.5 text-[10px] font-bold text-brass"
              title={t("reports.row.hasVideo.title")}
            >
              <Play className="size-3" /> {t("reports.row.hasVideo")}
            </span>
          )}
        </div>
      </div>
      {/* Como foi a live, sem precisar abrir: pico · chat · veredito */}
      {summary?.hasData && (
        <div className="hidden shrink-0 items-center gap-3 text-xs text-ink-muted sm:flex">
          {summary.peakViewers != null && (
            <span
              className="flex items-center gap-1"
              title={t("reports.row.peakViewers.title")}
            >
              <Eye className="size-3.5" />
              <span className="tabular-nums">
                {fmt.num(summary.peakViewers)}
              </span>
            </span>
          )}
          {summary.chatTotal != null && (
            <span
              className="flex items-center gap-1"
              title={t("reports.row.chat.title")}
            >
              <MessageSquare className="size-3.5" />
              <span className="tabular-nums">{fmt.num(summary.chatTotal)}</span>
            </span>
          )}
          <span
            className={cn(
              "flex items-center gap-1.5 font-semibold",
              TONE_TEXT[summary.verdictTone],
            )}
            title={t(
              summary.problemWindows === 0
                ? "reports.row.clean.title"
                : "reports.row.problems.title",
            )}
          >
            <span
              className={cn(
                "size-2 rounded-full",
                TONE_DOT[summary.verdictTone],
              )}
            />
            {summary.problemWindows === 0
              ? t("reports.row.clean")
              : tp("reports.row.problems", summary.problemWindows)}
          </span>
        </div>
      )}
      <ChevronRight className="size-5 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-brass" />
    </button>
  );
}

// Monta o pôster de recap a partir do relatório analisado.
// Não é componente: `t`/`fmt` chegam de quem chama (RecapModal).
function buildRecap(
  data: SessionData,
  a: ReportAnalysis,
  t: I18n["t"],
  fmt: Fmt,
): RecapData {
  const platforms = data.meta.platforms.map((p) => ({
    name: p.name,
    color:
      PLATFORMS[p.platformId as keyof typeof PLATFORMS]?.color ?? "#ffb323",
  }));
  // Mesmo número do painel do topo (contador da plataforma, ou alertas de follow).
  const follows = a.byChannel.followersGained ?? 0;
  const big: RecapStat[] = [];
  if (a.viewers.hasData)
    big.push({
      label: t("reports.recap.stat.peakViewers"),
      value: fmt.num(a.viewers.peak),
    });
  if (a.chat.hasData)
    big.push({
      label: t("reports.recap.stat.messages"),
      value: fmt.num(a.chat.total),
    });
  const small: RecapStat[] = [];
  if (big.length > 0)
    small.push({
      label: t("reports.recap.stat.onAir"),
      value: fmt.dur(data.meta.durationSec),
    });
  if (a.viewers.hasData)
    small.push({
      label: t("reports.recap.stat.avg"),
      value: fmt.num(a.viewers.avg),
    });
  if (follows > 0)
    small.push({
      label: t("reports.recap.stat.newFollowers"),
      value: fmt.num(follows),
    });
  if (a.alerts.subs > 0)
    small.push({
      label: t("reports.recap.stat.subs"),
      value: String(a.alerts.subs),
    });
  if (a.alerts.bits > 0)
    small.push({
      label: t("reports.recap.stat.bits"),
      value: fmt.num(a.alerts.bits),
    });
  if (a.alerts.raids > 0)
    small.push({
      label: t("reports.recap.stat.raids"),
      value: String(a.alerts.raids),
    });
  // Sem audiência nem chat → promove tempo no ar (e inscrições) pros heróis.
  if (big.length === 0) {
    big.push({
      label: t("reports.recap.stat.onAir"),
      value: fmt.dur(data.meta.durationSec),
    });
    if (a.alerts.subs > 0)
      big.push({
        label: t("reports.recap.stat.subs"),
        value: String(a.alerts.subs),
      });
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
    date: fmt.date(data.meta.startedAt),
    title: t("reports.recap.title", { date: fmt.date(data.meta.startedAt) }),
    subtitle: `${fmt.dur(data.meta.durationSec)} · ${data.meta.platforms.map((p) => p.name).join(" · ")}`,
    big,
    small: small.filter((s) => !bigLabels.has(s.label)).slice(0, 4),
    moment,
    platforms,
    footer: t("reports.recap.footer"),
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
  const { t, fmt } = useI18n();
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
        toast.error(t("reports.recap.error.canvas"));
        return;
      }
      try {
        const r = buildRecap(data, analysis, t, fmt);
        drawRecap(ctx, r, t);
        void (document.fonts?.ready ?? Promise.resolve()).then(() => {
          if (alive) drawRecap(ctx, r, t);
        });
      } catch (e) {
        toast.error(t("reports.recap.error.draw", { err: errMsg(e) }));
      }
    };
    paint();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [data, analysis, t, fmt]);

  const copy = async () => {
    const el = ref.current;
    if (!el) return;
    try {
      const blob = await recapToBlob(el);
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      toast.success(t("reports.recap.copied"));
    } catch {
      toast.error(t("reports.recap.error.copy"));
    }
  };
  const download = async () => {
    const el = ref.current;
    if (!el) return;
    const blob = await recapToBlob(el);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${t("reports.file.live")}-${fileStamp(data.meta.startedAt)}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <Modal
      title={t("reports.recap.modal.name")}
      onClose={onClose}
      className="max-w-lg rounded-xl bg-surface p-5 pop"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xl">{t("reports.recap.modal.heading")}</h3>
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
          <Copy className="size-4" /> {t("reports.recap.copy")}
        </Button>
        <Button variant="subtle" className="flex-1" onClick={download}>
          <Download className="size-4" /> {t("reports.recap.download")}
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
  const { t, tp, fmt } = useI18n();
  const [data, setData] = useState<SessionData | null | "loading">("loading");
  const [showRecap, setShowRecap] = useState(false);
  const [showDownload, setShowDownload] = useState(false);
  const [prevSummary, setPrevSummary] = useState<SessionSummary | null>(null);
  // Cada gráfico tem seu próprio "Total / Por canal": quem quer ver a audiência
  // repartida nem sempre quer o chat repartido junto.
  const [splitViewers, setSplitViewers] = useState(false);
  const [splitChat, setSplitChat] = useState(false);
  // O CURSOR. Um número em epoch ms, e tudo se pendura nele: o vídeo tocando move,
  // clicar em qualquer coisa do relatório move, e os gráficos e o chat leem.
  const [playheadT, setPlayheadT] = useState<number | null>(null);
  const [seek, setSeek] = useState<SeekRequest | null>(null);
  const [chatReplay, setChatReplay] = useState<{
    messages: ReplayChatMessage[];
    gaps: ReplayChatGap[];
  }>({ messages: [], gaps: [] });
  // Bump força a releitura da sessão (marcador novo, gravação apagada).
  const [reload, setReload] = useState(0);

  /** Único caminho de "leve o vídeo pra este instante". O nonce faz o segundo clique no
   *  MESMO evento saltar de novo, em vez de parecer quebrado. */
  const seekTo = (t: number) => setSeek({ epoch: t, nonce: Date.now() });

  useEffect(() => {
    let alive = true;
    void api.readSession(id).then((raw) => {
      if (!alive) return;
      const d = parseSession(raw, t);
      setData(d);
      // Aproveita a leitura pra deixar o resumo desta live no cache — só de
      // sessão encerrada (a que ainda roda geraria um snapshot parcial eterno).
      if (d && d.meta.endedAt != null)
        setCachedSummary(id, summarize(d, analyze(d, t)));
    });
    return () => {
      alive = false;
    };
  }, [id, t, reload]);

  // Chat gravado (Fase 2). Lido em separado porque mora em arquivo irmão — e porque a
  // maioria das sessões não tem, então não vale carregar junto com o relatório.
  useEffect(() => {
    let alive = true;
    void api
      .readSessionChat(id)
      .then((raw) => {
        if (alive && raw) setChatReplay(parseChatSession(raw));
      })
      .catch(() => {});
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
        const d = parseSession(raw, t);
        if (!d) return;
        const sum = summarize(d, analyze(d, t));
        if (d.meta.endedAt != null) setCachedSummary(prevId, sum);
        setPrevSummary(sum);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [prevId, t]);

  const remove = async () => {
    await api.deleteSession(id);
    dropCachedSummary(id);
    toast.info(t("reports.detail.deleted"));
    onDeleted();
  };

  // O CUSTO DO CURSOR. Com o replay tocando, `playheadT` muda ~4×/s e re-renderiza esta
  // tela inteira. Sem estes memos, cada quadro do vídeo refazia a análise completa da
  // sessão (várias passadas por ~7.200 amostras, mais janelas, canais e destaques) — o
  // relatório engasgava justamente enquanto o streamer assistia.
  //
  // Precisam ficar ACIMA dos returns de carregando/erro: hook não pode ser condicional.
  const parsed = data === "loading" || !data ? null : data;
  const analysis = useMemo(
    () => (parsed ? analyze(parsed, t) : null),
    [parsed, t],
  );
  const sampleTimes = useMemo(
    () => parsed?.samples.map((s) => s.t) ?? [],
    [parsed],
  );
  const viewerTimes = useMemo(
    () => parsed?.viewerSamples.map((s) => s.t) ?? [],
    [parsed],
  );

  if (data === "loading") {
    return (
      <div className="mx-auto max-w-3xl">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" /> {t("reports.detail.back")}
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
          <ArrowLeft className="size-4" /> {t("reports.detail.back")}
        </Button>
        <Card className="mt-4 text-sm text-ink-muted">
          {t("reports.detail.error.read")}
        </Card>
      </div>
    );
  }

  const a = analysis!;
  const n = data.samples.length;

  // --- Replay: o cursor traduzido pra cada eixo ---
  // Os gráficos são indexados por AMOSTRA, não por tempo, e a audiência tem eixo próprio
  // (amostra a cada 30s). Traduzir aqui é o que deixa o cursor bater nos dois.
  const playSample =
    playheadT == null ? null : fractionalIndexAt(sampleTimes, playheadT);
  const playViewer =
    playheadT == null ? null : fractionalIndexAt(viewerTimes, playheadT);
  const hasReplay = data.recordings.length > 0;
  const seekSample = hasReplay
    ? (i: number) => {
        const ts = sampleTimes[Math.round(i)];
        if (ts != null) seekTo(ts);
      }
    : undefined;
  const seekViewer = hasReplay
    ? (i: number) => {
        const ts = viewerTimes[Math.round(i)];
        if (ts != null) seekTo(ts);
      }
    : undefined;
  // Marcas na régua do player: os mesmos eventos que já viram marcador nos gráficos.
  const replayTicks: ReplayTick[] = hasReplay
    ? [
        ...a.events
          .filter((e) => e.kind === "error" || e.kind === "reconnect")
          .map((e) => ({
            t: e.t,
            color: e.kind === "error" ? "#ef4444" : "#f97316",
            label: e.label,
          })),
        ...data.markers.map((m) => ({
          t: m.t,
          color: "#e0b040",
          label: m.label,
        })),
      ]
    : [];

  // Marcadores de evento (reconexão/erro) no eixo de tempo.
  const indexAt = (ms: number) => {
    for (let i = 0; i < n; i++) if (data.samples[i].t >= ms) return i;
    return Math.max(0, n - 1);
  };
  const markers: ChartMarker[] = a.events
    .filter(
      (e) =>
        e.kind === "reconnect" || e.kind === "error" || e.kind === "signal",
    )
    .map((e) => ({
      index: indexAt(e.t),
      color:
        e.kind === "error"
          ? "#ef4444"
          : e.kind === "signal"
            ? "#a855f7"
            : "#f97316",
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
  const viewerIndexAt = (ms: number) => {
    // As amostras já estão em ordem temporal; busca binária evita uma varredura completa
    // para cada raid/marcador em sessões longas.
    let lo = 0;
    let hi = vN;
    while (lo < hi) {
      const mid = lo + ((hi - lo) >> 1);
      if (data.viewerSamples[mid].t < ms) lo = mid + 1;
      else hi = mid;
    }
    return Math.min(lo, Math.max(0, vN - 1));
  };
  const raidMarkers: ChartMarker[] = data.alertEvents
    .filter((e) => e.kind === "raid")
    .map((e) => ({ index: viewerIndexAt(e.t), color: "#7c9cff" }));

  // --- Séries por canal ---
  // Com um canal só, repartir não diz nada que o total já não diga: o botão nem aparece.
  const colors = channelColors(a.byChannel.channels);
  const viewerChannels = a.byChannel.channels.filter((c) => c.viewers.hasData);
  const chatChannels = a.byChannel.channels.filter((c) => c.chat.total > 0);
  const canSplitViewers = viewerChannels.length > 1;
  const canSplitChat = a.byChannel.hasChatByChannel && chatChannels.length > 1;
  const viewerChartSeries =
    splitViewers && canSplitViewers
      ? viewerChannels.map((c) => ({
          label: c.source,
          color: colors[c.key],
          values: viewerSeriesFor(data, c.key),
        }))
      : [
          {
            label: t("reports.viewers.series"),
            color: "#56e39b",
            values: viewerSeries(data),
          },
        ];
  const chatChartSeries =
    splitChat && canSplitChat
      ? chatChannels.map((c) => ({
          label: c.source,
          color: colors[c.key],
          values: chatRateSeriesFor(data, c.key),
        }))
      : [
          {
            label: t("reports.chat.series"),
            color: "#ffb323",
            values: chatRateSeries(data),
          },
        ];
  const chatMarkers: ChartMarker[] = a.highlights
    .filter((h) => h.kind === "chat")
    .map((h) => ({ index: indexAt(h.t), color: "#ffb323" }));

  // Tempo relativo ao início (pra achar/clipar no VOD). `ms`, não `t`: `t` agora
  // é a tradução.
  const rel = (ms: number) => {
    const s = Math.max(0, Math.round((ms - data.meta.startedAt) / 1000));
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
    if (pct === 0) return { text: t("reports.delta.same"), tone: "neutral" };
    return {
      // O sinal viaja dentro de {pct}: a chave só tem o "%" e a comparação.
      text: t("reports.delta.pct", { pct: `${pct > 0 ? "+" : ""}${pct}` }),
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
      label: t("reports.stat.peakViewers"),
      value: fmt.num(a.viewers.peak),
      accent: true,
      sub: delta(a.viewers.peak, prevSummary?.peakViewers),
    });
    heroStats.push({
      label: t("reports.stat.avg"),
      value: fmt.num(a.viewers.avg),
      sub: delta(a.viewers.avg, prevSummary?.avgViewers),
    });
  }
  // Seguidores vêm antes das inscrições porque são muito mais frequentes. O número
  // sai do contador da plataforma quando existe (Twitch/Kick) e dos eventos de follow
  // do Streamlabs/StreamElements quando não — a análise já resolve qual vale, aqui só
  // muda o rótulo, porque medido é LÍQUIDO e por alerta é bruto.
  const seg = a.byChannel.followersGained;
  if (seg != null && seg !== 0)
    heroStats.push({
      label: t(
        a.byChannel.followersNet
          ? "reports.stat.followersNet"
          : "reports.stat.newFollowers",
      ),
      value: `${seg > 0 ? "+" : ""}${fmt.num(seg)}`,
    });
  if (a.alerts.subs > 0)
    heroStats.push({
      label: t("reports.stat.subs"),
      value: String(a.alerts.subs),
    });
  if (a.alerts.bits > 0)
    heroStats.push({
      label: t("reports.stat.bits"),
      value: fmt.num(a.alerts.bits),
    });
  if (a.alerts.raids > 0)
    heroStats.push({
      label: t("reports.stat.raids"),
      value: `${a.alerts.raids} · +${a.alerts.raidViewers}`,
    });
  if (a.chat.hasData)
    heroStats.push({
      label: t("reports.stat.messages"),
      value: fmt.num(a.chat.total),
      sub: delta(a.chat.total, prevSummary?.chatTotal),
    });

  // Modo desconhecido (sessão de uma versão futura) cai no valor cru do arquivo.
  const modeKey = MODE_KEY[data.meta.mode];

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
          <ArrowLeft className="size-4" /> {t("reports.detail.back")}
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="subtle" size="sm" onClick={() => setShowRecap(true)}>
            <Share2 className="size-4" /> {t("reports.detail.recap")}
          </Button>
          <Button
            variant="subtle"
            size="sm"
            onClick={() => setShowDownload(true)}
          >
            <Download className="size-4" /> {t("reports.detail.download")}
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
      {showDownload && (
        <DownloadModal data={data} onClose={() => setShowDownload(false)} />
      )}

      <div className="mb-1 font-display text-2xl font-extrabold">
        {t("reports.detail.heading", { date: fmt.date(data.meta.startedAt) })}
      </div>
      <div className="mb-4 text-sm text-ink-muted">
        {fmt.dur(data.meta.durationSec)} · {fmt.time(data.meta.startedAt)}
        {data.meta.endedAt ? `–${fmt.time(data.meta.endedAt)}` : ""} ·{" "}
        {data.meta.platforms.map((p) => p.name).join(", ")} ·{" "}
        {t("reports.detail.mode", {
          mode: modeKey ? t(modeKey) : data.meta.mode,
        })}
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

      {/* REPLAY — só existe se esta live foi gravada. Fica logo abaixo do veredito
          porque é o caminho mais curto entre "a análise diz que travou às 23:40" e
          "quero VER o que estava na tela às 23:40". */}
      {hasReplay && (
        <ReplayPlayer
          data={data}
          sessionId={id}
          chat={chatReplay.messages}
          gaps={chatReplay.gaps}
          ticks={replayTicks}
          seek={seek}
          onPlayhead={setPlayheadT}
          onMarkerAdded={() => setReload((r) => r + 1)}
          onRecordingsDeleted={() => setReload((r) => r + 1)}
        />
      )}

      {/* Retenção (audiência ao vivo) */}
      {a.viewers.hasData && vN > 1 && (
        <Card className="mb-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
            <Eye className="size-4" /> {t("reports.viewers.title")}
            {canSplitViewers && (
              <SplitToggle on={splitViewers} onChange={setSplitViewers} />
            )}
          </h3>
          <LineChart
            series={viewerChartSeries}
            n={vN}
            markers={raidMarkers}
            formatValue={(v) => fmt.num(Math.round(v))}
            formatX={relAtViewer}
            playhead={playViewer}
            onSeek={seekViewer}
          />
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
            {/* Estes números são sempre da live inteira. Com o gráfico repartido
                eles passam a bater com nenhuma das linhas — sem esse aviso, o
                "pico 521" ao lado de um eixo que vai só até 408 lê como bug. */}
            {splitViewers && canSplitViewers && (
              <span className="font-semibold text-ink-faint">
                {t("reports.chart.allChannels")}
              </span>
            )}
            <span>
              {t("reports.viewers.peak")}{" "}
              <strong className="text-ink">{fmt.num(a.viewers.peak)}</strong>
            </span>
            <span>
              {t("reports.stat.avg")}{" "}
              <strong className="text-ink">{fmt.num(a.viewers.avg)}</strong>
            </span>
            <span>
              {t("reports.viewers.startEnd", {
                start: a.viewers.start,
                end: a.viewers.end,
              })}
            </span>
            {raidMarkers.length > 0 && (
              <span className="text-[#7c9cff]">
                {t("reports.viewers.raidsLegend")}
              </span>
            )}
          </div>
        </Card>
      )}

      {/* Público por canal — pico/média, fatia da audiência, chat e alertas de cada um */}
      {a.byChannel.channels.length > 1 && (
        <ChannelBreakdownCard b={a.byChannel} colors={colors} />
      )}

      {/* Momentos de destaque (clipes sugeridos) */}
      {a.highlights.length > 0 && (
        <Card className="mb-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
            <Scissors className="size-4 text-brass" />{" "}
            {t("reports.highlights.title")}
          </h3>
          <div className="flex flex-col gap-1.5">
            {a.highlights.map((h, i) => (
              <HighlightRow
                key={i}
                h={h}
                time={rel(h.t)}
                onSeek={hasReplay ? () => seekTo(h.t) : undefined}
              />
            ))}
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">
            {t("reports.highlights.note")}
          </p>
        </Card>
      )}

      {/* Atividade do chat */}
      {hasChat(data) && n > 1 && (
        <Card className="mb-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
            <MessageSquare className="size-4" /> {t("reports.chat.title")}
            {canSplitChat && (
              <SplitToggle on={splitChat} onChange={setSplitChat} />
            )}
          </h3>
          <LineChart
            series={chatChartSeries}
            n={n}
            markers={chatMarkers}
            formatValue={(v) => Math.round(v).toString()}
            formatX={relAtSample}
            playhead={playSample}
            onSeek={seekSample}
          />
          <div className="mt-2 text-xs text-ink-muted">
            {splitChat && canSplitChat && (
              <span className="font-semibold text-ink-faint">
                {t("reports.chart.allChannels")}{" "}
              </span>
            )}
            {/* Total e pico em destaque, média não: o olho bate nos dois números
                que a pessoa vai comparar com a live passada. */}
            {rich(t, "reports.chat.summary", {
              total: (
                <strong className="text-ink">{fmt.num(a.chat.total)}</strong>
              ),
              peak: <strong className="text-ink">{a.chat.peakPerMin}</strong>,
              avg: a.chat.avgPerMin,
            })}
          </div>
        </Card>
      )}

      {/* Resumo dos alertas */}
      {a.alerts.hasData && (
        <Card className="mb-4">
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
            {t("reports.alerts.title")}
          </h3>
          <div className="flex flex-wrap gap-2">
            {ALERT_LABELS.map(([k, labelKey, emoji]) =>
              a.alerts.byKind[k] ? (
                <span
                  key={k}
                  className="flex items-center gap-1.5 rounded-md bg-surface-2 px-2.5 py-1.5 text-sm"
                >
                  <span>{emoji}</span> <strong>{a.alerts.byKind[k]}</strong>{" "}
                  <span className="text-ink-muted">
                    {tp(labelKey, a.alerts.byKind[k])}
                  </span>
                </span>
              ) : null,
            )}
            {a.alerts.bits > 0 && (
              <span className="flex items-center gap-1.5 rounded-md bg-surface-2 px-2.5 py-1.5 text-sm">
                💎 <strong>{fmt.num(a.alerts.bits)}</strong>{" "}
                <span className="text-ink-muted">
                  {t("reports.alerts.bitsTotal")}
                </span>
              </span>
            )}
          </div>
          {a.alerts.topRaid && a.alerts.topRaid.amount > 0 && (
            <div className="mt-2 text-xs text-ink-muted">
              {/* {user} pode ser o "alguém" da exportação anônima. */}
              {rich(t, "reports.alerts.topRaid", {
                user: (
                  <strong className="text-ink">{a.alerts.topRaid.user}</strong>
                ),
                n: Math.round(a.alerts.topRaid.amount),
              })}
            </div>
          )}
        </Card>
      )}

      {/* Gráfico de bitrate por plataforma */}
      {n > 1 && (
        <Card className="mb-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
            <Activity className="size-4" /> {t("reports.bitrate.title")}
          </h3>
          <LineChart
            series={bitrateSeriesData}
            n={n}
            markers={markers}
            formatValue={(v) => fmt.dec(v, 1)}
            formatX={relAtSample}
            playhead={playSample}
            onSeek={seekSample}
          />
          {markers.length > 0 && (
            <div className="mt-2 flex gap-3 text-[11px] font-semibold text-ink-faint">
              <span className="text-[#f97316]">
                {t("reports.marker.reconnect")}
              </span>
              <span className="text-[#ef4444]">
                {t("reports.marker.error")}
              </span>
              <span className="text-[#a855f7]">
                {t("reports.marker.noSignal")}
              </span>
            </div>
          )}
        </Card>
      )}

      {/* Gráfico de CPU/GPU */}
      {n > 1 && (cpu.some((v) => v != null) || hasGpu) && (
        <Card className="mb-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
            <Cpu className="size-4" /> {t("reports.machine.title")}
          </h3>
          <LineChart
            series={machineSeries}
            n={n}
            yMax={100}
            formatValue={(v) => `${Math.round(v)}`}
            formatX={relAtSample}
            refLine={{ value: 92, label: t("reports.machine.dangerLine") }}
            playhead={playSample}
            onSeek={seekSample}
          />
        </Card>
      )}

      {/* OBS — render lag (encode/render) */}
      {n > 1 && hasObs(data) && (
        <Card className="mb-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
            <Activity className="size-4" /> {t("reports.obs.title")}
          </h3>
          <LineChart
            series={[
              {
                label: t("reports.obs.series"),
                color: "#a855f7",
                values: obsRenderSeries(data),
              },
            ]}
            n={n}
            markers={markers}
            formatValue={(v) => `${Math.round(v)}`}
            formatX={relAtSample}
            playhead={playSample}
            onSeek={seekSample}
          />
        </Card>
      )}

      {/* Saúde do envio, por destino (o "Público por canal" cuida da audiência) */}
      <Card className="mb-4">
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
          {t("reports.perTarget.title")}
        </h3>
        <div className="flex flex-col gap-2">
          {/* `tg`, não `t`: `t` é a tradução. */}
          {a.perTarget.map((tg) => (
            <div
              key={tg.id}
              className="flex items-center gap-3 rounded-md bg-surface-2 px-3 py-2"
            >
              <PlatformGlyph id={tg.platformId} size={22} />
              <span className="min-w-24 flex-1 font-display font-bold">
                {tg.name}
              </span>
              <span className="text-xs text-ink-muted">
                {t("reports.perTarget.avgBitrate", {
                  mbps: fmt.dec(tg.avgBitrate / 1000, 1),
                })}
              </span>
              <span className="text-xs text-ink-muted">
                {t("reports.perTarget.dropped", { n: tg.maxDropped })}
              </span>
              <span
                className={cn(
                  "text-xs",
                  tg.reconnects > 0 ? "text-warn" : "text-ink-faint",
                )}
              >
                {t("reports.perTarget.reconnects", { n: tg.reconnects })}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Janelas problemáticas */}
      {a.windows.length > 0 && (
        <Card className="mb-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
            <AlertTriangle className="size-4 text-warn" />{" "}
            {t("reports.windows.title")}
          </h3>
          <div className="flex flex-col gap-2">
            {a.windows.map((w, i) => (
              <WindowCard
                key={i}
                w={w}
                time={rel(w.tStart)}
                onSeek={hasReplay ? () => seekTo(w.tStart) : undefined}
              />
            ))}
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">
            {t("reports.windows.note")}
          </p>
        </Card>
      )}

      {/* Linha do tempo de eventos */}
      <Card>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
          <Clock className="size-4" /> {t("reports.events.title")}
        </h3>
        <div className="flex flex-col gap-1">
          {a.events.map((e, i) => (
            <EventRow
              key={i}
              e={e}
              time={rel(e.t)}
              onSeek={hasReplay ? () => seekTo(e.t) : undefined}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}

/** Escolha de formato + a opção de tirar nomes, num lugar só.
 *
 *  Um botão por formato encheria o cabeçalho, e a caixa "sem nomes" não teria onde
 *  morar — ela vale pros três, porque o que muda é o dado, não o formato. */
function DownloadModal({
  data,
  onClose,
}: {
  data: SessionData;
  onClose: () => void;
}) {
  // O objeto inteiro, e não só `t`: o HTML exportado precisa de `fmt` e do
  // `locale` (o lang= do <html>), e o parâmetro `fmt` daqui embaixo é o FORMATO
  // do arquivo — nomes diferentes de propósito.
  const i18n = useI18n();
  const { t } = i18n;
  const [semNomes, setSemNomes] = useState(false);
  const [busy, setBusy] = useState(false);

  const baixar = async (fmt: "html" | "csv" | "json") => {
    setBusy(true);
    try {
      // Anonimiza ANTES de analisar: os nomes ficam costurados dentro de textos
      // prontos ("Raid de fulano"), e limpar depois viraria caça a substring.
      const d = semNomes ? anonymize(data) : data;
      const a = analyze(d, t);
      // A DATA continua ISO: ordena sozinha no explorador e não segue o idioma.
      const base = `${t("reports.file.live")}-${fileStamp(d.meta.startedAt)}`;
      const arquivo = {
        html: {
          name: `${base}.html`,
          label: t("reports.download.html.label"),
          ext: "html",
          content: reportHtml(d, a, i18n),
        },
        csv: {
          name: `${base}${t("reports.file.seriesSuffix")}.csv`,
          label: t("reports.download.csv.label"),
          ext: "csv",
          content: seriesCsv(d, a, i18n),
        },
        json: {
          name: `${base}.json`,
          label: t("reports.download.json.label"),
          ext: "json",
          content: reportJson(d, a),
        },
      }[fmt];
      if (await api.saveTextFile(arquivo)) {
        toast.success(t("reports.download.saved"));
        onClose();
      }
    } catch (e) {
      toast.error(t("reports.download.error", { err: errMsg(e) }));
    } finally {
      setBusy(false);
    }
  };

  const OPCOES: ["html" | "csv" | "json", React.ReactNode, string, string][] = [
    [
      "html",
      <FileText key="h" className="size-4" />,
      t("reports.download.html.label"),
      t("reports.download.html.desc"),
    ],
    [
      "csv",
      <Table2 key="c" className="size-4" />,
      t("reports.download.csv.label"),
      t("reports.download.csv.desc"),
    ],
    [
      "json",
      <Braces key="j" className="size-4" />,
      t("reports.download.json.label"),
      t("reports.download.json.desc"),
    ],
  ];

  return (
    <Modal
      title={t("reports.download.modal.name")}
      onClose={onClose}
      className="max-w-md rounded-xl bg-surface p-5 pop"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xl">{t("reports.download.modal.name")}</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {OPCOES.map(([fmt, icon, titulo, desc]) => (
          <button
            key={fmt}
            disabled={busy}
            onClick={() => void baixar(fmt)}
            className="flex items-start gap-3 rounded-lg border-2 border-border bg-surface-2 px-3 py-2.5 text-left transition-colors hover:border-brass disabled:opacity-50"
          >
            <span className="mt-0.5 text-brass">{icon}</span>
            <span className="flex-1">
              <span className="block font-display font-bold">{titulo}</span>
              <span className="mt-0.5 block text-xs text-ink-muted">
                {desc}
              </span>
            </span>
          </button>
        ))}
      </div>

      <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg bg-surface-2 px-3 py-2.5">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-brass"
          checked={semNomes}
          onChange={(e) => setSemNomes(e.target.checked)}
        />
        <span>
          <span className="block text-sm font-bold">
            {t("reports.download.anon.title")}
          </span>
          {/* Enquanto o relatório fica na máquina, os nomes são a memória da live.
              Mandado pra fora, viram dado pessoal de terceiro na mão de quem
              recebeu — e quem envia é que responde por isso. */}
          <span className="mt-0.5 block text-xs text-ink-muted">
            {t("reports.download.anon.desc")}
          </span>
        </span>
      </label>
    </Modal>
  );
}

/** "Total | Por canal" no cabeçalho de um gráfico. */
function SplitToggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  const t = useT();
  return (
    <div className="ml-auto flex shrink-0 items-center gap-0.5 rounded-md bg-surface-2 p-0.5 normal-case">
      {[false, true].map((v) => (
        <button
          key={String(v)}
          onClick={() => onChange(v)}
          aria-pressed={on === v}
          className={cn(
            "rounded px-2 py-1 text-[11px] font-bold transition-colors",
            on === v
              ? "bg-brass text-brass-ink"
              : "text-ink-faint hover:text-ink",
          )}
        >
          {t(v ? "reports.split.byChannel" : "reports.split.total")}
        </button>
      ))}
    </div>
  );
}

/** Uma linha por canal: audiência (com a fatia da live), chat e alertas. */
function ChannelRow({ c, color }: { c: ChannelStats; color: string }) {
  const { t, fmt } = useI18n();
  const num = fmt.num;
  const chips: string[] = [];
  if (c.followers.hasData && c.followers.gained !== 0)
    chips.push(
      `💜 ${c.followers.gained > 0 ? "+" : ""}${num(c.followers.gained)}`,
    );
  if (c.alerts.subs > 0) chips.push(`⭐ ${c.alerts.subs}`);
  if (c.alerts.bits > 0) chips.push(`💎 ${num(Math.round(c.alerts.bits))}`);
  if (c.alerts.raids > 0) chips.push(`🚀 ${c.alerts.raids}`);
  // Sem chip próprio pros alertas de follow: o 💜 acima já os usa como fonte quando
  // não há contador da plataforma. Dois chips seriam a mesma gente contada duas vezes.

  return (
    <div className="rounded-md bg-surface-2 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <PlatformGlyph id={c.platform} size={22} />
        <span className="min-w-24 flex-1 truncate font-display font-bold">
          {c.source}
        </span>
        {c.viewers.hasData && (
          <>
            <span className="text-xs text-ink-muted">
              {t("reports.channel.peak")}{" "}
              <strong className="tabular-nums text-ink">
                {num(c.viewers.peak)}
              </strong>
            </span>
            <span className="text-xs text-ink-muted">
              {t("reports.channel.avg")}{" "}
              <strong className="tabular-nums text-ink">
                {num(c.viewers.avg)}
              </strong>
            </span>
          </>
        )}
        {c.chat.hasData && c.chat.total > 0 && (
          <span className="text-xs text-ink-muted">
            💬{" "}
            <strong className="tabular-nums text-ink">
              {num(c.chat.total)}
            </strong>
          </span>
        )}
        {chips.length > 0 && (
          <span className="text-xs tabular-nums text-ink-muted">
            {chips.join(" · ")}
          </span>
        )}
      </div>

      {/* Fatia da audiência: soma de quem esteve assistindo neste canal ao longo da
          live dividida pelo total. Comparar PICOS seria enganoso — os picos de cada
          canal não acontecem no mesmo instante e somariam mais que a live inteira. */}
      {c.sharePct != null && (
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(c.sharePct, 1.5)}%`,
                background: color,
              }}
            />
          </div>
          <span className="w-24 shrink-0 text-right text-[11px] font-semibold tabular-nums text-ink-faint">
            {t("reports.channel.share", { pct: c.sharePct.toFixed(0) })}
          </span>
        </div>
      )}
    </div>
  );
}

function ChannelBreakdownCard({
  b,
  colors,
}: {
  b: ChannelBreakdown;
  colors: Record<string, string>;
}) {
  const t = useT();
  return (
    <Card className="mb-4">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
        <Users className="size-4" /> {t("reports.channels.title")}
      </h3>
      <div className="flex flex-col gap-2">
        {b.channels.map((c) => (
          <ChannelRow key={c.key} c={c} color={colors[c.key]} />
        ))}
      </div>
      {b.followersNet && (
        <p className="mt-2 text-[11px] text-ink-faint">
          {t("reports.channels.followersNote")}
        </p>
      )}
      {!b.hasChatByChannel && (
        <p className="mt-2 text-[11px] text-ink-faint">
          {t("reports.channels.oldChatNote")}
        </p>
      )}
      {b.unattributedAlerts > 0 && (
        <p className="mt-2 text-[11px] text-ink-faint">
          {t("reports.channels.unattributed", { n: b.unattributedAlerts })}
        </p>
      )}
    </Card>
  );
}

function DeleteButton({ onDelete }: { onDelete: () => void }) {
  const t = useT();
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
      <Trash2 className="size-4" />{" "}
      {t(confirm ? "reports.detail.delete.confirm" : "reports.detail.delete")}
    </Button>
  );
}

// Tempo relativo primário (acha no VOD), hora do relógio secundária.
function WindowCard({
  w,
  time,
  onSeek,
}: {
  w: ProblemWindow;
  time: string;
  /** Definido só quando a live foi gravada: leva o vídeo pra este instante. */
  onSeek?: () => void;
}) {
  const { t, fmt } = useI18n();
  return (
    <div className="rounded-md border border-warn/30 bg-warn/5 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-2 text-sm">
        <span className="font-display font-bold tabular-nums text-warn">
          {time}
        </span>
        <span className="text-xs text-ink-faint">
          ({fmt.time(w.tStart)} · {w.durationSec}s)
        </span>
        <span className="font-semibold">{w.cause}</span>
        {onSeek && <SeekButton onSeek={onSeek} />}
        <button
          onClick={() => {
            void navigator.clipboard?.writeText(time);
            toast.success(t("reports.copyTime.done"));
          }}
          className="ml-auto rounded p-1 text-ink-faint transition-colors hover:bg-surface-3 hover:text-ink"
          title={t("reports.copyTime")}
          aria-label={t("reports.copyTime")}
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
function EventRow({
  e,
  time,
  onSeek,
}: {
  e: ReportEvent;
  time: string;
  onSeek?: () => void;
}) {
  const { fmt } = useI18n();
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-16 shrink-0 text-xs font-semibold tabular-nums text-ink">
        {time}
      </span>
      <span className={cn("size-2 shrink-0 rounded-full", EVENT_DOT[e.kind])} />
      <span className="flex-1 text-ink-muted">{e.label}</span>
      {onSeek && <SeekButton onSeek={onSeek} />}
      <span className="text-[11px] tabular-nums text-ink-faint">
        {fmt.time(e.t)}
      </span>
    </div>
  );
}

/** "Ver no vídeo": o botão que transforma um número do relatório num momento assistido.
 *  Só aparece quando a live foi gravada. */
function SeekButton({ onSeek }: { onSeek: () => void }) {
  const t = useT();
  return (
    <button
      onClick={onSeek}
      className="rounded p-1 text-ink-faint transition-colors hover:bg-surface-3 hover:text-brass"
      title={t("replay.seek.cta")}
      aria-label={t("replay.seek.cta")}
    >
      <Play className="size-3.5" />
    </button>
  );
}

// [id do evento (enum das plataformas), chave do rótulo, emoji].
// A 1ª posição é id de evento (vem do backend); a 2ª é a RAIZ da chave — o `tp`
// completa com .one/.other, senão o chip diz "1 gifts".
const ALERT_LABELS: [string, string, string][] = [
  ["sub", "reports.alerts.kind.sub", "⭐"],
  ["resub", "reports.alerts.kind.resub", "🔁"],
  ["subgift", "reports.alerts.kind.subgift", "🎁"],
  ["member", "reports.alerts.kind.member", "🏅"],
  ["superchat", "reports.alerts.kind.superchat", "💬"],
  ["raid", "reports.alerts.kind.raid", "🚀"],
  ["follow", "reports.alerts.kind.follow", "💜"],
];

const HL_ICON: Record<Highlight["kind"], string> = {
  chat: "💬",
  raid: "🚀",
  viewers: "📈",
  alert: "🎉",
};

function HighlightRow({
  h,
  time,
  onSeek,
}: {
  h: Highlight;
  time: string;
  onSeek?: () => void;
}) {
  const t = useT();
  return (
    <div className="flex items-center gap-2.5 rounded-md bg-surface-2 px-3 py-2">
      <span className="text-lg leading-none">{HL_ICON[h.kind]}</span>
      <span className="w-16 shrink-0 font-display font-extrabold tabular-nums text-ink">
        {time}
      </span>
      <span className="flex-1 text-sm text-ink-muted">{h.reason}</span>
      {onSeek && <SeekButton onSeek={onSeek} />}
      <button
        onClick={() => {
          void navigator.clipboard?.writeText(time);
          toast.success(t("reports.copyTime.done"));
        }}
        className="rounded p-1 text-ink-faint transition-colors hover:bg-surface-3 hover:text-ink"
        title={t("reports.copyTime")}
        aria-label={t("reports.copyTime")}
      >
        <Copy className="size-3.5" />
      </button>
    </div>
  );
}
