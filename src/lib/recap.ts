import type { I18n } from "./i18n";

type Translate = I18n["t"];

const C = {
  bg: "#100b07",
  surface: "#1a130c",
  surface2: "#221a10",
  brass: "#ffb323",
  ink: "#fcf3e3",
  inkMuted: "#c6b69b",
  inkFaint: "#8c7a60",
  border: "#3d301c",
  night: "#0b0805",
  live: "#ff4733",
  brassInk: "#241400",
};
const DISPLAY = '"Baloo 2", "Segoe UI", system-ui, sans-serif';
const SANS = '"Inter Variable", "Inter", "Segoe UI", system-ui, sans-serif';

export const RECAP_WIDTH = 1080;
export const RECAP_HEIGHT = 1350;

export interface RecapStat {
  label: string;
  value: string;
}
export interface RecapData {
  brand: string;
  date: string;
  title: string;
  subtitle: string;
  big: RecapStat[];
  small: RecapStat[];
  moment?: string;
  platforms: { name: string; color: string }[];
  footer: string;
}

/** Shrink text to maxWidth and leave the selected font in ctx.font. */
function fit(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  base: number,
  weight: number,
  family = DISPLAY,
  min = 14,
): number {
  let size = base;
  ctx.font = `${weight} ${size}px ${family}`;
  while (size > min && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  return size;
}

function trimToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let end = text.length;
  while (end > 1 && ctx.measureText(`${text.slice(0, end)}…`).width > maxWidth)
    end--;
  return `${text.slice(0, end).trimEnd()}…`;
}

/** Wrap within fixed bounds; truncate only when all lines cannot fit. */
function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  if (lines.length <= maxLines)
    return lines.map((line) => trimToWidth(ctx, line, maxWidth));

  const visible = lines.slice(0, maxLines);
  visible[maxLines - 1] = trimToWidth(
    ctx,
    lines.slice(maxLines - 1).join(" "),
    maxWidth,
  );
  return visible;
}

export function drawRecap(
  ctx: CanvasRenderingContext2D,
  r: RecapData,
  t: Translate,
): void {
  const W = RECAP_WIDTH;
  const H = RECAP_HEIGHT;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  const m = 48;
  const pw = W - m * 2;
  const ph = H - m * 2;
  ctx.fillStyle = C.night;
  ctx.fillRect(m + 12, m + 12, pw, ph);
  ctx.fillStyle = C.surface;
  ctx.fillRect(m, m, pw, ph);
  const px = m + 46;
  const pr = W - m - 46;
  const innerWidth = pr - px;
  ctx.textBaseline = "alphabetic";

  const heroBottom = 382;
  ctx.fillStyle = C.brass;
  ctx.fillRect(m, m, pw, heroBottom - m);
  ctx.fillStyle = C.live;
  ctx.beginPath();
  ctx.arc(px + 11, 108, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.brassInk;
  ctx.font = `800 36px ${DISPLAY}`;
  ctx.textAlign = "left";
  ctx.fillText(r.brand, px + 34, 120);
  ctx.font = `700 28px ${DISPLAY}`;
  ctx.textAlign = "right";
  const date = trimToWidth(ctx, r.date, 300);
  ctx.fillText(date, pr, 118);

  ctx.textAlign = "left";
  ctx.fillStyle = C.brassInk;
  const title = r.title.toUpperCase();
  const ts = fit(ctx, title, innerWidth, 86, 800, DISPLAY, 42);
  ctx.font = `800 ${ts}px ${DISPLAY}`;
  ctx.fillText(title, px, 238);
  ctx.fillStyle = "rgba(36, 20, 0, 0.72)";
  const ss = fit(ctx, r.subtitle, innerWidth, 32, 700, SANS, 20);
  ctx.font = `600 ${ss}px ${SANS}`;
  ctx.fillText(r.subtitle, px, 302);
  ctx.fillStyle = "rgba(36, 20, 0, 0.24)";
  ctx.fillRect(px, 338, innerWidth, 3);

  const big = r.big.slice(0, 2);
  const bigTop = 430;
  const bigHeight = 230;
  if (big.length) {
    const gap = big.length > 1 ? 46 : 0;
    const colW = (innerWidth - gap) / big.length;
    big.forEach((s, i) => {
      const cx = px + (colW + gap) * i;
      ctx.fillStyle = C.brass;
      const vs = fit(ctx, s.value, colW, 126, 800, DISPLAY, 62);
      ctx.font = `800 ${vs}px ${DISPLAY}`;
      ctx.fillText(s.value, cx, bigTop + 126);
      ctx.fillStyle = C.inkMuted;
      const ls = fit(ctx, s.label.toUpperCase(), colW, 27, 700, SANS, 17);
      ctx.font = `700 ${ls}px ${SANS}`;
      ctx.fillText(s.label.toUpperCase(), cx + 2, bigTop + 172);
    });
    if (big.length > 1) {
      ctx.fillStyle = C.border;
      ctx.fillRect(px + (innerWidth - 2) / 2, bigTop + 18, 2, 164);
    }
  }
  ctx.fillStyle = C.border;
  ctx.fillRect(px, bigTop + bigHeight, innerWidth, 2);

  const small = r.small.slice(0, 6);
  const smallTop = bigTop + bigHeight + 34;
  let smallBottom = smallTop;
  if (small.length) {
    const gap = 16;
    const columns = small.length > 4 ? 3 : 2;
    const bw = (innerWidth - gap * (columns - 1)) / columns;
    const bh = 108;
    small.forEach((s, i) => {
      const col = i % columns;
      const row = Math.floor(i / columns);
      const bx = px + col * (bw + gap);
      const by = smallTop + row * (bh + gap);
      ctx.fillStyle = C.surface2;
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = C.brass;
      const valueWidth = columns === 3 ? bw - 36 : bw * 0.42;
      const vs = fit(ctx, s.value, valueWidth, 48, 800, DISPLAY, 26);
      ctx.font = `800 ${vs}px ${DISPLAY}`;
      ctx.fillText(s.value, bx + 22, by + (columns === 3 ? 48 : 67));
      ctx.fillStyle = C.inkMuted;
      const label = s.label.toUpperCase();
      const labelWidth = columns === 3 ? bw - 44 : bw * 0.48;
      const ls = fit(ctx, label, labelWidth, 22, 700, SANS, 15);
      ctx.font = `700 ${ls}px ${SANS}`;
      ctx.textAlign = columns === 3 ? "left" : "right";
      ctx.fillText(
        trimToWidth(ctx, label, labelWidth),
        columns === 3 ? bx + 22 : bx + bw - 22,
        by + (columns === 3 ? 82 : 62),
      );
      ctx.textAlign = "left";
    });
    smallBottom =
      smallTop + Math.ceil(small.length / columns) * (bh + gap) - gap;
  }

  if (r.moment) {
    const y = Math.max(smallBottom + 30, 790);
    const bh = 156;
    ctx.fillStyle = C.surface2;
    ctx.fillRect(px, y, innerWidth, bh);
    ctx.fillStyle = C.brass;
    ctx.font = `800 21px ${SANS}`;
    ctx.fillText(t("analysis.recap.bestMoment").toUpperCase(), px + 24, y + 35);
    ctx.fillStyle = C.ink;
    let momentSize = 34;
    ctx.font = `700 ${momentSize}px ${DISPLAY}`;
    let lines = wrapLines(ctx, r.moment, innerWidth - 48, 3);
    while (lines.length > 2 && momentSize > 28) {
      momentSize -= 2;
      ctx.font = `700 ${momentSize}px ${DISPLAY}`;
      lines = wrapLines(ctx, r.moment, innerWidth - 48, 3);
    }
    lines.forEach((line, index) =>
      ctx.fillText(line, px + 24, y + 78 + index * 34),
    );
  }

  if (r.platforms.length) {
    const platformY = 1160;
    let cx = px;
    let row = 0;
    let drawn = 0;
    for (const [index, p] of r.platforms.entries()) {
      const fs = fit(ctx, p.name, 220, 24, 700, SANS, 16);
      ctx.font = `700 ${fs}px ${SANS}`;
      const name = trimToWidth(ctx, p.name, 220);
      const chipW = 30 + ctx.measureText(name).width + 34;
      if (cx + chipW > pr && cx > px) {
        if (row === 1) break;
        row = 1;
        cx = px;
      }
      // Reserve overflow-count width before adding the last visible platform chip.
      const hasMore = index < r.platforms.length - 1;
      if (row === 1 && hasMore && cx + chipW + 64 > pr) break;
      const cy = platformY + row * 44;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(cx + 10, cy, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.inkMuted;
      ctx.fillText(name, cx + 28, cy + 8);
      cx += chipW;
      drawn++;
    }
    if (drawn < r.platforms.length) {
      ctx.fillStyle = C.inkFaint;
      ctx.font = `700 23px ${SANS}`;
      ctx.fillText(
        `+${r.platforms.length - drawn}`,
        cx,
        platformY + row * 44 + 8,
      );
    }
  }

  ctx.textAlign = "center";
  ctx.fillStyle = C.inkFaint;
  const footerSize = fit(ctx, r.footer, innerWidth, 24, 600, SANS, 16);
  ctx.font = `600 ${footerSize}px ${SANS}`;
  ctx.fillText(r.footer, W / 2, H - m - 26);
}

export function recapToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to generate PNG"))),
      "image/png",
    ),
  );
}
