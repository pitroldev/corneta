import type { I18n } from "../i18n";
import { fileStamp } from "../i18n/format";
import { analyze, type ReportAnalysis } from "../report";
import type { SessionData } from "../types";
import { anonymize } from "./anonymize";

export type DownloadFormat = "html" | "csv" | "json";

export async function selectedReportExport(
  data: SessionData,
  existingAnalysis: ReportAnalysis | null,
  i18n: I18n,
  format: DownloadFormat,
  anonymous: boolean,
) {
  const { t } = i18n;
  const report = anonymous
    ? anonymize(data, t("analysis.parse.alert.userFallback"))
    : data;
  // Never reuse identifying derived text in an anonymous export.
  const analysis =
    !anonymous && existingAnalysis ? existingAnalysis : analyze(report, t);
  const base = `${t("reports.file.live")}-${fileStamp(report.meta.startedAt)}`;
  switch (format) {
    case "html":
      return {
        name: `${base}.html`,
        label: t("reports.download.html.label"),
        ext: format,
        content: (await import("./html")).reportHtml(report, analysis, i18n),
      };
    case "csv":
      return {
        name: `${base}${t("reports.file.seriesSuffix")}.csv`,
        label: t("reports.download.csv.label"),
        ext: format,
        content: (await import("./csv")).seriesCsv(report, analysis, i18n),
      };
    case "json":
      return {
        name: `${base}.json`,
        label: t("reports.download.json.label"),
        ext: format,
        content: (await import("./json")).reportJson(report, analysis),
      };
  }
}
