// ============================================================
// CSV — primitiva de escrita + as duas tabelas que o relatório exporta.
// Funções puras: recebem dado e devolvem string. Quem salva é o adapter.
// ============================================================
import type { SessionData, SessionMeta } from "../types";
import type { Locale } from "../i18n/locale";
import {
  chatRateSeries,
  chatRateSeriesFor,
  cpuSeries,
  gpuSeries,
  type ReportAnalysis,
} from "../report";
import type { ReportI18n } from "./html";

export type Cell = string | number | null | undefined;

/** BOM de UTF-8. Sem ele o Excel em português lê o arquivo como ANSI e "audiência"
 *  chega como "audiÃªncia".
 *
 *  Montado pelo código de propósito: U+FEFF é INVISÍVEL no editor. Escrito direto no
 *  fonte, some numa cópia distraída e ninguém vê o que quebrou. */
export const BOM = String.fromCharCode(0xfeff);

/** Como o Excel do idioma escreve uma planilha.
 *
 *  Não é cosmético: o Excel corta as colunas no separador de lista DA MÁQUINA. Um
 *  arquivo com `;` aberto num Excel em inglês cai inteiro numa coluna só — o
 *  mesmo estrago que `,` faz num Excel em português, ao contrário. E o separador
 *  de lista anda colado no decimal: quem usa `;` usa vírgula decimal, quem usa
 *  `,` usa ponto. Trocar um sem o outro faz "1,5" virar duas células. */
interface Dialect {
  sep: string;
  decimal: string;
}

const DIALECT: Record<Locale, Dialect> = {
  "pt-BR": { sep: ";", decimal: "," },
  en: { sep: ",", decimal: "." },
};

/** Caracteres que fazem o Excel/Sheets tratar a célula como FÓRMULA ao abrir.
 *  Nome de canal vem da config do usuário, então um rótulo `=...` viraria execução
 *  na planilha de quem recebeu o relatório. O apóstrofo à frente neutraliza. */
const FORMULA_START = /^[=+\-@\t\r]/;

function escapeText(s: string, sep: string): string {
  const guarded = FORMULA_START.test(s) ? `'${s}` : s;
  // Aspas em volta quando o texto contém o próprio separador — que muda com o
  // idioma, então a regra tem que olhar pro separador em uso, não pro `;`.
  return guarded.includes(sep) || /["\n\r]/.test(guarded)
    ? `"${guarded.replace(/"/g, '""')}"`
    : guarded;
}

/** Só texto passa pelo escudo de fórmula — senão todo valor negativo viraria
 *  texto com apóstrofo. */
function cell(v: Cell, dialect: Dialect): string {
  if (v == null) return "";
  if (typeof v === "number")
    return Number.isFinite(v) ? String(v).replace(".", dialect.decimal) : "";
  return escapeText(v, dialect.sep);
}

/** Linhas → CSV com BOM. CRLF porque é o que o Excel no Windows espera. */
export function toCsv(rows: Cell[][], locale: Locale = "pt-BR"): string {
  const dialect = DIALECT[locale];
  return (
    BOM +
    rows
      .map((r) => r.map((v) => cell(v, dialect)).join(dialect.sep))
      .join("\r\n") +
    "\r\n"
  );
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
  "reports.csv.history.date",
  "reports.csv.history.start",
  "reports.csv.history.durationMin",
  "reports.csv.history.platforms",
  "reports.csv.history.mode",
  "reports.csv.history.peakAudience",
  "reports.csv.history.avgAudience",
  "reports.csv.history.followersGained",
  "reports.csv.history.chatMessages",
  "reports.csv.history.subs",
  "reports.csv.history.bits",
  "reports.csv.history.raids",
  "reports.csv.history.raidViewers",
  "reports.csv.history.problemWindows",
  "reports.csv.history.verdict",
] as const;

/** Histórico pra planilha: a evolução entre lives, que é pra isso que serve planilha.
 *  Série de 2s aqui não ajudaria ninguém — essa é a outra tabela. */
export function historyCsv(rows: HistoryRow[], i18n: ReportI18n): string {
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
  return toCsv([HISTORY_HEADER.map((k) => i18n.t(k)), ...body], i18n.locale);
}

// ---------------------------------------------------------------------------
// Tabela 2 — série temporal de UMA live (eixo das amostras, ~2s)
// ---------------------------------------------------------------------------

/** Série da live no eixo das amostras.
 *
 *  Audiência e seguidores são amostrados a cada ~30s, num eixo diferente. Em vez de
 *  ficarem de fora, entram como ÚLTIMO VALOR CONHECIDO — e o nome da coluna diz isso,
 *  pra ninguém ler um degrau de 30s como se fosse medição instantânea. */
export function seriesCsv(
  d: SessionData,
  a: ReportAnalysis,
  i18n: ReportI18n,
): string {
  // `t` aqui é a tradução; a coluna de tempo é `relTimeS`.
  const { t } = i18n;
  const canais = a.byChannel.channels;
  const alvos = a.perTarget;
  const header = [
    t("reports.csv.series.relTimeS"),
    t("reports.csv.series.clock"),
    t("reports.csv.series.cpuPct"),
    t("reports.csv.series.gpuPct"),
    t("reports.csv.series.obsRenderMs"),
    t("reports.csv.series.obsCongestionPct"),
    t("reports.csv.series.chatPerMin"),
    ...canais.map((c) =>
      t("reports.csv.series.chatPerMinFor", { source: c.source }),
    ),
    ...alvos.flatMap((target) => [
      t("reports.csv.series.bitrateKbpsFor", { target: target.name }),
      t("reports.csv.series.stateFor", { target: target.name }),
      t("reports.csv.series.droppedFor", { target: target.name }),
    ]),
    ...canais
      .filter((c) => c.viewers.hasData)
      .map((c) =>
        t("reports.csv.series.watchingLastKnownFor", { source: c.source }),
      ),
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
      ...alvos.flatMap((target) => {
        const alvo = s.targets.find((x) => x.id === target.id);
        return [
          alvo?.bitrate ?? null,
          alvo?.state ?? null,
          alvo?.dropped ?? null,
        ];
      }),
      ...ultimo,
    ];
  });

  return toCsv([header, ...body], i18n.locale);
}
