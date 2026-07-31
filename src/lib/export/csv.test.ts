import { describe, it, expect } from "vitest";
import { BOM, toCsv, historyCsv, seriesCsv } from "./csv";
import { analyze, parseSession } from "../report";
import type { SessionMeta } from "../types";

const linhas = (csv: string) =>
  (csv.startsWith(BOM) ? csv.slice(BOM.length) : csv).trim().split("\r\n");

describe("toCsv", () => {
  it("abre com BOM e separa por ';' — é o que o Excel pt-BR espera", () => {
    const csv = toCsv([
      ["a", "b"],
      [1, 2],
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM, senão o Excel lê como ANSI
    expect(linhas(csv)).toEqual(["a;b", "1;2"]);
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("número sai com vírgula decimal e célula vazia pra nulo", () => {
    expect(linhas(toCsv([[1.5, null, undefined, 0]]))[0]).toBe("1,5;;;0");
  });

  it("escapa aspas, quebra de linha e o próprio separador", () => {
    expect(linhas(toCsv([['diz "oi"', "a;b"]]))[0]).toBe('"diz ""oi""";"a;b"');
    expect(toCsv([["duas\nlinhas"]])).toContain('"duas\nlinhas"');
  });

  it("neutraliza célula que o Excel abriria como fórmula", () => {
    // Nome de canal vem da config; um rótulo `=...` viraria execução na planilha
    // de quem recebeu o relatório.
    expect(linhas(toCsv([["=1+1"]]))[0]).toBe("'=1+1");
    expect(linhas(toCsv([["@canal"]]))[0]).toBe("'@canal");
    // Número negativo NÃO é texto: continua número, sem apóstrofo.
    expect(linhas(toCsv([[-3]]))[0]).toBe("-3");
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

const sessao = (body: object[], m = meta()) =>
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
  )!;

describe("historyCsv", () => {
  it("uma linha por live, com data ISO e hora local", () => {
    const d = sessao([
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
    const out = linhas(historyCsv([{ meta: meta(), analysis: analyze(d) }]));
    expect(out).toHaveLength(2);
    expect(out[0].startsWith("data;inicio;duracao_min")).toBe(true);
    const c = out[1].split(";");
    expect(c[0]).toBe("2026-07-30");
    expect(c[1]).toBe("20:15");
    expect(c[2]).toBe("60"); // 3600s
    expect(c[3]).toBe("Twitch");
    expect(c[5]).toBe("300"); // pico
  });

  it("live sem audiência deixa a célula vazia em vez de fingir zero", () => {
    const out = linhas(
      historyCsv([{ meta: meta(), analysis: analyze(sessao([])) }]),
    );
    const c = out[1].split(";");
    expect(c[5]).toBe(""); // pico
    expect(c[7]).toBe(""); // seguidores ganhos
  });
});

describe("seriesCsv", () => {
  const start = meta().startedAt;
  const d = sessao([
    {
      kind: "sample",
      t: start + 2000,
      cpu: 40,
      gpu: 22,
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
      chat: 0,
      targets: [
        { id: "t1", name: "Twitch", state: "live", bitrate: 6100, dropped: 3 },
      ],
    },
  ]);

  it("uma linha por amostra, com o tempo relativo ao início", () => {
    const out = linhas(seriesCsv(d, analyze(d)));
    expect(out).toHaveLength(3); // cabeçalho + 2 amostras
    expect(out[1].split(";")[0]).toBe("2");
    expect(out[2].split(";")[0]).toBe("4");
  });

  it("colunas por destino saem com o nome do destino", () => {
    const head = linhas(seriesCsv(d, analyze(d)))[0];
    expect(head).toContain("bitrate_kbps_Twitch");
    expect(head).toContain("estado_Twitch");
    expect(head).toContain("chat_por_min_Twitch");
  });

  it("audiência entra como último valor conhecido, e o nome da coluna avisa", () => {
    // A audiência é amostrada a cada ~30s, num eixo diferente do das amostras.
    // Antes da primeira leitura não há valor; depois dela, o degrau se mantém.
    const out = linhas(seriesCsv(d, analyze(d)));
    const head = out[0].split(";");
    const col = head.indexOf("assistindo_ultimo_conhecido_Twitch");
    expect(col).toBeGreaterThan(-1);
    expect(out[1].split(";")[col]).toBe(""); // amostra em t+2s, audiência só em t+3s
    expect(out[2].split(";")[col]).toBe("120");
  });
});
