import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Film,
  FolderOpen,
  Scissors,
  Smartphone,
  X,
} from "lucide-react";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/ui";
import {
  api,
  type BatchClipResult,
  type ClipExportFormat,
  type ClipProgressEvent,
} from "../../lib/api";
import {
  planMomentClips,
  type Moment,
  type MomentKind,
} from "../../lib/export/moments";
import { useI18n, type MessageKey } from "../../lib/i18n";
import type { ReplayIndex } from "../../lib/replay";
import { useStore } from "../../lib/store";
import { toast } from "../../lib/toast";
import type { Reframe } from "../../lib/types";
import { cn, errMsg } from "../../lib/utils";

interface WindowPreset {
  id: "15-30" | "20-40" | "30-60";
  preMs: number;
  postMs: number;
}

const WINDOW_PRESETS: readonly WindowPreset[] = [
  { id: "15-30", preMs: 15_000, postMs: 30_000 },
  { id: "20-40", preMs: 20_000, postMs: 40_000 },
  { id: "30-60", preMs: 30_000, postMs: 60_000 },
];

const KIND_KEY: Record<MomentKind, MessageKey> = {
  marker: "reports.moments.kind.marker",
  chat: "reports.moments.kind.chat",
  raid: "reports.moments.kind.raid",
  viewers: "reports.moments.kind.viewers",
  alert: "reports.moments.kind.alert",
};

function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
  const s = String(totalSec % 60).padStart(2, "0");
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

export function BatchClipsModal({
  moments,
  replayIndex,
  onClose,
}: {
  moments: readonly Moment[];
  replayIndex: ReplayIndex;
  onClose: () => void;
}) {
  const { t, tp, fmt } = useI18n();
  const config = useStore((state) => state.config);
  const liveState = useStore((state) => state.snapshot.state);
  const isLive = liveState === "live" || liveState === "starting";

  // Preselect manual markers; if the session has only auto-detected peaks, preselect those instead.
  const [selected, setSelected] = useState<Set<number>>(() => {
    const manual = moments
      .map((m, idx) => (m.kind === "marker" ? idx : -1))
      .filter((idx) => idx >= 0);
    return new Set(
      manual.length > 0 ? manual : moments.map((_, index) => index),
    );
  });
  const [presetId, setPresetId] = useState<WindowPreset["id"]>("15-30");
  const [format, setFormat] = useState<ClipExportFormat>("copy");
  const [running, setRunning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [progress, setProgress] = useState<ClipProgressEvent | null>(null);
  const [result, setResult] = useState<BatchClipResult | null>(null);

  useEffect(() => {
    const unsubscribe = api.subscribeClipsProgress((next) => {
      setProgress(next);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const preset =
    WINDOW_PRESETS.find((item) => item.id === presetId) ?? WINDOW_PRESETS[0];

  // Reuse the configured portrait reframe (single or split camera + gameplay) when available.
  const verticalReframe = useMemo<Reframe | null>(() => {
    const targets = config?.targets ?? [];
    const withReframe =
      targets.find(
        (target) =>
          target.enabled &&
          target.encoding.preset &&
          target.encoding.preset.height > target.encoding.preset.width &&
          target.encoding.reframe,
      ) ?? targets.find((target) => target.encoding.reframe);
    return withReframe?.encoding.reframe ?? null;
  }, [config]);

  const selectedMoments = useMemo(
    () => moments.filter((_, idx) => selected.has(idx)),
    [moments, selected],
  );

  const planned = useMemo(
    () =>
      planMomentClips(selectedMoments, replayIndex, {
        preMs: preset.preMs,
        postMs: preset.postMs,
        mergeGapMs: 5_000,
        fallbackLabel: t("reports.moments.kind.marker"),
      }),
    [selectedMoments, replayIndex, preset.preMs, preset.postMs, t],
  );

  const totalDurationSec = useMemo(
    () =>
      Math.round(
        planned.reduce((acc, clip) => acc + clip.durationMs, 0) / 1000,
      ),
    [planned],
  );
  // Rough estimate: ~0.9 MB/s (~7.2 Mbps) for copy or ~1.0 MB/s (~8 Mbps) for 9:16 H.264.
  const approxMb = Math.max(
    1,
    Math.round(totalDurationSec * (format === "vertical" ? 1.0 : 0.9)),
  );
  const mergedCount = Math.max(0, selectedMoments.length - planned.length);
  const hasMarkers = moments.some((m) => m.kind === "marker");
  const isSplitReframe = verticalReframe?.layout === "split";

  const toggleIndex = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const selectMarkersOnly = () => {
    setSelected(
      new Set(
        moments
          .map((m, idx) => (m.kind === "marker" ? idx : -1))
          .filter((idx) => idx >= 0),
      ),
    );
  };

  const selectAll = () => {
    setSelected(new Set(moments.map((_, idx) => idx)));
  };

  const selectNone = () => {
    setSelected(new Set());
  };

  const startExport = async () => {
    if (running || !planned.length) return;
    if (format === "vertical" && isLive) {
      toast.error(t("reports.clips.liveBlocked"));
      return;
    }
    const dir = await api.recordPickDir();
    if (!dir) return;

    setRunning(true);
    setCancelling(false);
    setResult(null);
    setProgress({
      done: 0,
      total: planned.length,
      currentName: `${planned[0].slug}.mp4`,
    });
    try {
      const res = await api.exportClipsBatch(
        dir,
        planned.map((clip) => ({ slug: clip.slug, slices: clip.slices })),
        format,
        format === "vertical" ? verticalReframe : null,
      );
      setResult(res);
      if (res.cancelled) {
        toast.info(tp("reports.clips.result.cancelled", res.saved.length));
      } else if (res.failed > 0) {
        toast.error(
          t("reports.clips.result.partial", {
            saved: res.saved.length,
            failed: res.failed,
          }),
        );
      } else {
        toast.success(tp("reports.clips.result.done", res.saved.length));
      }
    } catch (error) {
      toast.error(errMsg(error));
    } finally {
      setRunning(false);
      setCancelling(false);
    }
  };

  const cancelExport = async () => {
    if (!running || cancelling) return;
    setCancelling(true);
    try {
      await api.cancelClipsBatch();
    } catch {
      /* Cancellation flag is best-effort. */
    }
  };

  const openFolder = async () => {
    try {
      await api.openClipsExportFolder();
    } catch (error) {
      toast.error(errMsg(error));
    }
  };

  const handleClose = () => {
    if (running) return;
    onClose();
  };

  const pct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.done / progress.total) * 100))
      : 0;

  return (
    <Modal
      title={t("reports.clips.modal.title")}
      onClose={handleClose}
      className="max-w-2xl rounded-xl bg-surface p-5 sm:p-6 pop"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-xl">
            <Film className="size-5 text-brass" aria-hidden />
            {t("reports.clips.modal.title")}
          </h3>
          <p className="mt-1 text-xs text-ink-muted">
            {t("reports.clips.modal.subtitle")}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={running}
          onClick={handleClose}
          aria-label={t("encoding.close")}
          title={t("encoding.close")}
        >
          <X className="size-4" />
        </Button>
      </div>

      {result ? (
        <div className="rounded-lg border border-border-soft bg-surface-2/70 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2
              className="mt-0.5 size-5 shrink-0 text-ok"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-ink">
                {result.cancelled
                  ? tp("reports.clips.result.cancelled", result.saved.length)
                  : result.failed > 0
                    ? t("reports.clips.result.partial", {
                        saved: result.saved.length,
                        failed: result.failed,
                      })
                    : tp("reports.clips.result.done", result.saved.length)}
              </p>
              <p className="mt-1 truncate text-xs text-ink-muted">
                {result.dir}
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {result.saved.length > 0 ? (
              <Button
                size="sm"
                variant="primary"
                onClick={() => void openFolder()}
              >
                <FolderOpen className="size-4" />
                {t("reports.clips.openFolder")}
              </Button>
            ) : null}
            <Button size="sm" variant="subtle" onClick={() => setResult(null)}>
              {t("reports.clips.exportMore")}
            </Button>
            <Button size="sm" variant="ghost" onClick={handleClose}>
              {t("encoding.close")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-ink-faint">
                {t("reports.clips.select.heading", {
                  selected: selectedMoments.length,
                  total: moments.length,
                })}
              </span>
              <div className="flex flex-wrap gap-1.5 text-xs">
                {hasMarkers ? (
                  <button
                    type="button"
                    disabled={running}
                    onClick={selectMarkersOnly}
                    className="rounded px-2 py-0.5 font-semibold text-ink-muted hover:bg-surface-2 hover:text-ink disabled:opacity-50"
                  >
                    {t("reports.clips.select.markers")}
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={running}
                  onClick={selectAll}
                  className="rounded px-2 py-0.5 font-semibold text-ink-muted hover:bg-surface-2 hover:text-ink disabled:opacity-50"
                >
                  {t("reports.clips.select.all")}
                </button>
                <button
                  type="button"
                  disabled={running}
                  onClick={selectNone}
                  className="rounded px-2 py-0.5 font-semibold text-ink-muted hover:bg-surface-2 hover:text-ink disabled:opacity-50"
                >
                  {t("reports.clips.select.none")}
                </button>
              </div>
            </div>

            <div className="max-h-48 divide-y divide-border-soft overflow-y-auto rounded-lg border border-border-soft bg-surface-2/50">
              {moments.map((moment, idx) => {
                const checked = selected.has(idx);
                return (
                  <label
                    key={`${moment.ms}-${moment.kind}-${idx}`}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 px-3 py-2 text-xs transition-colors hover:bg-surface-2",
                      running && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="size-4 shrink-0 accent-brass"
                      disabled={running}
                      checked={checked}
                      onChange={() => toggleIndex(idx)}
                    />
                    <span className="w-14 shrink-0 font-mono text-[11px] font-bold tabular-nums text-ink-faint">
                      {formatClock(moment.ms)}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold text-ink">
                      {moment.label || t(KIND_KEY[moment.kind])}
                    </span>
                    <span className="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-bold uppercase text-ink-muted">
                      {t(KIND_KEY[moment.kind])}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-faint">
                {t("reports.clips.window.label")}
              </span>
              <div className="flex flex-col gap-1.5">
                {WINDOW_PRESETS.map((item) => {
                  const active = item.id === presetId;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={running}
                      aria-pressed={active}
                      onClick={() => setPresetId(item.id)}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-left text-xs font-bold transition-colors disabled:opacity-50",
                        active
                          ? "border-brass bg-brass/12 text-ink"
                          : "border-border-soft bg-surface-2/60 text-ink-muted hover:border-border hover:text-ink",
                      )}
                    >
                      {t("reports.clips.window.option", {
                        pre: item.preMs / 1000,
                        post: item.postMs / 1000,
                      })}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-faint">
                {t("reports.clips.format.label")}
              </span>
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  disabled={running}
                  aria-pressed={format === "copy"}
                  onClick={() => setFormat("copy")}
                  className={cn(
                    "flex items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-50",
                    format === "copy"
                      ? "border-brass bg-brass/12 text-ink"
                      : "border-border-soft bg-surface-2/60 text-ink-muted hover:border-border hover:text-ink",
                  )}
                >
                  <Scissors
                    className="mt-0.5 size-4 shrink-0 text-brass"
                    aria-hidden
                  />
                  <span>
                    <span className="block text-xs font-bold">
                      {t("reports.clips.format.copy.title")}
                    </span>
                    <span className="mt-0.5 block text-[11px] font-normal text-ink-muted">
                      {t("reports.clips.format.copy.desc")}
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  disabled={running || isLive}
                  aria-pressed={format === "vertical"}
                  onClick={() => setFormat("vertical")}
                  className={cn(
                    "flex items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-50",
                    format === "vertical"
                      ? "border-brass bg-brass/12 text-ink"
                      : "border-border-soft bg-surface-2/60 text-ink-muted hover:border-border hover:text-ink",
                  )}
                >
                  <Smartphone
                    className="mt-0.5 size-4 shrink-0 text-brass"
                    aria-hidden
                  />
                  <span>
                    <span className="block text-xs font-bold">
                      {t("reports.clips.format.vertical.title")}
                    </span>
                    <span className="mt-0.5 block text-[11px] font-normal text-ink-muted">
                      {isLive
                        ? t("reports.clips.liveBlocked")
                        : isSplitReframe
                          ? t("reports.clips.format.vertical.splitDesc")
                          : t("reports.clips.format.vertical.desc")}
                    </span>
                  </span>
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border-soft bg-surface-2/60 px-3.5 py-2.5 text-xs text-ink-muted">
            {planned.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-ink">
                  {tp("reports.clips.summary.count", planned.length)}
                  {mergedCount > 0
                    ? ` · ${tp("reports.clips.summary.merged", mergedCount)}`
                    : null}
                </span>
                <span className="tabular-nums">
                  {t("reports.clips.summary.estimate", {
                    dur: fmt.dur(totalDurationSec),
                    mb: fmt.num(approxMb),
                  })}
                </span>
              </div>
            ) : (
              <span>{t("reports.clips.summary.empty")}</span>
            )}
          </div>

          {running && progress ? (
            <div className="space-y-2 rounded-lg border border-border-soft bg-surface-2 p-3">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-semibold text-ink">
                  {t("reports.clips.progress.working", {
                    done: Math.min(progress.done + 1, progress.total),
                    total: progress.total,
                    name: progress.currentName,
                  })}
                </span>
                <span className="shrink-0 font-mono tabular-nums text-ink-muted">
                  {pct}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full bg-brass transition-all duration-150"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            {running ? (
              <Button
                size="sm"
                variant="outline"
                disabled={cancelling}
                onClick={() => void cancelExport()}
              >
                {cancelling
                  ? t("reports.clips.cancelling")
                  : t("reports.clips.cancel")}
              </Button>
            ) : (
              <>
                <Button size="sm" variant="ghost" onClick={handleClose}>
                  {t("encoding.close")}
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={planned.length === 0}
                  onClick={() => void startExport()}
                >
                  <Film className="size-4" />
                  {t("reports.clips.start")}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
