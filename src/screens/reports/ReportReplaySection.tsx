import { memo } from "react";
import { Play } from "lucide-react";
import {
  ReplayPlayer,
  type ReplayTick,
  type SeekRequest,
} from "../../components/ReplayPlayer";
import { useI18n } from "../../lib/i18n";
import type {
  ReplayChatGap,
  ReplayChatMessage,
  SessionData,
  SessionMarker,
} from "../../lib/types";
import { StorySectionHeading } from "./ReportPrimitives";
import type { ReplayState } from "./useReportModels";

export const ReportReplaySection = memo(function ReportReplaySection({
  state,
  data,
  sessionId,
  chat,
  gaps,
  ticks,
  seek,
  onPlayhead,
  onMarkerAdded,
  onRecordingsDeleted,
}: {
  state: ReplayState;
  data: SessionData;
  sessionId: string;
  chat: ReplayChatMessage[];
  gaps: ReplayChatGap[];
  ticks: ReplayTick[];
  seek: SeekRequest | null;
  onPlayhead: (timestamp: number | null) => void;
  onMarkerAdded: (marker: SessionMarker) => void;
  onRecordingsDeleted: () => void;
}) {
  const t = useI18n().t;
  const descriptionKey =
    state === "ready"
      ? "reports.story.replay.desc"
      : state === "empty"
        ? "reports.story.replay.emptyDesc"
        : "reports.story.replay.missingDesc";

  return (
    <section className="mt-12" aria-labelledby="report-replay-heading">
      <StorySectionHeading
        id="report-replay-heading"
        icon={Play}
        title={t("reports.story.replay.title")}
        description={t(descriptionKey)}
      />
      {state === "ready" ? (
        <div className="mt-5 overflow-hidden rounded-xl bg-night pop [&>h3]:sr-only [&>div]:mb-0">
          <ReplayPlayer
            data={data}
            sessionId={sessionId}
            chat={chat}
            gaps={gaps}
            ticks={ticks}
            seek={seek}
            onPlayhead={onPlayhead}
            onMarkerAdded={onMarkerAdded}
            onRecordingsDeleted={onRecordingsDeleted}
          />
        </div>
      ) : (
        <ReplayUnavailable state={state} />
      )}
    </section>
  );
});

function ReplayUnavailable({ state }: { state: "empty" | "missing" }) {
  const t = useI18n().t;
  return (
    <div className="mt-5 flex items-center gap-4 rounded-xl border-2 border-dashed border-border bg-surface-2 p-5 text-sm text-ink-muted">
      <span className="grid size-11 shrink-0 place-items-center rounded-md bg-surface-3 text-ink-faint">
        <Play className="size-5" aria-hidden />
      </span>
      <div>
        <h3 className="text-base text-ink">
          {t(
            state === "empty"
              ? "reports.story.replay.emptyTitle"
              : "reports.story.replay.missingTitle",
          )}
        </h3>
        <p className="mt-1">
          {t(
            state === "empty"
              ? "reports.story.replay.emptyBody"
              : "reports.story.replay.missingBody",
          )}
        </p>
      </div>
    </div>
  );
}
