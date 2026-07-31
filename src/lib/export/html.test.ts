import { describe, it, expect } from "vitest";
import { reportHtml } from "./html";
import { reportJson, REPORT_JSON_VERSION } from "./json";
import { anonymize } from "./anonymize";
import { analyze, parseSession } from "../report";
import { interpolate, type Vars } from "../i18n/locale";
import { pt, type MessageKey } from "../i18n/pt";
import { makeFmt } from "../i18n/format";

/** `parseSession`/`analyze` recebem a tradução por parâmetro — aqui entra o dicionário pt de verdade. */
const t = (k: MessageKey, vars?: Vars) => interpolate(pt[k], vars);
/** O HTML exportado precisa de locale e formatadores além do texto. */
const i18n = { locale: "pt-BR" as const, t, fmt: makeFmt("pt-BR") };

const start = new Date(2026, 6, 30, 20, 15).getTime();

const sessao = (extra: object[] = []) =>
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
  const d = sessao();
  const html = reportHtml(d, analyze(d, t), i18n);

  it("é um documento completo e autocontido", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>Live de 30/07/26 — Corneta</title>");
    expect(html).toContain("<svg");
    // Nada de rede: o arquivo vai por e-mail e precisa abrir offline na máquina
    // de quem recebeu. Nenhuma fonte, CDN ou imagem externa.
    expect(html).not.toMatch(/<(script|link|img)\b/i);
    expect(html).not.toMatch(/https?:\/\//);
  });

  it("traz o veredito, os números e a linha do tempo", () => {
    expect(html).toContain("Transmissão limpa");
    expect(html).toContain("Pico de viewers");
    expect(html).toContain("Início da transmissão");
  });

  it("escapa o que vem do usuário em vez de injetar HTML", () => {
    const mau = sessao([
      {
        kind: "marker",
        t: start + 3000,
        label: "<img src=x onerror=alert(1)>",
      },
    ]);
    const out = reportHtml(mau, analyze(mau, t), i18n);
    expect(out).not.toContain("<img src=x");
    expect(out).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
});

describe("reportJson", () => {
  it("carrega formato, versão e a análise pronta", () => {
    const d = sessao();
    const j = JSON.parse(reportJson(d, analyze(d, t)));
    expect(j.formato).toBe("corneta.relatorio");
    expect(j.versao).toBe(REPORT_JSON_VERSION);
    expect(j.audiencia.peak).toBe(300);
    expect(j.amostras).toEqual({ maquina: 2, audiencia: 2, seguidores: 0 });
    // Instante em ISO: epoch-ms obrigaria quem consome a saber de que relógio veio.
    expect(j.eventos[0].instante).toBe(new Date(start).toISOString());
    expect(j.eventos[0].segundosDoInicio).toBe(0);
  });
});

describe("anonymize", () => {
  const comRaid = sessao([
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

  it("tira o nome de tudo que deriva do alerta, inclusive dos destaques", () => {
    const cru = analyze(comRaid, t);
    expect(JSON.stringify(cru)).toContain("Gaules");

    const limpo = analyze(anonymize(comRaid), t);
    expect(JSON.stringify(limpo)).not.toContain("Gaules");
    expect(limpo.highlights.some((h) => h.reason.includes("alguém"))).toBe(
      true,
    );
  });

  it("não mexe nos números nem no nome dos canais do próprio streamer", () => {
    const cru = analyze(comRaid, t);
    const limpo = analyze(anonymize(comRaid), t);
    expect(limpo.alerts.raids).toBe(cru.alerts.raids);
    expect(limpo.alerts.raidViewers).toBe(cru.alerts.raidViewers);
    expect(limpo.viewers.peak).toBe(cru.viewers.peak);
    expect(limpo.byChannel.channels.map((c) => c.source)).toEqual(
      cru.byChannel.channels.map((c) => c.source),
    );
  });

  it("não altera a sessão original", () => {
    anonymize(comRaid);
    expect(comRaid.alertEvents[0].user).toBe("Gaules");
  });
});
