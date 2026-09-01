import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import {
  analyze,
  getCachedSummary,
  parseSession,
  setCachedSummary,
  summarize,
} from "../../lib/report";
import { useStore } from "../../lib/store";
import type { SessionMeta, SessionSummary } from "../../lib/types";

export function useReportSessions() {
  const { t } = useI18n();
  const markReportSeen = useStore((state) => state.markReportSeen);
  const [sessions, setSessions] = useState<SessionMeta[] | null>(null);
  const [error, setError] = useState(false);
  const [summaries, setSummaries] = useState<Record<string, SessionSummary>>(
    {},
  );

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
    if (!sessions?.length) return;
    let alive = true;
    void (async () => {
      const cached: Record<string, SessionSummary> = {};
      const missing: string[] = [];
      for (const session of sessions) {
        const summary = getCachedSummary(session.id);
        if (summary) cached[session.id] = summary;
        else missing.push(session.id);
      }
      if (alive) setSummaries(cached);

      // Sequencial por intenção: o pico de memória é uma sessão, não o histórico inteiro.
      for (const id of missing) {
        try {
          const parsed = parseSession(await api.readSession(id), t);
          if (!alive) return;
          if (!parsed) continue;
          const summary = summarize(parsed, analyze(parsed, t));
          if (parsed.meta.endedAt != null) setCachedSummary(id, summary);
          setSummaries((current) => ({ ...current, [id]: summary }));
        } catch {
          // Uma sessão ilegível não impede as demais de aparecerem.
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [sessions, t]);

  return { sessions, summaries, error, refresh };
}
