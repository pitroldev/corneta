import { describe, expect, it } from "vitest";
import { en } from "../i18n/en";
import { interpolate, type Vars } from "../i18n/locale";
import { pt, type MessageKey } from "../i18n/pt";
import type { Highlight } from "../report";
import { buildReplayIndex, type ReplaySegment } from "../replay";
import type { SessionMarker, SessionMeta } from "../types";
import { BOM } from "./csv";
import {
  collectMoments,
  momentsCsv,
  momentsEdl,
  youtubeChapters,
  type Moment,
} from "./moments";

const tPt = (key: MessageKey, vars?: Vars) => interpolate(pt[key], vars);
const tEn = (key: MessageKey, vars?: Vars) => interpolate(en[key], vars);

const T0 = new Date(2026, 9, 18, 20, 0).getTime();

const meta: SessionMeta = {
  id: "1",
  startedAt: T0,
  durationSec: 3 * 3600,
  mode: "hybrid",
  platforms: [{ id: "t1", name: "Twitch", platformId: "twitch" }],
};

const highlight = (
  t: number,
  kind: Highlight["kind"],
  reason: string,
): Highlight => ({ t, kind, reason, score: 1 });

const marker = (t: number, label: string): SessionMarker => ({ t, label });

const segment = (
  seg: number,
  t: number,
  durationMs: number,
): ReplaySegment => ({
  seg,
  t,
  path: `S${seg}.mp4`,
  codec: "h264",
  estimated: false,
  syncs: [
    { t, out: 0 },
    { t: t + durationMs, out: durationMs },
  ],
  endT: t + durationMs,
});

const moment = (
  seconds: number,
  label: string,
  kind: Moment["kind"] = "marker",
): Moment => ({ ms: seconds * 1000, kind, label });

const timeline = (moments: Moment[], durationSec = 3 * 3600) => ({
  base: "live" as const,
  moments,
  durationMs: durationSec * 1000,
});

const csvRows = (csv: string) =>
  (csv.startsWith(BOM) ? csv.slice(BOM.length) : csv).trim().split("\r\n");

describe("collectMoments", () => {
  it("counts from the stream start when there is no recording", () => {
    const result = collectMoments(
      { meta, markers: [marker(T0 + 90_000, "Momento")] },
      [highlight(T0 + 30_000, "chat", "Chat explodiu (85/min)")],
      null,
    );
    expect(result).toEqual({
      base: "live",
      moments: [
        { ms: 30_000, kind: "chat", label: "Chat explodiu (85/min)" },
        { ms: 90_000, kind: "marker", label: "Momento" },
      ],
      outside: 0,
      durationMs: 3 * 3600 * 1000,
      files: 0,
    });
  });

  it("treats an index without segments as no recording", () => {
    const result = collectMoments(
      { meta, markers: [marker(T0 + 5_000, "Momento")] },
      [],
      buildReplayIndex([]),
    );
    expect(result.base).toBe("live");
    expect(result.moments[0].ms).toBe(5_000);
  });

  it("follows the recording and its sync offset, leaving out unrecorded moments", () => {
    const replay = buildReplayIndex(
      [segment(1, T0 + 20_000, 60_000)],
      [],
      2_000,
    );
    const result = collectMoments(
      { meta, markers: [marker(T0 + 10_000, "Antes de gravar")] },
      [highlight(T0 + 30_000, "raid", "Raid de Ana (+40)")],
      replay,
    );
    expect(result.base).toBe("recording");
    expect(result.moments).toEqual([
      { ms: 12_000, kind: "raid", label: "Raid de Ana (+40)" },
    ]);
    expect(result.outside).toBe(1);
    expect(result.durationMs).toBe(60_000);
    expect(result.files).toBe(1);
  });

  it("lays recording files back to back", () => {
    const replay = buildReplayIndex([
      segment(1, T0, 60_000),
      segment(2, T0 + 90_000, 30_000),
    ]);
    const result = collectMoments(
      { meta, markers: [marker(T0 + 100_000, "Depois da queda")] },
      [],
      replay,
    );
    expect(result.moments[0].ms).toBe(70_000);
    expect(result.files).toBe(2);
    expect(result.durationMs).toBe(90_000);
  });

  it("keeps labels on a single line", () => {
    const result = collectMoments(
      { meta, markers: [marker(T0 + 1_000, "  Clutch\r\nabsurdo\t ")] },
      [],
      null,
    );
    expect(result.moments[0].label).toBe("Clutch absurdo");
  });
});

describe("youtubeChapters", () => {
  it("sorts chapters and opens the list at 00:00", () => {
    const result = youtubeChapters(
      timeline([moment(125, "Raid"), moment(40, "Chat", "chat")]),
      tPt,
    );
    expect(result).toEqual({
      ok: true,
      count: 3,
      text: "00:00 Início\n00:40 Chat\n02:05 Raid",
    });
  });

  it("uses the localized opening title", () => {
    const result = youtubeChapters(
      timeline([moment(40, "Chat"), moment(125, "Raid")]),
      tEn,
    );
    expect(result.ok && result.text.split("\n")[0]).toBe("00:00 Start");
  });

  it("turns a moment in the first 10 seconds into the opening chapter", () => {
    const result = youtubeChapters(
      timeline([moment(4, "Começo"), moment(60, "A"), moment(120, "B")]),
      tPt,
    );
    expect(result.ok && result.text).toBe("00:00 Começo\n01:00 A\n02:00 B");
  });

  it("folds moments closer than 10 seconds into the previous chapter", () => {
    const result = youtubeChapters(
      timeline([
        moment(60, "A"),
        moment(65, "B"),
        moment(69.4, "C"),
        moment(70, "D"),
      ]),
      tPt,
    );
    expect(result.ok && result.text).toBe("00:00 Início\n01:00 A\n01:10 D");
  });

  it("refuses fewer than three chapters instead of returning invalid text", () => {
    expect(youtubeChapters(timeline([]), tPt)).toEqual({
      ok: false,
      reason: "tooFew",
    });
    expect(youtubeChapters(timeline([moment(60, "A")]), tPt)).toEqual({
      ok: false,
      reason: "tooFew",
    });
    expect(
      youtubeChapters(timeline([moment(60, "A"), moment(63, "B")]), tPt),
    ).toEqual({ ok: false, reason: "tooFew" });
  });

  it("drops a last chapter shorter than 10 seconds", () => {
    const moments = [moment(60, "A"), moment(120, "B")];
    expect(youtubeChapters(timeline(moments, 125), tPt)).toEqual({
      ok: false,
      reason: "tooFew",
    });
    expect(youtubeChapters(timeline(moments, 130), tPt).ok).toBe(true);
  });

  it("writes hours once a chapter passes the first hour", () => {
    const result = youtubeChapters(
      timeline([moment(600, "A"), moment(3725, "B")]),
      tPt,
    );
    expect(result.ok && result.text).toBe("00:00 Início\n10:00 A\n1:02:05 B");
  });

  it("names a moment by its type when its label is empty", () => {
    const result = youtubeChapters(
      timeline([moment(30, "Chat", "chat"), moment(60, "")]),
      tPt,
    );
    expect(result.ok && result.text.split("\n")[2]).toBe("01:00 marcador");
  });
});

describe("momentsCsv", () => {
  it("uses the pt-BR dialect and names the recording time base", () => {
    const csv = momentsCsv(
      {
        base: "recording",
        moments: [
          moment(3725, "Raid de Zé (+50)", "raid"),
          moment(330.4, "Momento"),
        ],
      },
      { locale: "pt-BR", t: tPt },
    );
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csvRows(csv)).toEqual([
      "tempo_na_gravacao;tipo;descricao",
      "0:05:30;marcador;Momento",
      "1:02:05;raid;Raid de Zé (+50)",
    ]);
  });

  it("uses the English dialect and quotes the active separator", () => {
    const moments = [
      moment(42, "Raid from Ana, Bia (+12)", "raid"),
      moment(50, "Gifts; lots", "alert"),
    ];
    expect(
      csvRows(momentsCsv({ base: "live", moments }, { locale: "en", t: tEn })),
    ).toEqual([
      "stream_time,type,label",
      '0:00:42,raid,"Raid from Ana, Bia (+12)"',
      "0:00:50,alert,Gifts; lots",
    ]);
    expect(
      csvRows(
        momentsCsv({ base: "live", moments }, { locale: "pt-BR", t: tPt }),
      ).slice(1),
    ).toEqual([
      "0:00:42;raid;Raid from Ana, Bia (+12)",
      '0:00:50;alerta;"Gifts; lots"',
    ]);
  });

  it("keeps the spreadsheet formula guard for labels", () => {
    const csv = momentsCsv(
      {
        base: "live",
        moments: [moment(90, "+15 assistindo de uma vez", "viewers")],
      },
      { locale: "pt-BR", t: tPt },
    );
    expect(csvRows(csv)[1]).toBe(
      "0:01:30;audiência;'+15 assistindo de uma vez",
    );
  });
});

describe("momentsEdl", () => {
  const edl = (moments: Moment[], fps?: number) =>
    momentsEdl(
      { moments },
      { title: "corneta-live-2026-10-18-momentos", t: tPt, fps },
    );

  it("writes a CMX 3600 header and one single-frame event per moment", () => {
    expect(edl([moment(5.5, "Momento")]).split("\r\n")).toEqual([
      "TITLE: corneta-live-2026-10-18-momentos",
      "FCM: NON-DROP FRAME",
      "",
      "001  001      V     C        01:00:05:15 01:00:05:16 01:00:05:15 01:00:05:16",
      " |C:ResolveColorBlue |M:Momento |D:1",
      "* LOC: 01:00:05:15 BLUE    Momento",
      "",
    ]);
  });

  it("numbers events in time order and carries timecodes past an hour", () => {
    const lines = edl([
      moment(3725, "Raid de Ana (+40)", "raid"),
      moment(0, "Chat explodiu (85/min)", "chat"),
    ]).split("\r\n");
    expect(lines.filter((line) => /^\d{3} /.test(line))).toEqual([
      "001  001      V     C        01:00:00:00 01:00:00:01 01:00:00:00 01:00:00:01",
      "002  001      V     C        02:02:05:00 02:02:05:01 02:02:05:00 02:02:05:01",
    ]);
    expect(lines).toContain(" |C:ResolveColorPurple |M:Raid de Ana (+40) |D:1");
    expect(lines).toContain(
      "* LOC: 01:00:00:00 YELLOW  Chat explodiu (85/min)",
    );
  });

  it("counts frames at the requested rate", () => {
    const lines = edl([moment(1.5, "Momento")], 25).split("\r\n");
    expect(lines[3]).toBe(
      "001  001      V     C        01:00:01:13 01:00:01:14 01:00:01:13 01:00:01:14",
    );
  });

  it("folds names to ASCII and keeps Resolve's field separator out", () => {
    const lines = edl([
      moment(10, "Raid de Zé | ação 🎉", "raid"),
      moment(20, "🎉🎉"),
    ]).split("\r\n");
    expect(lines).toContain(" |C:ResolveColorPurple |M:Raid de Ze / acao |D:1");
    expect(lines).toContain(" |C:ResolveColorBlue |M:marcador |D:1");
    expect(lines.every((line) => /^[ -~]*$/.test(line))).toBe(true);
  });

  it("merges moments that land on the same frame", () => {
    const lines = edl([
      moment(10, "Momento"),
      moment(10.01, "Chat explodiu (85/min)", "chat"),
    ]).split("\r\n");
    expect(lines.filter((line) => /^\d{3} /.test(line))).toHaveLength(1);
    expect(lines).toContain(
      " |C:ResolveColorBlue |M:Momento / Chat explodiu (85/min) |D:1",
    );
  });
});
