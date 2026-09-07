import { describe, it, expect } from "vitest";
import {
  analyze,
  chatRateSeriesFor,
  hasChat,
  hasObs,
  parseSession,
  timeAxis,
  viewerSeriesFor,
} from "./report";
import { interpolate, type Vars } from "./i18n/locale";
import { pt, type MessageKey } from "./i18n/pt";

const t = (k: MessageKey, vars?: Vars) => interpolate(pt[k], vars);

const nd = (lines: object[]) => lines.map((l) => JSON.stringify(l)).join("\n");

describe("parseSession", () => {
  it("reads metadata and samples and measures duration to end", () => {
    const d = parseSession(
      nd([
        {
          kind: "meta",
          id: "s1",
          startedAt: 1000,
          mode: "hybrid",
          platforms: [],
        },
        { kind: "sample", t: 2000, cpu: 40, gpu: 10, targets: [] },
        { kind: "sample", t: 3000, cpu: 50, targets: [] },
        { kind: "end", endedAt: 5000 },
      ]),
      t,
    )!;
    expect(d).not.toBeNull();
    expect(d.meta.id).toBe("s1");
    expect(d.meta.durationSec).toBe(4);
    expect(d.meta.endedAt).toBe(5000);
    expect(d.samples).toHaveLength(2);
    expect(timeAxis(d)).toEqual([2000, 3000]);
  });

  it("uses the last sample for an unfinished session without endedAt", () => {
    const d = parseSession(
      nd([
        {
          kind: "meta",
          id: "s2",
          startedAt: 0,
          mode: "per-platform",
          platforms: [],
        },
        { kind: "sample", t: 10000, targets: [] },
      ]),
      t,
    )!;
    expect(d.meta.endedAt).toBeUndefined();
    expect(d.meta.durationSec).toBe(10);
  });

  it("preserves the first end record after late recovery", () => {
    const d = parseSession(
      nd([
        { kind: "meta", id: "s-recovered", startedAt: 1000, platforms: [] },
        { kind: "sample", t: 4000, targets: [] },
        { kind: "end", endedAt: 5000 },
        { kind: "marker", t: 3000, label: "depois da live" },
        { kind: "end", endedAt: 2_005_000, recovered: true },
      ]),
      t,
    )!;

    expect(d.meta.endedAt).toBe(5000);
    expect(d.meta.durationSec).toBe(4);
  });

  it("skips malformed lines and untimed samples and requires metadata", () => {
    const d = parseSession(
      nd([
        { kind: "meta", id: "s3", startedAt: 0, platforms: [] },
        { kind: "sample", t: 1000, targets: [] },
        { kind: "sample", t: "nao-numero", targets: [] },
      ]) + "\nlixo que não é json\n",
      t,
    )!;
    expect(d.samples).toHaveLength(1);
    expect(parseSession("nada de meta aqui", t)).toBeNull();
    expect(parseSession("", t)).toBeNull();
  });

  it("sets hasObs and hasChat from observed data", () => {
    const withoutObs = parseSession(
      nd([
        { kind: "meta", id: "s4", startedAt: 0, platforms: [] },
        { kind: "sample", t: 1000, targets: [] },
      ]),
      t,
    )!;
    expect(hasObs(withoutObs)).toBe(false);
    expect(hasChat(withoutObs)).toBe(false);
    const withObs = parseSession(
      nd([
        { kind: "meta", id: "s5", startedAt: 0, platforms: [] },
        {
          kind: "sample",
          t: 1000,
          obs: { congestion: 0.1, renderMs: 5 },
          chat: 3,
          targets: [],
        },
      ]),
      t,
    )!;
    expect(hasObs(withObs)).toBe(true);
    expect(hasChat(withObs)).toBe(true);
  });

  it("bounds process data and removes paths at the report boundary", () => {
    const d = parseSession(
      nd([
        { kind: "meta", id: "apps", startedAt: 0, platforms: [] },
        {
          kind: "sample",
          t: 1000,
          memoryPct: 94.2,
          apps: [
            {
              appRef: "game",
              name: "C:\\Games\\MeuJogo.exe",
              cpu: 101,
              memoryMb: 4096,
              gpu3d: 92.3,
            },
          ],
          targets: [],
        },
      ]),
      t,
    )!;

    expect(d.samples[0].memoryPct).toBe(94.2);
    expect(d.samples[0].apps).toEqual([
      {
        appRef: "game",
        name: "MeuJogo.exe",
        cpu: 100,
        memoryMb: 4096,
        gpu3d: 92.3,
        gpuEncode: undefined,
      },
    ]);
  });
});

describe("problem windows", () => {
  const resourceSession = (avgRenderMs: number, withBusyApp = false) =>
    parseSession(
      nd([
        {
          kind: "meta",
          id: "resource-pressure",
          startedAt: 0,
          mode: "per-platform",
          platforms: [{ id: "twitch", platformId: "twitch", name: "Twitch" }],
        },
        ...Array.from({ length: 12 }, (_, index) => ({
          kind: "sample",
          t: 1000 + index * 2000,
          cpu: 99,
          gpu: 99,
          apps:
            withBusyApp && index % 3 === 0
              ? [
                  {
                    appRef: "meujogo",
                    name: "MeuJogo",
                    cpu: 25,
                    memoryMb: 2400,
                    gpu3d: 97,
                  },
                ]
              : undefined,
          obs: {
            activeFps: 60,
            avgRenderMs,
            renderSkipped: 0,
            outputSkipped: 0,
            congestion: 0,
          },
          targets: [
            {
              id: "twitch",
              name: "Twitch",
              state: "live",
              bitrate: 6000,
              dropped: 0,
              fps: 60,
            },
          ],
        })),
        { kind: "end", endedAt: 25000 },
      ]),
      t,
    )!;

  it("does not turn high CPU or GPU usage alone into an incident", () => {
    const analysis = analyze(resourceSession(4, true), t);
    expect(analysis.windows).toEqual([]);
    expect(analysis.events.some((event) => event.kind === "cpu")).toBe(true);
  });

  it("uses CPU and GPU pressure to explain observed OBS render lag", () => {
    const analysis = analyze(resourceSession(30), t);
    expect(analysis.windows).toHaveLength(1);
    expect(analysis.windows[0].causeKind).toBe("encoding");
  });

  it("identifies an application when pressure and delayed frames coincide", () => {
    const session = parseSession(
      nd([
        {
          kind: "meta",
          id: "app-cause",
          startedAt: 0,
          mode: "per-platform",
          platforms: [{ id: "twitch", platformId: "twitch", name: "Twitch" }],
        },
        ...Array.from({ length: 12 }, (_, index) => ({
          kind: "sample",
          t: 1000 + index * 2000,
          cpu: 88,
          gpu: 98,
          apps:
            index % 3 === 0
              ? [
                  {
                    appRef: "meujogo",
                    name: "MeuJogo",
                    cpu: 35,
                    memoryMb: 3200,
                    gpu3d: 96,
                  },
                ]
              : undefined,
          obs: {
            activeFps: 60,
            avgRenderMs: 31,
            renderSkipped: index * 12,
            outputSkipped: 0,
            congestion: 0,
          },
          targets: [
            {
              id: "twitch",
              name: "Twitch",
              state: "live",
              bitrate: 6000,
              dropped: 0,
              fps: 60,
            },
          ],
        })),
        { kind: "end", endedAt: 25000 },
      ]),
      t,
    )!;

    const analysis = analyze(session, t);
    expect(analysis.windows).toHaveLength(1);
    expect(analysis.windows[0].causeKind).toBe("app");
    expect(analysis.windows[0].confidence).toBe("high");
    expect(analysis.windows[0].contributingApp).toBe("MeuJogo");
    expect(analysis.windows[0].cause).toContain("MeuJogo");
    expect(analysis.windows[0].signals.join(" ")).toContain("placa de vídeo");
    const [resourcePressure, observedImpact, affectedScope] =
      analysis.windows[0].signals;
    expect(resourcePressure).toMatch(
      /^MeuJogo segurou \d+% da placa de vídeo$/,
    );
    expect(observedImpact).toMatch(
      /^(Na mesma hora,|\d+s depois,) o OBS pulou \d+ quadros ao montar a cena$/,
    );
    expect(affectedScope).toContain("dentro do PC");
  });

  it("uses the preceding pressure sample when it leads render lag", () => {
    const session = parseSession(
      nd([
        {
          kind: "meta",
          id: "temporal-cause",
          startedAt: 0,
          mode: "per-platform",
          platforms: [{ id: "twitch", platformId: "twitch", name: "Twitch" }],
        },
        {
          kind: "sample",
          t: 1000,
          cpu: 80,
          gpu: 97,
          apps: [
            {
              appRef: "meujogo",
              name: "MeuJogo",
              cpu: 30,
              memoryMb: 2800,
              gpu3d: 96,
            },
          ],
          obs: {
            activeFps: 60,
            avgRenderMs: 7,
            renderSkipped: 0,
            outputSkipped: 0,
            congestion: 0,
          },
          targets: [
            {
              id: "twitch",
              name: "Twitch",
              state: "live",
              bitrate: 6000,
              dropped: 0,
              fps: 60,
            },
          ],
        },
        {
          kind: "sample",
          t: 3000,
          cpu: 82,
          gpu: 97,
          obs: {
            activeFps: 60,
            avgRenderMs: 7,
            renderSkipped: 40,
            outputSkipped: 0,
            congestion: 0,
          },
          targets: [
            {
              id: "twitch",
              name: "Twitch",
              state: "live",
              bitrate: 6000,
              dropped: 0,
              fps: 60,
            },
          ],
        },
        { kind: "end", endedAt: 5000 },
      ]),
      t,
    )!;

    const analysis = analyze(session, t);
    expect(analysis.windows).toHaveLength(1);
    expect(analysis.windows[0].causeKind).toBe("app");
    expect(analysis.windows[0].contributingApp).toBe("MeuJogo");
  });

  it("does not blame an application observed long before render lag", () => {
    const session = parseSession(
      nd([
        {
          kind: "meta",
          id: "stale-app-pressure",
          startedAt: 0,
          mode: "per-platform",
          platforms: [{ id: "twitch", platformId: "twitch", name: "Twitch" }],
        },
        {
          kind: "sample",
          t: 1000,
          cpu: 85,
          gpu: 97,
          apps: [
            {
              appRef: "editor",
              name: "Editor",
              cpu: 30,
              memoryMb: 2500,
              gpu3d: 95,
            },
          ],
          obs: {
            activeFps: 60,
            avgRenderMs: 7,
            renderSkipped: 0,
            outputSkipped: 0,
            congestion: 0,
          },
          targets: [],
        },
        ...[60_000, 72_000].map((timestamp) => ({
          kind: "sample",
          t: timestamp,
          cpu: 35,
          gpu: 30,
          obs: {
            activeFps: 60,
            avgRenderMs: 32,
            renderSkipped: 0,
            outputSkipped: 0,
            congestion: 0,
          },
          targets: [],
        })),
        { kind: "end", endedAt: 74_000 },
      ]),
      t,
    )!;

    const analysis = analyze(session, t);
    expect(analysis.windows).toHaveLength(1);
    expect(analysis.windows[0].causeKind).toBe("render");
    expect(analysis.windows[0].contributingApp).toBeUndefined();
  });

  it("summarizes the dominant application without attributing other applications' incidents to it", () => {
    let skipped = 0;
    const incidentApps = new Map([
      [1, "Editor"],
      [4, "MeuJogo"],
      [7, "MeuJogo"],
    ]);
    const session = parseSession(
      nd([
        {
          kind: "meta",
          id: "multiple-app-causes",
          startedAt: 0,
          mode: "per-platform",
          platforms: [{ id: "twitch", platformId: "twitch", name: "Twitch" }],
        },
        ...Array.from({ length: 8 }, (_, index) => {
          const app = incidentApps.get(index);
          if (app) skipped += 40;
          return {
            kind: "sample",
            t: 1000 + index * 2000,
            cpu: app ? 88 : 35,
            gpu: app ? 96 : 30,
            ...(app
              ? {
                  apps: [
                    {
                      appRef: app.toLowerCase(),
                      name: app,
                      cpu: 35,
                      memoryMb: 2800,
                      gpu3d: 94,
                    },
                  ],
                }
              : {}),
            obs: {
              activeFps: 60,
              avgRenderMs: 7,
              renderSkipped: skipped,
              outputSkipped: 0,
              congestion: 0,
            },
            targets: [
              {
                id: "twitch",
                name: "Twitch",
                state: "live",
                bitrate: 6000,
                dropped: 0,
                fps: 60,
              },
            ],
          };
        }),
        { kind: "end", endedAt: 17_000 },
      ]),
      t,
    )!;

    const analysis = analyze(session, t);
    expect(analysis.windows).toHaveLength(3);
    expect(analysis.verdict.title).toContain("MeuJogo");
    expect(analysis.verdict.detail).toContain("Em 2 trechos");
    expect(analysis.verdict.detail).toContain("2s no total");
    expect(analysis.verdict.detail).not.toContain("Em 3 trechos");
  });
});

const sessionData = (body: object[]) =>
  parseSession(
    nd([
      { kind: "meta", id: "c", startedAt: 0, mode: "hybrid", platforms: [] },
      ...body,
      { kind: "end", endedAt: 120000 },
    ]),
    t,
  )!;

const A = "twitch:Canal A";
const B = "youtube:Canal B";
const seg = { platform: "twitch", source: "Canal A" };

const viewers = (t: number, items: object[]) => ({
  kind: "viewers",
  t,
  total: items.reduce(
    (acc: number, i) => acc + ((i as { viewers: number | null }).viewers ?? 0),
    0,
  ),
  items,
});

describe("byChannel", () => {
  const completeSession = sessionData([
    {
      kind: "sample",
      t: 1000,
      chat: 3,
      chatBy: { [A]: 2, [B]: 1 },
      targets: [],
    },
    { kind: "sample", t: 3000, chat: 2, chatBy: { [A]: 2 }, targets: [] },
    viewers(1000, [
      { platform: "twitch", source: "Canal A", viewers: 100 },
      { platform: "youtube", source: "Canal B", viewers: 50 },
    ]),
    viewers(2000, [
      { platform: "twitch", source: "Canal A", viewers: 200 },
      { platform: "youtube", source: "Canal B", viewers: 50 },
    ]),
    {
      kind: "alert",
      t: 1500,
      platform: "twitch",
      source: "Canal A",
      alertKind: "sub",
      user: "fulano",
    },
    {
      kind: "alert",
      t: 1600,
      platform: "youtube",
      source: "Canal B",
      alertKind: "bits",
      user: "ciclano",
      amount: 300,
    },
  ]);

  it("combines audience, chat and alerts per channel", () => {
    const { channels, hasChatByChannel } = analyze(
      completeSession,
      t,
    ).byChannel;
    expect(hasChatByChannel).toBe(true);
    expect(channels.map((c) => c.key)).toEqual([A, B]);

    const [a, b] = channels;
    expect(a.viewers).toMatchObject({ peak: 200, avg: 150, hasData: true });
    expect(a.chat).toMatchObject({ total: 4, perMin: 2 });
    expect(a.alerts.subs).toBe(1);
    expect(b.viewers).toMatchObject({ peak: 50, avg: 50 });
    expect(b.chat.total).toBe(1);
    expect(b.alerts.bits).toBe(300);
  });

  it("channel averages sum to the stream average", () => {
    const r = analyze(completeSession, t);
    const audienceSum = r.byChannel.channels.reduce(
      (s, c) => s + c.viewers.avg,
      0,
    );
    expect(audienceSum).toBe(r.viewers.avg);
  });

  it("computes shares from accumulated audience rather than peaks", () => {
    const [a, b] = analyze(completeSession, t).byChannel.channels;
    // Channel peaks are not simultaneous; summing them would invent concurrent viewers.
    expect(a.sharePct).toBe(75);
    expect(b.sharePct).toBe(25);
  });

  it("exposes audience and chat series for a single channel", () => {
    expect(viewerSeriesFor(completeSession, A)).toEqual([100, 200]);
    expect(viewerSeriesFor(completeSession, "kick:Nao existe")).toEqual([
      null,
      null,
    ]);
    expect(chatRateSeriesFor(completeSession, A)).toEqual([60, 60]);
    expect(chatRateSeriesFor(completeSession, B)).toEqual([30, 0]);
  });

  it("includes offline channels without inflating peaks or shares", () => {
    const d = sessionData([
      viewers(1000, [
        { platform: "twitch", source: "Canal A", viewers: 100 },
        { platform: "kick", source: "Canal C", viewers: null },
      ]),
    ]);
    const c = analyze(d, t).byChannel.channels.find((x) =>
      x.key.startsWith("kick"),
    )!;
    expect(c.viewers).toMatchObject({ peak: 0, avg: 0, hasData: false });
    expect(c.sharePct).toBe(0);
  });

  it("includes Cinefy chat without an audience counter", () => {
    const key = "cinefy:kett";
    const d = sessionData([
      { kind: "sample", t: 1000, chat: 4, chatBy: { [key]: 4 }, targets: [] },
    ]);
    const channel = analyze(d, t).byChannel.channels.find((c) => c.key === key);
    expect(channel).toMatchObject({
      platform: "cinefy",
      source: "kett",
      chat: { total: 4, hasData: true },
      viewers: { hasData: false },
    });
  });

  it("preserves channel audience for legacy sessions without per-channel chat", () => {
    const d = sessionData([
      { kind: "sample", t: 1000, chat: 5, targets: [] },
      viewers(1000, [
        { platform: "twitch", source: "Canal A", viewers: 100 },
        { platform: "youtube", source: "Canal B", viewers: 100 },
      ]),
    ]);
    const { channels, hasChatByChannel } = analyze(d, t).byChannel;
    expect(hasChatByChannel).toBe(false);
    expect(channels).toHaveLength(2);
    expect(channels.every((c) => c.chat.total === 0)).toBe(true);
    expect(channels.every((c) => c.chat.hasData === false)).toBe(true);
  });

  it("attributes sourceless alerts only when the platform has one channel", () => {
    const alertRecord = {
      kind: "alert",
      t: 1500,
      platform: "twitch",
      alertKind: "raid",
      user: "fulano",
      amount: 30,
    };
    const oneChannel = analyze(
      sessionData([
        viewers(1000, [
          { platform: "twitch", source: "Canal A", viewers: 100 },
        ]),
        alertRecord,
      ]),
      t,
    ).byChannel;
    expect(oneChannel.unattributedAlerts).toBe(0);
    expect(oneChannel.channels[0].alerts.raids).toBe(1);

    const twoChannels = analyze(
      sessionData([
        viewers(1000, [
          { platform: "twitch", source: "Canal A", viewers: 100 },
          { platform: "twitch", source: "Canal B", viewers: 90 },
        ]),
        alertRecord,
      ]),
      t,
    ).byChannel;
    expect(twoChannels.unattributedAlerts).toBe(1);
    expect(twoChannels.channels.every((c) => c.alerts.total === 0)).toBe(true);
  });

  it("computes follower gains from the first and last counter samples", () => {
    const d = sessionData([
      viewers(1000, [{ platform: "twitch", source: "Canal A", viewers: 100 }]),
      { kind: "followers", t: 1000, items: [{ ...seg, total: 12_480 }] },
      { kind: "followers", t: 60000, items: [{ ...seg, total: 12_509 }] },
    ]);
    const b = analyze(d, t).byChannel;
    expect(b.channels[0].followers).toEqual({
      gained: 29,
      total: 12_509,
      from: "counter",
      hasData: true,
    });
    expect(b.followersGained).toBe(29);
    expect(b.followersNet).toBe(true);
  });

  it("reports falling follower counters as negative gains", () => {
    const d = sessionData([
      { kind: "followers", t: 1000, items: [{ ...seg, total: 900 }] },
      { kind: "followers", t: 60000, items: [{ ...seg, total: 897 }] },
    ]);
    expect(analyze(d, t).byChannel.followersGained).toBe(-3);
  });

  it("does not infer a follower gain from one sample", () => {
    const d = sessionData([
      { kind: "followers", t: 1000, items: [{ ...seg, total: 900 }] },
    ]);
    const f = analyze(d, t).byChannel.channels[0].followers;
    expect(f).toMatchObject({ from: null, hasData: false, total: 900 });
    expect(analyze(d, t).byChannel.followersGained).toBeNull();
  });

  it("falls back to channel follow alerts without a counter", () => {
    const d = sessionData([
      viewers(1000, [{ platform: "twitch", source: "Canal A", viewers: 100 }]),
      ...[1500, 1600, 1700].map((t) => ({
        kind: "alert",
        t,
        platform: "twitch",
        source: "Canal A",
        alertKind: "follow",
        user: "fulano",
      })),
    ]);
    const b = analyze(d, t).byChannel;
    expect(b.channels[0].followers).toMatchObject({
      gained: 3,
      from: "alerts",
    });
    expect(b.followersNet).toBe(false);
    expect(b.followersGained).toBe(3);
  });

  it("counts standalone Streamlabs follows without double-counting platform counters", () => {
    const slFollow = (t: number) => ({
      kind: "alert",
      t,
      platform: "streamlabs",
      source: "Minha conta",
      alertKind: "follow",
      user: "fulano",
    });
    const standalone = analyze(
      sessionData([slFollow(1500), slFollow(1600)]),
      t,
    ).byChannel;
    expect(standalone.followersGained).toBe(2);
    expect(standalone.followersNet).toBe(false);

    // The platform counter and aggregator can observe the same followers; do not add both.
    const combined = analyze(
      sessionData([
        { kind: "followers", t: 1000, items: [{ ...seg, total: 12_480 }] },
        { kind: "followers", t: 60000, items: [{ ...seg, total: 12_509 }] },
        slFollow(1500),
        slFollow(1600),
      ]),
      t,
    ).byChannel;
    expect(combined.followersGained).toBe(29);
    expect(combined.followersNet).toBe(true);
  });

  it("does not invent zero followers without a measurement source", () => {
    const d = sessionData([
      viewers(1000, [{ platform: "twitch", source: "Canal A", viewers: 100 }]),
    ]);
    expect(analyze(d, t).byChannel.followersGained).toBeNull();
  });

  it("does not invent channel attribution for aggregator alerts", () => {
    const { channels, unattributedAlerts } = analyze(
      sessionData([
        viewers(1000, [
          { platform: "twitch", source: "Canal A", viewers: 100 },
        ]),
        {
          kind: "alert",
          t: 1500,
          platform: "streamlabs",
          source: "Minha conta",
          alertKind: "tip",
          user: "anônimo",
          amount: 20,
        },
      ]),
      t,
    ).byChannel;
    expect(unattributedAlerts).toBe(1);
    expect(channels.map((c) => c.key)).toEqual([A]);
  });
});
