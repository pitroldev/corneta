// Recap pós-live: desenha um pôster quadrado (1080×1080) compartilhável a partir do relatório.
// Canvas 2D puro (sem dependência), no visual de pôster da Corneta. Copiar/baixar PNG.

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
};
const DISPLAY = '"Baloo 2", "Segoe UI", system-ui, sans-serif';
const SANS = '"Inter Variable", "Inter", "Segoe UI", system-ui, sans-serif';

export const RECAP_SIZE = 1080;

export interface RecapStat {
  label: string;
  value: string;
}
export interface RecapData {
  brand: string;
  date: string;
  title: string;
  subtitle: string;
  big: RecapStat[]; // até 2 números-herói
  small: RecapStat[]; // até 4 secundários
  moment?: string; // melhor momento
  platforms: { name: string; color: string }[];
  footer: string;
}

/** Reduz a fonte até o texto caber em maxWidth. Deixa ctx.font setado. */
function fit(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  base: number,
  weight: number,
  family = DISPLAY,
): number {
  let size = base;
  ctx.font = `${weight} ${size}px ${family}`;
  while (size > 14 && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  return size;
}

export function drawRecap(ctx: CanvasRenderingContext2D, r: RecapData): void {
  const W = RECAP_SIZE;
  const H = RECAP_SIZE;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // Painel com sombra dura (estilo pôster/quadrinho).
  const m = 52;
  const pw = W - m * 2;
  const ph = H - m * 2;
  ctx.fillStyle = C.night;
  ctx.fillRect(m + 14, m + 14, pw, ph);
  ctx.fillStyle = C.surface;
  ctx.fillRect(m, m, pw, ph);
  ctx.strokeStyle = C.brass;
  ctx.lineWidth = 6;
  ctx.strokeRect(m + 3, m + 3, pw - 6, ph - 6);

  const px = m + 56;
  const pr = W - m - 56;
  ctx.textBaseline = "alphabetic";

  // Header: 🔴 CORNETA  ·  data
  ctx.fillStyle = C.live;
  ctx.beginPath();
  ctx.arc(px + 13, 130, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.brass;
  ctx.font = `800 42px ${DISPLAY}`;
  ctx.textAlign = "left";
  ctx.fillText(r.brand, px + 38, 144);
  ctx.fillStyle = C.inkFaint;
  ctx.font = `700 34px ${DISPLAY}`;
  ctx.textAlign = "right";
  ctx.fillText(r.date, pr, 144);

  // Título + subtítulo
  ctx.textAlign = "left";
  ctx.fillStyle = C.ink;
  const ts = fit(ctx, r.title, pr - px, 78, 800);
  ctx.font = `800 ${ts}px ${DISPLAY}`;
  ctx.fillText(r.title, px, 244);
  ctx.fillStyle = C.inkMuted;
  const ss = fit(ctx, r.subtitle, pr - px, 30, 600, SANS);
  ctx.font = `600 ${ss}px ${SANS}`;
  ctx.fillText(r.subtitle, px, 292);

  let y = 350;

  // Heróis (até 2 colunas)
  const big = r.big.slice(0, 2);
  if (big.length) {
    const colW = (pr - px) / big.length;
    big.forEach((s, i) => {
      const cx = px + colW * i;
      ctx.fillStyle = C.brass;
      const vs = fit(ctx, s.value, colW - 24, 130, 800);
      ctx.font = `800 ${vs}px ${DISPLAY}`;
      ctx.fillText(s.value, cx, y + 116);
      ctx.fillStyle = C.inkMuted;
      ctx.font = `700 30px ${SANS}`;
      ctx.fillText(s.label.toUpperCase(), cx + 4, y + 158);
    });
    y += 206;
  }

  // Secundários (boxes, até 4)
  const small = r.small.slice(0, 4);
  if (small.length) {
    const gap = 18;
    const bw = (pr - px - gap * (small.length - 1)) / small.length;
    const bh = 140;
    small.forEach((s, i) => {
      const bx = px + (bw + gap) * i;
      ctx.fillStyle = C.surface2;
      ctx.fillRect(bx, y, bw, bh);
      ctx.strokeStyle = C.border;
      ctx.lineWidth = 2;
      ctx.strokeRect(bx + 1, y + 1, bw - 2, bh - 2);
      ctx.fillStyle = C.ink;
      const vs = fit(ctx, s.value, bw - 28, 54, 800);
      ctx.font = `800 ${vs}px ${DISPLAY}`;
      ctx.fillText(s.value, bx + 18, y + 72);
      ctx.fillStyle = C.inkFaint;
      ctx.font = `600 23px ${SANS}`;
      ctx.fillText(s.label.toUpperCase(), bx + 18, y + 110);
    });
    y += bh + 34;
  }

  // Melhor momento
  if (r.moment) {
    const bh = 112;
    ctx.fillStyle = C.surface2;
    ctx.fillRect(px, y, pr - px, bh);
    ctx.fillStyle = C.brass;
    ctx.fillRect(px, y, 8, bh);
    ctx.fillStyle = C.brass;
    ctx.font = `800 23px ${SANS}`;
    ctx.fillText("★ MELHOR MOMENTO", px + 28, y + 42);
    ctx.fillStyle = C.ink;
    const ms = fit(ctx, r.moment, pr - px - 56, 40, 700);
    ctx.font = `700 ${ms}px ${DISPLAY}`;
    ctx.fillText(r.moment, px + 28, y + 88);
    y += bh + 34;
  }

  // Plataformas (bolinha da marca + nome). Não vaza: se não couber, mostra "+N".
  if (r.platforms.length) {
    let cx = px;
    ctx.font = `700 30px ${SANS}`;
    let drawn = 0;
    for (const p of r.platforms) {
      const chipW = 34 + ctx.measureText(p.name).width + 42;
      if (cx + chipW > pr && drawn > 0) {
        ctx.fillStyle = C.inkFaint;
        ctx.fillText(`+${r.platforms.length - drawn}`, cx, y + 12);
        break;
      }
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(cx + 12, y + 2, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.inkMuted;
      ctx.fillText(p.name, cx + 34, y + 12);
      cx += chipW;
      drawn++;
    }
  }

  // Rodapé (marketing orgânico)
  ctx.textAlign = "center";
  ctx.fillStyle = C.inkFaint;
  ctx.font = `600 26px ${SANS}`;
  ctx.fillText(r.footer, W / 2, H - m - 38);
}

export function recapToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("falha ao gerar PNG"))), "image/png"),
  );
}
