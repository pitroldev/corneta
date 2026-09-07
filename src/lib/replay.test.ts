import { describe, it, expect } from "vitest";
import {
  buildReplayIndex,
  denormalizeEpoch,
  epochAtGlobal,
  fractionalIndexAt,
  globalAtEpoch,
  hasEstimatedAnchor,
  hasUnplayableCodec,
  isCovered,
  normalizeEpoch,
  pointAtGlobal,
  sampleIndexAt,
  type ReplaySegment,
} from "./replay";

const T0 = 1_700_000_000_000;

function seg(
  n: number,
  t: number,
  durMs: number,
  extra: Partial<ReplaySegment> = {},
): ReplaySegment {
  return {
    seg: n,
    t,
    path: `S${n}.mp4`,
    codec: "h264",
    estimated: false,
    syncs: [
      { t, out: 0 },
      { t: t + durMs, out: durMs },
    ],
    endT: t + durMs,
    ...extra,
  };
}

describe("replay index", () => {
  it("sums durations and ignores empty segments", () => {
    const idx = buildReplayIndex([
      seg(1, T0, 60_000),
      seg(2, T0 + 90_000, 0),
      seg(3, T0 + 120_000, 30_000),
    ]);
    expect(idx.segments).toHaveLength(2);
    expect(idx.totalMs).toBe(90_000);
    expect(idx.starts).toEqual([0, 60_000]);
  });

  it("sorts by anchor rather than segment number", () => {
    const idx = buildReplayIndex([
      seg(2, T0 + 60_000, 10_000),
      seg(1, T0, 10_000),
    ]);
    expect(idx.segments.map((s) => s.path)).toEqual(["S1.mp4", "S2.mp4"]);
  });

  it("handles sessions without recordings", () => {
    const idx = buildReplayIndex([]);
    expect(idx.totalMs).toBe(0);
    expect(globalAtEpoch(idx, T0)).toBeNull();
    expect(pointAtGlobal(idx, 0)).toBeNull();
    expect(epochAtGlobal(idx, 0)).toBeNull();
    expect(isCovered(idx, T0)).toBe(false);
  });
});

describe("replay epoch/global mapping", () => {
  const idx = buildReplayIndex([
    seg(1, T0, 60_000),
    seg(2, T0 + 90_000, 30_000),
  ]);

  it("maps a timestamp inside the first segment", () => {
    expect(globalAtEpoch(idx, T0 + 10_000)).toBe(10_000);
  });

  it("omits unrecorded gaps between segments", () => {
    // Recording time omits the unrecorded gap between files.
    expect(globalAtEpoch(idx, T0 + 90_000)).toBe(60_000);
    expect(globalAtEpoch(idx, T0 + 100_000)).toBe(70_000);
  });

  it("clamps timestamps inside gaps to the next boundary", () => {
    expect(globalAtEpoch(idx, T0 + 75_000)).toBe(60_000);
  });

  it("returns null before and after the recording", () => {
    expect(globalAtEpoch(idx, T0 - 1)).toBeNull();
    expect(globalAtEpoch(idx, T0 + 120_001)).toBeNull();
  });

  it("round-trips between time axes", () => {
    const g = globalAtEpoch(idx, T0 + 100_000);
    expect(g).not.toBeNull();
    expect(epochAtGlobal(idx, g as number)).toBeCloseTo(T0 + 100_000, -1);
  });

  it("locates the file and its local time", () => {
    expect(pointAtGlobal(idx, 70_000)).toEqual({ index: 1, localSec: 10 });
    expect(pointAtGlobal(idx, 0)).toEqual({ index: 0, localSec: 0 });
  });

  it("clamps out-of-range positions", () => {
    expect(pointAtGlobal(idx, -5_000)).toEqual({ index: 0, localSec: 0 });
    expect(pointAtGlobal(idx, 999_999)?.index).toBe(1);
  });
});

describe("replay drift and anchors", () => {
  it("interpolates piecewise without applying late drift to the beginning", () => {
    // Piecewise interpolation must follow clock drift rather than extrapolating from the initial anchor.
    const s: ReplaySegment = {
      ...seg(1, T0, 120_000),
      syncs: [
        { t: T0, out: 0 },
        { t: T0 + 60_000, out: 60_000 },
        { t: T0 + 120_000, out: 126_000 },
      ],
      endT: T0 + 120_000,
    };
    const idx = buildReplayIndex([s]);
    expect(globalAtEpoch(idx, T0 + 60_000)).toBe(60_000);
    expect(globalAtEpoch(idx, T0 + 90_000)).toBe(93_000);
  });

  it("uses real-time progression without anchors", () => {
    const s = { ...seg(1, T0, 60_000), syncs: [] };
    expect(globalAtEpoch(buildReplayIndex([s]), T0 + 20_000)).toBe(20_000);
  });

  it("sorts out-of-order anchors", () => {
    const s: ReplaySegment = {
      ...seg(1, T0, 60_000),
      syncs: [
        { t: T0 + 60_000, out: 60_000 },
        { t: T0, out: 0 },
        { t: T0 + 30_000, out: 30_000 },
      ],
    };
    expect(globalAtEpoch(buildReplayIndex([s]), T0 + 45_000)).toBe(45_000);
  });

  it("handles coincident anchors without division by zero", () => {
    const s: ReplaySegment = {
      ...seg(1, T0, 60_000),
      syncs: [
        { t: T0, out: 0 },
        { t: T0 + 30_000, out: 30_000 },
        { t: T0 + 30_000, out: 31_000 },
        { t: T0 + 60_000, out: 60_000 },
      ],
    };
    const g = globalAtEpoch(buildReplayIndex([s]), T0 + 30_000);
    expect(Number.isFinite(g as number)).toBe(true);
  });

  it("detects estimated anchors and unsupported codecs", () => {
    expect(hasEstimatedAnchor(buildReplayIndex([seg(1, T0, 1_000)]))).toBe(
      false,
    );
    expect(
      hasEstimatedAnchor(
        buildReplayIndex([seg(1, T0, 1_000, { estimated: true })]),
      ),
    ).toBe(true);
    expect(hasUnplayableCodec(buildReplayIndex([seg(1, T0, 1_000)]))).toBe(
      false,
    );
    expect(
      hasUnplayableCodec(
        buildReplayIndex([seg(1, T0, 1_000, { codec: "hevc" })]),
      ),
    ).toBe(true);
  });
});

describe("replay clock jumps", () => {
  const jumps = [{ t: T0 + 40_000, delta: 10_000 }];

  it("normalizes and restores clock jumps symmetrically", () => {
    expect(normalizeEpoch(T0 + 50_000, jumps)).toBe(T0 + 40_000);
    expect(normalizeEpoch(T0 + 30_000, jumps)).toBe(T0 + 30_000);
    expect(denormalizeEpoch(T0 + 40_000, jumps)).toBe(T0 + 50_000);
  });

  it("keeps mapping consistent across a recording-time clock jump", () => {
    const s: ReplaySegment = { ...seg(1, T0, 120_000), syncs: [] };
    const idx = buildReplayIndex([s], jumps);
    expect(globalAtEpoch(idx, T0 + 50_000)).toBe(40_000);
  });

  it("round-trips backward clock adjustments", () => {
    const back = [{ t: T0 + 40_000, delta: -5_000 }];
    expect(normalizeEpoch(T0 + 50_000, back)).toBe(T0 + 55_000);
    expect(denormalizeEpoch(normalizeEpoch(T0 + 50_000, back), back)).toBe(
      T0 + 50_000,
    );
  });
});

describe("replay manual offset", () => {
  it("shifts mapping by the user offset", () => {
    const base = buildReplayIndex([seg(1, T0, 60_000)]);
    const ahead = buildReplayIndex([seg(1, T0, 60_000)], [], 5_000);
    expect(globalAtEpoch(base, T0 + 20_000)).toBe(20_000);
    expect(globalAtEpoch(ahead, T0 + 20_000)).toBe(25_000);
  });

  it("subtracts the offset on the reverse mapping", () => {
    const idx = buildReplayIndex([seg(1, T0, 60_000)], [], 5_000);
    const g = globalAtEpoch(idx, T0 + 20_000) as number;
    expect(epochAtGlobal(idx, g)).toBeCloseTo(T0 + 20_000, -1);
  });
});

describe("replay nearest sample", () => {
  const times = [0, 100, 200, 300, 400];

  it("finds neighboring sample indices and clamps boundaries", () => {
    expect(sampleIndexAt(times, 0)).toBe(0);
    expect(sampleIndexAt(times, 149)).toBe(1);
    expect(sampleIndexAt(times, 151)).toBe(2);
    expect(sampleIndexAt(times, -50)).toBe(0);
    expect(sampleIndexAt(times, 9_999)).toBe(4);
  });

  it("breaks ties toward the earlier sample and returns null for empty input", () => {
    expect(sampleIndexAt(times, 150)).toBe(1);
    expect(sampleIndexAt([], 10)).toBeNull();
  });

  it("interpolates fractional positions between samples", () => {
    expect(fractionalIndexAt(times, 150)).toBeCloseTo(1.5, 5);
    expect(fractionalIndexAt(times, 100)).toBe(1);
    expect(fractionalIndexAt(times, 275)).toBeCloseTo(2.75, 5);
  });

  it("handles fractional boundaries and degenerate series", () => {
    expect(fractionalIndexAt(times, -10)).toBe(0);
    expect(fractionalIndexAt(times, 9_999)).toBe(4);
    expect(fractionalIndexAt([5], 5)).toBe(0);
    expect(fractionalIndexAt([7, 7], 7)).toBe(0);
    expect(fractionalIndexAt([], 1)).toBeNull();
  });
});
