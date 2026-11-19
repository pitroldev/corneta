import { describe, expect, it } from "vitest";
import {
  DEFAULT_SPLIT_TOP,
  SPLIT_RATIO,
  cropFractions,
  reframeKey,
  splitHeights,
  splitParts,
} from "./reframe";

describe("split portrait geometry", () => {
  it("matches the native even heights for every ratio", () => {
    for (const outH of [1280, 1920, 1366, 960]) {
      for (let step = 0; step <= 50; step++) {
        const [top, bottom] = splitHeights(outH, 0.2 + step * 0.01)!;
        expect(top % 2, `${outH}`).toBe(0);
        expect(bottom % 2, `${outH}`).toBe(0);
        expect(top + bottom).toBe(outH);
      }
    }
    expect(splitHeights(1280, 0.35)).toEqual([448, 832]);
    expect(splitHeights(1280, Number.NaN)).toEqual([448, 832]);
    expect(splitHeights(40, 0.25)).toBeNull();
  });

  it("keeps split regions inside the stage while the single frame keeps its formula", () => {
    // 720x448 camera strip is wider than 16:9: its height shrinks instead of stretching.
    const wide = cropFractions(1, 720 / 320, true);
    expect(wide.w).toBeCloseTo(1);
    expect(wide.h).toBeLessThan(1);
    const portrait = cropFractions(0.8, 720 / 1280, false);
    expect(portrait.h).toBe(0.8);
    expect(portrait.w).toBeCloseTo((0.8 * 0.5625) / (16 / 9));
    expect(cropFractions(0.8, 720 / 1280, true)).toEqual(portrait);
  });

  it("fills the camera defaults the engine uses when a split has no region yet", () => {
    expect(splitParts({ x: 0.5, y: 0.5, zoom: 1, layout: "split" })).toEqual({
      top: DEFAULT_SPLIT_TOP,
      ratio: SPLIT_RATIO.default,
    });
  });
});

describe("rendition key", () => {
  it("is unchanged for one frame and ignores leftover split fields", () => {
    expect(reframeKey()).toBe("0.5000:0.5000:1.0000");
    expect(
      reframeKey({
        x: 0.2,
        y: 0.5,
        zoom: 0.8,
        layout: "single",
        top: { x: 0, y: 0, zoom: 0.3 },
        splitRatio: 0.4,
      }),
    ).toBe("0.2000:0.5000:0.8000");
  });

  it("separates split crops and clamps them like the engine", () => {
    const split = {
      x: 0.5,
      y: 0.5,
      zoom: 1,
      layout: "split" as const,
      top: { x: 1, y: 1, zoom: 0.3 },
      splitRatio: 0.4,
    };
    expect(reframeKey(split)).toBe(
      "split:0.4000:1.0000:1.0000:0.3000:0.5000:0.5000:1.0000",
    );
    expect(reframeKey({ ...split, splitRatio: 9 })).toBe(
      reframeKey({ ...split, splitRatio: 0.5 }),
    );
    expect(reframeKey({ ...split, top: { x: 1, y: 1, zoom: 0 } })).toContain(
      "split:0.4000:1.0000:1.0000:0.1000:",
    );
  });
});
