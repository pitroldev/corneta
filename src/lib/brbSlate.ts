// Desenha o slate do "JÁ VOLTO" (estilo pôster/Corneta) num canvas e devolve o
// PNG em base64 (sem o prefixo data:). O backend faz loop dessa imagem no FFmpeg
// pra manter a live de pé quando o sinal do OBS cai.
//
// O texto sai do dicionário porque este cartão vai AO AR: quem lê é o PÚBLICO do
// streamer, não ele. Um streamer gringo com "JÁ VOLTO" na tela seria a frase em
// português mais visível do produto inteiro.
import type { Locale } from "./i18n/locale";
import type { MessageKey } from "./i18n/pt";

type Translate = (key: MessageKey) => string;

const W = 1280;
const H = 720;
/** Largura útil do bloco de latão, com respiro dos dois lados. */
const BLOCK_W = 924;
const TITLE_MAX_PX = 132;

/** Assinatura do PNG gerado — o backend só reencoda quando ela muda.
 *
 *  O IDIOMA entra na assinatura: sem isso, quem troca pra inglês continua com o
 *  cartão em português no disco (e no ar) até o desenho mudar de versão. */
export const brbSlateGeneration = (locale: Locale) =>
  `corneta-slate-v2-${locale}`;

/** Maior tamanho de fonte em que o texto ainda cabe no bloco.
 *
 *  "JÁ VOLTO" tem 8 caracteres e "BE RIGHT BACK" tem 13 — no tamanho fixo o
 *  inglês vazava pra fora do latão. Mede e encolhe só o quanto precisar. */
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
  // Garante que a fonte de marca (Baloo 2) esteja carregada antes de rasterizar.
  try {
    await document.fonts?.ready;
  } catch {
    /* segue com fallback de fonte */
  }

  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  if (!ctx) return null;

  // Fundo (papel escuro) + textura de meio-tom sutil.
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

  // Kicker — marca, igual nos dois idiomas.
  ctx.fillStyle = "#ffb323";
  ctx.font = '700 34px "Baloo 2", "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("CORNETA · MULTI-STREAM", W / 2, H / 2 - 128);

  // Bloco de latão (marca-texto) levemente inclinado, com a sombra dura.
  const title = t("brb.slate.title");
  ctx.save();
  ctx.translate(W / 2, H / 2 + 6);
  ctx.rotate(-0.03);
  ctx.fillStyle = "#0b0805";
  ctx.fillRect(-462, -82 + 10, BLOCK_W, 168); // sombra (offset)
  ctx.fillStyle = "#ffb323";
  ctx.fillRect(-470, -82, BLOCK_W, 168);
  // Título em tinta escura sobre o latão.
  ctx.fillStyle = "#2a1c00";
  ctx.font = `800 ${fitFont(ctx, title, TITLE_MAX_PX, BLOCK_W - 96)}px "Baloo 2", "Segoe UI", system-ui, sans-serif`;
  ctx.fillText(title, 0, 6);
  ctx.restore();

  // Subtítulo
  ctx.fillStyle = "#c6b69b";
  ctx.font = '600 30px "Inter", "Segoe UI", system-ui, sans-serif';
  ctx.fillText(t("brb.slate.subtitle"), W / 2, H / 2 + 168);

  const url = c.toDataURL("image/png");
  return url.split(",")[1] ?? null;
}
