// Desenha o slate "JÁ VOLTO" (estilo pôster/Corneta) num canvas e devolve o PNG
// em base64 (sem o prefixo data:). O backend faz loop dessa imagem no FFmpeg pra
// manter a live de pé quando o sinal do OBS cai.

export async function renderBrbSlatePng(): Promise<string | null> {
  if (typeof document === "undefined") return null;
  // Garante que a fonte de marca (Baloo 2) esteja carregada antes de rasterizar.
  try {
    await document.fonts?.ready;
  } catch {
    /* segue com fallback de fonte */
  }

  const W = 1280;
  const H = 720;
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

  // Kicker
  ctx.fillStyle = "#ffb323";
  ctx.font = '700 34px "Baloo 2", "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("CORNETA · MULTI-STREAM", W / 2, H / 2 - 128);

  // Bloco de latão (marca-texto) levemente inclinado, com a sombra dura.
  ctx.save();
  ctx.translate(W / 2, H / 2 + 6);
  ctx.rotate(-0.03);
  ctx.fillStyle = "#0b0805";
  ctx.fillRect(-462, -82 + 10, 924, 168); // sombra (offset)
  ctx.fillStyle = "#ffb323";
  ctx.fillRect(-470, -82, 924, 168);
  // "JÁ VOLTO" em tinta escura sobre o latão
  ctx.fillStyle = "#2a1c00";
  ctx.font = '800 132px "Baloo 2", "Segoe UI", system-ui, sans-serif';
  ctx.fillText("JÁ VOLTO", 0, 6);
  ctx.restore();

  // Subtítulo
  ctx.fillStyle = "#c6b69b";
  ctx.font = '600 30px "Inter", "Segoe UI", system-ui, sans-serif';
  ctx.fillText("já já tô de volta — segura a corneta 📣", W / 2, H / 2 + 168);

  const url = c.toDataURL("image/png");
  return url.split(",")[1] ?? null;
}
