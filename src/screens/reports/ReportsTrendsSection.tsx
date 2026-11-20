import { useMemo, useState } from "react";
import { Clock, Eye, Flame, MessageSquare, TrendingUp } from "lucide-react";
import { LineChart, type ChartSeries } from "../../components/LineChart";
import { PlatformGlyph } from "../../components/ui";
import { useI18n } from "../../lib/i18n";
import {
  computeReportTrends,
  type ReportTrendWindow,
} from "../../lib/reportTrends";
import type { SessionMeta, SessionSummary } from "../../lib/types";
import { cn } from "../../lib/utils";

const WINDOWS: readonly ReportTrendWindow[] = [7, 30, 50];

export function ReportsTrendsSection({
  sessions,
  summaries,
  onSelect,
}: {
  sessions: readonly SessionMeta[];
  summaries: Record<string, SessionSummary | null>;
  onSelect: (id: string) => void;
}) {
  const { t, tp, fmt } = useI18n();
  const [windowSize, setWindowSize] = useState<ReportTrendWindow>(7);

  const availableWindows = useMemo(() => {
    const out: ReportTrendWindow[] = [7];
    if (sessions.length > 7) out.push(30);
    if (sessions.length > 30) out.push(50);
    return out;
  }, [sessions.length]);

  const effectiveWindow: ReportTrendWindow = availableWindows.includes(
    windowSize,
  )
    ? windowSize
    : 7;

  const trends = useMemo(
    () => computeReportTrends(sessions, summaries, effectiveWindow),
    [sessions, summaries, effectiveWindow],
  );

  const series = useMemo<ChartSeries[]>(() => {
    if (!trends || trends.audience.measuredSessions === 0) return [];
    const avgSeries: ChartSeries = {
      label: t("reports.trends.chart.avg"),
      color: "var(--color-ok)",
      values: trends.points.map((point) => point.avgViewers),
    };
    const hasPeak = trends.points.some((point) => point.peakViewers != null);
    if (!hasPeak) return [avgSeries];
    return [
      avgSeries,
      {
        label: t("reports.trends.chart.peak"),
        color: "var(--color-brass)",
        values: trends.points.map((point) => point.peakViewers),
        dashed: true,
      },
    ];
  }, [trends, t]);

  if (!trends) return null;

  const delta = trends.audience.deltaPct;
  const deltaLabel =
    delta == null
      ? null
      : delta > 0
        ? `+${delta}%`
        : delta < 0
          ? `${delta}%`
          : "0%";

  return (
    <section
      aria-labelledby="reports-trends-heading"
      className="rounded-xl border border-border-soft bg-surface p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3
            id="reports-trends-heading"
            className="flex items-center gap-2 text-xl"
          >
            <TrendingUp className="size-5 text-brass" aria-hidden />
            {t("reports.trends.title")}
          </h3>
          <p className="mt-1 text-xs text-ink-muted">
            {tp("reports.trends.subtitle", trends.cadence.sessionCount)}
            {trends.pendingCount > 0
              ? ` · ${t("reports.trends.loadingMore")}`
              : null}
          </p>
        </div>

        {availableWindows.length > 1 ? (
          <div
            role="group"
            aria-label={t("reports.trends.window.label")}
            className="inline-flex rounded-lg border border-border-soft bg-surface-2 p-0.5"
          >
            {WINDOWS.filter((size) => availableWindows.includes(size)).map(
              (size) => {
                const active = effectiveWindow === size;
                return (
                  <button
                    key={size}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setWindowSize(size)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-bold transition-colors",
                      active
                        ? "bg-surface text-ink"
                        : "text-ink-muted hover:text-ink",
                    )}
                  >
                    {size === 50
                      ? t("reports.trends.window.all")
                      : t("reports.trends.window.last", { n: size })}
                  </button>
                );
              },
            )}
          </div>
        ) : null}
      </div>

      <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TrendCard
          icon={Eye}
          iconClass="text-ok"
          label={t("reports.trends.stat.avgViewers")}
          value={
            trends.audience.avgViewers != null
              ? fmt.num(trends.audience.avgViewers)
              : "—"
          }
          badge={
            deltaLabel != null ? (
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums",
                  delta != null && delta > 0
                    ? "bg-ok/15 text-ok"
                    : delta != null && delta < 0
                      ? "bg-warn/15 text-warn"
                      : "bg-surface-3 text-ink-muted",
                )}
                title={t("reports.trends.stat.deltaHint")}
              >
                {deltaLabel}
              </span>
            ) : null
          }
          detail={
            trends.audience.measuredSessions === 0
              ? t("reports.trends.stat.noAudience")
              : trends.audience.measuredSessions < trends.audience.totalSessions
                ? t("reports.trends.stat.measuredShare", {
                    measured: trends.audience.measuredSessions,
                    total: trends.audience.totalSessions,
                  })
                : t("reports.trends.stat.measuredAll", {
                    n: trends.audience.measuredSessions,
                  })
          }
        />

        <TrendCard
          icon={Flame}
          iconClass="text-brass"
          label={t("reports.trends.stat.bestPeak")}
          value={trends.bestPeak ? fmt.num(trends.bestPeak.value) : "—"}
          onClick={
            trends.bestPeak
              ? () => onSelect(trends.bestPeak!.sessionId)
              : undefined
          }
          detail={
            trends.bestPeak ? (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>{fmt.date(trends.bestPeak.startedAt)}</span>
                {trends.bestPeak.byPlatform.map((share) => (
                  <span
                    key={share.platform}
                    className="inline-flex items-center gap-1 font-semibold text-ink-muted"
                  >
                    <PlatformGlyph id={share.platform} size={13} />
                    <span className="tabular-nums">
                      {fmt.num(share.viewers)}
                    </span>
                  </span>
                ))}
              </span>
            ) : (
              t("reports.trends.stat.noAudience")
            )
          }
        />

        <TrendCard
          icon={MessageSquare}
          iconClass="text-[#7c9cff]"
          label={t("reports.trends.stat.chat")}
          value={
            trends.chat.avgPerMin != null
              ? t("reports.trends.stat.chatRate", {
                  rate: fmt.num(trends.chat.avgPerMin),
                })
              : trends.chat.markersTotal > 0
                ? tp(
                    "reports.trends.stat.markersOnly",
                    trends.chat.markersTotal,
                    {
                      count: fmt.num(trends.chat.markersTotal),
                    },
                  )
                : "—"
          }
          detail={
            trends.chat.hasData
              ? [
                  tp("reports.trends.stat.chatTotal", trends.chat.total, {
                    count: fmt.num(trends.chat.total),
                  }),
                  trends.chat.markersTotal > 0
                    ? tp(
                        "reports.trends.stat.markers",
                        trends.chat.markersTotal,
                        {
                          count: fmt.num(trends.chat.markersTotal),
                        },
                      )
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : t("reports.trends.stat.noChat")
          }
        />

        <TrendCard
          icon={Clock}
          iconClass="text-ink-muted"
          label={t("reports.trends.stat.airtime")}
          value={fmt.dur(trends.cadence.totalDurationSec)}
          detail={
            trends.cadence.streamsPerWeek != null
              ? t("reports.trends.stat.cadence", {
                  avg: fmt.dur(trends.cadence.avgDurationSec),
                  rate: fmt.dec(trends.cadence.streamsPerWeek, 1),
                })
              : t("reports.trends.stat.avgDuration", {
                  avg: fmt.dur(trends.cadence.avgDurationSec),
                })
          }
        />
      </dl>

      {series.length > 0 && trends.points.length > 1 ? (
        <div className="mt-5 border-t border-border-soft pt-4">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-ink-faint">
              {t("reports.trends.chart.heading")}
            </span>
            <span className="text-[11px] text-ink-faint">
              {t("reports.trends.chart.hint")}
            </span>
          </div>
          <LineChart
            series={series}
            n={trends.points.length}
            height={176}
            formatValue={(value) => fmt.num(Math.round(value))}
            formatX={(index) =>
              trends.points[index]
                ? fmt.date(trends.points[index].startedAt)
                : ""
            }
            onSeek={(index) => {
              const target = trends.points[index];
              if (target) onSelect(target.sessionId);
            }}
            ariaLabel={t("reports.trends.chart.aria")}
          />
        </div>
      ) : null}
    </section>
  );
}

function TrendCard({
  icon: Icon,
  iconClass,
  label,
  value,
  badge,
  detail,
  onClick,
}: {
  icon: typeof Eye;
  iconClass: string;
  label: string;
  value: string;
  badge?: React.ReactNode;
  detail: React.ReactNode;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <dt className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-faint">
        <Icon className={cn("size-3.5 shrink-0", iconClass)} aria-hidden />
        <span>{label}</span>
      </dt>
      <dd className="mt-2 flex items-baseline gap-2">
        <span className="font-display text-2xl font-extrabold leading-none tabular-nums text-ink">
          {value}
        </span>
        {badge}
      </dd>
      <p className="mt-2 text-[11px] leading-snug text-ink-muted">{detail}</p>
    </>
  );

  if (onClick) {
    return (
      <div className="rounded-lg border border-border-soft bg-surface-2/60">
        <button
          type="button"
          onClick={onClick}
          className="h-full w-full rounded-lg p-3.5 text-left transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass"
        >
          {inner}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border-soft bg-surface-2/60 p-3.5">
      {inner}
    </div>
  );
}
