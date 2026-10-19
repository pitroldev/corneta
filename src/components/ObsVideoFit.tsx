import { useEffect, useRef, useState } from "react";
import { MonitorCog, Undo2 } from "lucide-react";
import { api } from "../lib/api";
import { useT, type I18n } from "../lib/i18n";
import { obsFailure } from "../lib/obsErrors";
import type { ObsVideo, ObsVideoCheck } from "../lib/types";
import { Button } from "./ui";

function describe(t: I18n["t"], video: ObsVideo): string {
  const fps =
    Math.round((video.fpsNumerator / video.fpsDenominator) * 100) / 100;
  const base = {
    w: video.outputWidth,
    h: video.outputHeight,
    fps,
  };
  return video.simpleKbps === null
    ? t("obs.video.format", base)
    : t("obs.video.formatKbps", { ...base, kbps: video.simpleKbps });
}

/** Offers to bring OBS's video within what the active destinations take as-is, with undo. */
export function ObsVideoFit() {
  const t = useT();
  const [check, setCheck] = useState<ObsVideoCheck | null>(null);
  const [applied, setApplied] = useState<ObsVideo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(true);

  const refresh = async () => {
    try {
      const next = await api.obsVideoCheck();
      if (active.current) setCheck(next);
    } catch (e) {
      if (active.current) setError(obsFailure(e).message);
    }
  };
  useEffect(() => {
    active.current = true;
    void refresh();
    return () => {
      active.current = false;
    };
  }, []);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      if (active.current) setError(obsFailure(e).message);
    } finally {
      if (active.current) setBusy(false);
    }
  };
  const apply = () =>
    run(async () => {
      const video = await api.obsVideoApply();
      if (!active.current) return;
      setApplied(video);
      await refresh();
    });
  const undo = () =>
    run(async () => {
      await api.obsVideoUndo();
      if (!active.current) return;
      setApplied(null);
      await refresh();
    });

  if (!check && !error) return null;
  const advancedBitrate =
    check && check.current.simpleKbps === null && check.limitKbps !== null;

  return (
    <div className="rounded-md border-2 border-border-soft bg-surface-2 p-3 text-sm">
      <div className="flex items-center gap-2 font-display font-bold">
        <MonitorCog className="size-4 text-brass" /> {t("obs.video.title")}
      </div>
      {check && (
        <p className="mt-1 text-ink-muted">
          {applied
            ? t("obs.video.applied", { proposal: describe(t, applied) })
            : check.proposal
              ? t("obs.video.over", {
                  current: describe(t, check.current),
                  proposal: describe(t, check.proposal),
                })
              : check.canUndo
                ? t("obs.video.adjusted", {
                    current: describe(t, check.current),
                  })
                : t("obs.video.ok", { current: describe(t, check.current) })}
        </p>
      )}
      {advancedBitrate && (
        <p className="mt-1 text-xs text-ink-faint">
          {t("obs.video.advancedBitrate", { kbps: check.limitKbps! })}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-1 text-xs font-semibold text-bad">
          {error}
        </p>
      )}
      {check && (check.proposal || check.canUndo) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {check.proposal && !applied && (
            <Button
              variant="primary"
              size="sm"
              loading={busy}
              disabled={busy}
              onClick={() => void apply()}
            >
              {t("obs.video.apply")}
            </Button>
          )}
          {check.canUndo && (
            <Button
              variant="subtle"
              size="sm"
              loading={busy}
              disabled={busy}
              onClick={() => void undo()}
            >
              <Undo2 className="size-3.5" /> {t("obs.video.undo")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
