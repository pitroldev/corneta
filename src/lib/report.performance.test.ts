import { describe, expect, it } from "vitest";
import { analyze, parseSession } from "./report";
import { interpolate, type Vars } from "./i18n/locale";
import { pt, type MessageKey } from "./i18n/pt";

const t = (key: MessageKey, vars?: Vars) => interpolate(pt[key], vars);

describe("report performance", () => {
  it("analisa oito horas e quatro destinos sem caminho quadrático", () => {
    const sampleCount = 8 * 60 * 30; // uma amostra a cada dois segundos
    const platforms = ["Twitch", "YouTube", "Kick", "Servidor próprio"].map(
      (name, index) => ({
        id: `target-${index}`,
        name,
        platformId: index === 3 ? "custom" : name.toLowerCase(),
      }),
    );
    const lines: object[] = [
      {
        kind: "meta",
        schemaVersion: 4,
        id: "performance-8h",
        startedAt: 0,
        mode: "per-platform",
        platforms,
      },
    ];
    let renderSkipped = 0;
    for (let index = 0; index < sampleCount; index++) {
      const incidentOffset = index % 1800;
      const incident = incidentOffset >= 900 && incidentOffset < 918;
      if (incident) renderSkipped += 4;
      lines.push({
        kind: "sample",
        t: index * 2000,
        cpu: incident ? 91 : 48,
        gpu: incident ? 97 : 62,
        memoryPct: incident ? 79 : 55,
        apps:
          index % 3 === 0
            ? [
                {
                  appRef: "jogo",
                  name: "Jogo",
                  cpu: incident ? 45 : 25,
                  memoryMb: 3600,
                  gpu3d: incident ? 95 : 56,
                },
              ]
            : undefined,
        obs: {
          activeFps: 60,
          avgRenderMs: incident ? 32 : 7,
          renderSkipped,
          outputSkipped: 0,
          congestion: 0.02,
        },
        targets: platforms.map((platform) => ({
          id: platform.id,
          name: platform.name,
          state: "live",
          bitrate: incident ? 5200 : 6000,
          fps: 60,
          dropped: 0,
        })),
      });
    }
    lines.push({ kind: "end", endedAt: sampleCount * 2000 });

    const started = performance.now();
    const data = parseSession(
      lines.map((line) => JSON.stringify(line)).join("\n"),
      t,
    );
    expect(data).not.toBeNull();
    const analysis = analyze(data!, t);
    const elapsedMs = performance.now() - started;

    expect(analysis.windows.length).toBeGreaterThan(0);
    // Inclui JSON.parse, normalização e análise. O teto folgado evita teste instável,
    // mas pega imediatamente uma regressão O(n²) numa sessão longa.
    expect(elapsedMs).toBeLessThan(750);
  });
});
