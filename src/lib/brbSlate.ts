import type { Locale } from "./i18n/locale";
import type { MessageKey } from "./i18n/pt";

type Translate = (key: MessageKey) => string;

const W = 1280;
const H = 720;
const BLOCK_W = 924;
const TITLE_MAX_PX = 132;

/** Include locale in the generation signature so changing language replaces the on-air PNG. */
export const brbSlateGeneration = (locale: Locale) =>
  `corneta-slate-v2-${locale}`;

function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxPx: number,
  maxWidth: number,
): number {
  let px = maxPx;
  for (; px > 40; px -= 2) {
    ctx.font = `800 ${px}px "Baloo 2", "Segoe UI", system-ui, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
  }
  return px;
}

export async function renderBrbSlatePng(t: Translate): Promise<string | null> {
  if (typeof document === "undefined") return null;
  // Wait for the brand font before rasterizing.
  try {
    await document.fonts?.ready;
  } catch {
    /* Use the fallback font if loading fails. */
  }

  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#14100a";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255,179,35,0.05)";
  for (let y = 0; y < H; y += 22) {
    for (let x = 0; x < W; x += 22) {
      ctx.beginPath();
      ctx.arc(x, y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = "#ffb323";
  ctx.font = '700 34px "Baloo 2", "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("CORNETA · MULTI-STREAM", W / 2, H / 2 - 128);

  const title = t("brb.slate.title");
  ctx.save();
  ctx.translate(W / 2, H / 2 + 6);
  ctx.rotate(-0.03);
  ctx.fillStyle = "#0b0805";
  ctx.fillRect(-462, -82 + 10, BLOCK_W, 168);
  ctx.fillStyle = "#ffb323";
  ctx.fillRect(-470, -82, BLOCK_W, 168);
  ctx.fillStyle = "#2a1c00";
  ctx.font = `800 ${fitFont(ctx, title, TITLE_MAX_PX, BLOCK_W - 96)}px "Baloo 2", "Segoe UI", system-ui, sans-serif`;
  ctx.fillText(title, 0, 6);
  ctx.restore();

  ctx.fillStyle = "#c6b69b";
  ctx.font = '600 30px "Inter", "Segoe UI", system-ui, sans-serif';
  ctx.fillText(t("brb.slate.subtitle"), W / 2, H / 2 + 168);

  const url = c.toDataURL("image/png");
  return url.split(",")[1] ?? null;
}
