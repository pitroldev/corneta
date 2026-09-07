import { describe, it, expect } from "vitest";
import {
  buildPath,
  sampleIndices,
  peakOf,
  MAX_POINTS,
  envelopeIndices,
  type PathGeometry,
} from "./chartPath";

const g: PathGeometry = {
  n: 5,
  yMax: 100,
  padL: 0,
  padT: 0,
  innerW: 100,
  innerH: 100,
};

describe("chartPath", () => {
  it("treats non-finite samples as gaps, never invalid SVG coordinates", () => {
    expect(buildPath([10, NaN, Infinity, 20], { ...g, n: 4 })).toBe(
      "M0.0,90.0 M100.0,80.0",
    );
  });
  it("preserves isolated peaks, troughs and the final sample within the point budget", () => {
    const values = Array<number | null>(14400).fill(50);
    values[123] = 100;
    values[456] = 0;
    values[values.length - 1] = 99;
    const indices = envelopeIndices(values);
    expect(indices).toContain(123);
    expect(indices).toContain(456);
    expect(indices[indices.length - 1]).toBe(values.length - 1);
    expect(indices.length).toBeLessThanOrEqual(MAX_POINTS);
    expect(new Set(indices).size).toBe(indices.length);
  });
  it("maps the series into the rectangle with zero at the bottom", () => {
    expect(buildPath([0, 50, 100], { ...g, n: 3 })).toBe(
      "M0.0,100.0 L50.0,50.0 L100.0,0.0",
    );
  });

  it("breaks the path across a gap", () => {
    expect(buildPath([10, null, 30], { ...g, n: 3 })).toBe(
      "M0.0,90.0 M100.0,70.0",
    );
  });

  it("preserves gaps between downsampled points", () => {
    const n = MAX_POINTS * 3;
    const vals: (number | null)[] = Array.from({ length: n }, () => 50);
    expect(sampleIndices(n)).toHaveLength(MAX_POINTS);
    // Downsampling must preserve this missing sample even though its index is skipped.
    vals[1] = null;
    const d = buildPath(vals, { ...g, n });
    expect(d.match(/M/g)?.length).toBe(2);
  });

  it("adds ten percent headroom with a minimum maximum of one", () => {
    expect(peakOf([{ values: [10, 50, null] }])).toBeCloseTo(55);
    expect(peakOf([{ values: [null] }])).toBeCloseTo(1.1);
  });
});
