import type { RecordingReplayStatus } from "../../lib/api/types";
import { useI18n, type MessageKey } from "../../lib/i18n";
import { Button } from "../ui";

export function ReplayPreparationNotice({
  status,
  onPrepare,
  onRetry,
}: {
  status?: RecordingReplayStatus;
  onPrepare: () => void;
  onRetry: () => void;
}) {
  const { t, fmt } = useI18n();
  if (!status || status.state === "ready" || status.state === "missing")
    return null;
  const preparing = status.state === "preparing";
  const unavailable = status.reason === "status_unavailable";
  const noSpace = status.reason === "insufficientSpace";
  const reasonKeys: Record<string, MessageKey> = {
    invalidFile: "replay.prepare.invalidFile",
    unreadable: "replay.prepare.unreadable",
    spaceUnavailable: "replay.prepare.spaceUnavailable",
    busy: "replay.prepare.busy",
    sourceChanged: "replay.prepare.sourceChanged",
    interrupted: "replay.prepare.interrupted",
  };
  return (
    <div
      className="flex flex-wrap items-center gap-3 border-t border-border-soft bg-surface px-4 py-3 text-sm text-ink-muted"
      role="status"
    >
      <div className="min-w-0 flex-1 basis-64">
        <p className="font-semibold text-ink">
          {t(
            preparing
              ? "replay.prepare.running"
              : unavailable
                ? "replay.prepare.statusUnavailable"
                : status.state === "failed"
                  ? "replay.prepare.failed"
                  : "replay.prepare.suggest",
          )}
        </p>
        <p className="mt-1 text-xs">
          {t(
            preparing
              ? "replay.prepare.runningHint"
              : noSpace
                ? "replay.prepare.space"
                : unavailable
                  ? "replay.prepare.statusHint"
                  : (reasonKeys[status.reason ?? ""] ?? "replay.prepare.hint"),
          )}
        </p>
        {noSpace &&
          status.requiredBytes != null &&
          status.availableBytes != null && (
            <p className="mt-1 text-xs">
              {t("replay.prepare.spaceDetails", {
                required: fmt.dec(status.requiredBytes / 1024 ** 3, 1),
                available: fmt.dec(status.availableBytes / 1024 ** 3, 1),
              })}
            </p>
          )}
      </div>
      {!preparing && (
        <Button
          size="sm"
          variant="subtle"
          onClick={unavailable ? onRetry : onPrepare}
        >
          {t(unavailable ? "replay.retry" : "replay.prepare.action")}
        </Button>
      )}
    </div>
  );
}
