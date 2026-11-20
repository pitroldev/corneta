import type { MessageKey } from "../i18n";
import type { Highlight } from "../report";
import { globalAtEpoch, type ReplayIndex } from "../replay";
import type { SessionData } from "../types";
import { toCsv } from "./csv";
import type { ReportI18n } from "./html";

export type MomentKind = "marker" | Highlight["kind"];

export interface Moment {
  /** Milliseconds from the start of the timeline base. */
  ms: number;
  kind: MomentKind;
  label: string;
}

export interface MomentTimeline {
  /** recording: the replay video with its files back to back; live: the stream start. */
  base: "recording" | "live";
  moments: Moment[];
  /** Moments with no recorded frame; they cannot be placed on the recording. */
  outside: number;
  durationMs: number;
  /** Recording files on the timeline; 0 for the live base. */
  files: number;
}

export interface ClipSegmentSlice {
  path: string;
  startMs: number;
  endMs: number;
}

export interface PlannedMomentClip {
  id: string;
  /** File stem without extension, formatted as `01-00h18m42s-slug`. */
  slug: string;
  label: string;
  startGlobalMs: number;
  endGlobalMs: number;
  durationMs: number;
  momentCount: number;
  kinds: MomentKind[];
  slices: ClipSegmentSlice[];
}

export interface PlanMomentClipsOptions {
  preMs: number;
  postMs: number;
  /** Merge adjacent windows separated by at most this many milliseconds (default 0: overlap only). */
  mergeGapMs?: number;
  fallbackLabel?: string;
}

export type ChaptersResult =
  { ok: true; text: string; count: number } | { ok: false; reason: "tooFew" };

type Translate = ReportI18n["t"];

const KIND_KEY: Record<MomentKind, MessageKey> = {
  marker: "reports.moments.kind.marker",
  chat: "reports.moments.kind.chat",
  raid: "reports.moments.kind.raid",
  viewers: "reports.moments.kind.viewers",
  alert: "reports.moments.kind.alert",
};

const RESOLVE_COLOR: Record<MomentKind, string> = {
  marker: "ResolveColorBlue",
  chat: "ResolveColorYellow",
  raid: "ResolveColorPurple",
  viewers: "ResolveColorGreen",
  alert: "ResolveColorRed",
};

const LOCATOR_COLOR: Record<MomentKind, string> = {
  marker: "BLUE",
  chat: "YELLOW",
  raid: "MAGENTA",
  viewers: "GREEN",
  alert: "RED",
};

const MIN_CHAPTER_SEC = 10;
const MIN_CHAPTERS = 3;

const oneLine = (text: string): string =>
  text.replace(/[\s\p{Cc}]+/gu, " ").trim();

const titleOf = (moment: Moment, t: Translate): string =>
  moment.label || t(KIND_KEY[moment.kind]);

const byTime = (moments: readonly Moment[]): Moment[] =>
  [...moments].sort((a, b) => a.ms - b.ms);

function clock(totalSec: number, withHours = totalSec >= 3600): string {
  const minutes = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSec % 60).padStart(2, "0");
  return withHours
    ? `${Math.floor(totalSec / 3600)}:${minutes}:${seconds}`
    : `${minutes}:${seconds}`;
}

/** Exported times follow the recording whenever there is one, so they match the video file rather than the stream start. */
export function collectMoments(
  data: Pick<SessionData, "meta" | "markers">,
  highlights: readonly Highlight[],
  replay: ReplayIndex | null,
): MomentTimeline {
  const recording = replay?.segments.length ? replay : null;
  const moments: Moment[] = [];
  let outside = 0;
  const add = (epoch: number, kind: MomentKind, label: string) => {
    const ms = recording
      ? globalAtEpoch(recording, epoch)
      : Math.max(0, epoch - data.meta.startedAt);
    if (ms == null) outside++;
    else moments.push({ ms, kind, label: oneLine(label) });
  };
  for (const marker of data.markers) add(marker.t, "marker", marker.label);
  for (const highlight of highlights)
    add(highlight.t, highlight.kind, highlight.reason);
  return {
    base: recording ? "recording" : "live",
    moments: byTime(moments),
    outside,
    durationMs: recording ? recording.totalMs : data.meta.durationSec * 1000,
    files: recording ? recording.segments.length : 0,
  };
}

/** YouTube only shows chapters starting at 00:00, at least three, each 10 s or longer; moments too close to the previous chapter fold into it. */
export function youtubeChapters(
  timeline: Pick<MomentTimeline, "moments" | "durationMs">,
  t: Translate,
): ChaptersResult {
  const chapters: { sec: number; title: string }[] = [];
  for (const moment of byTime(timeline.moments)) {
    const sec = Math.round(moment.ms / 1000);
    const title = titleOf(moment, t);
    if (chapters.length === 0) {
      if (sec < MIN_CHAPTER_SEC) {
        chapters.push({ sec: 0, title });
        continue;
      }
      chapters.push({ sec: 0, title: t("reports.moments.chapters.opening") });
    }
    if (sec - chapters[chapters.length - 1].sec >= MIN_CHAPTER_SEC)
      chapters.push({ sec, title });
  }
  const endSec = timeline.durationMs / 1000;
  while (
    chapters.length > 0 &&
    endSec - chapters[chapters.length - 1].sec < MIN_CHAPTER_SEC
  )
    chapters.pop();
  if (chapters.length < MIN_CHAPTERS) return { ok: false, reason: "tooFew" };
  return {
    ok: true,
    count: chapters.length,
    text: chapters.map(({ sec, title }) => `${clock(sec)} ${title}`).join("\n"),
  };
}

export function momentsCsv(
  timeline: Pick<MomentTimeline, "base" | "moments">,
  { locale, t }: Pick<ReportI18n, "locale" | "t">,
): string {
  return toCsv(
    [
      [
        t(
          timeline.base === "recording"
            ? "reports.csv.moments.recordingTime"
            : "reports.csv.moments.liveTime",
        ),
        t("reports.csv.moments.type"),
        t("reports.csv.moments.label"),
      ],
      // Always write hours: spreadsheets read 05:30 as a time of day.
      ...byTime(timeline.moments).map((moment) => [
        clock(Math.round(moment.ms / 1000), true),
        t(KIND_KEY[moment.kind]),
        titleOf(moment, t),
      ]),
    ],
    locale,
  );
}

// CMX 3600 is 7-bit ASCII, and Resolve splits marker fields on "|".
const edlText = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\|/g, "/")
    .replace(/[^ -~]+/g, " ")
    .replace(/ +/g, " ")
    .trim();

function timecode(frame: number, fps: number): string {
  const seconds = Math.floor(frame / fps);
  return [
    Math.floor(seconds / 3600),
    Math.floor(seconds / 60) % 60,
    seconds % 60,
    frame % fps,
  ]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

/**
 * One single-frame event per moment, named by both a DaVinci Resolve marker comment and a `* LOC:` locator.
 * Record timecodes start at 01:00:00:00, Resolve's default timeline start, and count non-drop frames at
 * `fps`; editors read the frame field at the timeline's own rate, so other rates shift markers by under a second.
 */
export function momentsEdl(
  timeline: Pick<MomentTimeline, "moments">,
  { title, t, fps = 30 }: { title: string; t: Translate; fps?: number },
): string {
  const events: { frame: number; kind: MomentKind; names: string[] }[] = [];
  for (const moment of byTime(timeline.moments)) {
    const frame = 3600 * fps + Math.round((moment.ms * fps) / 1000);
    const name =
      edlText(titleOf(moment, t)) || edlText(t(KIND_KEY[moment.kind]));
    const previous = events[events.length - 1];
    // Resolve keeps one marker per frame, so moments sharing a frame share an event.
    if (previous?.frame === frame) previous.names.push(name);
    else events.push({ frame, kind: moment.kind, names: [name] });
  }
  const lines = [`TITLE: ${edlText(title)}`, "FCM: NON-DROP FRAME", ""];
  events.forEach(({ frame, kind, names }, index) => {
    const start = timecode(frame, fps);
    const end = timecode(frame + 1, fps);
    const name = names.join(" / ");
    lines.push(
      `${String(index + 1).padStart(3, "0")}  001      V     C        ${start} ${end} ${start} ${end}`,
      ` |C:${RESOLVE_COLOR[kind]} |M:${name} |D:1`,
      `* LOC: ${start} ${LOCATOR_COLOR[kind].padEnd(7)} ${name}`,
      "",
    );
  });
  return lines.join("\r\n");
}

const WINDOWS_RESERVED_NAMES = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
]);

const MIN_SLICE_MS = 100;
const MIN_CLIP_MS = 500;
const MAX_SLUG_LEN = 64;

/** Keep clip file names safe across Windows filesystems, stripping reserved names and control bytes. */
export function sanitizeClipSlug(
  label: string,
  fallback = "clip",
  maxLen = MAX_SLUG_LEN,
): string {
  const cleaned = label
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[<>:"/\\|?*\p{Cc}]/gu, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const truncated = cleaned.slice(0, maxLen).replace(/-+$/g, "");
  const candidate = truncated || fallback;
  if (WINDOWS_RESERVED_NAMES.has(candidate.toLowerCase())) {
    return `${candidate}-clip`.slice(0, maxLen).replace(/-+$/g, "");
  }
  return candidate;
}

function fileClockStamp(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(totalSec / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
  const s = String(totalSec % 60).padStart(2, "0");
  return `${h}h${m}m${s}s`;
}

/** Map a global recorded interval onto one or more local segment slices. */
export function slicesForGlobalRange(
  replay: ReplayIndex,
  startGlobalMs: number,
  endGlobalMs: number,
): ClipSegmentSlice[] {
  if (!replay.segments.length || replay.totalMs <= 0) return [];
  const rangeStart = Math.max(0, Math.min(replay.totalMs, startGlobalMs));
  const rangeEnd = Math.max(0, Math.min(replay.totalMs, endGlobalMs));
  if (rangeEnd - rangeStart < MIN_SLICE_MS) return [];

  const slices: ClipSegmentSlice[] = [];
  for (let i = 0; i < replay.segments.length; i++) {
    const seg = replay.segments[i];
    const segStart = replay.starts[i];
    const segDur = Math.max(0, seg.endT - seg.t);
    const segEnd = segStart + segDur;
    if (segEnd <= rangeStart) continue;
    if (segStart >= rangeEnd) break;
    const localStart = Math.round(Math.max(0, rangeStart - segStart));
    const localEnd = Math.round(Math.min(segDur, rangeEnd - segStart));
    if (localEnd - localStart >= MIN_SLICE_MS) {
      slices.push({ path: seg.path, startMs: localStart, endMs: localEnd });
    }
  }
  return slices;
}

/** Plan merged MP4 clip windows for a set of recording-based moments. */
export function planMomentClips(
  moments: readonly Moment[],
  replay: ReplayIndex | null,
  options: PlanMomentClipsOptions,
): PlannedMomentClip[] {
  if (!replay || !replay.segments.length || replay.totalMs < MIN_CLIP_MS) {
    return [];
  }
  const preMs = Math.max(0, options.preMs);
  const postMs = Math.max(0, options.postMs);
  const mergeGapMs = Math.max(0, options.mergeGapMs ?? 0);
  const fallback = sanitizeClipSlug(options.fallbackLabel ?? "clip", "clip");

  const sorted = byTime(moments);
  interface WindowAcc {
    startGlobalMs: number;
    endGlobalMs: number;
    anchorMs: number;
    label: string;
    momentCount: number;
    kinds: MomentKind[];
  }
  const merged: WindowAcc[] = [];

  for (const moment of sorted) {
    if (!Number.isFinite(moment.ms)) continue;
    const startGlobalMs = Math.max(0, Math.round(moment.ms - preMs));
    const endGlobalMs = Math.min(
      replay.totalMs,
      Math.round(moment.ms + postMs),
    );
    if (endGlobalMs - startGlobalMs < MIN_CLIP_MS) continue;

    const prev = merged[merged.length - 1];
    if (prev && startGlobalMs <= prev.endGlobalMs + mergeGapMs) {
      prev.endGlobalMs = Math.max(prev.endGlobalMs, endGlobalMs);
      prev.momentCount++;
      if (!prev.kinds.includes(moment.kind)) prev.kinds.push(moment.kind);
      // Prefer an explicit marker label over a generic highlight label when merging.
      if (!prev.label && moment.label) prev.label = moment.label;
    } else {
      merged.push({
        startGlobalMs,
        endGlobalMs,
        anchorMs: Math.max(0, Math.min(replay.totalMs, Math.round(moment.ms))),
        label: moment.label,
        momentCount: 1,
        kinds: [moment.kind],
      });
    }
  }

  const clips: PlannedMomentClip[] = [];
  for (const window of merged) {
    const slices = slicesForGlobalRange(
      replay,
      window.startGlobalMs,
      window.endGlobalMs,
    );
    if (!slices.length) continue;
    const durationMs = slices.reduce(
      (acc, slice) => acc + (slice.endMs - slice.startMs),
      0,
    );
    if (durationMs < MIN_CLIP_MS) continue;

    const index = clips.length + 1;
    const prefix = `${String(index).padStart(2, "0")}-${fileClockStamp(window.anchorMs)}-`;
    const bodyMax = Math.max(8, MAX_SLUG_LEN - prefix.length);
    const body = sanitizeClipSlug(window.label || fallback, fallback, bodyMax);
    const slug = `${prefix}${body}`;

    clips.push({
      id: `${index}-${window.startGlobalMs}-${window.endGlobalMs}`,
      slug,
      label: window.label,
      startGlobalMs: window.startGlobalMs,
      endGlobalMs: window.endGlobalMs,
      durationMs,
      momentCount: window.momentCount,
      kinds: window.kinds,
      slices,
    });
  }
  return clips;
}
