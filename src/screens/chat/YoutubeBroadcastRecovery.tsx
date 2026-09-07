import { ExternalLink, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button, Toggle } from "../../components/ui";
import { api } from "../../lib/api";
import { useT } from "../../lib/i18n";
import { useStore } from "../../lib/store";
import { openExternal } from "../../lib/utils";
import { useAccountAction } from "./useAccountAction";
import {
  resolveYoutubeRecovery,
  type YoutubeRecoveryStatus,
} from "./youtubeRecovery";

export function YoutubeBroadcastRecovery() {
  const t = useT();
  const stopped = useStore(
    (state) =>
      state.snapshot.state === "stopped" || state.snapshot.state === "error",
  );
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<YoutubeRecoveryStatus | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const { busy, run } = useAccountAction();
  const check = () =>
    void run(async () => {
      setConfirmed(false);
      setStatus(null);
      setStatus(await api.youtubeBroadcastRecoveryStatus());
    });
  const resolve = () =>
    void run(async () => {
      if (await resolveYoutubeRecovery(api, status, confirmed, stopped)) {
        setStatus("none");
        setConfirmed(false);
      }
    });
  return (
    <div className="mt-2">
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        aria-expanded={expanded}
        onClick={() => {
          setExpanded(!expanded);
          if (!expanded) check();
        }}
      >
        <RotateCcw className="size-3.5" aria-hidden />
        {t("youtube.recovery.open")}
      </Button>
      {expanded ? (
        <div className="mt-2 space-y-3 text-sm leading-relaxed text-ink-muted">
          <p role="status" aria-live="polite">
            {status === null
              ? t(
                  busy
                    ? "youtube.recovery.loading"
                    : "youtube.recovery.loadFailed",
                )
              : t(`youtube.recovery.${status}`)}
          </p>
          {status === "pending" || status === "unknown" ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void openExternal("https://studio.youtube.com")}
              >
                <ExternalLink className="size-3.5" aria-hidden />{" "}
                {t("youtube.recovery.studio")}
              </Button>
              {!stopped ? (
                <p className="text-warn">{t("youtube.recovery.stopFirst")}</p>
              ) : null}
              {status === "unknown" ? (
                <div className="flex items-start gap-3">
                  <Toggle
                    checked={confirmed}
                    onChange={setConfirmed}
                    disabled={busy || !stopped}
                    label={t("youtube.recovery.confirm")}
                  />
                  <span>{t("youtube.recovery.confirm")}</span>
                </div>
              ) : null}
              <Button
                size="sm"
                variant="primary"
                className="h-auto min-h-8 whitespace-normal py-1.5"
                loading={busy}
                disabled={!stopped || (status === "unknown" && !confirmed)}
                onClick={resolve}
              >
                {t(
                  status === "unknown"
                    ? "youtube.recovery.acknowledge"
                    : "youtube.recovery.retry",
                )}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="subtle" loading={busy} onClick={check}>
              {t("youtube.recovery.check")}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
