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
  memorySeries,
  bitrateSeries,
  viewerSeries,
  viewerSeriesFor,
  hasChat,
  type ReportAnalysis,
} from "../report";
import type { SessionData } from "../types";
import type { I18n, MessageKey } from "../i18n";

/** Este módulo não é componente: não pode chamar hook. O idioma entra por
 *  parâmetro — quem chama é a tela, que já tem o contexto. */
export type ReportI18n = Pick<I18n, "locale" | "t" | "fmt">;

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

const platColor = (id: string) =>
  PLATFORMS[id as keyof typeof PLATFORMS]?.color ?? "#c98a00";

// A CHAVE é enum do meta da sessão; só o rótulo é texto de tela.
const MODE_KEY: Record<string, MessageKey> = {
  "per-platform": "reports.mode.perPlatform",
  passthrough: "reports.mode.passthrough",
  hybrid: "reports.mode.hybrid",
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
.verdict b{display:block;font-size:17px;margin-bottom:3px;overflow-wrap:anywhere}
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
.win{border:1px solid var(--line);border-left:4px solid var(--warn);border-radius:8px;padding:10px 13px;margin-bottom:8px;background:var(--card);overflow-wrap:anywhere}
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

export function reportHtml(
  d: SessionData,
  a: ReportAnalysis,
  i18n: ReportI18n,
): string {
  const { t, fmt, locale } = i18n;
  const num = fmt.num;
  const start = d.meta.startedAt;
  // `ms`, não `t`: `t` agora é a tradução.
  const rel = (ms: number) => {
    const s = Math.max(0, Math.round((ms - start) / 1000));
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

  const modeKey = MODE_KEY[d.meta.mode];
  const title = t("reports.detail.heading", { date: fmt.date(start) });
  const sub = [
    fmt.dur(d.meta.durationSec),
    `${fmt.time(start)}${d.meta.endedAt ? `–${fmt.time(d.meta.endedAt)}` : ""}`,
    d.meta.platforms.map((p) => p.name).join(", "),
    t("reports.detail.mode", {
      mode: modeKey ? t(modeKey) : d.meta.mode,
    }),
  ]
    .filter(Boolean)
    .join(" · ");

  // --- Números ---
  const stats: [string, string][] = [];
  if (a.viewers.hasData) {
    stats.push([t("reports.stat.peakViewers"), num(a.viewers.peak)]);
    stats.push([t("reports.stat.avg"), num(a.viewers.avg)]);
  }
  const seg = a.byChannel.followersGained;
  if (seg != null && seg !== 0)
    stats.push([
      t(
        a.byChannel.followersNet
          ? "reports.stat.followersNet"
          : "reports.stat.newFollowers",
      ),
      `${seg > 0 ? "+" : ""}${num(seg)}`,
    ]);
  if (a.alerts.subs > 0)
    stats.push([t("reports.stat.subs"), String(a.alerts.subs)]);
  if (a.alerts.bits > 0)
    stats.push([t("reports.stat.bits"), num(Math.round(a.alerts.bits))]);
  if (a.alerts.raids > 0)
    stats.push([
      t("reports.stat.raids"),
      `${a.alerts.raids} · +${a.alerts.raidViewers}`,
    ]);
  if (a.chat.hasData)
    stats.push([t("reports.stat.messages"), num(a.chat.total)]);
  if (a.maxCpu != null)
    stats.push([t("reports.stat.maxCpu"), `${Math.round(a.maxCpu)}%`]);

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
      ? `<section><h2>${esc(t("reports.channels.title"))}</h2><div class="card"><table>
<thead><tr><th>${esc(t("reports.html.table.channel"))}</th><th class="n">${esc(t("reports.viewers.peak"))}</th><th class="n">${esc(t("reports.stat.avg"))}</th><th class="n">${esc(t("reports.html.table.chat"))}</th><th class="n">${esc(t("reports.html.table.followers"))}</th><th>${esc(t("reports.html.table.share"))}</th></tr></thead>
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
            ? `<p class="note">${esc(t("reports.html.followersNote"))}</p>`
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
        : [
            {
              label: t("reports.viewers.series"),
              color: "#1e7a4d",
              values: viewerSeries(d),
            },
          ];
    partes.push(
      `<section><h2>${esc(t("reports.html.viewers.title"))}</h2><div class="card">${chart(
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
      `<section><h2>${esc(t("reports.chat.title"))}</h2><div class="card">${chart(
        [
          {
            label: t("reports.chat.series"),
            color: "#c98a00",
            values: chatRateSeries(d),
          },
        ],
        n,
        { xLabel: eixoAmostras },
      )}</div></section>`,
    );

  if (n > 1 && d.meta.platforms.length)
    partes.push(
      `<section><h2>${esc(t("reports.bitrate.title"))}</h2><div class="card">${chart(
        d.meta.platforms.map((p) => ({
          label: p.name,
          color: platColor(p.platformId),
          values: bitrateSeries(d, p.id).map((v) =>
            v == null ? null : v / 1000,
          ),
        })),
        n,
        { xLabel: eixoAmostras, fmt: (v) => fmt.dec(v, 1) },
      )}</div></section>`,
    );

  const cpu = cpuSeries(d);
  const gpu = gpuSeries(d);
  const memory = memorySeries(d);
  if (
    n > 1 &&
    [cpu, gpu, memory].some((series) => series.some((value) => value != null))
  )
    partes.push(
      `<section><h2>${esc(t("reports.machine.title"))}</h2><div class="card">${chart(
        [
          { label: "CPU", color: "#c0392b", values: cpu },
          ...(gpu.some((v) => v != null)
            ? [{ label: "GPU", color: "#2a6fb5", values: gpu }]
            : []),
          ...(memory.some((v) => v != null)
            ? [
                {
                  label: t("reports.machine.memory"),
                  color: "#7454b3",
                  values: memory,
                },
              ]
            : []),
        ],
        n,
        { xLabel: eixoAmostras, yMax: 100, refLine: 92 },
      )}</div></section>`,
    );

  // --- Momentos, trechos, eventos ---
  const momentos = a.highlights.length
    ? `<section><h2>${esc(t("reports.html.highlights.title"))}</h2><div class="card"><ul class="tl">${a.highlights
        .map(
          (h) =>
            `<li><span class="t">${esc(rel(h.t))}</span><span class="lbl">${esc(h.reason)}</span></li>`,
        )
        .join(
          "",
        )}</ul><p class="note">${esc(t("reports.html.highlights.note"))}</p></div></section>`
    : "";

  const trechos = a.windows.length
    ? `<section><h2>${esc(t("reports.windows.title"))}</h2>${a.windows
        .map(
          (w) => `<div class="win"><span class="t">${esc(rel(w.tStart))}</span>
 · ${w.durationSec}s · <b>${esc(w.cause)}</b> · ${esc(
   t(`reports.technical.incidents.confidence.${w.confidence}` as MessageKey),
 )}
${w.signals.length ? `<div class="sig">${esc(w.signals.join(" · "))}</div>` : ""}
<div class="adv">→ ${esc(w.advice)}</div></div>`,
        )
        .join("")}</section>`
    : "";

  const eventos = `<section><h2>${esc(t("reports.events.title"))}</h2><div class="card"><ul class="tl">${a.events
    .map(
      (e) =>
        `<li><span class="t">${esc(rel(e.t))}</span><span class="lbl">${esc(e.label)}</span></li>`,
    )
    .join("")}</ul></div></section>`;

  const verdictClass = a.verdict.tone;

  return `<!doctype html>
<html lang="${esc(locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(t("reports.html.docTitle", { title }))}</title>
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
<span class="tag">${esc(t("reports.html.tag"))}</span>
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

<footer>${esc(t("reports.html.footer", { date: fmt.date(Date.now()) }))}</footer>
</div>
</body>
</html>`;
}
