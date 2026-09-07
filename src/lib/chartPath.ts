/** Bound plotted points independently of session length. */
export const MAX_POINTS = 600;

export function sampleIndices(len: number): number[] {
  if (len <= MAX_POINTS) return Array.from({ length: len }, (_, i) => i);
  const step = (len - 1) / (MAX_POINTS - 1);
  return Array.from({ length: MAX_POINTS }, (_, k) => Math.floor(k * step));
}

/** A bounded min/max envelope preserves spikes and endpoints; check gaps against the original series. */
export function envelopeIndices(values: readonly (number | null)[]): number[] {
  if (values.length <= MAX_POINTS) return sampleIndices(values.length);
  const buckets = Math.floor((MAX_POINTS - 2) / 2);
  const indices = [0];
  for (let bucket = 0; bucket < buckets; bucket++) {
    const start = 1 + Math.floor((bucket * (values.length - 2)) / buckets);
    const end = 1 + Math.floor(((bucket + 1) * (values.length - 2)) / buckets);
    let min = -1;
    let max = -1;
    for (let i = start; i < end; i++) {
      const value = values[i];
      if (value === null || !Number.isFinite(value)) continue;
      if (min < 0 || value < values[min]!) min = i;
      if (max < 0 || value > values[max]!) max = i;
    }
    if (min < 0) indices.push(start);
    else if (min === max) indices.push(min);
    else indices.push(Math.min(min, max), Math.max(min, max));
  }
  indices.push(values.length - 1);
  return indices;
}

export interface PathGeometry {
  /** X-axis length in samples, which may differ from values for independently sampled series. */
  n: number;
  yMax: number;
  padL: number;
  padT: number;
  innerW: number;
  innerH: number;
}

export const xAt = (i: number, g: PathGeometry): number =>
  g.padL + (g.n <= 1 ? 0 : (i / (g.n - 1)) * g.innerW);

export const yAt = (v: number, g: PathGeometry): number =>
  g.padT + (1 - Math.min(v, g.yMax) / g.yMax) * g.innerH;

export function peakOf(series: { values: (number | null)[] }[]): number {
  let peak = 1;
  for (const s of series)
    for (const v of s.values) if (v != null && v > peak) peak = v;
  return peak * 1.1;
}

/** Break the path when any original sample between downsampled points is missing. */
export function buildPath(values: (number | null)[], g: PathGeometry): string {
  let d = "";
  let pen = false;
  let prev = -1;
  for (const i of envelopeIndices(values)) {
    if (pen && prev >= 0) {
      for (let k = prev + 1; k < i; k++) {
        if (values[k] == null || !Number.isFinite(values[k])) {
          pen = false;
          break;
        }
      }
    }
    const v = values[i];
    if (v == null || !Number.isFinite(v)) {
      pen = false;
    } else {
      d += `${pen ? "L" : "M"}${xAt(i, g).toFixed(1)},${yAt(v, g).toFixed(1)} `;
      pen = true;
    }
    prev = i;
  }
  return d.trim();
}
