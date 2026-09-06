import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { buildReplayIndex } from "../../lib/replay";
import {
  getCachedSummary,
  setCachedSummary,
  withReportMarkers,
  type ReportAnalysis,
} from "../../lib/report";
import { ReportClient } from "../../lib/reportClient";
import type { ReportSummaryResult } from "../../lib/reportTasks";
import type { ChatPage } from "../../lib/replayChatPage";
import type {
  SessionData,
  SessionMarker,
  SessionSummary,
} from "../../lib/types";

interface LoadedReport {
  data: SessionData;
  analysis: ReportAnalysis;
  summary: SessionSummary;
}
const EMPTY_CHAT: ChatPage = {
  messages: [],
  gaps: [],
  start: 0,
  end: 0,
  total: 0,
  validFrom: null,
  validUntil: null,
};

export function useReportDetailData(id: string, previousId: string | null) {
  const { t, locale } = useI18n();
  const [loaded, setLoaded] = useState<LoadedReport | null | "loading">(
    "loading",
  );
  const [previousSummary, setPreviousSummary] = useState<SessionSummary | null>(
    null,
  );
  const [chat, setChat] = useState(EMPTY_CHAT);
  const [recordingsDeleted, setRecordingsDeleted] = useState(false);
  const [revision, setRevision] = useState(0);
  const clientRef = useRef<ReportClient | null>(null);
  const readChatPage = useCallback(
    (epoch: number) =>
      clientRef.current?.run<ChatPage>({ kind: "chatPage", epoch }) ??
      Promise.resolve(EMPTY_CHAT),
    [],
  );
  const reload = useCallback(() => setRevision((current) => current + 1), []);

  const addMarker = useCallback(
    (marker: SessionMarker) => {
      setLoaded((current) => {
        if (!current || current === "loading") return current;
        const markers = [...current.data.markers, marker].sort(
          (a, b) => a.t - b.t,
        );
        return {
          ...current,
          data: { ...current.data, markers },
          analysis: withReportMarkers(current.analysis, markers, t),
        };
      });
    },
    [t],
  );

  const clearRecordings = useCallback(() => {
    setRecordingsDeleted(true);
    setLoaded((current) =>
      !current || current === "loading"
        ? current
        : { ...current, data: { ...current.data, recordings: [] } },
    );
  }, []);

  useEffect(() => {
    let alive = true;
    const client = new ReportClient();
    clientRef.current = client;
    setLoaded("loading");
    setChat(EMPTY_CHAT);
    setPreviousSummary(null);
    setRecordingsDeleted(false);
    void (async () => {
      try {
        const raw = await api.readSessionBytes(id);
        if (!alive) return;
        const result = await client.run<LoadedReport | null>({
          kind: "analyze",
          raw,
          locale,
        });
        if (!alive) return;
        setLoaded(result);
        if (!result) return;
        if (result.data.meta.endedAt != null)
          setCachedSummary(id, result.summary);
        // One worker, detail first, optional data later. Navigation terminates
        // pending work instead of just hiding stale results.
        try {
          const raw = await api.readSessionBytes(id, true);
          if (alive && raw.byteLength > 0) {
            const next = await client.run<ChatPage>({
              kind: "chat",
              raw,
              epoch: result.data.meta.startedAt,
            });
            if (alive) setChat(next);
          }
        } catch {
          /* Missing chat is independent of the live story. */
        }
        if (!alive || !previousId) return;
        const cached = getCachedSummary(previousId);
        if (cached) {
          setPreviousSummary(cached);
          return;
        }
        try {
          const raw = await api.readSessionBytes(previousId);
          if (!alive) return;
          const next = await client.run<ReportSummaryResult | null>({
            kind: "summary",
            raw,
            locale,
          });
          if (alive) setPreviousSummary(next?.summary ?? null);
        } catch {
          /* Comparison is optional. */
        }
      } catch {
        if (alive) setLoaded(null);
      }
    })();
    return () => {
      alive = false;
      if (clientRef.current === client) clientRef.current = null;
      client.dispose();
    };
  }, [id, previousId, revision, locale]);

  const parsed = loaded && loaded !== "loading" ? loaded.data : null;
  const analysis = loaded && loaded !== "loading" ? loaded.analysis : null;
  const recordings = parsed?.recordings;
  const clockJumps = parsed?.clockJumps;
  const offsetMs = parsed?.offsetMs;
  const replayIndex = useMemo(
    () =>
      recordings
        ? buildReplayIndex(recordings, clockJumps ?? [], offsetMs ?? 0)
        : null,
    [recordings, clockJumps, offsetMs],
  );

  return {
    data: loaded === "loading" ? ("loading" as const) : parsed,
    parsed,
    analysis,
    replayIndex,
    previousSummary,
    chat,
    readChatPage,
    recordingsDeleted,
    reload,
    addMarker,
    clearRecordings,
  };
}
