import { describe, it, expect } from "vitest";
import {
  buildReplayIndex,
  denormalizeEpoch,
  epochAtGlobal,
  fractionalIndexAt,
  globalAtEpoch,
  hasEstimatedAnchor,
  hasUnplayableCodec,
  isCovered,
  normalizeEpoch,
  pointAtGlobal,
  sampleIndexAt,
  type ReplaySegment,
} from "./replay";

const T0 = 1_700_000_000_000;

/** Segmento de `durMs` começando em `t`, com âncoras de sincronia perfeitas (sem deriva). */
function seg(
  n: number,
  t: number,
  durMs: number,
  extra: Partial<ReplaySegment> = {},
): ReplaySegment {
  return {
    seg: n,
    t,
    path: `S${n}.mp4`,
    codec: "h264",
    estimated: false,
    syncs: [
      { t, out: 0 },
      { t: t + durMs, out: durMs },
    ],
    endT: t + durMs,
    ...extra,
  };
}

describe("replay — índice", () => {
  it("soma as durações e ignora segmento vazio", () => {
    const idx = buildReplayIndex([
      seg(1, T0, 60_000),
      seg(2, T0 + 90_000, 0), // FFmpeg morreu antes do 1º frame
      seg(3, T0 + 120_000, 30_000),
    ]);
    expect(idx.segments).toHaveLength(2);
    expect(idx.totalMs).toBe(90_000);
    expect(idx.starts).toEqual([0, 60_000]);
  });

  it("ordena pela âncora, não pelo número do segmento", () => {
    // Numa retomada com relógio bagunçado o número pode mentir; o instante não.
    const idx = buildReplayIndex([seg(2, T0 + 60_000, 10_000), seg(1, T0, 10_000)]);
    expect(idx.segments.map((s) => s.path)).toEqual(["S1.mp4", "S2.mp4"]);
  });

  it("sessão sem gravação nenhuma não quebra nada", () => {
    const idx = buildReplayIndex([]);
    expect(idx.totalMs).toBe(0);
    expect(globalAtEpoch(idx, T0)).toBeNull();
    expect(pointAtGlobal(idx, 0)).toBeNull();
    expect(epochAtGlobal(idx, 0)).toBeNull();
    expect(isCovered(idx, T0)).toBe(false);
  });
});

describe("replay — epoch ↔ global", () => {
  const idx = buildReplayIndex([seg(1, T0, 60_000), seg(2, T0 + 90_000, 30_000)]);

  it("mapeia um instante dentro do primeiro segmento", () => {
    expect(globalAtEpoch(idx, T0 + 10_000)).toBe(10_000);
  });

  it("pula o buraco entre segmentos", () => {
    // O 2º arquivo começa 90s depois do início, mas no eixo global ele encosta nos 60s:
    // o tempo em que ninguém gravou não existe pro player.
    expect(globalAtEpoch(idx, T0 + 90_000)).toBe(60_000);
    expect(globalAtEpoch(idx, T0 + 100_000)).toBe(70_000);
  });

  it("instante DENTRO do buraco encosta na borda seguinte, não recusa o clique", () => {
    // 75s caiu no meio da retomada. Clicar num evento dali tem que levar o vídeo
    // pra beirada — devolver null faria o clique não fazer nada, sem explicação.
    expect(globalAtEpoch(idx, T0 + 75_000)).toBe(60_000);
  });

  it("fora da gravação devolve null nas duas pontas", () => {
    expect(globalAtEpoch(idx, T0 - 1)).toBeNull();
    expect(globalAtEpoch(idx, T0 + 120_001)).toBeNull();
  });

  it("ida e volta se fecha", () => {
    const g = globalAtEpoch(idx, T0 + 100_000);
    expect(g).not.toBeNull();
    expect(epochAtGlobal(idx, g as number)).toBeCloseTo(T0 + 100_000, -1);
  });

  it("localiza o arquivo e o segundo dentro dele", () => {
    expect(pointAtGlobal(idx, 70_000)).toEqual({ index: 1, localSec: 10 });
    expect(pointAtGlobal(idx, 0)).toEqual({ index: 0, localSec: 0 });
  });

  it("posição fora da faixa é grampeada nas bordas", () => {
    expect(pointAtGlobal(idx, -5_000)).toEqual({ index: 0, localSec: 0 });
    expect(pointAtGlobal(idx, 999_999)?.index).toBe(1);
  });
});

describe("replay — deriva e âncoras", () => {
  it("interpola POR TRECHOS: a deriva do fim não contamina o começo", () => {
    // 60s de parede que renderam 66s de vídeo no último trecho (relógios divergindo).
    // Extrapolar da âncora inicial daria 30s no meio; por trechos dá o valor certo.
    const s: ReplaySegment = {
      ...seg(1, T0, 120_000),
      syncs: [
        { t: T0, out: 0 },
        { t: T0 + 60_000, out: 60_000 },
        { t: T0 + 120_000, out: 126_000 },
      ],
      endT: T0 + 120_000,
    };
    const idx = buildReplayIndex([s]);
    expect(globalAtEpoch(idx, T0 + 60_000)).toBe(60_000);
    expect(globalAtEpoch(idx, T0 + 90_000)).toBe(93_000);
  });

  it("segmento sem âncora nenhuma cai no tempo real", () => {
    const s = { ...seg(1, T0, 60_000), syncs: [] };
    expect(globalAtEpoch(buildReplayIndex([s]), T0 + 20_000)).toBe(20_000);
  });

  it("âncoras fora de ordem são reordenadas em vez de embaralhar o mapa", () => {
    const s: ReplaySegment = {
      ...seg(1, T0, 60_000),
      syncs: [
        { t: T0 + 60_000, out: 60_000 },
        { t: T0, out: 0 },
        { t: T0 + 30_000, out: 30_000 },
      ],
    };
    expect(globalAtEpoch(buildReplayIndex([s]), T0 + 45_000)).toBe(45_000);
  });

  it("duas âncoras no mesmo instante não viram divisão por zero", () => {
    const s: ReplaySegment = {
      ...seg(1, T0, 60_000),
      syncs: [
        { t: T0, out: 0 },
        { t: T0 + 30_000, out: 30_000 },
        { t: T0 + 30_000, out: 31_000 },
        { t: T0 + 60_000, out: 60_000 },
      ],
    };
    const g = globalAtEpoch(buildReplayIndex([s]), T0 + 30_000);
    expect(Number.isFinite(g as number)).toBe(true);
  });

  it("acusa âncora estimada e codec que o webview não toca", () => {
    expect(hasEstimatedAnchor(buildReplayIndex([seg(1, T0, 1_000)]))).toBe(false);
    expect(
      hasEstimatedAnchor(
        buildReplayIndex([seg(1, T0, 1_000, { estimated: true })]),
      ),
    ).toBe(true);
    expect(hasUnplayableCodec(buildReplayIndex([seg(1, T0, 1_000)]))).toBe(false);
    expect(
      hasUnplayableCodec(
        buildReplayIndex([seg(1, T0, 1_000, { codec: "hevc" })]),
      ),
    ).toBe(true);
  });
});

describe("replay — salto de relógio", () => {
  const jumps = [{ t: T0 + 40_000, delta: 10_000 }];

  it("desfaz e refaz o salto simetricamente", () => {
    // Depois do salto, o relógio marca 10s a mais do que o tempo real passado.
    expect(normalizeEpoch(T0 + 50_000, jumps)).toBe(T0 + 40_000);
    expect(normalizeEpoch(T0 + 30_000, jumps)).toBe(T0 + 30_000);
    expect(denormalizeEpoch(T0 + 40_000, jumps)).toBe(T0 + 50_000);
  });

  it("mantém o mapeamento coerente quando o relógio pula no meio da gravação", () => {
    // 120s de gravação com um salto de +10s aos 40s: o instante marcado como 50s
    // é, na verdade, o segundo 40 do vídeo.
    const s: ReplaySegment = { ...seg(1, T0, 120_000), syncs: [] };
    const idx = buildReplayIndex([s], jumps);
    expect(globalAtEpoch(idx, T0 + 50_000)).toBe(40_000);
  });

  it("salto pra trás (NTP corrigindo adiantamento) também fecha", () => {
    const back = [{ t: T0 + 40_000, delta: -5_000 }];
    expect(normalizeEpoch(T0 + 50_000, back)).toBe(T0 + 55_000);
    expect(denormalizeEpoch(normalizeEpoch(T0 + 50_000, back), back)).toBe(
      T0 + 50_000,
    );
  });
});

describe("replay — offset manual", () => {
  it("desloca o mapeamento pelo ajuste do streamer", () => {
    const base = buildReplayIndex([seg(1, T0, 60_000)]);
    const ahead = buildReplayIndex([seg(1, T0, 60_000)], [], 5_000);
    expect(globalAtEpoch(base, T0 + 20_000)).toBe(20_000);
    expect(globalAtEpoch(ahead, T0 + 20_000)).toBe(25_000);
  });

  it("a volta desconta o offset — o cursor não sai andando sozinho", () => {
    const idx = buildReplayIndex([seg(1, T0, 60_000)], [], 5_000);
    const g = globalAtEpoch(idx, T0 + 20_000) as number;
    expect(epochAtGlobal(idx, g)).toBeCloseTo(T0 + 20_000, -1);
  });
});

describe("replay — amostra mais próxima", () => {
  const times = [0, 100, 200, 300, 400];

  it("acha o índice vizinho e grampeia nas pontas", () => {
    expect(sampleIndexAt(times, 0)).toBe(0);
    expect(sampleIndexAt(times, 149)).toBe(1);
    expect(sampleIndexAt(times, 151)).toBe(2);
    expect(sampleIndexAt(times, -50)).toBe(0);
    expect(sampleIndexAt(times, 9_999)).toBe(4);
  });

  it("empate cai no anterior e lista vazia devolve null", () => {
    expect(sampleIndexAt(times, 150)).toBe(1);
    expect(sampleIndexAt([], 10)).toBeNull();
  });

  it("a versão fracionária anda ENTRE as amostras", () => {
    // Sem isso o cursor pularia de 2 em 2s enquanto o vídeo corre liso.
    expect(fractionalIndexAt(times, 150)).toBeCloseTo(1.5, 5);
    expect(fractionalIndexAt(times, 100)).toBe(1);
    expect(fractionalIndexAt(times, 275)).toBeCloseTo(2.75, 5);
  });

  it("fracionária nas pontas e em série degenerada não explode", () => {
    expect(fractionalIndexAt(times, -10)).toBe(0);
    expect(fractionalIndexAt(times, 9_999)).toBe(4);
    expect(fractionalIndexAt([5], 5)).toBe(0);
    expect(fractionalIndexAt([7, 7], 7)).toBe(0);
    expect(fractionalIndexAt([], 1)).toBeNull();
  });
});
