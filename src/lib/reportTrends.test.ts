import { describe, expect, it } from "vitest";
import { computeReportTrends } from "./reportTrends";
import type { SessionMeta, SessionSummary } from "./types";

const DAY = 24 * 60 * 60 * 1000;
const BASE = Date.UTC(2026, 10, 1, 20, 0, 0);

function meta(id: string, dayOffset: number, durationSec = 3600): SessionMeta {
  return {
    id,
    startedAt: BASE + dayOffset * DAY,
    durationSec,
    mode: "hybrid",
    platforms: [{ id: "t1", name: "Twitch", platformId: "twitch" }],
    hasVideo: false,
  };
}

function summary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    hasData: true,
    peakViewers: 120,
    avgViewers: 80,
    chatTotal: 240,
    problemWindows: 0,
    verdictTone: "ok",
    markersCount: 2,
    ...overrides,
  };
}

describe("computeReportTrends", () => {
  it("returns null when fewer than 3 sessions have loaded summaries", () => {
    const sessions = [meta("s2", 2), meta("s1", 1)];
    const summaries = { s1: summary(), s2: summary() };
    expect(computeReportTrends(sessions, summaries, 7)).toBeNull();

    const withUnreadable = [meta("s3", 3), meta("s2", 2), meta("s1", 1)];
    expect(
      computeReportTrends(
        withUnreadable,
        { s1: summary(), s2: summary(), s3: null },
        7,
      ),
    ).toBeNull();
  });

  it("excludes sessions without audience readings from the viewer denominator while keeping them in airtime", () => {
    const sessions = [
      meta("s4", 10, 7200),
      meta("s3", 7, 3600),
      meta("s2", 3, 3600),
      meta("s1", 0, 1800),
    ];
    const summaries: Record<string, SessionSummary> = {
      s1: summary({ avgViewers: 100, peakViewers: 150, markersCount: 1 }),
      s2: summary({
        avgViewers: null,
        peakViewers: null,
        chatTotal: null,
        markersCount: 0,
      }),
      s3: summary({
        avgViewers: 200,
        peakViewers: 340,
        peakByPlatform: { youtube: 120, twitch: 220 },
        markersCount: 3,
      }),
      s4: summary({ avgViewers: null, peakViewers: null, markersCount: 2 }),
    };

    const trends = computeReportTrends(sessions, summaries, 7);
    expect(trends).not.toBeNull();
    expect(trends!.audience.avgViewers).toBe(150);
    expect(trends!.audience.measuredSessions).toBe(2);
    expect(trends!.audience.totalSessions).toBe(4);
    expect(trends!.cadence.totalDurationSec).toBe(7200 + 3600 + 3600 + 1800);
    expect(trends!.cadence.sessionCount).toBe(4);
    expect(trends!.cadence.streamsPerWeek).toBeCloseTo(2.8, 1);
    expect(trends!.chat.markersTotal).toBe(6);
    expect(trends!.bestPeak).toEqual({
      value: 340,
      sessionId: "s3",
      startedAt: BASE + 7 * DAY,
      byPlatform: [
        { platform: "twitch", viewers: 220 },
        { platform: "youtube", viewers: 120 },
      ],
    });
    expect(trends!.points.map((p) => p.sessionId)).toEqual([
      "s1",
      "s2",
      "s3",
      "s4",
    ]);
  });

  it("compares against the immediately preceding window only when both windows have enough readings", () => {
    // 10 sessions: newest 7 have avg 150, previous 3 have avg 100 -> +50%
    const sessions: SessionMeta[] = [];
    const summaries: Record<string, SessionSummary> = {};
    for (let i = 1; i <= 10; i++) {
      const id = `s${i}`;
      sessions.push(meta(id, i * 2, 3600));
      summaries[id] = summary({
        avgViewers: i > 3 ? 150 : 100,
        peakViewers: i > 3 ? 210 : 140,
      });
    }
    const trends = computeReportTrends(sessions, summaries, 7);
    expect(trends!.audience.avgViewers).toBe(150);
    expect(trends!.audience.deltaPct).toBe(50);

    // If only 1 session in the previous window had audience data, omit the percentage delta.
    summaries.s1 = summary({ avgViewers: null, peakViewers: null });
    summaries.s2 = summary({ avgViewers: null, peakViewers: null });
    const incompletePrev = computeReportTrends(sessions, summaries, 7);
    expect(incompletePrev!.audience.deltaPct).toBeNull();
  });

  it("handles a full window without any audience data gracefully", () => {
    const sessions = [
      meta("s3", 6, 3600),
      meta("s2", 3, 3600),
      meta("s1", 0, 3600),
    ];
    const summaries = {
      s1: summary({ avgViewers: null, peakViewers: null, chatTotal: 120 }),
      s2: summary({ avgViewers: null, peakViewers: null, chatTotal: 180 }),
      s3: summary({ avgViewers: null, peakViewers: null, chatTotal: 60 }),
    };
    const trends = computeReportTrends(sessions, summaries, 7);
    expect(trends).not.toBeNull();
    expect(trends!.audience.avgViewers).toBeNull();
    expect(trends!.audience.measuredSessions).toBe(0);
    expect(trends!.bestPeak).toBeNull();
    expect(trends!.chat.hasData).toBe(true);
    expect(trends!.chat.total).toBe(360);
    expect(trends!.chat.avgPerMin).toBe(2);
  });
});
