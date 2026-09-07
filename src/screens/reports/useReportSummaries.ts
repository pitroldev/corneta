import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { ReportClient } from "../../lib/reportClient";
import type { ReportLibraryCache } from "../../lib/reportLibraryCache";
import { startReportSummaryQueue } from "../../lib/reportSummaryQueue";
import {
  flushSummaryCache,
  getCachedSummary,
  setCachedSummary,
} from "../../lib/summaryCache";
import type { SessionMeta, SessionSummary } from "../../lib/types";

/** Mounted only with the library: opening a detail terminates its background worker. */
export function useReportSummaries(
  sessions: SessionMeta[] | null,
  cache: ReportLibraryCache,
) {
  const { locale } = useI18n();
  const [summaries, setSummaries] = useState<
    Record<string, SessionSummary | null>
  >(() => cache.snapshot(sessions ?? []));
  useEffect(() => {
    if (!sessions) return;
    const { summaries: cached, missing } = cache.prepare(
      sessions,
      getCachedSummary,
    );
    const revisions = new Map(
      sessions.map((session) => [session.id, session.sourceRevision]),
    );
    setSummaries(cached);
    if (!missing.length) return;
    const queue = startReportSummaryQueue({
      ids: missing,
      locale,
      read: (id) => api.readSessionBytes(id),
      client: new ReportClient(),
      receive(id, result) {
        // An estimated listing end time is not a persisted end record.
        if (result?.complete) setCachedSummary(id, result.summary);
        cache.remember(id, revisions.get(id), result?.summary ?? null);
        setSummaries((current) => ({
          ...current,
          [id]: result?.summary ?? null,
        }));
      },
    });
    return () => {
      queue.cancel();
      flushSummaryCache();
    };
  }, [sessions, locale, cache]);
  return summaries;
}
