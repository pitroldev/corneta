import { describe, it, expect } from "vitest";
import { parseSession, timeAxis, hasObs, hasChat } from "./report";

const nd = (lines: object[]) => lines.map((l) => JSON.stringify(l)).join("\n");

describe("parseSession", () => {
  it("lê meta + samples e calcula a duração até o 'end'", () => {
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
    )!;
    expect(d).not.toBeNull();
    expect(d.meta.id).toBe("s1");
    expect(d.meta.durationSec).toBe(4); // (5000-1000)/1000
    expect(d.meta.endedAt).toBe(5000);
    expect(d.samples).toHaveLength(2);
    expect(timeAxis(d)).toEqual([2000, 3000]);
  });

  it("sem 'end' (ainda no ar): duração vai até o último sample e endedAt fica indefinido", () => {
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
    )!;
    expect(d.meta.endedAt).toBeUndefined();
    expect(d.meta.durationSec).toBe(10);
  });

  it("pula linhas inválidas e samples sem timestamp; sem meta → null", () => {
    const d = parseSession(
      nd([
        { kind: "meta", id: "s3", startedAt: 0, platforms: [] },
        { kind: "sample", t: 1000, targets: [] },
        { kind: "sample", t: "nao-numero", targets: [] },
      ]) + "\nlixo que não é json\n",
    )!;
    expect(d.samples).toHaveLength(1);
    expect(parseSession("nada de meta aqui")).toBeNull();
    expect(parseSession("")).toBeNull();
  });

  it("hasObs / hasChat refletem a presença dos dados", () => {
    const semObs = parseSession(
      nd([
        { kind: "meta", id: "s4", startedAt: 0, platforms: [] },
        { kind: "sample", t: 1000, targets: [] },
      ]),
    )!;
    expect(hasObs(semObs)).toBe(false);
    expect(hasChat(semObs)).toBe(false);
    const comObs = parseSession(
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
    )!;
    expect(hasObs(comObs)).toBe(true);
    expect(hasChat(comObs)).toBe(true);
  });
});
