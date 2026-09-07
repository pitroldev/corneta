import type { SessionData, SessionMeta } from "../types";
import type { Locale } from "../i18n/locale";
import {
  chatRateSeries,
  chatRateSeriesFor,
  cpuSeries,
  gpuSeries,
  memorySeries,
  type ReportAnalysis,
} from "../report";
import type { ReportI18n } from "./html";

export type Cell = string | number | null | undefined;

/** Use an explicit UTF-8 BOM so Excel detects encoding; a numeric escape remains visible in source. */
export const BOM = String.fromCharCode(0xfeff);

/** Keep list and decimal separators aligned with the export locale. */
interface Dialect {
  sep: string;
  decimal: string;
}

const DIALECT: Record<Locale, Dialect> = {
  "pt-BR": { sep: ";", decimal: "," },
  en: { sep: ",", decimal: "." },
};

/** Prefix formula-like text with an apostrophe to prevent spreadsheet execution. */
const FORMULA_START = /^[=+\-@\t\r]/;

function escapeText(s: string, sep: string): string {
  const guarded = FORMULA_START.test(s) ? `'${s}` : s;
  return guarded.includes(sep) || /["\n\r]/.test(guarded)
    ? `"${guarded.replace(/"/g, '""')}"`
    : guarded;
}

/** Protect text only; negative numeric cells must remain numbers. */
function cell(v: Cell, dialect: Dialect): string {
  if (v == null) return "";
  if (typeof v === "number")
    return Number.isFinite(v) ? String(v).replace(".", dialect.decimal) : "";
  return escapeText(v, dialect.sep);
}

/** Use a UTF-8 BOM and CRLF for Windows spreadsheet compatibility. */
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

/** Audience and follower columns carry the last known value from their slower sampling cadence. */
export function seriesCsv(
  d: SessionData,
  a: ReportAnalysis,
  i18n: ReportI18n,
): string {
  const { t } = i18n;
  const channels = a.byChannel.channels;
  const targets = a.perTarget;
  const header = [
    t("reports.csv.series.relTimeS"),
    t("reports.csv.series.clock"),
    t("reports.csv.series.cpuPct"),
    t("reports.csv.series.gpuPct"),
    t("reports.csv.series.memoryPct"),
    t("reports.csv.series.obsRenderMs"),
    t("reports.csv.series.obsCongestionPct"),
    t("reports.csv.series.chatPerMin"),
    ...channels.map((c) =>
      t("reports.csv.series.chatPerMinFor", { source: c.source }),
    ),
    ...targets.flatMap((target) => [
      t("reports.csv.series.bitrateKbpsFor", { target: target.name }),
      t("reports.csv.series.stateFor", { target: target.name }),
      t("reports.csv.series.droppedFor", { target: target.name }),
    ]),
    ...channels
      .filter((c) => c.viewers.hasData)
      .map((c) =>
        t("reports.csv.series.watchingLastKnownFor", { source: c.source }),
      ),
  ];

  const cpu = cpuSeries(d);
  const gpu = gpuSeries(d);
  const memory = memorySeries(d);
  const chat = chatRateSeries(d);
  const chatByChannel = channels.map((c) => chatRateSeriesFor(d, c.key));

  // Advance one pointer through the sorted audience series rather than rescanning per sample.
  const audienceChannels = channels.filter((c) => c.viewers.hasData);
  const lastKnown: (number | null)[] = audienceChannels.map(() => null);
  let vi = 0;

  const body = d.samples.map((s, i) => {
    while (vi < d.viewerSamples.length && d.viewerSamples[vi].t <= s.t) {
      for (const [k, c] of audienceChannels.entries()) {
        const it = d.viewerSamples[vi].items.find(
          (x) => `${x.platform}:${x.source}` === c.key,
        );
        if (it?.viewers != null) lastKnown[k] = it.viewers;
      }
      vi++;
    }
    return [
      Math.round((s.t - d.meta.startedAt) / 1000),
      clock(s.t),
      cpu[i],
      gpu[i],
      memory[i],
      s.obs ? Math.round(s.obs.avgRenderMs * 10) / 10 : null,
      s.obs ? Math.round(s.obs.congestion * 100) : null,
      chat[i],
      ...chatByChannel.map((channelSeries) => channelSeries[i]),
      ...targets.flatMap((target) => {
        const sampleTarget = s.targets.find((x) => x.id === target.id);
        return [
          sampleTarget?.bitrate ?? null,
          sampleTarget?.state ?? null,
          sampleTarget?.dropped ?? null,
        ];
      }),
      ...lastKnown,
    ];
  });

  return toCsv([header, ...body], i18n.locale);
}
