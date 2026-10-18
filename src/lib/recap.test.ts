import { describe, expect, it, vi } from "vitest";
import type { I18n } from "./i18n";
import {
  drawRecap,
  RECAP_HEIGHT,
  RECAP_WIDTH,
  recapToBlob,
  type RecapData,
} from "./recap";

interface DrawnText {
  text: string;
  x: number;
  y: number;
  size: number;
  align: string;
  width: number;
}

/** Every glyph is 0.6 em wide, so layout limits can be checked exactly. */
class FakeContext {
  font = "10px sans-serif";
  fillStyle = "#000";
  textAlign = "start";
  textBaseline = "alphabetic";
  cleared: number[] = [];
  readonly texts: DrawnText[] = [];
  readonly rects: { x: number; y: number; width: number; height: number }[] =
    [];

  private get size() {
    return Number(/(\d+)px/.exec(this.font)?.[1]);
  }

  measureText(text: string) {
    return { width: text.length * this.size * 0.6 };
  }

  fillText(text: string, x: number, y: number) {
    this.texts.push({
      text,
      x,
      y,
      size: this.size,
      align: this.textAlign,
      width: this.measureText(text).width,
    });
  }

  fillRect(x: number, y: number, width: number, height: number) {
    this.rects.push({ x, y, width, height });
  }

  clearRect(...area: number[]) {
    this.cleared = area;
  }

  beginPath() {}

  arc() {}

  fill() {}
}

const CARD_INSET = 48;
const t = ((key: string) =>
  key === "analysis.recap.bestMoment" ? "Best moment" : key) as I18n["t"];

const recap = (overrides: Partial<RecapData> = {}): RecapData => ({
  brand: "CORNETA",
  date: "18/10/2026",
  title: "Live · 18/10/2026",
  subtitle: "3h 12min on air",
  big: [
    { label: "peak viewers", value: "1,234" },
    { label: "messages", value: "5,678" },
  ],
  small: [
    { label: "time on air", value: "3h 12min" },
    { label: "average", value: "870" },
  ],
  platforms: [
    { name: "Twitch", color: "#9146ff" },
    { name: "YouTube", color: "#ff0000" },
  ],
  footer: "streamed with Corneta — multistream in one app",
  ...overrides,
});

function draw(data: RecapData, translate = t) {
  const ctx = new FakeContext();
  drawRecap(ctx as unknown as CanvasRenderingContext2D, data, translate);
  return ctx;
}

const find = (ctx: FakeContext, text: string) =>
  ctx.texts.find((drawn) => drawn.text === text);
const starting = (ctx: FakeContext, prefix: string) =>
  ctx.texts.filter((drawn) => drawn.text.startsWith(prefix));
const platforms = (names: string[]) =>
  names.map((name) => ({ name, color: "#ffb323" }));
const numbered = (count: number) =>
  Array.from(
    { length: count },
    (_, i) => `Platform ${String(i + 1).padStart(2, "0")}`,
  );
const moment = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");

describe("drawRecap", () => {
  it("paints the whole canvas and uppercases the title and stat labels", () => {
    const ctx = draw(recap());
    expect(ctx.cleared).toEqual([0, 0, RECAP_WIDTH, RECAP_HEIGHT]);
    expect(ctx.rects[0]).toEqual({
      x: 0,
      y: 0,
      width: RECAP_WIDTH,
      height: RECAP_HEIGHT,
    });
    expect(find(ctx, "LIVE · 18/10/2026")).toBeDefined();
    expect(find(ctx, "Live · 18/10/2026")).toBeUndefined();
    expect(find(ctx, "PEAK VIEWERS")).toBeDefined();
    expect(find(ctx, "TIME ON AIR")).toBeDefined();
  });

  it("shrinks a long title until it fits the content width", () => {
    const short = find(draw(recap()), "LIVE · 18/10/2026")!;
    const long = find(
      draw(recap({ title: "Live · Saturday 18/10/2026" })),
      "LIVE · SATURDAY 18/10/2026",
    )!;
    expect(long.size).toBeLessThan(short.size);
    expect(long.x + long.width).toBeLessThanOrEqual(RECAP_WIDTH - long.x);
  });

  it("draws at most two headline stats and divides them only when there are two", () => {
    const divider = (ctx: FakeContext) =>
      ctx.rects.filter((rect) => rect.width === 2);
    const three = draw(
      recap({
        big: [
          { label: "first", value: "111" },
          { label: "second", value: "222" },
          { label: "third", value: "333" },
        ],
      }),
    );
    expect(find(three, "111")).toBeDefined();
    expect(find(three, "222")).toBeDefined();
    expect(find(three, "333")).toBeUndefined();
    expect(divider(three)).toHaveLength(1);
    const one = draw(recap({ big: [{ label: "first", value: "111" }] }));
    expect(divider(one)).toHaveLength(0);
  });

  it("lays out up to six secondary stats in two or three columns", () => {
    const stats = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        label: `stat ${i + 1}`,
        value: `S${i + 1}`,
      }));
    const values = (ctx: FakeContext) =>
      ctx.texts.filter((drawn) => /^S\d$/.test(drawn.text));
    const seven = values(draw(recap({ small: stats(7) })));
    expect(seven.map((drawn) => drawn.text)).toEqual([
      "S1",
      "S2",
      "S3",
      "S4",
      "S5",
      "S6",
    ]);
    expect(new Set(seven.map((drawn) => drawn.x)).size).toBe(3);
    const four = values(draw(recap({ small: stats(4) })));
    expect(new Set(four.map((drawn) => drawn.x)).size).toBe(2);
  });

  it("trims overlong text with an ellipsis instead of overflowing", () => {
    const ctx = draw(
      recap({
        date: "Saturday, October 18, 2026",
        small: [
          { label: "new followers from every platform this month", value: "9" },
        ],
        platforms: platforms(["My extremely long custom destination name"]),
      }),
    );
    for (const [prefix, full] of [
      ["Saturday", "Saturday, October 18, 2026"],
      ["NEW FOLLOWERS", "NEW FOLLOWERS FROM EVERY PLATFORM THIS MONTH"],
      ["My extremely", "My extremely long custom destination name"],
    ]) {
      const [drawn] = starting(ctx, prefix);
      expect(drawn.text.endsWith("…"), prefix).toBe(true);
      expect(full.startsWith(drawn.text.slice(0, -1)), prefix).toBe(true);
    }
  });

  it("wraps the best moment into three lines at most under a localized heading", () => {
    const long = draw(recap({ moment }));
    expect(find(long, "BEST MOMENT")).toBeDefined();
    const lines = starting(long, "word");
    expect(lines).toHaveLength(3);
    expect(lines[2].text.endsWith("…")).toBe(true);
    for (const line of lines)
      expect(line.x + line.width).toBeLessThanOrEqual(RECAP_WIDTH - line.x);
    const short = starting(draw(recap({ moment: "word raid" })), "word");
    expect(short.map((line) => line.text)).toEqual(["word raid"]);
    expect(short[0].size).toBeGreaterThan(lines[0].size);
  });

  it("skips the best moment block when there is none", () => {
    const translate = vi.fn(t);
    const ctx = draw(recap(), translate);
    expect(find(ctx, "BEST MOMENT")).toBeUndefined();
    expect(translate).not.toHaveBeenCalled();
  });

  it("shows platform chips on two rows at most and counts the hidden ones", () => {
    const ctx = draw(recap({ platforms: platforms(numbered(12)) }));
    const chips = starting(ctx, "Platform ");
    const hidden = ctx.texts.find((drawn) => /^\+\d+$/.test(drawn.text));
    expect(chips.length).toBeLessThan(12);
    expect(hidden?.text).toBe(`+${12 - chips.length}`);
    expect(new Set(chips.map((chip) => chip.y)).size).toBe(2);
    const few = draw(recap());
    expect(few.texts.some((drawn) => /^\+\d+$/.test(drawn.text))).toBe(false);
  });

  it("keeps every text inside the card for a busy stream", () => {
    const ctx = draw(
      recap({
        title: "Live · Saturday 18/10/2026",
        subtitle: "3h 12min on air — a long Saturday stream",
        date: "Saturday, October 18, 2026",
        big: [
          { label: "peak concurrent viewers", value: "1,234,567" },
          { label: "chat messages", value: "98,765" },
        ],
        small: [
          { label: "time on air", value: "3h 12min" },
          { label: "average viewers", value: "870" },
          {
            label: "new followers from every platform this month",
            value: "1,234",
          },
          { label: "subs", value: "56" },
          { label: "bits", value: "7,890" },
          { label: "raids", value: "3" },
        ],
        moment,
        platforms: platforms([
          "My extremely long custom destination name",
          ...numbered(11),
        ]),
      }),
    );
    const card = {
      left: CARD_INSET,
      top: CARD_INSET,
      right: RECAP_WIDTH - CARD_INSET,
      bottom: RECAP_HEIGHT - CARD_INSET,
    };
    expect(ctx.rects).toContainEqual({
      x: card.left,
      y: card.top,
      width: card.right - card.left,
      height: card.bottom - card.top,
    });
    for (const drawn of ctx.texts) {
      const left =
        drawn.align === "right"
          ? drawn.x - drawn.width
          : drawn.align === "center"
            ? drawn.x - drawn.width / 2
            : drawn.x;
      expect(left, drawn.text).toBeGreaterThanOrEqual(card.left);
      expect(left + drawn.width, drawn.text).toBeLessThanOrEqual(card.right);
      expect(drawn.y, drawn.text).toBeGreaterThan(card.top);
      expect(drawn.y, drawn.text).toBeLessThan(card.bottom);
    }
  });
});

describe("recapToBlob", () => {
  it("exports the canvas as PNG and fails when the browser returns nothing", async () => {
    const png = new Blob(["png"], { type: "image/png" });
    const toBlob = vi.fn((done: (blob: Blob | null) => void) => done(png));
    await expect(
      recapToBlob({ toBlob } as unknown as HTMLCanvasElement),
    ).resolves.toBe(png);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/png");
    const empty = {
      toBlob: (done: (blob: Blob | null) => void) => done(null),
    } as unknown as HTMLCanvasElement;
    await expect(recapToBlob(empty)).rejects.toThrow("Failed to generate PNG");
  });
});
