import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { buildReplayIndex } from "../../lib/replay";
import {
  analyze,
  getCachedSummary,
  parseChatSession,
  parseSession,
  setCachedSummary,
  summarize,
} from "../../lib/report";
import type {
  ReplayChatGap,
  ReplayChatMessage,
  SessionData,
  SessionMarker,
  SessionSummary,
} from "../../lib/types";

type ReportDataState = SessionData | null | "loading";

const EMPTY_CHAT: {
  messages: ReplayChatMessage[];
  gaps: ReplayChatGap[];
} = { messages: [], gaps: [] };

export function useReportDetailData(id: string, previousId: string | null) {
  const { t } = useI18n();
  const [data, setData] = useState<ReportDataState>("loading");
  const [previousSummary, setPreviousSummary] = useState<SessionSummary | null>(
    null,
  );
  const [chat, setChat] = useState(EMPTY_CHAT);
  const [revision, setRevision] = useState(0);

  const reload = useCallback(() => {
    setRevision((current) => current + 1);
  }, []);

  // A persistência já terminou quando estes callbacks rodam. Atualizar só o pedaço
  // alterado mantém player, chat e gráficos montados — trocar tudo pelo skeleton aqui
  // fazia a tela inteira piscar ao marcar um único instante.
  const addMarker = useCallback((marker: SessionMarker) => {
    setData((current) => {
      if (!current || current === "loading") return current;
      return {
        ...current,
        markers: [...current.markers, marker].sort((a, b) => a.t - b.t),
      };
    });
  }, []);

  const clearRecordings = useCallback(() => {
    setData((current) => {
      if (!current || current === "loading") return current;
      return { ...current, recordings: [] };
    });
  }, []);

  useEffect(() => {
    let alive = true;
    setData("loading");
    void api
      .readSession(id)
      .then((raw) => {
        if (!alive) return;
        const parsed = parseSession(raw, t);
        setData(parsed);
        if (parsed?.meta.endedAt != null)
          setCachedSummary(id, summarize(parsed, analyze(parsed, t)));
      })
      .catch(() => {
        if (alive) setData(null);
      });
    return () => {
      alive = false;
    };
  }, [id, revision, t]);

  useEffect(() => {
    let alive = true;
    setChat(EMPTY_CHAT);
    void api
      .readSessionChat(id)
      .then((raw) => {
        if (alive && raw) setChat(parseChatSession(raw));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    setPreviousSummary(null);
    if (!previousId) return;
    const cached = getCachedSummary(previousId);
    if (cached) {
      setPreviousSummary(cached);
      return;
    }
    let alive = true;
    void api
      .readSession(previousId)
      .then((raw) => {
        if (!alive) return;
        const parsed = parseSession(raw, t);
        if (!parsed) return;
        const summary = summarize(parsed, analyze(parsed, t));
        if (parsed.meta.endedAt != null) setCachedSummary(previousId, summary);
        setPreviousSummary(summary);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [previousId, t]);

  const parsed = data === "loading" || !data ? null : data;
  const analysis = useMemo(
    () => (parsed ? analyze(parsed, t) : null),
    [parsed, t],
  );
  const replayIndex = useMemo(
    () =>
      parsed
        ? buildReplayIndex(
            parsed.recordings.map((recording) => ({
              seg: recording.seg,
              t: recording.t,
              path: recording.path,
              codec: recording.codec,
              estimated: recording.estimated,
              syncs: recording.syncs,
              endT: recording.endT,
            })),
            parsed.clockJumps,
            parsed.offsetMs,
          )
        : null,
    [parsed],
  );

  return {
    data,
    parsed,
    analysis,
    replayIndex,
    previousSummary,
    chat,
    reload,
    addMarker,
    clearRecordings,
  };
}
