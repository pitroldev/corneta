// ============================================================
// Relatório em HTML autocontido: um arquivo que abre em qualquer navegador, sem
// internet e sem a Corneta instalada — e que vira PDF pelo "Imprimir → Salvar".
//
// DUAS RESTRIÇÕES que moldam tudo aqui:
//  • zero recurso externo (fonte, CDN, imagem): o arquivo vai por WhatsApp/e-mail e
//    precisa abrir igual na máquina de quem recebeu, offline. Os gráficos já são SVG,
//    então saem inline; a tipografia é a pilha do sistema.
//  • fundo CLARO, ao contrário do app: o navegador descarta cor de fundo ao imprimir
//    por padrão, e um relatório escuro sairia com texto claro sobre papel branco.
// ============================================================
import { PLATFORMS } from "../platforms";
import { buildPath, peakOf, xAt, type PathGeometry } from "../chartPath";
import {
  chatRateSeries,
  cpuSeries,
  gpuSeries,
  bitrateSeries,
  viewerSeries,
  viewerSeriesFor,
  hasChat,
  type ReportAnalysis,
} from "../report";
import type { SessionData } from "../types";

const esc = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]!,
  );

const num = (v: number) => v.toLocaleString("pt-BR");
const platColor = (id: string) =>
  PLATFORMS[id as keyof typeof PLATFORMS]?.color ?? "#c98a00";

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
const fmtTime = (ms: number) =>
  new Date(ms).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
function fmtDur(sec: number): string {
  const total = Math.round(sec / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m}min`;
}

const MODE_LABEL: Record<string, string> = {
  "per-platform": "Caprichado",
  passthrough: "Na lata",
  hybrid: "Esperto",
};

// ---------------------------------------------------------------------------
// Gráfico
// ---------------------------------------------------------------------------

interface Serie {
  label: string;
  color: string;
  values: (number | null)[];
}

/** SVG de linhas com eixo Y de 3 marcas, legenda e (opcional) linha de referência. */
function chart(
  series: Serie[],
  n: number,
  opts: {
    /** Rótulo do eixo X pra amostra `i`. Cada gráfico tem sua própria escala de
     *  tempo (máquina a ~2s, audiência a ~30s), então vem de fora. */
    xLabel: (i: number) => string;
    yMax?: number;
    fmt?: (v: number) => string;
    refLine?: number;
  },
): string {
  const usable = series.filter((s) => s.values.some((v) => v != null));
  if (!usable.length || n < 2) return "";
  const W = 720;
  const H = 190;
  const g: PathGeometry = {
    n,
    yMax: opts.yMax ?? peakOf(usable),
    padL: 46,
    padT: 10,
    innerW: W - 46 - 10,
    innerH: H - 10 - 22,
  };
  const fmt = opts.fmt ?? ((v: number) => String(Math.round(v)));
  const y = (v: number) =>
    g.padT + (1 - Math.min(v, g.yMax) / g.yMax) * g.innerH;

  const grid = [1, 0.5, 0]
    .map((f) => g.yMax * f)
    .map(
      (v) =>
        `<line x1="${g.padL}" y1="${y(v).toFixed(1)}" x2="${W - 10}" y2="${y(v).toFixed(1)}" class="gl"/>` +
        `<text x="${g.padL - 6}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end" class="ax">${esc(fmt(v))}</text>`,
    )
    .join("");

  const ref =
    opts.refLine != null && opts.refLine <= g.yMax
      ? `<line x1="${g.padL}" y1="${y(opts.refLine).toFixed(1)}" x2="${W - 10}" y2="${y(opts.refLine).toFixed(1)}" class="ref"/>`
      : "";

  const paths = usable
    .map(
      (s) =>
        `<path d="${buildPath(s.values, g)}" fill="none" stroke="${esc(s.color)}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`,
    )
    .join("");

  // 4 marcas no eixo do tempo (início · 1/3 · 2/3 · fim), ancoradas pra não vazar.
  const ticks = [
    ...new Set([0, 1 / 3, 2 / 3, 1].map((f) => Math.round(f * (n - 1)))),
  ];
  const xLabels = ticks
    .map((i, k) => {
      const anchor =
        k === 0 ? "start" : k === ticks.length - 1 ? "end" : "middle";
      return `<text x="${xAt(i, g).toFixed(1)}" y="${H - 6}" text-anchor="${anchor}" class="ax">${esc(
        opts.xLabel(i),
      )}</text>`;
    })
    .join("");

  const legend = usable
    .map(
      (s) =>
        `<span class="lg"><i style="background:${esc(s.color)}"></i>${esc(s.label)}</span>`,
    )
    .join("");

  return `<svg viewBox="0 0 ${W} ${H}" class="ch" role="img">${grid}${ref}${paths}${xLabels}</svg><div class="lgs">${legend}</div>`;
}

// ---------------------------------------------------------------------------

const CSS = `
:root{--brass:#c98a00;--ink:#191207;--muted:#6b5c45;--line:#e4dccd;--paper:#fffdf8;--card:#fff;--bad:#c0392b;--warn:#b7791f;--ok:#1e7a4d}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.wrap{max-width:820px;margin:0 auto;padding:36px 26px 60px}
h1{font-size:30px;line-height:1.1;margin:0 0 4px;letter-spacing:-.02em}
h2{font-size:12px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);margin:0 0 10px}
.sub{color:var(--muted);margin:0 0 26px;font-size:14px}
.tag{display:inline-block;background:var(--brass);color:#2a1c00;font-weight:800;font-size:11px;letter-spacing:.12em;text-transform:uppercase;padding:4px 9px;border-radius:4px;margin-bottom:14px}
section{margin:0 0 26px;break-inside:avoid}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px}
.verdict{border-left-width:5px;border-left-style:solid}
.verdict.ok{border-left-color:var(--ok)}.verdict.warn{border-left-color:var(--warn)}.verdict.bad{border-left-color:var(--bad)}
.verdict b{display:block;font-size:17px;margin-bottom:3px}
.verdict p{margin:0;color:var(--muted);font-size:14px}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.stat{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.stat b{display:block;font-size:24px;font-variant-numeric:tabular-nums;line-height:1.1}
.stat span{display:block;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-top:3px}
table{width:100%;border-collapse:collapse;font-size:14px}
th{text-align:left;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:700;padding:0 8px 7px 0;border-bottom:1px solid var(--line)}
td{padding:8px 8px 8px 0;border-bottom:1px solid var(--line);vertical-align:middle}
td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
tr:last-child td{border-bottom:0}
.dot{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:7px;vertical-align:baseline}
.bar{height:6px;border-radius:3px;background:var(--line);overflow:hidden;min-width:70px}
.bar i{display:block;height:100%;border-radius:3px}
.ch{width:100%;height:auto;display:block}
.gl{stroke:#eee5d6;stroke-width:1}
.ref{stroke:var(--bad);stroke-width:1;stroke-dasharray:5 4;opacity:.7}
.ax{fill:var(--muted);font-size:10px}
.lgs{display:flex;flex-wrap:wrap;gap:14px;margin-top:6px}
.lg{font-size:12px;font-weight:600;color:var(--muted);display:inline-flex;align-items:center;gap:6px}
.lg i{width:10px;height:10px;border-radius:2px;display:inline-block}
.t{font-variant-numeric:tabular-nums;font-weight:700;white-space:nowrap}
.win{border:1px solid var(--line);border-left:4px solid var(--warn);border-radius:8px;padding:10px 13px;margin-bottom:8px;background:var(--card)}
.win .sig{color:var(--muted);font-size:13px;margin-top:2px}
.win .adv{font-size:13px;margin-top:5px}
ul.tl{list-style:none;margin:0;padding:0;font-size:13.5px}
ul.tl li{display:flex;gap:10px;padding:3px 0}
ul.tl .lbl{color:var(--muted)}
footer{margin-top:34px;padding-top:16px;border-top:1px solid var(--line);font-size:12px;color:var(--muted)}
.note{font-size:12px;color:var(--muted);margin:9px 0 0}
@media print{
  /* Uma live longa tem dezenas de eventos: cortar um card no meio da página é o
     defeito clássico de exportar HTML pra PDF. */
  .wrap{padding:0}
  section,.win,.card,.stat{break-inside:avoid}
  @page{margin:14mm}
}
@media (max-width:560px){.stats{grid-template-columns:repeat(2,1fr)}}
`;

// ---------------------------------------------------------------------------

export function reportHtml(d: SessionData, a: ReportAnalysis): string {
  const start = d.meta.startedAt;
  const rel = (t: number) => {
    const s = Math.max(0, Math.round((t - start) / 1000));
    const h = Math.floor(s / 3600);
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  };
  const n = d.samples.length;
  const vN = d.viewerSamples.length;
  const eixoAmostras = (i: number) =>
    rel(d.samples[Math.min(i, n - 1)]?.t ?? start);
  const eixoAudiencia = (i: number) =>
    rel(d.viewerSamples[Math.min(i, vN - 1)]?.t ?? start);

  const title = `Live de ${fmtDate(start)}`;
  const sub = [
    fmtDur(d.meta.durationSec),
    `${fmtTime(start)}${d.meta.endedAt ? `–${fmtTime(d.meta.endedAt)}` : ""}`,
    d.meta.platforms.map((p) => p.name).join(", "),
    `modo ${MODE_LABEL[d.meta.mode] ?? d.meta.mode}`,
  ]
    .filter(Boolean)
    .join(" · ");

  // --- Números ---
  const stats: [string, string][] = [];
  if (a.viewers.hasData) {
    stats.push(["Pico de viewers", num(a.viewers.peak)]);
    stats.push(["Média", num(a.viewers.avg)]);
  }
  const seg = a.byChannel.followersGained;
  if (seg != null && seg !== 0)
    stats.push([
      a.byChannel.followersNet ? "Seguidores (líquido)" : "Novos seguidores",
      `${seg > 0 ? "+" : ""}${num(seg)}`,
    ]);
  if (a.alerts.subs > 0) stats.push(["Inscrições", String(a.alerts.subs)]);
  if (a.alerts.bits > 0) stats.push(["Bits", num(Math.round(a.alerts.bits))]);
  if (a.alerts.raids > 0)
    stats.push(["Raids", `${a.alerts.raids} · +${a.alerts.raidViewers}`]);
  if (a.chat.hasData) stats.push(["Mensagens", num(a.chat.total)]);
  if (a.maxCpu != null) stats.push(["CPU máx.", `${Math.round(a.maxCpu)}%`]);

  const statsHtml = stats.length
    ? `<section class="stats">${stats
        .map(
          ([k, v]) =>
            `<div class="stat"><b>${esc(v)}</b><span>${esc(k)}</span></div>`,
        )
        .join("")}</section>`
    : "";

  // --- Público por canal ---
  const canais = a.byChannel.channels;
  const canaisHtml =
    canais.length > 1
      ? `<section><h2>Público por canal</h2><div class="card"><table>
<thead><tr><th>Canal</th><th class="n">Pico</th><th class="n">Média</th><th class="n">Chat</th><th class="n">Seguidores</th><th>Fatia</th></tr></thead>
<tbody>${canais
          .map((c) => {
            const cor = platColor(c.platform);
            const fatia =
              c.sharePct == null
                ? "—"
                : `<div class="bar"><i style="width:${Math.max(c.sharePct, 2)}%;background:${esc(cor)}"></i></div>`;
            const f =
              c.followers.hasData && c.followers.gained !== 0
                ? `${c.followers.gained > 0 ? "+" : ""}${num(c.followers.gained)}`
                : "—";
            return `<tr>
<td><span class="dot" style="background:${esc(cor)}"></span>${esc(c.source)}</td>
<td class="n">${c.viewers.hasData ? num(c.viewers.peak) : "—"}</td>
<td class="n">${c.viewers.hasData ? num(c.viewers.avg) : "—"}</td>
<td class="n">${c.chat.hasData && c.chat.total ? num(c.chat.total) : "—"}</td>
<td class="n">${f}</td>
<td>${fatia}</td></tr>`;
          })
          .join("")}</tbody></table>${
          a.byChannel.followersNet
            ? `<p class="note">Seguidores vêm do contador da plataforma: é o número líquido (quem deixou de seguir subtrai).</p>`
            : ""
        }</div></section>`
      : "";

  // --- Gráficos ---
  const partes: string[] = [];

  if (a.viewers.hasData && vN > 1) {
    const comAud = canais.filter((c) => c.viewers.hasData);
    const series: Serie[] =
      comAud.length > 1
        ? comAud.map((c) => ({
            label: c.source,
            color: platColor(c.platform),
            values: viewerSeriesFor(d, c.key),
          }))
        : [{ label: "Assistindo", color: "#1e7a4d", values: viewerSeries(d) }];
    partes.push(
      `<section><h2>Audiência ao vivo</h2><div class="card">${chart(
        series,
        vN,
        {
          xLabel: eixoAudiencia,
        },
      )}</div></section>`,
    );
  }

  if (hasChat(d) && n > 1)
    partes.push(
      `<section><h2>Atividade do chat (msgs/min)</h2><div class="card">${chart(
        [{ label: "msgs/min", color: "#c98a00", values: chatRateSeries(d) }],
        n,
        { xLabel: eixoAmostras },
      )}</div></section>`,
    );

  if (n > 1 && d.meta.platforms.length)
    partes.push(
      `<section><h2>Bitrate por plataforma (Mbps)</h2><div class="card">${chart(
        d.meta.platforms.map((p) => ({
          label: p.name,
          color: platColor(p.platformId),
          values: bitrateSeries(d, p.id).map((v) =>
            v == null ? null : v / 1000,
          ),
        })),
        n,
        { xLabel: eixoAmostras, fmt: (v) => v.toFixed(1).replace(".", ",") },
      )}</div></section>`,
    );

  const gpu = gpuSeries(d);
  if (n > 1 && a.maxCpu != null)
    partes.push(
      `<section><h2>Carga da máquina (%)</h2><div class="card">${chart(
        [
          { label: "CPU", color: "#c0392b", values: cpuSeries(d) },
          ...(gpu.some((v) => v != null)
            ? [{ label: "GPU", color: "#2a6fb5", values: gpu }]
            : []),
        ],
        n,
        { xLabel: eixoAmostras, yMax: 100, refLine: 92 },
      )}</div></section>`,
    );

  // --- Momentos, trechos, eventos ---
  const momentos = a.highlights.length
    ? `<section><h2>Momentos de destaque</h2><div class="card"><ul class="tl">${a.highlights
        .map(
          (h) =>
            `<li><span class="t">${esc(rel(h.t))}</span><span class="lbl">${esc(h.reason)}</span></li>`,
        )
        .join(
          "",
        )}</ul><p class="note">Os tempos contam do início da live — use pra achar o trecho na gravação.</p></div></section>`
    : "";

  const trechos = a.windows.length
    ? `<section><h2>Trechos que deram problema</h2>${a.windows
        .map(
          (w) => `<div class="win"><span class="t">${esc(rel(w.tStart))}</span>
 · ${w.durationSec}s · <b>${esc(w.cause)}</b>
${w.signals.length ? `<div class="sig">${esc(w.signals.join(" · "))}</div>` : ""}
<div class="adv">→ ${esc(w.advice)}</div></div>`,
        )
        .join("")}</section>`
    : "";

  const eventos = `<section><h2>Eventos</h2><div class="card"><ul class="tl">${a.events
    .map(
      (e) =>
        `<li><span class="t">${esc(rel(e.t))}</span><span class="lbl">${esc(e.label)}</span></li>`,
    )
    .join("")}</ul></div></section>`;

  const verdictClass = a.verdict.tone;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — Corneta</title>
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
<span class="tag">Corneta · relatório da live</span>
<h1>${esc(title)}</h1>
<p class="sub">${esc(sub)}</p>

<section class="card verdict ${verdictClass}">
<b>${esc(a.verdict.title)}</b>
<p>${esc(a.verdict.detail)}</p>
</section>

${statsHtml}
${canaisHtml}
${partes.join("\n")}
${momentos}
${trechos}
${eventos}

<footer>Gerado pela Corneta em ${esc(fmtDate(Date.now()))} · multistream que roda no seu PC</footer>
</div>
</body>
</html>`;
}
