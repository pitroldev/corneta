import { describe, expect, it } from "vitest";
import {
  analyze,
  parseSession,
  summarize,
  viewerSeries,
  viewerSeriesFor,
} from "./report";
import { interpolate, type Vars } from "./i18n/locale";
import { pt, type MessageKey } from "./i18n/pt";
import { reportJson } from "./export/json";

const t = (key: MessageKey, vars?: Vars) => interpolate(pt[key], vars);
const session = (records: object[]) =>
  parseSession(
    [
      { kind: "meta", id: "audience-fixture", startedAt: 0, platforms: [] },
      ...records,
      { kind: "end", endedAt: 120_000 },
    ]
      .map((record) => JSON.stringify(record))
      .join("\n"),
    t,
  )!;
const sample = (time: number, items: unknown[], total = 0) => ({
  kind: "viewers",
  t: time,
  total,
  items,
});
const native = (viewers: unknown, extra: Record<string, unknown> = {}) => ({
  platform: "cinefy",
  source: "demo-cinefy",
  viewers,
  live: true,
  audienceStatus: "live",
  ...extra,
});
const cinefyKey = "cinefy:demo-cinefy";

describe("Cinefy report audience", () => {
  it("preserves the latest embedded counter separately from native audience metrics and JSON exports", () => {
    const twitch = { platform: "twitch", source: "demo-twitch", viewers: 100 };
    const data = session([
      sample(
        1000,
        [
          native(null, {
            audienceStatus: "embedded",
            audienceOrigin: "twitch",
            embeddedViewers: 999,
          }),
          twitch,
        ],
        1099,
      ),
      sample(
        2000,
        [
          native(null, {
            audienceStatus: "embedded",
            audienceOrigin: "twitch",
            embeddedViewers: 1200,
          }),
          twitch,
        ],
        1300,
      ),
    ]);
    const analysis = analyze(data, t);
    const channel = analysis.byChannel.channels.find(
      (item) => item.key === cinefyKey,
    )!;
    expect(data.viewerSamples[0].items[0].embeddedViewers).toBe(999);
    expect(viewerSeries(data)).toEqual([100, 100]);
    expect(viewerSeriesFor(data, cinefyKey)).toEqual([null, null]);
    expect(analysis.viewers).toMatchObject({ peak: 100, avg: 100 });
    expect(channel.viewers).toEqual({
      peak: 0,
      avg: 0,
      last: 0,
      hasData: false,
    });
    expect(channel.sharePct).toBeNull();
    expect(channel.audience).toMatchObject({
      status: "embedded",
      origin: "twitch",
      embeddedViewers: 1200,
    });
    expect(
      JSON.parse(reportJson(data, analysis)).porCanal.channels.find(
        (item: { key: string }) => item.key === cinefyKey,
      ).audience.embeddedViewers,
    ).toBe(1200);
  });

  it.each([
    null,
    undefined,
    "999",
    false,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
  ])(
    "rejects an invalid embedded counter (%s) without inventing a measured zero",
    (embeddedViewers) => {
      const data = session([
        sample(1000, [
          native(null, {
            audienceStatus: "embedded",
            audienceOrigin: "twitch",
            embeddedViewers,
          }),
        ]),
      ]);
      expect(data.viewerSamples[0].items[0].embeddedViewers).toBeUndefined();
      const analysis = analyze(data, t);
      expect(
        analysis.byChannel.channels[0].audience?.embeddedViewers,
      ).toBeUndefined();
      expect(analysis.viewers.hasData).toBe(false);
    },
  );

  it.each(["live", "offline", "unavailable"])(
    "ignores embedded counters on %s audience records",
    (audienceStatus) => {
      const data = session([
        sample(1000, [native(0, { audienceStatus, embeddedViewers: 999 })]),
      ]);
      expect(data.viewerSamples[0].items[0].embeddedViewers).toBeUndefined();
      expect(
        analyze(data, t).byChannel.channels[0].audience?.embeddedViewers,
      ).toBeUndefined();
    },
  );

  it("preserves an embedded zero without treating it as a native measurement", () => {
    const data = session([
      sample(1000, [
        native(null, {
          audienceStatus: "embedded",
          audienceOrigin: "twitch",
          embeddedViewers: 0,
        }),
      ]),
    ]);
    expect(data.viewerSamples[0].items[0].embeddedViewers).toBe(0);
    expect(viewerSeries(data)).toEqual([null]);
    expect(
      analyze(data, t).byChannel.channels[0].audience?.embeddedViewers,
    ).toBe(0);
  });

  it("combines native Cinefy and Twitch counters without trusting an inconsistent journal total", () => {
    const data = session([
      sample(
        1000,
        [
          native(20),
          { platform: "twitch", source: "demo-twitch", viewers: 100 },
        ],
        999,
      ),
      sample(2000, [
        native(40),
        { platform: "twitch", source: "demo-twitch", viewers: 200 },
      ]),
    ]);
    const analysis = analyze(data, t);
    expect(viewerSeries(data)).toEqual([120, 240]);
    expect(viewerSeriesFor(data, cinefyKey)).toEqual([20, 40]);
    expect(analysis.viewers).toEqual({
      peak: 240,
      avg: 180,
      start: 120,
      end: 240,
      hasData: true,
    });
    expect(
      analysis.byChannel.channels.find((channel) => channel.key === cinefyKey)
        ?.viewers,
    ).toEqual({ peak: 40, avg: 30, last: 40, hasData: true });
    expect(summarize(data, analysis)).toMatchObject({
      peakViewers: 240,
      avgViewers: 180,
    });
  });

  it.each(["twitch", "youtube", "kick", "external"])(
    "excludes %s embeds even if an editable report claims a numeric counter",
    (audienceOrigin) => {
      const data = session([
        sample(
          1000,
          [
            native(800, {
              audienceStatus: "embedded",
              audienceOrigin,
              title: "Sessão fictícia",
              startedAt: "2026-09-09T12:30:00Z",
            }),
            { platform: "youtube", source: "demo-youtube", viewers: 30 },
          ],
          830,
        ),
      ]);
      const analysis = analyze(data, t);
      expect(viewerSeries(data)).toEqual([30]);
      expect(viewerSeriesFor(data, cinefyKey)).toEqual([null]);
      expect(
        analysis.byChannel.channels.find(
          (channel) => channel.key === cinefyKey,
        ),
      ).toMatchObject({
        audience: {
          status: "embedded",
          origin: audienceOrigin,
          title: "Sessão fictícia",
          startedAt: "2026-09-09T12:30:00Z",
          live: true,
        },
        viewers: { hasData: false },
        sharePct: null,
      });
    },
  );

  it("retains an external-only stream without inventing an audience measurement", () => {
    const data = session([
      sample(1000, [
        native(null, { audienceStatus: "embedded", audienceOrigin: "youtube" }),
      ]),
    ]);
    const analysis = analyze(data, t);
    expect(viewerSeries(data)).toEqual([null]);
    expect(analysis.viewers.hasData).toBe(false);
    expect(analysis.byChannel.channels[0].audience).toMatchObject({
      status: "embedded",
      origin: "youtube",
      live: true,
    });
    expect(summarize(data, analysis)).toMatchObject({
      peakViewers: null,
      avgViewers: null,
    });
  });

  it("excludes unavailable samples from averages while preserving a measured zero", () => {
    const data = session([
      sample(1000, [native(100)]),
      sample(2000, [
        native(100, { audienceStatus: "unavailable", live: false }),
      ]),
      sample(3000, [native(0)]),
    ]);
    const analysis = analyze(data, t);
    expect(viewerSeries(data)).toEqual([100, null, 0]);
    expect(viewerSeriesFor(data, cinefyKey)).toEqual([100, null, 0]);
    expect(analysis.viewers).toEqual({
      peak: 100,
      avg: 50,
      start: 100,
      end: 0,
      hasData: true,
    });
    expect(analysis.byChannel.channels[0].viewers).toEqual({
      peak: 100,
      avg: 50,
      last: 0,
      hasData: true,
    });
  });

  it("does not treat a missing Cinefy item as zero or alter legacy channel denominators", () => {
    const data = session([
      sample(
        1000,
        [
          native(100),
          { platform: "twitch", source: "demo-twitch", viewers: 40 },
        ],
        140,
      ),
      sample(
        2000,
        [{ platform: "twitch", source: "demo-twitch", viewers: 40 }],
        40,
      ),
      sample(3000, [native(0)]),
    ]);
    const channels = analyze(data, t).byChannel.channels;
    expect(viewerSeriesFor(data, cinefyKey)).toEqual([100, null, 0]);
    expect(
      channels.find((channel) => channel.key === cinefyKey)?.viewers.avg,
    ).toBe(50);
    expect(
      channels.find((channel) => channel.platform === "twitch")?.viewers.avg,
    ).toBe(27);
  });

  it("keeps the most recent metadata and clears stream details no longer reported", () => {
    const data = session([
      sample(1000, [
        native(100, {
          title: "Sessão fictícia",
          startedAt: "2026-09-09T12:30:00Z",
        }),
      ]),
      sample(3000, [
        native(null, { audienceStatus: "unavailable", live: false }),
      ]),
      sample(2000, [
        native(null, {
          audienceStatus: "embedded",
          audienceOrigin: "twitch",
          title: "Anterior",
        }),
      ]),
    ]);
    const channel = analyze(data, t).byChannel.channels[0];
    expect(channel.audience).toEqual({
      status: "unavailable",
      origin: undefined,
      title: undefined,
      startedAt: undefined,
      live: false,
    });
    expect(channel.viewers).toMatchObject({
      peak: 100,
      avg: 100,
      hasData: true,
    });
  });

  it.each([null, undefined, "12", false, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "does not coerce invalid counts (%s) into measurements",
    (count) => {
      const data = session([sample(1000, [native(count)])]);
      expect(data.viewerSamples[0].items[0].viewers).toBeNull();
      expect(analyze(data, t).viewers.hasData).toBe(false);
    },
  );

  it("keeps offline zero distinct from an unavailable counter", () => {
    const data = session([
      sample(1000, [native(0, { audienceStatus: "offline", live: false })]),
    ]);
    expect(data.viewerSamples[0]).toMatchObject({
      total: 0,
      items: [{ viewers: 0, audienceStatus: "offline", live: false }],
    });
    expect(analyze(data, t).viewers.hasData).toBe(true);
  });

  it("does not create audience jumps across unknown totals", () => {
    const data = session([
      sample(1000, [native(10)]),
      sample(2000, [native(null, { audienceStatus: "unavailable" })]),
      sample(3000, [native(100)]),
    ]);
    expect(
      analyze(data, t).highlights.filter(
        (highlight) => highlight.kind === "viewers",
      ),
    ).toEqual([]);
  });

  it.each(["unavailable", "live"])(
    "leaves the total unknown when native Cinefy is %s without a counter, even if Twitch is measured",
    (audienceStatus) => {
      const twitch = {
        platform: "twitch",
        source: "demo-twitch",
        viewers: 100,
      };
      const data = session([
        sample(1000, [native(100), twitch], 200),
        sample(2000, [native(null, { audienceStatus }), twitch], 100),
        sample(3000, [native(100), twitch], 200),
      ]);
      const analysis = analyze(data, t);
      expect(viewerSeries(data)).toEqual([200, null, 200]);
      expect(viewerSeriesFor(data, "twitch:demo-twitch")).toEqual([
        100, 100, 100,
      ]);
      expect(viewerSeriesFor(data, cinefyKey)).toEqual([100, null, 100]);
      expect(analysis.viewers).toEqual({
        peak: 200,
        avg: 200,
        start: 200,
        end: 200,
        hasData: true,
      });
      expect(
        analysis.byChannel.channels.map((channel) => channel.viewers.avg),
      ).toEqual([100, 100]);
      expect(
        analysis.highlights.filter((highlight) => highlight.kind === "viewers"),
      ).toEqual([]);
    },
  );

  it("keeps the legacy total without requiring channel metadata", () => {
    const data = session([
      { kind: "viewers", t: 1000, total: 50 },
      { kind: "viewers", t: 2000, total: 0, items: [] },
      { kind: "viewers", t: 3000 },
      { kind: "viewers", t: 4000, total: null },
    ]);
    expect(viewerSeries(data)).toEqual([50, 0, null, null]);
    expect(analyze(data, t).viewers).toMatchObject({
      peak: 50,
      avg: 25,
      start: 50,
      end: 0,
    });
  });

  it("preserves a legacy viewer item without inventing live state or metadata", () => {
    const item = { platform: "twitch", source: "demo-twitch", viewers: 50 };
    const data = session([sample(1000, [item], 50)]);
    expect(data.viewerSamples[0].items).toEqual([item]);
    expect(analyze(data, t).byChannel.channels[0].audience).toBeUndefined();
  });

  it("ignores malformed items and unsupported metadata without coercing labels", () => {
    const data = session([
      sample(1000, [
        null,
        1,
        { platform: "unknown", source: "fixture" },
        { platform: "cinefy", source: {} },
        native(20, {
          audienceOrigin: "invalid",
          title: {},
          startedAt: 1788971400000,
          live: "true",
        }),
      ]),
    ]);
    expect(data.viewerSamples[0].items).toEqual([
      {
        platform: "cinefy",
        source: "demo-cinefy",
        viewers: 20,
        audienceStatus: "live",
      },
    ]);
    const malformed = session([
      { kind: "viewers", t: 1000, total: 20, items: {} },
    ]);
    expect(malformed.viewerSamples[0].items).toEqual([]);
  });

  it.each([
    "2026-09-09T12:30:00Z",
    "2026-09-09T09:30:00-03:00",
    "2024-02-29T12:30:00.123456789+00:00",
  ])("preserves a valid RFC3339 start time: %s", (startedAt) => {
    const data = session([sample(1000, [native(0, { startedAt })])]);
    expect(data.viewerSamples[0].items[0].startedAt).toBe(startedAt);
  });

  it.each([
    "2026-02-30T12:30:00Z",
    "2026-02-29T12:30:00Z",
    "2026-13-09T12:30:00Z",
    "2026-09-09T24:00:00Z",
    "2026-09-09T12:30:00",
    "1788971400000",
    "invalid",
    "",
  ])("rejects an invalid start time: %s", (startedAt) => {
    const data = session([sample(1000, [native(0, { startedAt })])]);
    expect(data.viewerSamples[0].items[0].startedAt).toBeUndefined();
  });

  it("bounds editable titles and strips control characters", () => {
    const data = session([
      sample(1000, [native(0, { title: `  \u0000${"a".repeat(600)}\n` })]),
    ]);
    expect(data.viewerSamples[0].items[0].title).toBe("a".repeat(512));
  });
});
