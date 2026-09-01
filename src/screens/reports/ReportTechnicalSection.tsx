import {
  Activity,
  AlertTriangle,
  Check,
  ChevronDown,
  Clock,
  Cpu,
  Gauge,
} from "lucide-react";
import { LineChart } from "../../components/LineChart";
import { Card, PlatformGlyph } from "../../components/ui";
import { useI18n } from "../../lib/i18n";
import { hasObs, type ReportAnalysis } from "../../lib/report";
import type { SessionData } from "../../lib/types";
import { cn } from "../../lib/utils";
import { EventRow, WindowCard } from "./ReportPrimitives";
import type {
  ReportStoryModel,
  ReportTechnicalModel,
  ReportTimelineModel,
} from "./useReportModels";

export function ReportTechnicalSection({
  data,
  analysis,
  story,
  technical,
  timeline,
  open,
  onOpenChange,
}: {
  data: SessionData;
  analysis: ReportAnalysis;
  story: ReportStoryModel;
  technical: ReportTechnicalModel | null;
  timeline: ReportTimelineModel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, fmt } = useI18n();
  const seekTo = story.replayState === "ready" ? timeline.seekTo : undefined;
  const TechnicalSummaryIcon =
    analysis.verdict.tone === "ok" ? Check : AlertTriangle;

  return (
    <section className="mt-12" aria-labelledby="report-technical-heading">
      <details
        open={open}
        onToggle={(event) => onOpenChange(event.currentTarget.open)}
        className="group overflow-hidden rounded-xl bg-surface"
      >
        <summary className="flex cursor-pointer list-none items-center gap-4 p-5 sm:p-6 [&::-webkit-details-marker]:hidden">
          <span className="grid size-11 shrink-0 place-items-center rounded-md bg-surface-2 text-brass">
            <Gauge className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span
              id="report-technical-heading"
              className="block font-display text-xl font-extrabold"
            >
              {t("reports.story.technical.title")}
            </span>
            <span className="mt-1 block text-sm text-ink-muted">
              {t("reports.story.technical.desc")}
            </span>
          </span>
          <span
            className={cn(
              "hidden rounded-sm px-2 py-1 text-[11px] font-extrabold uppercase tracking-wide sm:inline-flex",
              analysis.verdict.tone === "ok"
                ? "bg-ok/15 text-ok"
                : "bg-warn/15 text-warn",
            )}
          >
            {analysis.verdict.tone === "ok"
              ? t("reports.story.technical.clean")
              : t("reports.story.technical.review")}
          </span>
          <ChevronDown className="size-5 shrink-0 text-ink-faint transition-transform group-open:rotate-180" />
        </summary>

        {open && technical ? (
          <div className="border-t border-border-soft bg-surface-2 p-4 sm:p-6">
            <div
              className={cn(
                "mb-5 rounded-lg bg-surface p-4 sm:p-5",
                analysis.verdict.tone === "ok"
                  ? "text-ok"
                  : analysis.verdict.tone === "bad"
                    ? "text-bad"
                    : "text-warn",
              )}
            >
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-current/10">
                  <TechnicalSummaryIcon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <h3 className="text-lg text-current">
                    {analysis.verdict.title}
                  </h3>
                  <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-muted">
                    {analysis.verdict.detail}
                  </p>
                </div>
              </div>
            </div>

            {analysis.windows.length > 0 ? (
              <div className="mb-5" aria-labelledby="report-problems-heading">
                <h3
                  id="report-problems-heading"
                  className="mb-3 text-base text-ink"
                >
                  {t("reports.windows.title")}
                </h3>
                <div className="grid gap-2 xl:grid-cols-2">
                  {analysis.windows.map((window, index) => (
                    <WindowCard
                      key={index}
                      window={window}
                      time={timeline.relative(window.tStart)}
                      onSeek={seekTo ? () => seekTo(window.tStart) : undefined}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-2">
              {story.sampleCount > 1 ? (
                <Card className="mb-0">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
                    <Activity className="size-4" /> {t("reports.bitrate.title")}
                  </h3>
                  <LineChart
                    series={technical.bitrateSeries}
                    n={story.sampleCount}
                    markers={technical.markers}
                    formatValue={(value) => fmt.dec(value, 1)}
                    formatX={timeline.relativeAtSample}
                    playhead={timeline.playSample}
                    onSeek={timeline.seekSample}
                  />
                  {technical.markers.length > 0 ? (
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
                  ) : null}
                </Card>
              ) : null}

              {story.sampleCount > 1 && technical.hasCpuOrGpu ? (
                <Card className="mb-0">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
                    <Cpu className="size-4" /> {t("reports.machine.title")}
                  </h3>
                  <LineChart
                    series={technical.machineSeries}
                    n={story.sampleCount}
                    yMax={100}
                    formatValue={(value) => `${Math.round(value)}`}
                    formatX={timeline.relativeAtSample}
                    refLine={{
                      value: 92,
                      label: t("reports.machine.dangerLine"),
                    }}
                    playhead={timeline.playSample}
                    onSeek={timeline.seekSample}
                  />
                </Card>
              ) : null}

              {story.sampleCount > 1 && hasObs(data) ? (
                <Card className="mb-0">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
                    <Activity className="size-4" /> {t("reports.obs.title")}
                  </h3>
                  <LineChart
                    series={technical.obsSeries}
                    n={story.sampleCount}
                    markers={technical.markers}
                    formatValue={(value) => `${Math.round(value)}`}
                    formatX={timeline.relativeAtSample}
                    playhead={timeline.playSample}
                    onSeek={timeline.seekSample}
                  />
                </Card>
              ) : null}

              <Card className="mb-0">
                <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
                  {t("reports.perTarget.title")}
                </h3>
                <div className="flex flex-col gap-2">
                  {analysis.perTarget.map((target) => (
                    <div
                      key={target.id}
                      className="flex items-center gap-3 rounded-md bg-surface-2 px-3 py-2"
                    >
                      <PlatformGlyph id={target.platformId} size={22} />
                      <span className="min-w-24 flex-1 font-display font-bold">
                        {target.name}
                      </span>
                      <span className="text-xs text-ink-muted">
                        {t("reports.perTarget.avgBitrate", {
                          mbps: fmt.dec(target.avgBitrate / 1000, 1),
                        })}
                      </span>
                      <span className="text-xs text-ink-muted">
                        {t("reports.perTarget.dropped", {
                          n: target.maxDropped,
                        })}
                      </span>
                      <span
                        className={cn(
                          "text-xs",
                          target.reconnects > 0
                            ? "text-warn"
                            : "text-ink-faint",
                        )}
                      >
                        {t("reports.perTarget.reconnects", {
                          n: target.reconnects,
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="xl:col-span-2">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
                  <Clock className="size-4" /> {t("reports.events.title")}
                </h3>
                <div className="grid gap-x-6 gap-y-1 xl:grid-cols-2">
                  {analysis.events.map((event, index) => (
                    <EventRow
                      key={index}
                      event={event}
                      time={timeline.relative(event.t)}
                      onSeek={seekTo ? () => seekTo(event.t) : undefined}
                    />
                  ))}
                </div>
              </Card>
            </div>
          </div>
        ) : null}
      </details>
    </section>
  );
}
