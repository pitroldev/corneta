import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  Flag,
  FolderOpen,
  LoaderCircle,
  Maximize2,
  Pause,
  Play,
  Scissors,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { toast } from "../lib/toast";
import { cn, errMsg } from "../lib/utils";
import {
  buildReplayIndex,
  epochAtGlobal,
  globalAtEpoch,
  hasEstimatedAnchor,
  hasUnplayableCodec,
  isPlayableCodec,
  pointAtGlobal,
  type ReplayIndex,
} from "../lib/replay";
import type {
  ReplayChatGap,
  ReplayChatMessage,
  SessionData,
  SessionMarker,
} from "../lib/types";
import { ReplayChatPanel } from "./ReplayChatPanel";
import {
  upperBoundChat,
  chatPageContains,
  type ChatPage,
} from "../lib/replayChatPage";
import { Select } from "./Select";
import { Button } from "./ui";

/** The nonce makes repeated seeks to the same timestamp observable. */
export interface SeekRequest {
  epoch: number;
  nonce: number;
}

export interface ReplayTick {
  t: number;
  color: string;
  label: string;
}

const PLAY_RATES = [0.5, 1, 1.5, 2] as const;

export function ReplayPlayer({
  data,
  sessionId,
  chat: initialChat,
  gaps: initialGaps,
  readChatPage,
  ticks,
  seek,
  onPlayhead,
  onMarkerAdded,
  onRecordingsDeleted,
}: {
  data: SessionData;
  sessionId: string;
  chat: ReplayChatMessage[];
  readChatPage?: (epoch: number) => Promise<ChatPage>;
  gaps: ReplayChatGap[];
  ticks: ReplayTick[];
  seek: SeekRequest | null;
  onPlayhead: (epoch: number | null) => void;
  onMarkerAdded: (marker: SessionMarker) => void;
  onRecordingsDeleted: () => void;
}) {
  const { t, fmt } = useI18n();
  const rateOptions = useMemo(
    () =>
      PLAY_RATES.map((playRate) => ({
        value: String(playRate),
        label: `${fmt.dec(playRate, playRate % 1 === 0 ? 0 : 1)}×`,
      })),
    [fmt],
  );
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const idx: ReplayIndex = useMemo(
    () =>
      buildReplayIndex(
        data.recordings.map((r) => ({
          seg: r.seg,
          t: r.t,
          path: r.path,
          codec: r.codec,
          estimated: r.estimated,
          syncs: r.syncs,
          endT: r.endT,
        })),
        data.clockJumps,
        data.offsetMs,
      ),
    [data.clockJumps, data.offsetMs, data.recordings],
  );

  const [globalMs, setGlobalMs] = useState(0);
  const [segIndex, setSegIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState<number>(1);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [offset, setOffset] = useState(data.offsetMs);
  const [hoverMs, setHoverMs] = useState<number | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [clipFrom, setClipFrom] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [showOffset, setShowOffset] = useState(false);
  const [previewOk, setPreviewOk] = useState(false);
  const [loadedPath, setLoadedPath] = useState<string | null>(null);
  const [failedPath, setFailedPath] = useState<string | null>(null);

  // Apply offset changes without reparsing the session to keep calibration responsive.
  const tuned = useMemo(() => ({ ...idx, offsetMs: offset }), [idx, offset]);

  const segment = tuned.segments[segIndex];
  const src = segment ? urls[segment.path] : undefined;
  const codecUnsupported = segment ? !isPlayableCodec(segment.codec) : false;
  const mediaState: "loading" | "ready" | "missing" | "unsupported" =
    codecUnsupported
      ? "unsupported"
      : !segment || src === undefined
        ? "loading"
        : src === "" || failedPath === segment.path
          ? "missing"
          : loadedPath === segment.path
            ? "ready"
            : "loading";
  const canControl = mediaState === "ready";
  const truncated = data.recordings.some(
    (r) => r.reason && r.reason !== "stopped",
  );

  // Grant asset access per recording file, never to the entire directory.
  useEffect(() => {
    // An empty cached URL marks a failed attempt; truthiness would cause an infinite retry loop.
    if (!segment || codecUnsupported || segment.path in urls) return;
    let alive = true;
    void api
      .recordVideoUrl(segment.path)
      .then((u) => {
        if (alive) setUrls((prev) => ({ ...prev, [segment.path]: u }));
      })
      .catch(() => {
        if (alive) setUrls((prev) => ({ ...prev, [segment.path]: "" }));
      });
    return () => {
      alive = false;
    };
  }, [codecUnsupported, segment, urls]);

  const emitPlayhead = useCallback(
    (g: number) => {
      onPlayhead(epochAtGlobal(tuned, g));
    },
    [onPlayhead, tuned],
  );

  /** Route all seek inputs through this function to keep video and cursor positions synchronized. */
  const seekGlobal = useCallback(
    (g: number, keepPlaying = playing) => {
      const clamped = Math.max(0, Math.min(tuned.totalMs, g));
      const p = pointAtGlobal(tuned, clamped);
      if (!p) return;
      setGlobalMs(clamped);
      emitPlayhead(clamped);
      const v = videoRef.current;
      // Defer currentTime assignment until metadata loads; earlier seeks can be discarded.
      if (p.index !== segIndex || !v || v.readyState < 1) {
        if (p.index !== segIndex) setSegIndex(p.index);
        pendingSeek.current = { sec: p.localSec, play: keepPlaying };
      } else {
        v.currentTime = p.localSec;
      }
    },
    [emitPlayhead, playing, segIndex, tuned],
  );

  const pendingSeek = useRef<{ sec: number; play: boolean } | null>(null);

  useEffect(() => {
    if (!seek) return;
    const g = globalAtEpoch(tuned, seek.epoch);
    if (g == null) {
      toast.info(t("replay.seek.notRecorded"));
      return;
    }
    seekGlobal(g);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seek?.nonce]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v || v.readyState < 1) return;
    if (v.paused) void v.play().catch(() => setPlaying(false));
    else v.pause();
  }, []);

  // Scope shortcuts to the replay stage so Space still activates other report buttons.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el || !stageRef.current?.contains(el) || !canControl) return;
      if (
        el.closest(
          "button, a, input, textarea, select, [contenteditable='true'], [role='button'], [role='slider']",
        )
      )
        return;
      const step = e.shiftKey ? 60_000 : 10_000;
      switch (e.key) {
        case " ":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          seekGlobal(globalMs - step);
          break;
        case "ArrowRight":
          e.preventDefault();
          seekGlobal(globalMs + step);
          break;
        case ",":
          e.preventDefault();
          seekGlobal(globalMs - 1000 / 30);
          break;
        case ".":
          e.preventDefault();
          seekGlobal(globalMs + 1000 / 30);
          break;
        default:
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canControl, globalMs, seekGlobal, togglePlay]);

  const applyVolume = (v: number) => {
    setVolume(v);
    setMuted(v === 0);
    if (videoRef.current) {
      videoRef.current.volume = v;
      videoRef.current.muted = v === 0;
    }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (videoRef.current) videoRef.current.muted = next;
  };

  /** Fullscreen the container so custom controls and the synchronized timeline remain visible. */
  const toggleFullscreen = () => {
    const box = stageRef.current;
    if (!box) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void box.requestFullscreen().catch(() => {});
  };

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v || !tuned.segments.length) return;
    const g = tuned.starts[segIndex] + v.currentTime * 1000;
    setGlobalMs(g);
    emitPlayhead(g);
  };

  const onEnded = () => {
    if (segIndex + 1 < tuned.segments.length) {
      setSegIndex(segIndex + 1);
      pendingSeek.current = { sec: 0, play: true };
    } else {
      setPlaying(false);
    }
  };

  const onLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v || !segment) return;
    setLoadedPath(segment.path);
    setFailedPath(null);
    // Changing src resets playback rate and volume; restore both for the next segment.
    v.playbackRate = rate;
    v.volume = volume;
    v.muted = muted;
    const want = pendingSeek.current;
    if (!want) return;
    pendingSeek.current = null;
    v.currentTime = want.sec;
    if (want.play) void v.play().catch(() => setPlaying(false));
  };

  const applyOffset = async (ms: number) => {
    const clamped = Math.max(-30_000, Math.min(30_000, ms));
    setOffset(clamped);
    try {
      await api.setSessionOffset(sessionId, clamped);
    } catch {
      // An offset persistence failure must not interrupt playback.
    }
  };

  const addMarker = async () => {
    const epoch = epochAtGlobal(tuned, globalMs);
    if (epoch == null) return;
    const marker: SessionMarker = {
      t: Math.round(epoch),
      label: t("replay.marker.default"),
    };
    try {
      await api.addSessionMarker(sessionId, marker.t, marker.label);
      toast.success(t("replay.marker.added"));
      onMarkerAdded(marker);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const exportClip = async () => {
    if (clipFrom == null) {
      setClipFrom(globalMs);
      return;
    }
    const a = Math.min(clipFrom, globalMs);
    const b = Math.max(clipFrom, globalMs);
    if (b - a < 500) {
      setClipFrom(null);
      return;
    }
    const pa = pointAtGlobal(tuned, a);
    const pb = pointAtGlobal(tuned, b);
    if (!pa || !pb || pa.index !== pb.index) {
      // Cross-segment clips require concatenation and are not supported.
      toast.error(t("replay.clip.crossSegment"));
      setClipFrom(null);
      return;
    }
    setBusy(true);
    try {
      const out = await api.exportClip(
        tuned.segments[pa.index].path,
        Math.round(pa.localSec * 1000),
        Math.round(pb.localSec * 1000),
      );
      if (out) toast.success(t("replay.clip.saved"));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
      setClipFrom(null);
    }
  };

  const removeRecordings = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    setConfirmDelete(false);
    setBusy(true);
    try {
      await api.deleteSessionRecordings(sessionId);
      toast.info(t("replay.delete.done"));
      onRecordingsDeleted();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const cursorEpoch = epochAtGlobal(tuned, globalMs);
  const [chatPage, setChatPage] = useState<ChatPage | null>(null);
  const chat = chatPage?.messages ?? initialChat;
  const gaps = chatPage?.gaps ?? initialGaps;
  useEffect(() => {
    if (
      !readChatPage ||
      cursorEpoch == null ||
      (initialChat.length === 0 && initialGaps.length === 0)
    )
      return;
    if (chatPage && chatPageContains(chatPage, cursorEpoch)) return;
    let alive = true;
    void readChatPage(cursorEpoch)
      .then((page) => {
        if (alive) setChatPage(page);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [readChatPage, cursorEpoch, initialChat, initialGaps, chatPage]);
  const chatCursor =
    cursorEpoch == null ? 0 : upperBoundChat(chat, cursorEpoch);
  const visibleChat = useMemo(() => {
    if (chatCursor === 0 || !chat.length) return [];
    // Binary search plus a bounded tail avoids scanning or rendering the entire chat on every timeupdate.
    const tail = chat.slice(Math.max(0, chatCursor - 300), chatCursor);
    return (showDeleted ? tail : tail.filter((m) => !m.deleted)).slice(-120);
  }, [chat, chatCursor, showDeleted]);

  const gapBefore = useMemo(() => {
    if (cursorEpoch == null) return null;
    return gaps.find((g) => Math.abs(g.t - cursorEpoch) < 15_000) ?? null;
  }, [gaps, cursorEpoch]);

  if (!tuned.segments.length) return null;

  const pct = tuned.totalMs > 0 ? (globalMs / tuned.totalMs) * 100 : 0;
  const tickAt = (epoch: number): number | null => {
    const g = globalAtEpoch(tuned, epoch);
    return g == null || tuned.totalMs <= 0 ? null : (g / tuned.totalMs) * 100;
  };

  const onScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const trackPadding = 16;
    const trackWidth = Math.max(1, rect.width - trackPadding * 2);
    const k = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left - trackPadding) / trackWidth),
    );
    seekGlobal(k * tuned.totalMs);
  };

  const onScrubHover = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const trackPadding = 16;
    const trackWidth = Math.max(1, rect.width - trackPadding * 2);
    const k = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left - trackPadding) / trackWidth),
    );
    const g = k * tuned.totalMs;
    setHoverMs(g);
    const p = pointAtGlobal(tuned, g);
    const v = previewRef.current;
    // Only seek thumbnails within the loaded segment to avoid showing a frame from another file.
    setPreviewOk(!!p && p.index === segIndex);
    if (p && v && p.index === segIndex) v.currentTime = p.localSec;
  };

  return (
    <>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
        <Play className="size-4" /> {t("replay.title")}
      </h3>
      <div className="mb-4 overflow-hidden bg-night">
        <div
          className={cn(
            "grid min-h-0 gap-px bg-border-soft",
            chat.length > 0 &&
              "xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start",
          )}
        >
          <div className="min-w-0 bg-night">
            <div
              ref={stageRef}
              className="bg-night outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brass [&:fullscreen]:flex [&:fullscreen]:h-screen [&:fullscreen]:flex-col [&:fullscreen]:justify-center [&:fullscreen]:bg-night [&:fullscreen]:p-4 [&:fullscreen_video]:max-h-[calc(100vh-9rem)]"
            >
              {mediaState === "missing" ? (
                <Note tone="warn">{t("replay.missing")}</Note>
              ) : mediaState === "unsupported" ? (
                <Note tone="bad">{t("replay.warn.codec")}</Note>
              ) : (
                <div className="relative flex min-h-48 items-center justify-center overflow-hidden bg-black xl:min-h-72">
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video
                    ref={videoRef}
                    src={src}
                    tabIndex={0}
                    aria-label={t("replay.stage.aria")}
                    className="aspect-video max-h-[58vh] w-full object-contain outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brass"
                    onTimeUpdate={onTimeUpdate}
                    onEnded={onEnded}
                    onLoadedMetadata={onLoadedMetadata}
                    onError={() => {
                      if (segment) setFailedPath(segment.path);
                    }}
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onClick={togglePlay}
                    preload="metadata"
                  />
                  {mediaState === "loading" && (
                    <div
                      className="absolute inset-0 grid min-h-40 place-items-center bg-night/85 text-sm font-semibold text-ink-muted"
                      role="status"
                    >
                      <span className="flex items-center gap-2">
                        <LoaderCircle
                          className="size-4 animate-spin text-brass"
                          aria-hidden
                        />
                        {t("replay.loading")}
                      </span>
                    </div>
                  )}
                  {hoverMs != null && previewOk && (
                    <div className="pointer-events-none absolute right-2 bottom-2 w-40 overflow-hidden rounded border-2 border-border bg-black">
                      <video
                        ref={previewRef}
                        src={src}
                        muted
                        preload="metadata"
                        className="w-full"
                      />
                    </div>
                  )}
                </div>
              )}

              <div
                className={cn(
                  "group relative h-10 px-4",
                  canControl
                    ? "cursor-pointer"
                    : "cursor-not-allowed opacity-50",
                )}
                onClick={canControl ? onScrub : undefined}
                onMouseMove={canControl ? onScrubHover : undefined}
                onMouseLeave={() => setHoverMs(null)}
                onKeyDown={(e) => {
                  if (!canControl) return;
                  const step = e.shiftKey ? 60_000 : 10_000;
                  if (e.key === "ArrowLeft") {
                    e.preventDefault();
                    seekGlobal(globalMs - step);
                  } else if (e.key === "ArrowRight") {
                    e.preventDefault();
                    seekGlobal(globalMs + step);
                  } else if (e.key === "Home") {
                    e.preventDefault();
                    seekGlobal(0);
                  } else if (e.key === "End") {
                    e.preventDefault();
                    seekGlobal(tuned.totalMs);
                  }
                }}
                role="slider"
                tabIndex={0}
                aria-valuemin={0}
                aria-valuemax={Math.round(tuned.totalMs / 1000)}
                aria-valuenow={Math.round(globalMs / 1000)}
                aria-valuetext={`${clock(globalMs)} / ${clock(tuned.totalMs)}`}
                aria-disabled={!canControl}
                aria-label={t("replay.scrub.aria")}
              >
                <div className="absolute top-[17px] right-4 left-4 h-1.5 rounded bg-surface-3" />
                <div
                  className="absolute top-[17px] left-4 h-1.5 rounded bg-brass"
                  style={{ width: `calc((100% - 2rem) * ${pct / 100})` }}
                />
                {ticks.map((k, i) => {
                  const x = tickAt(k.t);
                  return x == null ? null : (
                    <span
                      key={i}
                      title={k.label}
                      className="absolute top-3 h-4 w-0.5 rounded-full"
                      style={{
                        left: `calc(1rem + (100% - 2rem) * ${x / 100})`,
                        background: k.color,
                      }}
                    />
                  );
                })}
                {clipFrom != null && tuned.totalMs > 0 && (
                  <span
                    className="absolute top-2.5 h-5 w-0.5 bg-ok"
                    style={{
                      left: `calc(1rem + (100% - 2rem) * ${clipFrom / tuned.totalMs})`,
                    }}
                  />
                )}
                <span
                  className="absolute top-[13px] size-4 -translate-x-1/2 rounded-full border-2 border-brass bg-night"
                  style={{
                    left: `calc(1rem + (100% - 2rem) * ${pct / 100})`,
                  }}
                />
              </div>
            </div>

            <div className="flex min-h-14 flex-wrap items-center gap-1.5 border-t border-border-soft bg-surface px-3 py-2 sm:px-4">
              <Button
                size="sm"
                variant="ghost"
                className="size-10 px-0"
                disabled={!canControl}
                onClick={() => seekGlobal(globalMs - 10_000)}
                title={t("replay.back10")}
              >
                <SkipBack className="size-4" />
              </Button>
              <Button
                size="sm"
                variant="primary"
                className="size-11 rounded-md px-0"
                disabled={!canControl}
                onClick={togglePlay}
                aria-label={t(playing ? "replay.pause" : "replay.play")}
                title={t(playing ? "replay.pause" : "replay.play")}
              >
                {playing ? (
                  <Pause className="size-4" />
                ) : (
                  <Play className="size-4" />
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="size-10 px-0"
                disabled={!canControl}
                onClick={() => seekGlobal(globalMs + 10_000)}
                title={t("replay.fwd10")}
              >
                <SkipForward className="size-4" />
              </Button>
              <span className="ml-1 font-mono text-xs tabular-nums text-ink sm:text-sm">
                {clock(globalMs)} / {clock(tuned.totalMs)}
              </span>
              <Select
                value={String(rate)}
                options={rateOptions}
                size="sm"
                disabled={!canControl}
                onChange={(value) => {
                  const nextRate = Number(value);
                  setRate(nextRate);
                  if (videoRef.current) {
                    videoRef.current.playbackRate = nextRate;
                  }
                }}
                className="w-[4.75rem] shrink-0"
                aria-label={t("replay.rate.aria")}
              />
              <button
                onClick={toggleMute}
                disabled={!canControl}
                className="grid size-10 place-items-center rounded-md text-ink-faint transition-colors hover:bg-surface-2 hover:text-brass disabled:pointer-events-none disabled:opacity-40"
                title={t(muted ? "replay.unmute" : "replay.mute")}
                aria-label={t(muted ? "replay.unmute" : "replay.mute")}
              >
                {muted || volume === 0 ? (
                  <VolumeX className="size-4" />
                ) : (
                  <Volume2 className="size-4" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                disabled={!canControl}
                onChange={(e) => applyVolume(Number(e.target.value))}
                className="hidden h-1 w-20 accent-brass sm:block"
                aria-label={t("replay.volume")}
              />
              <button
                onClick={toggleFullscreen}
                disabled={!canControl}
                className="grid size-10 place-items-center rounded-md text-ink-faint transition-colors hover:bg-surface-2 hover:text-brass disabled:pointer-events-none disabled:opacity-40"
                title={t("replay.fullscreen")}
                aria-label={t("replay.fullscreen")}
              >
                <Maximize2 className="size-4" />
              </button>
            </div>

            <div className="flex min-h-12 flex-wrap items-center gap-1.5 border-t border-border-soft bg-surface-2 px-3 py-2 sm:px-4">
              <Button
                size="sm"
                variant="subtle"
                disabled={!canControl}
                onClick={() => void addMarker()}
                title={t("replay.marker.cta")}
              >
                <Flag className="size-4" />
                <span className="hidden sm:inline">
                  {t("replay.marker.action")}
                </span>
              </Button>
              <Button
                size="sm"
                variant={clipFrom == null ? "ghost" : "primary"}
                disabled={busy || !canControl}
                onClick={() => void exportClip()}
                title={t("replay.clip.cta")}
              >
                <Scissors className="size-4" />
                <span className="hidden sm:inline">
                  {clipFrom == null
                    ? t("replay.clip.action")
                    : t("replay.clip.pending")}
                </span>
              </Button>
              {clipFrom != null && (
                <button
                  onClick={() => setClipFrom(null)}
                  className="text-xs font-semibold text-ink-faint hover:text-brass"
                >
                  {t("replay.clip.cancel")}
                </button>
              )}
              <span className="flex-1" />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void api.openRecordingFolder()}
                title={t("replay.folder")}
              >
                <FolderOpen className="size-4" />
              </Button>
              <Button
                size="sm"
                variant={confirmDelete ? "danger" : "ghost"}
                disabled={busy}
                onClick={() => void removeRecordings()}
                title={t("replay.delete.cta")}
              >
                <Trash2 className="size-4" />
                {confirmDelete && (
                  <span className="text-[11px]">
                    {t("replay.delete.confirm")}
                  </span>
                )}
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 border-t border-border-soft bg-surface px-4 py-2 text-[11px] text-ink-faint">
              <span>{t("replay.shortcuts")}</span>
              {!showOffset && !hasEstimatedAnchor(tuned) && offset === 0 && (
                <button
                  onClick={() => setShowOffset(true)}
                  className="font-semibold hover:text-brass"
                >
                  {t("replay.offset.open")}
                </button>
              )}
            </div>

            <div
              className={cn(
                "items-center gap-2 bg-surface px-4 pb-3 text-xs text-ink-faint",
                showOffset || hasEstimatedAnchor(tuned) || offset !== 0
                  ? "flex"
                  : "hidden",
              )}
            >
              <span className="font-semibold">{t("replay.offset.label")}</span>
              <input
                type="range"
                min={-30000}
                max={30000}
                step={100}
                value={offset}
                onChange={(e) => void applyOffset(Number(e.target.value))}
                className="h-1 flex-1 accent-brass"
                aria-label={t("replay.offset.label")}
              />
              <span className="w-16 text-right font-mono">
                {offset > 0 ? "+" : ""}
                {fmt.dec(offset / 1000, 1)}s
              </span>
              {offset !== 0 && (
                <button
                  onClick={() => void applyOffset(0)}
                  className="font-semibold text-brass hover:underline"
                >
                  {t("replay.offset.reset")}
                </button>
              )}
            </div>

            {hasEstimatedAnchor(tuned) && (
              <Note tone="warn">{t("replay.warn.estimated")}</Note>
            )}
            {hasUnplayableCodec(tuned) && !codecUnsupported && (
              <Note tone="bad">{t("replay.warn.codec")}</Note>
            )}
            {truncated && <Note tone="warn">{t("replay.warn.truncated")}</Note>}
            {tuned.segments.length > 1 && (
              <Note tone="warn">
                {t("replay.warn.segments", { n: tuned.segments.length })}
              </Note>
            )}
          </div>

          {chat.length > 0 ? (
            <ReplayChatPanel
              messages={visibleChat}
              gap={gapBefore}
              showDeleted={showDeleted}
              onToggleDeleted={() => setShowDeleted((value) => !value)}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}

/** Format video positions as H:MM:SS rather than localized prose durations. */
function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function Note({
  tone,
  children,
}: {
  tone: "warn" | "bad";
  children: ReactNode;
}) {
  return (
    <p
      className={cn(
        "mx-4 mt-2 flex items-start gap-1.5 rounded px-2 py-1 text-[11px] font-semibold",
        tone === "warn" ? "bg-warn/15 text-warn" : "bg-bad/15 text-bad",
      )}
    >
      <AlertTriangle className="mt-px size-3.5 shrink-0" />
      {children}
    </p>
  );
}
