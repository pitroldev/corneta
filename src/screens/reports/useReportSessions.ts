import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { reconcileSummaryCache } from "../../lib/summaryCache";
import { useStore } from "../../lib/store";
import type { SessionMeta } from "../../lib/types";

export function useReportSessions() {
  const { t } = useI18n();
  const markReportSeen = useStore((state) => state.markReportSeen);
  const [sessions, setSessions] = useState<SessionMeta[] | null>(null);
  const [error, setError] = useState(false);
  const request = useRef(0);

  const refresh = useCallback(async () => {
    const current = ++request.current;
    setSessions(null);
    setError(false);
    try {
      const next = await api.listSessions(t);
      if (current !== request.current) return;
      reconcileSummaryCache(next);
      setSessions(next);
    } catch {
      if (current === request.current) setError(true);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
    markReportSeen();
    return () => {
      request.current += 1;
    };
  }, [markReportSeen, refresh]);

  return { sessions, error, refresh };
}
