// ============================================================
// CSV — primitiva de escrita + as duas tabelas que o relatório exporta.
// Funções puras: recebem dado e devolvem string. Quem salva é o adapter.
// ============================================================
import type { SessionData, SessionMeta } from "../types";
import {
  chatRateSeries,
  chatRateSeriesFor,
  cpuSeries,
  gpuSeries,
  type ReportAnalysis,
} from "../report";

export type Cell = string | number | null | undefined;

/** BOM de UTF-8. Sem ele o Excel em português lê o arquivo como ANSI e "audiência"
 *  chega como "audiÃªncia".
 *
 *  Montado pelo código de propósito: U+FEFF é INVISÍVEL no editor. Escrito direto no
 *  fonte, some numa cópia distraída e ninguém vê o que quebrou. */
export const BOM = String.fromCharCode(0xfeff);

/** Ponto e vírgula, não vírgula: no Excel configurado em pt-BR o separador de lista
 *  é `;`, e com `,` a planilha inteira cai numa coluna só. Combina com o decimal
 *  vírgula, que é o que o mesmo Excel espera pra reconhecer número. */
const SEP = ";";

/** Caracteres que fazem o Excel/Sheets tratar a célula como FÓRMULA ao abrir.
 *  Nome de canal vem da config do usuário, então um rótulo `=...` viraria execução
 *  na planilha de quem recebeu o relatório. O apóstrofo à frente neutraliza. */
const FORMULA_START = /^[=+\-@\t\r]/;

function escapeText(s: string): string {
  const guarded = FORMULA_START.test(s) ? `'${s}` : s;
  return /["\n\r;]/.test(guarded)
    ? `"${guarded.replace(/"/g, '""')}"`
    : guarded;
}

/** Número em pt-BR (decimal vírgula). Só texto passa pelo escudo de fórmula —
 *  senão todo valor negativo viraria texto com apóstrofo. */
function cell(v: Cell): string {
  if (v == null) return "";
  if (typeof v === "number")
    return Number.isFinite(v) ? String(v).replace(".", ",") : "";
  return escapeText(v);
}

/** Linhas → CSV com BOM. CRLF porque é o que o Excel no Windows espera. */
export function toCsv(rows: Cell[][]): string {
  return BOM + rows.map((r) => r.map(cell).join(SEP)).join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------------
// Tabela 1 — histórico: UMA LINHA POR LIVE
// ---------------------------------------------------------------------------

/** Uma live já analisada, pronta pra virar linha. */
export interface HistoryRow {
  meta: SessionMeta;
  analysis: ReportAnalysis;
}

const isoDate = (ms: number) => {
  const d = new Date(ms);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const clock = (ms: number) => {
  const d = new Date(ms);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};

const HISTORY_HEADER = [
  "data",
  "inicio",
  "duracao_min",
  "plataformas",
  "modo",
  "pico_audiencia",
  "media_audiencia",
  "seguidores_ganhos",
  "mensagens_chat",
  "inscricoes",
  "bits",
  "raids",
  "viewers_de_raid",
  "trechos_com_problema",
  "veredito",
];

/** Histórico pra planilha: a evolução entre lives, que é pra isso que serve planilha.
 *  Série de 2s aqui não ajudaria ninguém — essa é a outra tabela. */
export function historyCsv(rows: HistoryRow[]): string {
  const body = rows.map(({ meta, analysis: a }) => [
    isoDate(meta.startedAt),
    clock(meta.startedAt),
    Math.round(meta.durationSec / 60),
    meta.platforms.map((p) => p.name).join(", "),
    meta.mode,
    a.viewers.hasData ? a.viewers.peak : null,
    a.viewers.hasData ? a.viewers.avg : null,
    a.byChannel.followersGained,
    a.chat.hasData ? a.chat.total : null,
    a.alerts.subs,
    Math.round(a.alerts.bits),
    a.alerts.raids,
    a.alerts.raidViewers,
    a.windows.length,
    a.verdict.title,
  ]);
  return toCsv([HISTORY_HEADER, ...body]);
}

// ---------------------------------------------------------------------------
// Tabela 2 — série temporal de UMA live (eixo das amostras, ~2s)
// ---------------------------------------------------------------------------

/** Série da live no eixo das amostras.
 *
 *  Audiência e seguidores são amostrados a cada ~30s, num eixo diferente. Em vez de
 *  ficarem de fora, entram como ÚLTIMO VALOR CONHECIDO — e o nome da coluna diz isso,
 *  pra ninguém ler um degrau de 30s como se fosse medição instantânea. */
export function seriesCsv(d: SessionData, a: ReportAnalysis): string {
  const canais = a.byChannel.channels;
  const alvos = a.perTarget;
  const header = [
    "tempo_rel_s",
    "horario",
    "cpu_pct",
    "gpu_pct",
    "obs_render_ms",
    "obs_congestao_pct",
    "chat_por_min",
    ...canais.map((c) => `chat_por_min_${c.source}`),
    ...alvos.flatMap((t) => [
      `bitrate_kbps_${t.name}`,
      `estado_${t.name}`,
      `quedas_${t.name}`,
    ]),
    ...canais
      .filter((c) => c.viewers.hasData)
      .map((c) => `assistindo_ultimo_conhecido_${c.source}`),
  ];

  const cpu = cpuSeries(d);
  const gpu = gpuSeries(d);
  const chat = chatRateSeries(d);
  const chatPorCanal = canais.map((c) => chatRateSeriesFor(d, c.key));

  // Audiência por canal com um ponteiro que anda junto: as duas séries estão em ordem
  // de tempo, então basta avançar enquanto a amostra de audiência ficou pra trás.
  const comAudiencia = canais.filter((c) => c.viewers.hasData);
  const ultimo: (number | null)[] = comAudiencia.map(() => null);
  let vi = 0;

  const body = d.samples.map((s, i) => {
    while (vi < d.viewerSamples.length && d.viewerSamples[vi].t <= s.t) {
      for (const [k, c] of comAudiencia.entries()) {
        const it = d.viewerSamples[vi].items.find(
          (x) => `${x.platform}:${x.source}` === c.key,
        );
        if (it?.viewers != null) ultimo[k] = it.viewers;
      }
      vi++;
    }
    return [
      Math.round((s.t - d.meta.startedAt) / 1000),
      clock(s.t),
      cpu[i],
      gpu[i],
      s.obs ? Math.round(s.obs.avgRenderMs * 10) / 10 : null,
      s.obs ? Math.round(s.obs.congestion * 100) : null,
      chat[i],
      ...chatPorCanal.map((serie) => serie[i]),
      ...alvos.flatMap((t) => {
        const alvo = s.targets.find((x) => x.id === t.id);
        return [
          alvo?.bitrate ?? null,
          alvo?.state ?? null,
          alvo?.dropped ?? null,
        ];
      }),
      ...ultimo,
    ];
  });

  return toCsv([header, ...body]);
}
