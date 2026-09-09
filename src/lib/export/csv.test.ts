import { describe, it, expect } from "vitest";
import { BOM, toCsv, historyCsv, seriesCsv } from "./csv";
import { analyze, parseSession } from "../report";
import { interpolate, type Vars } from "../i18n/locale";
import { makeFmt } from "../i18n/format";
import { pt, type MessageKey } from "../i18n/pt";
import type { SessionMeta } from "../types";

const t = (k: MessageKey, vars?: Vars) => interpolate(pt[k], vars);

const i18n = { locale: "pt-BR", t, fmt: makeFmt("pt-BR") } as const;

const rows = (csv: string) =>
  (csv.startsWith(BOM) ? csv.slice(BOM.length) : csv).trim().split("\r\n");

describe("toCsv", () => {
  it("uses a BOM and semicolon separator for pt-BR spreadsheets", () => {
    const csv = toCsv([
      ["a", "b"],
      [1, 2],
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(rows(csv)).toEqual(["a;b", "1;2"]);
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("uses decimal commas and empty cells for null", () => {
    expect(rows(toCsv([[1.5, null, undefined, 0]]))[0]).toBe("1,5;;;0");
  });

  it("escapes quotes, newlines and the active separator", () => {
    expect(rows(toCsv([['diz "oi"', "a;b"]]))[0]).toBe('"diz ""oi""";"a;b"');
    expect(toCsv([["duas\nlinhas"]])).toContain('"duas\nlinhas"');
  });

  it("neutralizes spreadsheet formula text", () => {
    // User-defined labels must not become executable spreadsheet formulas.
    expect(rows(toCsv([["=1+1"]]))[0]).toBe("'=1+1");
    expect(rows(toCsv([["@canal"]]))[0]).toBe("'@canal");
    expect(rows(toCsv([[-3]]))[0]).toBe("-3");
  });

  it("uses comma separators and decimal points for English", () => {
    expect(rows(toCsv([["a", "b"], [1.5]], "en"))).toEqual(["a,b", "1.5"]);
  });

  it("escapes the separator selected by locale", () => {
    expect(rows(toCsv([["a,b", "c;d"]], "en"))[0]).toBe('"a,b",c;d');
    expect(rows(toCsv([["a,b", "c;d"]], "pt-BR"))[0]).toBe('a,b;"c;d"');
  });
});

const meta = (over: Partial<SessionMeta> = {}): SessionMeta => ({
  id: "1",
  startedAt: new Date(2026, 6, 30, 20, 15).getTime(),
  durationSec: 3600,
  mode: "hybrid",
  platforms: [{ id: "t1", name: "Twitch", platformId: "twitch" }],
  ...over,
});

const sessionData = (body: object[], m = meta()) =>
  parseSession(
    [
      {
        kind: "meta",
        id: m.id,
        startedAt: m.startedAt,
        mode: m.mode,
        platforms: m.platforms,
      },
      ...body,
      { kind: "end", endedAt: m.startedAt + m.durationSec * 1000 },
    ]
      .map((l) => JSON.stringify(l))
      .join("\n"),
    t,
  )!;

describe("historyCsv", () => {
  it("exports one row per stream with ISO date and local time", () => {
    const d = sessionData([
      {
        kind: "viewers",
        t: meta().startedAt + 1000,
        total: 100,
        items: [{ platform: "twitch", source: "Twitch", viewers: 100 }],
      },
      {
        kind: "viewers",
        t: meta().startedAt + 2000,
        total: 300,
        items: [{ platform: "twitch", source: "Twitch", viewers: 300 }],
      },
    ]);
    const out = rows(
      historyCsv([{ meta: meta(), analysis: analyze(d, t) }], i18n),
    );
    expect(out).toHaveLength(2);
    expect(out[0].startsWith("data;inicio;duracao_min")).toBe(true);
    const c = out[1].split(";");
    expect(c[0]).toBe("2026-07-30");
    expect(c[1]).toBe("20:15");
    expect(c[2]).toBe("60");
    expect(c[3]).toBe("Twitch");
    expect(c[5]).toBe("300");
  });

  it("leaves missing audience empty instead of inventing zero", () => {
    const out = rows(
      historyCsv(
        [{ meta: meta(), analysis: analyze(sessionData([]), t) }],
        i18n,
      ),
    );
    const c = out[1].split(";");
    expect(c[5]).toBe("");
    expect(c[7]).toBe("");
  });
});

describe("seriesCsv", () => {
  const start = meta().startedAt;
  const d = sessionData([
    {
      kind: "sample",
      t: start + 2000,
      cpu: 40,
      gpu: 22,
      memoryPct: 58,
      chat: 2,
      chatBy: { "twitch:Twitch": 2 },
      targets: [
        { id: "t1", name: "Twitch", state: "live", bitrate: 6000, dropped: 0 },
      ],
    },
    {
      kind: "viewers",
      t: start + 3000,
      total: 120,
      items: [{ platform: "twitch", source: "Twitch", viewers: 120 }],
    },
    {
      kind: "sample",
      t: start + 4000,
      cpu: 44,
      gpu: 25,
      memoryPct: 61,
      chat: 0,
      targets: [
        { id: "t1", name: "Twitch", state: "live", bitrate: 6100, dropped: 3 },
      ],
    },
  ]);

  it("exports one row per sample with relative time", () => {
    const out = rows(seriesCsv(d, analyze(d, t), i18n));
    expect(out).toHaveLength(3);
    expect(out[1].split(";")[0]).toBe("2");
    expect(out[2].split(";")[0]).toBe("4");
  });

  it("names destination columns after their destinations", () => {
    const head = rows(seriesCsv(d, analyze(d, t), i18n))[0];
    expect(head).toContain("bitrate_kbps_Twitch");
    expect(head).toContain("estado_Twitch");
    expect(head).toContain("chat_por_min_Twitch");
    expect(head).toContain("memoria_pct");
  });

  it("labels audience as the last known value", () => {
    // Audience samples use a separate cadence; carry the last known value forward only after its timestamp.
    const out = rows(seriesCsv(d, analyze(d, t), i18n));
    const head = out[0].split(";");
    const col = head.indexOf("assistindo_ultimo_conhecido_Twitch");
    expect(col).toBeGreaterThan(-1);
    expect(out[1].split(";")[col]).toBe("");
    expect(out[2].split(";")[col]).toBe("120");
  });

  it("clears Cinefy audience during unavailable, embedded and missing samples", () => {
    const audience = (
      offset: number,
      viewers: number | null,
      audienceStatus: string,
      extra = {},
    ) => ({
      kind: "viewers",
      t: start + offset,
      total: viewers ?? 0,
      items: [
        {
          platform: "cinefy",
          source: "Cinefy",
          viewers,
          audienceStatus,
          ...extra,
        },
      ],
    });
    const data = sessionData([
      audience(1000, 120, "live"),
      audience(3000, null, "unavailable"),
      audience(5000, 80, "live"),
      audience(7000, null, "embedded", { audienceOrigin: "youtube" }),
      audience(9000, 0, "live"),
      { kind: "viewers", t: start + 11000, total: 0, items: [] },
      ...[2000, 4000, 6000, 8000, 10000, 12000].map((offset) => ({
        kind: "sample",
        t: start + offset,
        targets: [],
      })),
    ]);
    const out = rows(seriesCsv(data, analyze(data, t), i18n));
    const column = out[0]
      .split(";")
      .indexOf("assistindo_ultimo_conhecido_Cinefy");
    expect(column).toBeGreaterThan(-1);
    expect(out.slice(1).map((row) => row.split(";")[column])).toEqual([
      "120",
      "",
      "80",
      "",
      "0",
      "",
    ]);
  });
});
