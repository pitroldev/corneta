import { Gem, MessageSquare, Sparkles, Users } from "lucide-react";
import { LineChart } from "../../components/LineChart";
import { rich, useI18n } from "../../lib/i18n";
import { hasChat, type ReportAnalysis } from "../../lib/report";
import type { SessionData } from "../../lib/types";
import {
  ALERT_LABELS,
  ChannelBreakdownCard,
  SplitToggle,
  StorySectionHeading,
  type SplitMode,
} from "./ReportPrimitives";
import type { ReportStoryModel, ReportTimelineModel } from "./useReportModels";

export function ReportCommunitySection({
  data,
  analysis,
  story,
  timeline,
  splitMode,
  onSplitModeChange,
}: {
  data: SessionData;
  analysis: ReportAnalysis;
  story: ReportStoryModel;
  timeline: ReportTimelineModel;
  splitMode: SplitMode;
  onSplitModeChange: (mode: SplitMode) => void;
}) {
  const { t, tp, fmt } = useI18n();
  const visible =
    hasChat(data) ||
    analysis.alerts.hasData ||
    analysis.byChannel.channels.length > 1;
  if (!visible) return null;

  return (
    <section className="mt-12" aria-labelledby="report-community-heading">
      <StorySectionHeading
        id="report-community-heading"
        icon={Users}
        title={t("reports.story.community.title")}
        description={t("reports.story.community.desc")}
      />
      <div className="mt-5 flex flex-col gap-4">
        {analysis.alerts.hasData ? (
          <div className="rounded-xl bg-surface px-5 py-4 sm:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
              <div className="shrink-0 lg:w-52">
                <h3 className="flex items-center gap-2 text-base">
                  <Sparkles className="size-4 text-brass" aria-hidden />
                  {t("reports.alerts.title")}
                </h3>
                {analysis.alerts.topRaid &&
                analysis.alerts.topRaid.amount > 0 ? (
                  <div className="mt-1 text-xs text-ink-muted">
                    {rich(t, "reports.alerts.topRaid", {
                      user: (
                        <strong className="text-ink">
                          {analysis.alerts.topRaid.user}
                        </strong>
                      ),
                      n: Math.round(analysis.alerts.topRaid.amount),
                    })}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-1 flex-wrap gap-x-5 gap-y-3 border-t border-border-soft pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5">
                {ALERT_LABELS.map(([kind, labelKey, Icon]) =>
                  analysis.alerts.byKind[kind] ? (
                    <span
                      key={kind}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Icon className="size-3.5 text-brass" aria-hidden />
                      <strong>{analysis.alerts.byKind[kind]}</strong>
                      <span className="text-ink-muted">
                        {tp(labelKey, analysis.alerts.byKind[kind])}
                      </span>
                    </span>
                  ) : null,
                )}
                {analysis.alerts.bits > 0 ? (
                  <span className="flex items-center gap-2 text-sm">
                    <Gem className="size-3.5 text-info" aria-hidden />
                    <strong>{fmt.num(analysis.alerts.bits)}</strong>
                    <span className="text-ink-muted">
                      {t("reports.alerts.bitsTotal")}
                    </span>
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {hasChat(data) && story.sampleCount > 1 ? (
          <div className="rounded-xl bg-surface p-5 sm:p-6">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h3 className="flex items-center gap-2 text-base">
                <MessageSquare className="size-4 text-brass" aria-hidden />
                {t("reports.chat.title")}
              </h3>
              {story.canSplitChat ? (
                <SplitToggle value={splitMode} onChange={onSplitModeChange} />
              ) : null}
            </div>
            <LineChart
              series={story.chatSeries}
              n={story.sampleCount}
              markers={story.chatMarkers}
              formatValue={(value) => Math.round(value).toString()}
              formatX={timeline.relativeAtSample}
              playhead={timeline.playSample}
              onSeek={timeline.seekSample}
            />
            <div className="mt-3 text-xs text-ink-muted">
              {splitMode === "channel" && story.canSplitChat ? (
                <span className="font-semibold text-ink-faint">
                  {t("reports.chart.allChannels")}{" "}
                </span>
              ) : null}
              {rich(t, "reports.chat.summary", {
                total: (
                  <strong className="text-ink">
                    {fmt.num(analysis.chat.total)}
                  </strong>
                ),
                peak: (
                  <strong className="text-ink">
                    {analysis.chat.peakPerMin}
                  </strong>
                ),
                avg: analysis.chat.avgPerMin,
              })}
            </div>
          </div>
        ) : null}

        {analysis.byChannel.channels.length > 1 ? (
          <ChannelBreakdownCard
            breakdown={analysis.byChannel}
            colors={story.channelColors}
          />
        ) : null}
      </div>
    </section>
  );
}
