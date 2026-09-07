import { describe, it, expect } from "vitest";
import { reportHtml } from "./html";
import { reportJson, REPORT_JSON_VERSION } from "./json";
import { anonymize } from "./anonymize";
import { analyze, parseSession } from "../report";
import { interpolate, type Vars } from "../i18n/locale";
import { pt, type MessageKey } from "../i18n/pt";
import { makeFmt } from "../i18n/format";

const t = (k: MessageKey, vars?: Vars) => interpolate(pt[k], vars);
const i18n = { locale: "pt-BR" as const, t, fmt: makeFmt("pt-BR") };

const start = new Date(2026, 6, 30, 20, 15).getTime();

const sessionData = (extra: object[] = []) =>
  parseSession(
    [
      {
        kind: "meta",
        id: "1",
        startedAt: start,
        mode: "hybrid",
        platforms: [{ id: "t1", name: "Twitch", platformId: "twitch" }],
      },
      {
        kind: "sample",
        t: start + 2000,
        cpu: 40,
        chat: 2,
        targets: [
          {
            id: "t1",
            name: "Twitch",
            state: "live",
            bitrate: 6000,
            dropped: 0,
          },
        ],
      },
      {
        kind: "sample",
        t: start + 4000,
        cpu: 44,
        chat: 3,
        targets: [
          {
            id: "t1",
            name: "Twitch",
            state: "live",
            bitrate: 6100,
            dropped: 0,
          },
        ],
      },
      {
        kind: "viewers",
        t: start + 2000,
        total: 100,
        items: [{ platform: "twitch", source: "Twitch", viewers: 100 }],
      },
      {
        kind: "viewers",
        t: start + 4000,
        total: 300,
        items: [{ platform: "twitch", source: "Twitch", viewers: 300 }],
      },
      ...extra,
      { kind: "end", endedAt: start + 3_600_000 },
    ]
      .map((l) => JSON.stringify(l))
      .join("\n"),
    t,
  )!;

describe("reportHtml", () => {
  const d = sessionData();
  const html = reportHtml(d, analyze(d, t), i18n);

  it("exports a complete self-contained document", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>Live de 30/07/26 — Corneta</title>");
    expect(html).toContain("<svg");
    // Exports must remain self-contained: no external fonts, images, or CDN resources.
    expect(html).not.toMatch(/<(script|link|img)\b/i);
    expect(html).not.toMatch(/https?:\/\//);
  });

  it("includes verdict, metrics and timeline", () => {
    expect(html).toContain("Transmissão limpa");
    expect(html).toContain("Pico de viewers");
    expect(html).toContain("Início da transmissão");
  });

  it("keeps the machine chart for memory-only sessions", () => {
    const memoryOnly = {
      ...d,
      samples: d.samples.map((sample) => ({
        ...sample,
        cpu: undefined,
        memoryPct: 63,
      })),
    };
    const out = reportHtml(memoryOnly, analyze(memoryOnly, t), i18n);

    expect(out).toContain("Carga da máquina (%)");
    expect(out).toContain("Memória");
  });

  it("escapes user content instead of injecting HTML", () => {
    const untrusted = sessionData([
      {
        kind: "marker",
        t: start + 3000,
        label: "<img src=x onerror=alert(1)>",
      },
    ]);
    const out = reportHtml(untrusted, analyze(untrusted, t), i18n);
    expect(out).not.toContain("<img src=x");
    expect(out).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
});

describe("reportJson", () => {
  it("includes format, version and analysis", () => {
    const d = sessionData();
    const j = JSON.parse(reportJson(d, analyze(d, t)));
    expect(j.formato).toBe("corneta.relatorio");
    expect(j.versao).toBe(REPORT_JSON_VERSION);
    expect(j.audiencia.peak).toBe(300);
    expect(j.amostras).toEqual({ maquina: 2, audiencia: 2, seguidores: 0 });
    expect(j.eventos[0].instante).toBe(new Date(start).toISOString());
    expect(j.eventos[0].segundosDoInicio).toBe(0);
  });
});

describe("anonymize", () => {
  const withRaid = sessionData([
    {
      kind: "alert",
      t: start + 3000,
      platform: "twitch",
      source: "Twitch",
      alertKind: "raid",
      user: "Gaules",
      amount: 90,
    },
  ]);

  it("removes viewer names from all alert-derived text including highlights", () => {
    const original = analyze(withRaid, t);
    expect(JSON.stringify(original)).toContain("Gaules");

    const anonymized = analyze(
      anonymize(withRaid, t("analysis.parse.alert.userFallback")),
      t,
    );
    expect(JSON.stringify(anonymized)).not.toContain("Gaules");
    expect(anonymized.highlights.some((h) => h.reason.includes("alguém"))).toBe(
      true,
    );
  });

  it("preserves metrics and streamer channel names", () => {
    const original = analyze(withRaid, t);
    const anonymized = analyze(
      anonymize(withRaid, t("analysis.parse.alert.userFallback")),
      t,
    );
    expect(anonymized.alerts.raids).toBe(original.alerts.raids);
    expect(anonymized.alerts.raidViewers).toBe(original.alerts.raidViewers);
    expect(anonymized.viewers.peak).toBe(original.viewers.peak);
    expect(anonymized.byChannel.channels.map((c) => c.source)).toEqual(
      original.byChannel.channels.map((c) => c.source),
    );
  });

  it("does not mutate the original session", () => {
    anonymize(withRaid, t("analysis.parse.alert.userFallback"));
    expect(withRaid.alertEvents[0].user).toBe("Gaules");
  });

  it("removes local process rankings from anonymous exports", () => {
    const withProcess = {
      ...withRaid,
      samples: withRaid.samples.map((sample, index) => ({
        ...sample,
        apps:
          index === 0
            ? [
                {
                  appRef: "jogo-secreto",
                  name: "Jogo secreto",
                  cpu: 30,
                  memoryMb: 2500,
                  gpu3d: 95,
                },
              ]
            : undefined,
      })),
    };

    const anonymized = anonymize(
      withProcess,
      t("analysis.parse.alert.userFallback"),
    );
    expect(JSON.stringify(anonymized)).not.toContain("Jogo secreto");
    expect(withProcess.samples[0].apps?.[0].name).toBe("Jogo secreto");
  });

  it("uses the caller's localized name placeholder", () => {
    const anonymized = anonymize(withRaid, "someone");
    expect(anonymized.alertEvents[0].user).toBe("someone");
    expect(JSON.stringify(anonymized)).not.toContain("alguém");
  });
});
