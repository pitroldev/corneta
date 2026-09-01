import { useState, type ComponentType } from "react";
import {
  Activity,
  AlertTriangle,
  Check,
  ChevronDown,
  Clock,
  Cpu,
  Gauge,
  Radio,
  type LucideProps,
} from "lucide-react";
import { LineChart } from "../../components/LineChart";
import { PlatformGlyph } from "../../components/ui";
import { useI18n } from "../../lib/i18n";
import { hasObs, type ReportAnalysis } from "../../lib/report";
import type { SessionData } from "../../lib/types";
import { cn } from "../../lib/utils";
import { ReportTechnicalEventsPanel } from "./ReportTechnicalEventsPanel";
import type {
  ReportStoryModel,
  ReportTechnicalModel,
  ReportTimelineModel,
} from "./useReportModels";

type TechnicalView = "signal" | "machine" | "obs" | "platforms" | "events";

interface TechnicalViewOption {
  id: TechnicalView;
  label: string;
  Icon: ComponentType<LucideProps>;
}

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
  const { t } = useI18n();
  const TechnicalSummaryIcon =
    analysis.verdict.tone === "ok" ? Check : AlertTriangle;

  return (
    <section className="mt-12" aria-labelledby="report-technical-heading">
      <details
        open={open}
        onToggle={(event) => onOpenChange(event.currentTarget.open)}
        className="group/technical overflow-hidden rounded-xl bg-surface"
      >
        <summary className="flex min-h-24 cursor-pointer list-none items-center gap-4 p-5 sm:p-6 [&::-webkit-details-marker]:hidden">
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
          <ChevronDown
            className="size-5 shrink-0 text-ink-faint transition-transform group-open/technical:rotate-180"
            aria-hidden
          />
        </summary>

        {open && technical ? (
          <div className="border-t border-border-soft bg-surface-2 p-4 sm:p-6">
            <div className="rounded-lg bg-surface p-4 sm:p-6">
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-md",
                    analysis.verdict.tone === "ok"
                      ? "bg-ok/10 text-ok"
                      : analysis.verdict.tone === "bad"
                        ? "bg-bad/10 text-bad"
                        : "bg-warn/10 text-warn",
                  )}
                >
                  <TechnicalSummaryIcon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <h3 className="text-lg">{analysis.verdict.title}</h3>
                  <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-muted">
                    {analysis.verdict.detail}
                  </p>
                </div>
              </div>

              <TechnicalWorkspace
                data={data}
                analysis={analysis}
                story={story}
                technical={technical}
                timeline={timeline}
              />
            </div>
          </div>
        ) : null}
      </details>
    </section>
  );
}

function TechnicalWorkspace({
  data,
  analysis,
  story,
  technical,
  timeline,
}: {
  data: SessionData;
  analysis: ReportAnalysis;
  story: ReportStoryModel;
  technical: ReportTechnicalModel;
  timeline: ReportTimelineModel;
}) {
  const { t, fmt } = useI18n();
  const [requestedView, setRequestedView] = useState<TechnicalView>("signal");
  const views: TechnicalViewOption[] = [];

  if (story.sampleCount > 1)
    views.push({
      id: "signal",
      label: t("reports.technical.tabs.signal"),
      Icon: Activity,
    });
  if (story.sampleCount > 1 && technical.hasCpuOrGpu)
    views.push({
      id: "machine",
      label: t("reports.technical.tabs.machine"),
      Icon: Cpu,
    });
  if (story.sampleCount > 1 && hasObs(data))
    views.push({
      id: "obs",
      label: t("reports.technical.tabs.obs"),
      Icon: Gauge,
    });
  if (analysis.perTarget.length > 0)
    views.push({
      id: "platforms",
      label: t("reports.technical.tabs.platforms"),
      Icon: Radio,
    });
  if (analysis.windows.length > 0 || analysis.events.length > 0)
    views.push({
      id: "events",
      label: t("reports.technical.tabs.events"),
      Icon: Clock,
    });

  const activeView = views.some((view) => view.id === requestedView)
    ? requestedView
    : views[0]?.id;
  if (!activeView) return null;

  return (
    <div className="mt-6 border-t border-border-soft pt-5">
      <div
        role="group"
        aria-label={t("reports.technical.tabs.label")}
        className="flex gap-1 overflow-x-auto pb-1"
      >
        {views.map(({ id, label, Icon }) => {
          const active = id === activeView;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => setRequestedView(id)}
              className={cn(
                "flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3 text-xs font-bold transition-colors",
                active
                  ? "bg-brass text-brass-ink"
                  : "text-ink-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              {label}
            </button>
          );
        })}
      </div>

      <div className="mt-5">
        {activeView === "signal" ? (
          <TechnicalChart
            title={t("reports.bitrate.title")}
            icon={Activity}
            series={technical.bitrateSeries}
            n={story.sampleCount}
            markers={technical.markers}
            formatValue={(value) => fmt.dec(value, 1)}
            formatX={timeline.relativeAtSample}
            playhead={timeline.playSample}
            onSeek={timeline.seekSample}
          >
            {technical.markers.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold text-ink-faint">
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
          </TechnicalChart>
        ) : null}

        {activeView === "machine" ? (
          <TechnicalChart
            title={t("reports.machine.title")}
            icon={Cpu}
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
        ) : null}

        {activeView === "obs" ? (
          <TechnicalChart
            title={t("reports.obs.title")}
            icon={Gauge}
            series={technical.obsSeries}
            n={story.sampleCount}
            markers={technical.markers}
            formatValue={(value) => `${Math.round(value)}`}
            formatX={timeline.relativeAtSample}
            playhead={timeline.playSample}
            onSeek={timeline.seekSample}
          />
        ) : null}

        {activeView === "platforms" ? (
          <TargetTable analysis={analysis} />
        ) : null}

        {activeView === "events" ? (
          <ReportTechnicalEventsPanel
            analysis={analysis}
            timeline={timeline}
            canSeek={story.replayState === "ready"}
            startedAt={data.meta.startedAt}
            endedAt={
              data.meta.endedAt ??
              data.samples[data.samples.length - 1]?.t ??
              data.meta.startedAt
            }
          />
        ) : null}
      </div>
    </div>
  );
}

function TechnicalChart({
  title,
  icon: Icon,
  children,
  ...chartProps
}: {
  title: string;
  icon: ComponentType<LucideProps>;
  children?: React.ReactNode;
} & React.ComponentProps<typeof LineChart>) {
  return (
    <div>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
        <Icon className="size-4" aria-hidden /> {title}
      </h3>
      <LineChart {...chartProps} height={210} />
      {children}
    </div>
  );
}

function TargetTable({ analysis }: { analysis: ReportAnalysis }) {
  const { t, fmt } = useI18n();
  return (
    <div>
      <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
        {t("reports.perTarget.title")}
      </h3>
      <div className="divide-y divide-border-soft">
        {analysis.perTarget.map((target) => (
          <div
            key={target.id}
            className="grid gap-3 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
          >
            <div className="flex min-w-0 items-center gap-3">
              <PlatformGlyph id={target.platformId} size={22} />
              <span className="min-w-0 truncate font-display font-bold">
                {target.name}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted lg:justify-end">
              <span>
                {t("reports.perTarget.avgBitrate", {
                  mbps: fmt.dec(target.avgBitrate / 1000, 1),
                })}
              </span>
              <span>
                {t("reports.perTarget.dropped", {
                  n: target.maxDropped,
                })}
              </span>
              <span className={target.reconnects > 0 ? "text-warn" : undefined}>
                {t("reports.perTarget.reconnects", {
                  n: target.reconnects,
                })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
