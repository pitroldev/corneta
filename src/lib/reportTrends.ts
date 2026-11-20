import type { SessionMeta, SessionSummary } from "./types";

export type ReportTrendWindow = 7 | 30 | 50;

export interface TrendPlatformShare {
  platform: string;
  viewers: number;
}

export interface ReportTrendPoint {
  sessionId: string;
  startedAt: number;
  durationSec: number;
  avgViewers: number | null;
  peakViewers: number | null;
  chatTotal: number | null;
  markersCount: number;
}

export interface ReportTrends {
  windowSize: ReportTrendWindow;
  /** Chronological (oldest -> newest) sessions included in the selected window. */
  points: ReportTrendPoint[];
  /** Total loaded sessions available across the library. */
  loadedCount: number;
  /** Sessions in the library still loading or unreadable. */
  pendingCount: number;
  audience: {
    avgViewers: number | null;
    deltaPct: number | null;
    measuredSessions: number;
    totalSessions: number;
  };
  bestPeak: {
    value: number;
    sessionId: string;
    startedAt: number;
    byPlatform: TrendPlatformShare[];
  } | null;
  chat: {
    hasData: boolean;
    total: number;
    avgPerMin: number | null;
    markersTotal: number;
  };
  cadence: {
    totalDurationSec: number;
    avgDurationSec: number;
    sessionCount: number;
    streamsPerWeek: number | null;
  };
}

const MIN_TREND_SESSIONS = 3;
const MIN_COMPARISON_SESSIONS = 2;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface LoadedSession {
  meta: SessionMeta;
  summary: SessionSummary;
}

function averageOf(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return Math.round(sum / values.length);
}

/** Pure aggregator over cached SessionMeta and SessionSummary entries; never reads disk. */
export function computeReportTrends(
  sessions: readonly SessionMeta[],
  summaries: Record<string, SessionSummary | null | undefined>,
  windowSize: ReportTrendWindow = 7,
): ReportTrends | null {
  // Sort newest -> oldest defensively so slicing always selects the most recent streams.
  const ordered = [...sessions].sort((a, b) => b.startedAt - a.startedAt);
  const loaded: LoadedSession[] = [];
  let pendingCount = 0;

  for (const meta of ordered) {
    const summary = summaries[meta.id];
    if (summary === undefined) {
      pendingCount++;
      continue;
    }
    if (summary === null) continue;
    loaded.push({ meta, summary });
  }

  if (loaded.length < MIN_TREND_SESSIONS) return null;

  const currentNewestFirst = loaded.slice(0, windowSize);
  const previousNewestFirst = loaded.slice(windowSize, windowSize * 2);

  // Present chart points oldest -> newest left-to-right.
  const chronological = [...currentNewestFirst].reverse();
  const points: ReportTrendPoint[] = chronological.map(({ meta, summary }) => ({
    sessionId: meta.id,
    startedAt: meta.startedAt,
    durationSec: Math.max(0, meta.durationSec),
    avgViewers: summary.avgViewers,
    peakViewers: summary.peakViewers,
    chatTotal: summary.chatTotal,
    markersCount: summary.markersCount ?? 0,
  }));

  const currentAvgValues = currentNewestFirst
    .map((item) => item.summary.avgViewers)
    .filter(
      (value): value is number => value != null && Number.isFinite(value),
    );
  const previousAvgValues = previousNewestFirst
    .map((item) => item.summary.avgViewers)
    .filter(
      (value): value is number => value != null && Number.isFinite(value),
    );

  const avgViewers = averageOf(currentAvgValues);
  let deltaPct: number | null = null;
  if (
    currentAvgValues.length >= MIN_COMPARISON_SESSIONS &&
    previousAvgValues.length >= MIN_COMPARISON_SESSIONS
  ) {
    const currentMean =
      currentAvgValues.reduce((acc, v) => acc + v, 0) / currentAvgValues.length;
    const previousMean =
      previousAvgValues.reduce((acc, v) => acc + v, 0) /
      previousAvgValues.length;
    if (previousMean > 0) {
      deltaPct = Math.round(
        ((currentMean - previousMean) / previousMean) * 100,
      );
    }
  }

  let bestPeak: ReportTrends["bestPeak"] = null;
  for (const { meta, summary } of currentNewestFirst) {
    if (summary.peakViewers == null || !Number.isFinite(summary.peakViewers)) {
      continue;
    }
    if (
      !bestPeak ||
      summary.peakViewers > bestPeak.value ||
      (summary.peakViewers === bestPeak.value &&
        meta.startedAt > bestPeak.startedAt)
    ) {
      const byPlatform: TrendPlatformShare[] = Object.entries(
        summary.peakByPlatform ?? {},
      )
        .filter(([, viewers]) => Number.isFinite(viewers) && viewers > 0)
        .map(([platform, viewers]) => ({ platform, viewers }))
        .sort(
          (a, b) =>
            b.viewers - a.viewers || a.platform.localeCompare(b.platform),
        );
      bestPeak = {
        value: summary.peakViewers,
        sessionId: meta.id,
        startedAt: meta.startedAt,
        byPlatform,
      };
    }
  }

  let chatTotal = 0;
  let chatDurationSec = 0;
  let chatHasData = false;
  let markersTotal = 0;
  let totalDurationSec = 0;

  for (const { meta, summary } of currentNewestFirst) {
    const dur = Math.max(0, meta.durationSec);
    totalDurationSec += dur;
    markersTotal += summary.markersCount ?? 0;
    if (summary.chatTotal != null && Number.isFinite(summary.chatTotal)) {
      chatHasData = true;
      chatTotal += summary.chatTotal;
      chatDurationSec += dur;
    }
  }

  const avgPerMin = chatHasData
    ? Math.round(chatTotal / Math.max(1, chatDurationSec / 60))
    : null;

  const spanMs =
    chronological.length >= 2
      ? chronological[chronological.length - 1].meta.startedAt -
        chronological[0].meta.startedAt
      : 0;
  const streamsPerWeek =
    spanMs >= WEEK_MS
      ? Math.round((chronological.length / (spanMs / WEEK_MS)) * 10) / 10
      : null;

  return {
    windowSize,
    points,
    loadedCount: loaded.length,
    pendingCount,
    audience: {
      avgViewers,
      deltaPct,
      measuredSessions: currentAvgValues.length,
      totalSessions: currentNewestFirst.length,
    },
    bestPeak,
    chat: {
      hasData: chatHasData,
      total: chatTotal,
      avgPerMin,
      markersTotal,
    },
    cadence: {
      totalDurationSec,
      avgDurationSec: Math.round(totalDurationSec / currentNewestFirst.length),
      sessionCount: currentNewestFirst.length,
      streamsPerWeek,
    },
  };
}
