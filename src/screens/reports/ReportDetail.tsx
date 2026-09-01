import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { Button, Card } from "../../components/ui";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { dropCachedSummary } from "../../lib/report";
import { toast } from "../../lib/toast";
import { ReportCommunitySection } from "./ReportCommunitySection";
import { DownloadModal, RecapModal } from "./ReportModals";
import { ReportOverview } from "./ReportOverview";
import { ReportReplaySection } from "./ReportReplaySection";
import { ReportTechnicalSection } from "./ReportTechnicalSection";
import { ReportTimelineSection } from "./ReportTimelineSection";
import type { SplitMode } from "./ReportPrimitives";
import { buildHeroStats } from "./reportUtils";
import { useReportDetailData } from "./useReportDetailData";
import {
  useReportStoryModel,
  useReportTechnicalModel,
  useReportTimeline,
} from "./useReportModels";

export function ReportDetail({
  id,
  previousId,
  onBack,
  onDeleted,
}: {
  id: string;
  previousId: string | null;
  onBack: () => void;
  onDeleted: () => void;
}) {
  const { t, fmt } = useI18n();
  const [recapOpen, setRecapOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [viewerSplit, setViewerSplit] = useState<SplitMode>("total");
  const [chatSplit, setChatSplit] = useState<SplitMode>("total");
  const [technicalOpen, setTechnicalOpen] = useState(false);
  const detail = useReportDetailData(id, previousId);
  const story = useReportStoryModel({
    data: detail.parsed,
    analysis: detail.analysis,
    replayIndex: detail.replayIndex,
    splitViewers: viewerSplit === "channel",
    splitChat: chatSplit === "channel",
    t,
  });
  const technical = useReportTechnicalModel({
    data: detail.parsed,
    analysis: detail.analysis,
    open: technicalOpen,
    t,
  });
  const timeline = useReportTimeline(
    detail.parsed,
    story?.replayState ?? "missing",
  );
  const heroStats = useMemo(
    () =>
      detail.analysis
        ? buildHeroStats(detail.analysis, detail.previousSummary, t, fmt)
        : [],
    [detail.analysis, detail.previousSummary, fmt, t],
  );

  const remove = useCallback(async () => {
    await api.deleteSession(id);
    dropCachedSummary(id);
    toast.info(t("reports.detail.deleted"));
    onDeleted();
  }, [id, onDeleted, t]);
  const openRecap = useCallback(() => setRecapOpen(true), []);
  const closeRecap = useCallback(() => setRecapOpen(false), []);
  const openDownload = useCallback(() => setDownloadOpen(true), []);
  const closeDownload = useCallback(() => setDownloadOpen(false), []);

  if (detail.data === "loading") return <DetailSkeleton onBack={onBack} />;
  if (!detail.data || !detail.analysis || !story)
    return <DetailError onBack={onBack} onRetry={detail.reload} />;

  return (
    <article className="mx-auto max-w-6xl pb-8">
      <ReportOverview
        data={detail.data}
        analysis={detail.analysis}
        stats={heroStats}
        onBack={onBack}
        onOpenRecap={openRecap}
        onOpenDownload={openDownload}
        onDelete={remove}
      />
      {recapOpen ? (
        <RecapModal
          data={detail.data}
          analysis={detail.analysis}
          onClose={closeRecap}
        />
      ) : null}
      {downloadOpen ? (
        <DownloadModal data={detail.data} onClose={closeDownload} />
      ) : null}

      <ReportReplaySection
        state={story.replayState}
        data={detail.data}
        sessionId={id}
        chat={detail.chat.messages}
        gaps={detail.chat.gaps}
        ticks={story.replayTicks}
        seek={timeline.seek}
        onPlayhead={timeline.setPlayhead}
        onReload={detail.reload}
      />
      <ReportTimelineSection
        analysis={detail.analysis}
        story={story}
        timeline={timeline}
        splitMode={viewerSplit}
        onSplitModeChange={setViewerSplit}
      />
      <ReportCommunitySection
        data={detail.data}
        analysis={detail.analysis}
        story={story}
        timeline={timeline}
        splitMode={chatSplit}
        onSplitModeChange={setChatSplit}
      />
      <ReportTechnicalSection
        data={detail.data}
        analysis={detail.analysis}
        story={story}
        technical={technical}
        timeline={timeline}
        open={technicalOpen}
        onOpenChange={setTechnicalOpen}
      />
    </article>
  );
}

function DetailSkeleton({ onBack }: { onBack: () => void }) {
  const t = useI18n().t;
  return (
    <div className="mx-auto max-w-3xl">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="size-4" /> {t("reports.detail.back")}
      </Button>
      <div className="mt-4 flex flex-col gap-3" aria-hidden>
        <div className="h-20 animate-pulse rounded-lg bg-surface-2" />
        <div className="h-16 animate-pulse rounded-lg bg-surface-2" />
        <div className="h-44 animate-pulse rounded-lg bg-surface-2" />
      </div>
    </div>
  );
}

function DetailError({
  onBack,
  onRetry,
}: {
  onBack: () => void;
  onRetry: () => void;
}) {
  const t = useI18n().t;
  return (
    <div className="mx-auto max-w-3xl">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="size-4" /> {t("reports.detail.back")}
      </Button>
      <Card className="mt-4 text-sm text-ink-muted">
        <div className="flex items-start gap-3" role="alert">
          <AlertTriangle
            className="mt-0.5 size-5 shrink-0 text-bad"
            aria-hidden
          />
          <div className="min-w-0">
            <h2 className="text-base text-ink">
              {t("reports.detail.error.title")}
            </h2>
            <p className="mt-1">{t("reports.detail.error.read")}</p>
            <Button
              className="mt-4"
              size="sm"
              variant="outline"
              onClick={onRetry}
            >
              {t("reports.error.retry")}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
