import { memo, useState } from "react";
import {
  AlertTriangle,
  ChevronRight,
  Eye,
  FolderOpen,
  MessageSquare,
  Play,
  Radio,
  Table2,
} from "lucide-react";
import { api } from "../../lib/api";
import { historyCsv, type HistoryRow } from "../../lib/export/csv";
import { fileStamp, useI18n } from "../../lib/i18n";
import { analyze, parseSession } from "../../lib/report";
import { toast } from "../../lib/toast";
import type { SessionMeta, SessionSummary } from "../../lib/types";
import { cn, errMsg } from "../../lib/utils";
import { Button, Card, EmptyState, PlatformGlyph } from "../../components/ui";

/** `summaries[id]`: ausente = ainda lendo · `null` = arquivo ilegível · resumo = lido. */
interface ReportsListProps {
  sessions: SessionMeta[] | null;
  summaries: Record<string, SessionSummary | null>;
  error: boolean;
  onRetry: () => void;
  onSelect: (id: string) => void;
}

export function ReportsList({
  sessions,
  summaries,
  error,
  onRetry,
  onSelect,
}: ReportsListProps) {
  const { t, tp } = useI18n();
  const archive = sessions?.slice(1) ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-3xl">{t("reports.list.title")}</h2>
          <p className="mt-2 max-w-xl text-sm text-ink-muted">
            {t("reports.list.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sessions && sessions.length > 0 ? (
            <HistoryCsvButton sessions={sessions} />
          ) : null}
          <Button
            variant="subtle"
            size="sm"
            onClick={() => void api.openSessionsDir()}
          >
            <FolderOpen className="size-4" /> {t("reports.list.openFolder")}
          </Button>
        </div>
      </div>

      {error ? (
        <ListError onRetry={onRetry} />
      ) : sessions === null ? (
        <ListSkeleton />
      ) : sessions.length === 0 ? (
        <EmptyState title={t("reports.list.empty.title")}>
          {t("reports.list.empty.body")}
        </EmptyState>
      ) : (
        <div className="space-y-8">
          <FeaturedSession
            meta={sessions[0]}
            summary={summaries[sessions[0].id]}
            onSelect={onSelect}
          />
          {archive.length > 0 ? (
            <section aria-labelledby="reports-archive-heading">
              <div className="mb-3">
                <h3 id="reports-archive-heading" className="text-xl">
                  {t("reports.list.archive")}
                </h3>
                <p className="mt-1 text-xs text-ink-faint">
                  {tp("reports.list.archiveCount", archive.length)}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                {archive.map((session) => (
                  <SessionRow
                    key={session.id}
                    meta={session}
                    summary={summaries[session.id]}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ListError({ onRetry }: { onRetry: () => void }) {
  const t = useI18n().t;
  return (
    <Card className="flex flex-col items-start gap-4 bg-bad/8" role="alert">
      <div className="flex items-start gap-3">
        <AlertTriangle
          className="mt-0.5 size-5 shrink-0 text-bad"
          aria-hidden
        />
        <div>
          <h3 className="text-base">{t("reports.list.error.title")}</h3>
          <p className="mt-1 text-sm text-ink-muted">
            {t("reports.list.error.body")}
          </p>
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={onRetry}>
        {t("reports.error.retry")}
      </Button>
    </Card>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="h-16 animate-pulse rounded-lg bg-surface-2"
        />
      ))}
    </div>
  );
}

const FeaturedSession = memo(function FeaturedSession({
  meta,
  summary,
  onSelect,
}: {
  meta: SessionMeta;
  summary?: SessionSummary | null;
  onSelect: (id: string) => void;
}) {
  const { t, fmt } = useI18n();

  return (
    <section aria-labelledby="reports-latest-heading">
      <button
        type="button"
        onClick={() => onSelect(meta.id)}
        className="group relative w-full overflow-hidden rounded-xl bg-surface text-left pop transition-transform duration-150 hover:-translate-y-0.5"
      >
        <div className="grid min-h-64 xl:grid-cols-[minmax(0,1.35fr)_minmax(17rem,0.65fr)]">
          <div className="relative flex flex-col justify-between overflow-hidden bg-brass p-6 text-brass-ink sm:p-8">
            <Radio
              className="pointer-events-none absolute -right-8 -bottom-10 size-52 rotate-[-12deg] opacity-10"
              strokeWidth={1.2}
              aria-hidden
            />
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-sm bg-brass-ink px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-brass">
                <span className="size-2 rounded-full bg-live" />
                {t("reports.list.latest")}
              </div>
              <h3
                id="reports-latest-heading"
                className="max-w-lg text-4xl leading-[0.95] sm:text-5xl"
              >
                {t("reports.detail.heading", {
                  date: fmt.date(meta.startedAt),
                })}
              </h3>
              <p className="mt-3 text-sm font-semibold text-brass-ink/75">
                {t("reports.row.onAir", { dur: fmt.dur(meta.durationSec) })} ·{" "}
                {fmt.time(meta.startedAt)}
              </p>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-2">
              {meta.platforms.map((platform) => (
                <span
                  key={platform.id}
                  className="inline-flex items-center gap-2 rounded-md bg-brass-ink/10 px-2.5 py-1.5 text-xs font-bold"
                >
                  <PlatformGlyph id={platform.platformId} size={20} />
                  {platform.name}
                </span>
              ))}
              {meta.hasVideo ? (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-brass-ink px-2.5 py-1.5 text-xs font-bold text-brass">
                  <Play className="size-3.5" /> {t("reports.row.hasVideo")}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col justify-between p-6 sm:p-7">
            {summary === undefined ? (
              <div className="space-y-3" aria-hidden>
                <div className="h-9 animate-pulse rounded bg-surface-2" />
                <div className="h-9 animate-pulse rounded bg-surface-2" />
                <div className="h-9 animate-pulse rounded bg-surface-2" />
              </div>
            ) : summary === null ? (
              <p className="text-sm text-ink-muted">
                {t("reports.detail.error.read")}
              </p>
            ) : summary.hasData &&
              (summary.peakViewers != null || summary.chatTotal != null) ? (
              <dl className="divide-y divide-border-soft">
                {summary.peakViewers != null ? (
                  <FeaturedMetric
                    label={t("reports.stat.peakViewers")}
                    value={fmt.num(summary.peakViewers)}
                    size="hero"
                  />
                ) : null}
                {summary.chatTotal != null ? (
                  <FeaturedMetric
                    label={t("reports.stat.messages")}
                    value={fmt.num(summary.chatTotal)}
                  />
                ) : null}
              </dl>
            ) : (
              // Live curta ou sem viewers: número não vem, e barra pulsando pra sempre
              // seria um erro disfarçado de espera.
              <p className="text-sm text-ink-muted">
                {t("reports.list.noData")}
              </p>
            )}
            <span className="mt-6 inline-flex items-center justify-end gap-2 font-display text-sm font-extrabold text-brass">
              {t("reports.list.openStory")}
              <ChevronRight className="size-5 transition-transform group-hover:translate-x-1" />
            </span>
          </div>
        </div>
      </button>
    </section>
  );
});

function FeaturedMetric({
  label,
  value,
  size = "regular",
}: {
  label: string;
  value: string;
  size?: "hero" | "regular";
}) {
  return (
    <div className="flex items-end justify-between gap-4 py-3 first:pt-0">
      <dt className="text-xs font-bold uppercase tracking-wide text-ink-faint">
        {label}
      </dt>
      <dd
        className={cn(
          "font-display font-extrabold tabular-nums",
          size === "hero" ? "text-3xl" : "text-2xl",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

const SessionRow = memo(function SessionRow({
  meta,
  summary,
  onSelect,
}: {
  meta: SessionMeta;
  summary?: SessionSummary | null;
  onSelect: (id: string) => void;
}) {
  const { t, fmt } = useI18n();
  return (
    <button
      onClick={() => onSelect(meta.id)}
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
          {meta.platforms.map((platform) => (
            <PlatformGlyph
              key={platform.id}
              id={platform.platformId}
              size={18}
            />
          ))}
          <span className="ml-1 text-xs text-ink-faint">
            {meta.platforms.map((platform) => platform.name).join(", ")}
          </span>
          {meta.hasVideo ? (
            <span
              className="ml-1 flex items-center gap-1 rounded bg-brass/15 px-1.5 py-0.5 text-[11px] font-bold text-brass"
              title={t("reports.row.hasVideo.title")}
            >
              <Play className="size-3" /> {t("reports.row.hasVideo")}
            </span>
          ) : null}
        </div>
      </div>
      {summary?.hasData &&
      (summary.peakViewers != null || summary.chatTotal != null) ? (
        <div className="hidden shrink-0 items-center gap-3 text-xs text-ink-muted sm:flex">
          {summary.peakViewers != null ? (
            <span
              className="flex items-center gap-1"
              title={t("reports.row.peakViewers.title")}
            >
              <Eye className="size-3.5" />
              <span className="tabular-nums">
                {fmt.num(summary.peakViewers)}
              </span>
            </span>
          ) : null}
          {summary.chatTotal != null ? (
            <span
              className="flex items-center gap-1"
              title={t("reports.row.chat.title")}
            >
              <MessageSquare className="size-3.5" />
              <span className="tabular-nums">{fmt.num(summary.chatTotal)}</span>
            </span>
          ) : null}
        </div>
      ) : null}
      <ChevronRight className="size-5 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-brass" />
    </button>
  );
});

/** Exporta uma sessão por vez para limitar o pico de memória. */
function HistoryCsvButton({ sessions }: { sessions: SessionMeta[] }) {
  const i18n = useI18n();
  const { t } = i18n;
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const rows: HistoryRow[] = [];
      let unreadable = 0;
      for (const meta of sessions) {
        try {
          const data = parseSession(await api.readSession(meta.id), t);
          if (!data) {
            unreadable++;
            continue;
          }
          rows.push({
            meta: { ...meta, ...data.meta },
            analysis: analyze(data, t),
          });
        } catch {
          unreadable++;
        }
      }
      if (!rows.length) {
        toast.error(t("reports.history.error.none"));
        return;
      }
      const saved = await api.saveTextFile({
        name: `${t("reports.file.history")}-${fileStamp(Date.now())}.csv`,
        label: t("reports.download.csv.label"),
        ext: "csv",
        content: historyCsv(rows, i18n),
      });
      if (saved)
        toast.success(
          unreadable > 0
            ? t("reports.history.ok.some", {
                n: rows.length,
                bad: unreadable,
              })
            : t("reports.history.ok.all", { n: rows.length }),
        );
    } catch (error) {
      toast.error(t("reports.history.error.save", { err: errMsg(error) }));
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
      <Table2 className="size-4" />
      {busy ? t("reports.history.busy") : t("reports.history.button")}
    </Button>
  );
}
