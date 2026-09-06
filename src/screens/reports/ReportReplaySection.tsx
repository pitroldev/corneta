import { memo } from "react";
import { Play, Video } from "lucide-react";
import {
  ReplayPlayer,
  type ReplayTick,
  type SeekRequest,
} from "../../components/ReplayPlayer";
import { Button } from "../../components/ui";
import { useI18n } from "../../lib/i18n";
import { useStore } from "../../lib/store";
import type {
  ReplayChatGap,
  ReplayChatMessage,
  SessionData,
  SessionMarker,
} from "../../lib/types";
import { StorySectionHeading } from "./ReportPrimitives";
import type { ReplayState } from "./useReportModels";
import type { ChatPage } from "../../lib/replayChatPage";

/** O que a seção mostra: os estados do modelo mais "apagada", que só existe nesta visita. */
type ReplayView = ReplayState | "deleted";

const UNAVAILABLE_COPY = {
  empty: {
    title: "reports.story.replay.emptyTitle",
    body: "reports.story.replay.emptyBody",
  },
  missing: {
    title: "reports.story.replay.missingTitle",
    body: "reports.story.replay.missingBody",
  },
  deleted: {
    title: "reports.story.replay.deletedTitle",
    body: "reports.story.replay.deletedBody",
  },
} as const;

export const ReportReplaySection = memo(function ReportReplaySection({
  state,
  data,
  sessionId,
  chat,
  readChatPage,
  gaps,
  ticks,
  seek,
  onPlayhead,
  onMarkerAdded,
  onRecordingsDeleted,
  recordingsDeleted,
}: {
  state: ReplayState;
  /** O streamer apagou a gravação nesta visita — ver `useReportDetailData`. */
  recordingsDeleted: boolean;
  data: SessionData;
  sessionId: string;
  chat: ReplayChatMessage[];
  readChatPage: (epoch: number) => Promise<ChatPage>;
  gaps: ReplayChatGap[];
  ticks: ReplayTick[];
  seek: SeekRequest | null;
  onPlayhead: (timestamp: number | null) => void;
  onMarkerAdded: (marker: SessionMarker) => void;
  onRecordingsDeleted: () => void;
}) {
  const t = useI18n().t;
  // Nos dados, gravação apagada e live que nunca gravou são a mesma coisa (sem trecho
  // no índice). Só o flag distingue — e evita dizer "não foi gravada" sobre um vídeo
  // que o app acabou de apagar a pedido do streamer.
  const view: ReplayView =
    state === "missing" && recordingsDeleted ? "deleted" : state;
  const descriptionKey =
    view === "ready"
      ? "reports.story.replay.desc"
      : view === "empty"
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
      {view === "ready" ? (
        <div className="mt-5 overflow-hidden rounded-xl bg-night pop [&>h3]:sr-only [&>div]:mb-0">
          <ReplayPlayer
            data={data}
            sessionId={sessionId}
            chat={chat}
            readChatPage={readChatPage}
            gaps={gaps}
            ticks={ticks}
            seek={seek}
            onPlayhead={onPlayhead}
            onMarkerAdded={onMarkerAdded}
            onRecordingsDeleted={onRecordingsDeleted}
          />
        </div>
      ) : (
        <ReplayUnavailable state={view} />
      )}
    </section>
  );
});

function ReplayUnavailable({ state }: { state: Exclude<ReplayView, "ready"> }) {
  const t = useI18n().t;
  const setSettingsTab = useStore((s) => s.setSettingsTab);
  const requestNavigate = useStore((s) => s.requestNavigate);
  const copy = UNAVAILABLE_COPY[state];
  // A gravação nasce desligada e o único lugar que liga é Configurações → Geral →
  // "Gravar a live". Sem este atalho, quem chega aqui sem vídeo dá com um beco: o texto
  // explica, mas não leva. Quem acabou de apagar a gravação não recebe o convite.
  const openRecordingSettings = () => {
    setSettingsTab("geral");
    requestNavigate("settings");
  };
  return (
    <div className="mt-5 flex items-center gap-4 rounded-xl border-2 border-dashed border-border bg-surface-2 p-5 text-sm text-ink-muted">
      <span className="grid size-11 shrink-0 place-items-center rounded-md bg-surface-3 text-ink-faint">
        <Play className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-base text-ink">{t(copy.title)}</h3>
        <p className="mt-1">{t(copy.body)}</p>
        {state === "missing" ? (
          <Button
            variant="primary"
            size="sm"
            className="mt-3"
            onClick={openRecordingSettings}
          >
            <Video className="size-4" /> {t("reports.story.replay.turnOn")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
