import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { Button, Card } from "../../components/ui";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { dropCachedSummary } from "../../lib/summaryCache";
import { toast } from "../../lib/toast";
import { cn } from "../../lib/utils";
import { ReportCommunitySection } from "./ReportCommunitySection";
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

const DownloadModal = lazy(() =>
  import("./ReportModals").then((module) => ({
    default: module.DownloadModal,
  })),
);
const RecapModal = lazy(() =>
  import("./ReportModals").then((module) => ({ default: module.RecapModal })),
);

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
    // DeleteButton não espera a Promise: se a exclusão falhar (arquivo em uso, permissão),
    // o aviso tem que sair daqui — senão o botão volta ao normal e o relatório fica, mudo.
    try {
      await api.deleteSession(id);
    } catch {
      toast.errorAction(
        t("reports.detail.delete.error"),
        t("reports.list.openFolder"),
        () => void api.openSessionsDir(),
      );
      return;
    }
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
        <Suspense fallback={null}>
          <RecapModal
            data={detail.data}
            analysis={detail.analysis}
            onClose={closeRecap}
          />
        </Suspense>
      ) : null}
      {downloadOpen ? (
        <Suspense fallback={null}>
          <DownloadModal
            data={detail.data}
            analysis={detail.analysis}
            onClose={closeDownload}
          />
        </Suspense>
      ) : null}

      <ReportReplaySection
        state={story.replayState}
        recordingsDeleted={detail.recordingsDeleted}
        data={detail.data}
        sessionId={id}
        chat={detail.chat.messages}
        readChatPage={detail.readChatPage}
        gaps={detail.chat.gaps}
        ticks={story.replayTicks}
        seek={timeline.seek}
        onPlayhead={timeline.setPlayhead}
        onMarkerAdded={detail.addMarker}
        onRecordingsDeleted={detail.clearRecordings}
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
    <article className="mx-auto max-w-6xl pb-8" aria-busy="true">
      <span className="sr-only" role="status">
        {t("reports.detail.loading")}
      </span>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" /> {t("reports.detail.back")}
        </Button>
        <div
          className="flex animate-pulse items-center gap-2 motion-reduce:animate-none"
          aria-hidden
        >
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-16" />
        </div>
      </div>

      <div className="animate-pulse motion-reduce:animate-none" aria-hidden>
        <header className="mb-7">
          <Skeleton className="h-12 w-3/4 max-w-xl" />
          <div className="mt-3 flex items-center gap-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="mt-4 flex gap-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-28" />
          </div>
        </header>

        <section className="grid overflow-hidden rounded-xl bg-surface pop xl:grid-cols-[minmax(0,1.25fr)_minmax(19rem,0.75fr)]">
          <div className="bg-surface-2 p-6 sm:p-8">
            <div className="flex items-start gap-3">
              <Skeleton className="size-10 shrink-0 bg-brass/25" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-9 w-4/5 max-w-lg" />
                <Skeleton className="mt-4 h-3 w-full max-w-xl" />
                <Skeleton className="mt-2 h-3 w-3/4 max-w-md" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 divide-x divide-y divide-border-soft">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="p-4 sm:p-5">
                <Skeleton className="h-2.5 w-16" />
                <Skeleton className="mt-3 h-8 w-20" />
                <Skeleton className="mt-2 h-2.5 w-24 max-w-full" />
              </div>
            ))}
          </div>
        </section>

        <SkeletonSectionHeading className="mt-12" />
        <div className="mt-5 overflow-hidden rounded-xl bg-night pop">
          <div className="grid gap-px bg-border-soft xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0 bg-night">
              <div className="grid aspect-video min-h-48 place-items-center xl:min-h-72">
                <Skeleton className="h-2 w-28 bg-surface-3" />
              </div>
              <div className="flex h-14 items-center gap-2 border-t border-border-soft bg-surface px-4">
                <Skeleton className="size-8" />
                <Skeleton className="size-10 bg-brass/25" />
                <Skeleton className="size-8" />
                <Skeleton className="ml-2 h-3 w-28" />
              </div>
              <div className="flex h-12 items-center gap-2 border-t border-border-soft bg-surface-2 px-4">
                <Skeleton className="h-8 w-28" />
                <Skeleton className="h-8 w-24" />
              </div>
            </div>
            <div className="h-80 bg-surface xl:h-[36rem]">
              <div className="flex h-14 items-center gap-2 border-b border-border-soft px-3">
                <Skeleton className="size-8" />
                <Skeleton className="h-4 w-16" />
              </div>
              <div className="space-y-3 px-3 py-4">
                {[0, 1, 2, 3, 4, 5].map((index) => (
                  <div key={index} className="flex items-start gap-2">
                    <Skeleton className="mt-0.5 size-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <Skeleton className="h-2.5 w-24" />
                      <Skeleton
                        className={cn(
                          "mt-1.5 h-2.5",
                          index % 2 === 0 ? "w-full" : "w-3/4",
                        )}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <SkeletonSectionHeading className="mt-12" />
        <div className="mt-5 rounded-xl bg-surface p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-7 w-32" />
          </div>
          <Skeleton className="mt-5 h-56 w-full bg-surface-2" />
          <div className="mt-4 flex gap-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>

        <SkeletonSectionHeading className="mt-12" />
        <div className="mt-5 space-y-4">
          <div className="flex min-h-20 items-center gap-5 rounded-xl bg-surface px-5 py-4 sm:px-6">
            <Skeleton className="h-5 w-32 shrink-0" />
            <Skeleton className="h-3 flex-1" />
          </div>
          <div className="rounded-xl bg-surface p-5 sm:p-6">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-5 h-56 w-full bg-surface-2" />
          </div>
        </div>

        <div className="mt-12 flex min-h-24 items-center gap-4 rounded-xl bg-surface p-5 sm:p-6">
          <Skeleton className="size-11 shrink-0" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="mt-2 h-3 w-full max-w-lg" />
          </div>
          <Skeleton className="size-5 shrink-0" />
        </div>
      </div>
    </article>
  );
}

function SkeletonSectionHeading({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <Skeleton className="size-9 shrink-0 bg-brass/25" />
      <div className="min-w-0 flex-1">
        <Skeleton className="h-8 w-52 max-w-2/3" />
        <Skeleton className="mt-2 h-3 w-full max-w-xl" />
      </div>
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("rounded-sm bg-surface-3", className)} />;
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
