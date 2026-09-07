// epoch: wall-clock milliseconds; global: recorded milliseconds excluding gaps; local: seconds within one file.

export interface ReplaySegment {
  seg: number;
  /** Epoch corresponding to this file's first frame. */
  t: number;
  path: string;
  codec: string;
  /** Estimated at process spawn, not measured by progress; may differ by up to a GOP. */
  estimated: boolean;
  /** recSync pairs of epoch and recorded milliseconds, including the initial (t, 0) anchor. */
  syncs: { t: number; out: number }[];
  /** Known ending epoch; falls back to the last recSync when recEnd is absent. */
  endT: number;
}

export interface ClockJump {
  /** Post-jump epoch at which the clock change was detected. */
  t: number;
  /** Clock delta in milliseconds; positive moves forward. */
  delta: number;
}

export interface ReplayIndex {
  segments: ReplaySegment[];
  jumps: ClockJump[];
  /** Manual offset in milliseconds; positive advances a delayed video. */
  offsetMs: number;
  /** Sum of segment durations, excluding gaps. */
  totalMs: number;
  /** Segment start positions in global recorded time, aligned with segments. */
  starts: number[];
}

export interface ReplayPoint {
  /** Index into ReplayIndex.segments, not the recorder's seg field. */
  index: number;
  /** Seconds within the selected file. */
  localSec: number;
}

const EMPTY: ReplayIndex = {
  segments: [],
  jumps: [],
  offsetMs: 0,
  totalMs: 0,
  starts: [],
};

const durationOf = (s: ReplaySegment): number => Math.max(0, s.endT - s.t);

/** Normalize report events and recording anchors with the same clock corrections to avoid inflating duration. */
export function normalizeEpoch(t: number, jumps: ClockJump[]): number {
  let out = t;
  for (const j of jumps) {
    // Compare against the post-jump timestamp to avoid applying a clock correction twice.
    if (t >= j.t) out -= j.delta;
  }
  return out;
}

/** Sort by anchor and discard zero-duration segments. */
export function buildReplayIndex(
  segments: ReplaySegment[],
  jumps: ClockJump[] = [],
  offsetMs = 0,
): ReplayIndex {
  const clean = segments
    .filter((s) => Number.isFinite(s.t) && durationOf(s) > 0)
    .sort((a, b) => a.t - b.t);
  if (!clean.length) return { ...EMPTY, offsetMs };

  const starts: number[] = [];
  let acc = 0;
  for (const s of clean) {
    starts.push(acc);
    acc += durationOf(s);
  }
  return { segments: clean, jumps, offsetMs, totalMs: acc, starts };
}

/** Interpolate between anchors to account for drift between media and wall clocks. */
function outMsWithin(seg: ReplaySegment, epoch: number): number {
  const pts = [...seg.syncs].sort((a, b) => a.t - b.t);
  if (!pts.length) return epoch - seg.t;
  if (epoch <= pts[0].t) {
    // Before the first anchor, assume real-time progression.
    return pts[0].out + (epoch - pts[0].t);
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (epoch <= b.t) {
      const span = b.t - a.t;
      // Coincident anchors have no slope; use the left value.
      if (span <= 0) return a.out;
      const k = (epoch - a.t) / span;
      return a.out + k * (b.out - a.out);
    }
  }
  const last = pts[pts.length - 1];
  return last.out + (epoch - last.t);
}

function epochWithin(seg: ReplaySegment, outMs: number): number {
  const pts = [...seg.syncs].sort((a, b) => a.out - b.out);
  if (!pts.length) return seg.t + outMs;
  if (outMs <= pts[0].out) return pts[0].t + (outMs - pts[0].out);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (outMs <= b.out) {
      const span = b.out - a.out;
      if (span <= 0) return a.t;
      const k = (outMs - a.out) / span;
      return a.t + k * (b.t - a.t);
    }
  }
  const last = pts[pts.length - 1];
  return last.t + (outMs - last.out);
}

/** Map epoch to global recording time; clamp gaps to a neighboring segment and return null outside the recording. */
export function globalAtEpoch(idx: ReplayIndex, epoch: number): number | null {
  if (!idx.segments.length) return null;
  const e = normalizeEpoch(epoch, idx.jumps) + idx.offsetMs;
  for (let i = 0; i < idx.segments.length; i++) {
    const seg = idx.segments[i];
    const t0 = normalizeEpoch(seg.t, idx.jumps);
    const t1 = normalizeEpoch(seg.endT, idx.jumps);
    if (e < t0) {
      // Before the first segment is outside; between segments, clamp to the next start.
      return i === 0 ? null : idx.starts[i];
    }
    if (e <= t1) {
      const out = outMsWithin(seg, e - t0 + seg.t);
      const local = Math.max(0, Math.min(durationOf(seg), out));
      return idx.starts[i] + local;
    }
  }
  return null;
}

export function pointAtGlobal(
  idx: ReplayIndex,
  globalMs: number,
): ReplayPoint | null {
  if (!idx.segments.length) return null;
  const g = Math.max(0, Math.min(idx.totalMs, globalMs));
  for (let i = idx.segments.length - 1; i >= 0; i--) {
    if (g >= idx.starts[i]) {
      const local = Math.min(g - idx.starts[i], durationOf(idx.segments[i]));
      return { index: i, localSec: local / 1000 };
    }
  }
  return { index: 0, localSec: 0 };
}

export function epochAtGlobal(
  idx: ReplayIndex,
  globalMs: number,
): number | null {
  const p = pointAtGlobal(idx, globalMs);
  if (!p) return null;
  const seg = idx.segments[p.index];
  const raw = epochWithin(seg, p.localSec * 1000);
  // Return to the original wall clock, including jumps, used by report samples.
  return denormalizeEpoch(raw - idx.offsetMs, idx.jumps);
}

export function denormalizeEpoch(t: number, jumps: ClockJump[]): number {
  let out = t;
  for (const j of jumps) {
    if (t >= j.t - j.delta) out += j.delta;
  }
  return out;
}

export function sampleIndexAt(times: number[], epoch: number): number | null {
  if (!times.length) return null;
  let lo = 0;
  let hi = times.length - 1;
  if (epoch <= times[0]) return 0;
  if (epoch >= times[hi]) return hi;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] === epoch) return mid;
    if (times[mid] < epoch) lo = mid;
    else hi = mid;
  }
  return epoch - times[lo] <= times[hi] - epoch ? lo : hi;
}

/** Return a fractional sample index so the replay cursor can move between sparse samples. */
export function fractionalIndexAt(
  times: number[],
  epoch: number,
): number | null {
  if (!times.length) return null;
  const i = sampleIndexAt(times, epoch);
  if (i == null) return null;
  const j = times[i] <= epoch ? i + 1 : i - 1;
  if (j < 0 || j >= times.length) return i;
  const span = times[j] - times[i];
  if (span === 0) return i;
  const k = (epoch - times[i]) / span;
  return i + k * (j - i);
}

export const isCovered = (idx: ReplayIndex, epoch: number): boolean =>
  globalAtEpoch(idx, epoch) != null;

export const hasEstimatedAnchor = (idx: ReplayIndex): boolean =>
  idx.segments.some((s) => s.estimated);

const PLAYABLE = new Set(["h264", "avc1", "aac", ""]);
export const isPlayableCodec = (codec: string): boolean =>
  PLAYABLE.has(codec.toLowerCase());
export const hasUnplayableCodec = (idx: ReplayIndex): boolean =>
  idx.segments.some((s) => s.codec && !isPlayableCodec(s.codec));
