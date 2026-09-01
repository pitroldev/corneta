import { ChevronDown, Eye, Scissors, TrendingUp } from "lucide-react";
import { LineChart } from "../../components/LineChart";
import { useI18n } from "../../lib/i18n";
import type { ReportAnalysis } from "../../lib/report";
import {
  HighlightRow,
  SplitToggle,
  StorySectionHeading,
  type SplitMode,
} from "./ReportPrimitives";
import type { ReportStoryModel, ReportTimelineModel } from "./useReportModels";

export function ReportTimelineSection({
  analysis,
  story,
  timeline,
  splitMode,
  onSplitModeChange,
}: {
  analysis: ReportAnalysis;
  story: ReportStoryModel;
  timeline: ReportTimelineModel;
  splitMode: SplitMode;
  onSplitModeChange: (mode: SplitMode) => void;
}) {
  const { t, tp, fmt } = useI18n();
  const seekTo = story.replayState === "ready" ? timeline.seekTo : undefined;
  const hasViewerChart = analysis.viewers.hasData && story.viewerCount > 1;
  if (!analysis.viewers.hasData && analysis.highlights.length === 0)
    return null;

  return (
    <section className="mt-12" aria-labelledby="report-story-heading">
      <StorySectionHeading
        id="report-story-heading"
        icon={TrendingUp}
        title={t("reports.story.timeline.title")}
        description={t("reports.story.timeline.desc")}
      />
      <div className="mt-5 overflow-hidden rounded-xl bg-surface">
        {hasViewerChart ? (
          <div className="p-5 sm:p-6">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h3 className="flex items-center gap-2 text-base">
                <Eye className="size-4 text-ok" aria-hidden />
                {t("reports.viewers.title")}
              </h3>
              {story.canSplitViewers ? (
                <SplitToggle value={splitMode} onChange={onSplitModeChange} />
              ) : null}
            </div>
            <LineChart
              series={story.viewerSeries}
              n={story.viewerCount}
              height={220}
              markers={story.momentMarkers}
              formatValue={(value) => fmt.num(Math.round(value))}
              formatX={timeline.relativeAtViewer}
              playhead={timeline.playViewer}
              onSeek={timeline.seekViewer}
            />
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
              {splitMode === "channel" && story.canSplitViewers ? (
                <span className="font-semibold text-ink-faint">
                  {t("reports.chart.allChannels")}
                </span>
              ) : null}
              <span>
                {t("reports.viewers.peak")}{" "}
                <strong className="text-ink">
                  {fmt.num(analysis.viewers.peak)}
                </strong>
              </span>
              <span>
                {t("reports.stat.avg")}{" "}
                <strong className="text-ink">
                  {fmt.num(analysis.viewers.avg)}
                </strong>
              </span>
              <span>
                {t("reports.viewers.startEnd", {
                  start: analysis.viewers.start,
                  end: analysis.viewers.end,
                })}
              </span>
              {story.raidMarkers.length > 0 ? (
                <span className="text-[#7c9cff]">
                  {t("reports.viewers.raidsLegend")}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {analysis.highlights.length > 0 ? (
          <div className="border-t border-border-soft bg-surface-2/45 p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
              <h3 className="flex items-center gap-2 text-base">
                <Scissors className="size-4 text-brass" aria-hidden />
                {t("reports.highlights.title")}
              </h3>
              {hasViewerChart ? (
                <p className="text-[11px] text-ink-faint">
                  {t("reports.highlights.chartHint")}
                </p>
              ) : null}
            </div>
            <div className="grid border-t border-border-soft 2xl:grid-cols-2">
              {analysis.highlights.slice(0, 4).map((highlight, index) => (
                <HighlightRow
                  key={index}
                  highlight={highlight}
                  time={timeline.relative(highlight.t)}
                  onSeek={seekTo ? () => seekTo(highlight.t) : undefined}
                />
              ))}
            </div>
            {analysis.highlights.length > 4 ? (
              <details className="group mt-3">
                <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-md px-2 text-xs font-bold text-brass hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass [&::-webkit-details-marker]:hidden">
                  <ChevronDown
                    className="size-4 transition-transform group-open:rotate-180"
                    aria-hidden
                  />
                  {tp(
                    "reports.highlights.more",
                    analysis.highlights.length - 4,
                  )}
                </summary>
                <div className="mt-2 grid border-t border-border-soft 2xl:grid-cols-2">
                  {analysis.highlights.slice(4).map((highlight, index) => (
                    <HighlightRow
                      key={index + 4}
                      highlight={highlight}
                      time={timeline.relative(highlight.t)}
                      onSeek={seekTo ? () => seekTo(highlight.t) : undefined}
                    />
                  ))}
                </div>
              </details>
            ) : null}
            <p className="mt-4 text-[11px] text-ink-faint">
              {t("reports.highlights.note")}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
