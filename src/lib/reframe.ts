import type { CropBox, Reframe } from "./types";

/** Mirrors `split_heights` and the clamps in `src-tauri/src/engine/args.rs`. */
export const SPLIT_RATIO = { min: 0.25, max: 0.5, default: 0.35 } as const;
/** A webcam usually sits in a corner of the canvas. */
export const DEFAULT_SPLIT_TOP: CropBox = { x: 1, y: 1, zoom: 0.35 };
export const ZOOM_MIN = { main: 0.25, camera: 0.1 } as const;
const STAGE_AR = 16 / 9;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));

export function isSplit(reframe?: Reframe): boolean {
  return reframe?.layout === "split";
}

/** Even camera and main heights that fill the frame, or null below 16 px each. */
export function splitHeights(
  outH: number,
  ratio: number,
): [number, number] | null {
  const r = Number.isFinite(ratio)
    ? clamp(ratio, SPLIT_RATIO.min, SPLIT_RATIO.max)
    : SPLIT_RATIO.default;
  const top = Math.round(outH * r) & ~1;
  const bottom = (outH - top) & ~1;
  return top >= 16 && bottom >= 16 ? [top, bottom] : null;
}

/**
 * A crop as fractions of a 16:9 stage. Split regions stay inside the source on both axes;
 * the single frame keeps its original formula, which only bounds the width.
 */
export function cropFractions(
  zoom: number,
  ar: number,
  contained: boolean,
): { w: number; h: number } {
  if (!contained) return { w: Math.min(1, (zoom * ar) / STAGE_AR), h: zoom };
  const h = Math.min(zoom, STAGE_AR / ar);
  return { w: (h * ar) / STAGE_AR, h };
}

/** The camera region and its height share, as the engine reads them. */
export function splitParts(reframe: Reframe): { top: CropBox; ratio: number } {
  return {
    top: reframe.top ?? DEFAULT_SPLIT_TOP,
    ratio: reframe.splitRatio ?? SPLIT_RATIO.default,
  };
}

const box = (b: CropBox, minZoom: number) =>
  [clamp(b.x, 0, 1), clamp(b.y, 0, 1), clamp(b.zoom, minZoom, 1)]
    .map((v) => v.toFixed(4))
    .join(":");

/** Destinations whose crops resolve the same share one encode in the engine. */
export function reframeKey(reframe?: Reframe): string {
  const main = box(reframe ?? { x: 0.5, y: 0.5, zoom: 1 }, ZOOM_MIN.main);
  if (!reframe || !isSplit(reframe)) return main;
  const { top, ratio } = splitParts(reframe);
  const r = clamp(ratio, SPLIT_RATIO.min, SPLIT_RATIO.max).toFixed(4);
  return `split:${r}:${box(top, ZOOM_MIN.camera)}:${main}`;
}
