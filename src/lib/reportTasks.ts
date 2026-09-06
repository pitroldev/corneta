import { loadI18n } from "./i18n/core";
import type { Locale } from "./i18n/locale";
import {
  analyze,
  parseSession,
  parseChatSession,
  summarize,
  type ReportAnalysis,
} from "./report";
import type { SessionData, SessionSummary } from "./types";
import { selectedReportExport, type DownloadFormat } from "./export/selected";
import { replayChatPage } from "./replayChatPage";

export type ReportTask =
  | { kind: "analyze" | "summary"; raw: string | ArrayBuffer; locale: Locale }
  | { kind: "chat"; raw: string | ArrayBuffer; epoch: number }
  | { kind: "chatPage"; epoch: number }
  | {
      kind: "export";
      data: SessionData;
      analysis: ReportAnalysis | null;
      locale: Locale;
      format: DownloadFormat;
      anonymous: boolean;
    };

export interface ReportSummaryResult {
  summary: SessionSummary;
  complete: boolean;
}

const decode = (raw: string | ArrayBuffer) =>
  typeof raw === "string" ? raw : new TextDecoder().decode(raw);

export function createReportTaskRunner() {
  let chat: ReturnType<typeof parseChatSession> = { messages: [], gaps: [] };
  return async function runReportTask(task: ReportTask) {
    if (task.kind === "chat") {
      chat = parseChatSession(decode(task.raw));
      chat.gaps.sort((a, b) => a.t - b.t);
      return replayChatPage(chat, task.epoch);
    }
    if (task.kind === "chatPage") return replayChatPage(chat, task.epoch);
    const i18n = await loadI18n(task.locale);
    if (task.kind === "export")
      return selectedReportExport(
        task.data,
        task.analysis,
        i18n,
        task.format,
        task.anonymous,
      );
    const data = parseSession(decode(task.raw), i18n.t);
    if (!data) return null;
    const analysis = analyze(data, i18n.t);
    const summary = summarize(data, analysis);
    return task.kind === "summary"
      ? ({
          summary,
          complete: data.meta.endedAt != null,
        } satisfies ReportSummaryResult)
      : { data, analysis, summary };
  };
}

export type ReportTaskResult = Awaited<
  ReturnType<ReturnType<typeof createReportTaskRunner>>
>;
