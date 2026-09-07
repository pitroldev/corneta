import { describe, expect, it } from "vitest";
import type { ProblemWindow } from "../../lib/report";
import { groupProblemWindows } from "./ReportTechnicalEventsPanel";

const windowAt = (
  tStart: number,
  overrides: Partial<ProblemWindow> = {},
): ProblemWindow => ({
  tStart,
  tEnd: tStart + 10_000,
  durationSec: 10,
  signals: ["GPU 99%"],
  cause: "Sobrecarga na codificação",
  causeKind: "encoding",
  confidence: "medium",
  advice: "Revise o encoder.",
  confirm: "Baixa a resolução e testa.",
  affected: ["Twitch"],
  totalTargets: 2,
  ...overrides,
});

describe("groupProblemWindows", () => {
  it("summarizes repeated occurrences of one cause as a diagnosis", () => {
    const groups = groupProblemWindows(
      Array.from({ length: 61 }, (_, index) => windowAt(index * 20_000)),
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].windows).toHaveLength(61);
    expect(groups[0].totalSec).toBe(610);
    expect(groups[0].signals).toEqual(["GPU 99%"]);
  });

  it("keeps incidents from different platforms separate", () => {
    const groups = groupProblemWindows([
      windowAt(0, {
        causeKind: "platform",
        cause: "Instabilidade na Twitch",
        targetName: "Twitch",
      }),
      windowAt(20_000, {
        causeKind: "platform",
        cause: "Instabilidade no YouTube",
        targetName: "YouTube",
      }),
    ]);

    expect(groups).toHaveLength(2);
  });

  it("bounds varying evidence in grouped summaries", () => {
    const groups = groupProblemWindows(
      Array.from({ length: 20 }, (_, index) =>
        windowAt(index * 20_000, { signals: [`GPU em ${80 + index}%`] }),
      ),
    );

    expect(groups[0].signals).toHaveLength(6);
  });

  it("bounds evidence even within a single occurrence", () => {
    const groups = groupProblemWindows([
      windowAt(0, {
        signals: Array.from({ length: 20 }, (_, index) => `Sinal ${index}`),
      }),
    ]);

    expect(groups[0].signals).toEqual([
      "Sinal 0",
      "Sinal 1",
      "Sinal 2",
      "Sinal 3",
      "Sinal 4",
      "Sinal 5",
    ]);
  });
});
