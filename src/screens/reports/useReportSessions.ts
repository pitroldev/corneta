import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { getCachedSummary, setCachedSummary } from "../../lib/report";
import {
  reconcileSummaryCache,
  flushSummaryCache,
} from "../../lib/summaryCache";
import { ReportClient } from "../../lib/reportClient";
import type { ReportSummaryResult } from "../../lib/reportTasks";
import { useStore } from "../../lib/store";
import type { SessionMeta, SessionSummary } from "../../lib/types";

export function useReportSessions() {
  const { t, locale } = useI18n();
  const markReportSeen = useStore((state) => state.markReportSeen);
  const [sessions, setSessions] = useState<SessionMeta[] | null>(null);
  const [error, setError] = useState(false);
  // `null` marca sessão que não deu pra ler: sem a marca, o card da lista ficaria
  // "carregando" pra sempre esperando um resumo que nunca vem.
  const [summaries, setSummaries] = useState<
    Record<string, SessionSummary | null>
  >({});

  const refresh = useCallback(async () => {
    setSessions(null);
    setError(false);
    try {
      setSessions(await api.listSessions(t));
    } catch {
      setError(true);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
    markReportSeen();
  }, [markReportSeen, refresh]);

  useEffect(() => {
    if (!sessions) return;
    reconcileSummaryCache(sessions);
    const client = new ReportClient();
    let alive = true;
    void (async () => {
      const cached: Record<string, SessionSummary | null> = {};
      const missing: string[] = [];
      for (const session of sessions) {
        const summary = getCachedSummary(session.id);
        if (summary) cached[session.id] = summary;
        else missing.push(session.id);
      }
      if (alive) setSummaries(cached);

      // Sequencial por intenção: o pico de memória é uma sessão, não o histórico inteiro.
      for (const id of missing) {
        if (!alive) return;
        let summary: SessionSummary | null = null;
        try {
          const raw = await api.readSessionBytes(id);
          if (!alive) return;
          const result = await client.run<ReportSummaryResult | null>({
            kind: "summary",
            raw,
            locale,
          });
          summary = result?.summary ?? null;
          // Native listing estimates the end of interrupted/active sessions from
          // mtime. Only a real end record makes this summary safe to persist.
          if (alive && result?.complete) setCachedSummary(id, result.summary);
        } catch {
          // Uma sessão ilegível não impede as demais de aparecerem — só fica marcada.
        }
        if (!alive) return;
        setSummaries((current) => ({ ...current, [id]: summary }));
      }
    })();
    return () => {
      alive = false;
      client.dispose();
      flushSummaryCache();
    };
  }, [sessions, locale]);

  return { sessions, summaries, error, refresh };
}
