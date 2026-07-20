import { describe, it, expect } from "vitest";
import {
  smartHybridAction,
  effectiveAction,
  lowestCommonDenominator,
  bandFit,
  estimate,
} from "./estimates";
import { defaultConfig, makeTarget } from "./factory";
import type { AppConfig, EncodingMode, PlatformId } from "./types";

function cfg(mode: EncodingMode, platforms: PlatformId[]): AppConfig {
  return {
    ...defaultConfig(),
    mode,
    targets: platforms.map((p) => makeTarget(p)),
  };
}

describe("smartHybridAction / effectiveAction", () => {
  it("landscape copia, vertical recodifica", () => {
    expect(smartHybridAction("twitch")).toBe("copy");
    expect(smartHybridAction("tiktok")).toBe("transcode");
    expect(smartHybridAction("instagram")).toBe("transcode");
  });

  it("modo global manda; override do híbrido vence", () => {
    const t = makeTarget("twitch");
    expect(effectiveAction("passthrough", t)).toBe("copy");
    expect(effectiveAction("per-platform", t)).toBe("transcode");
    expect(effectiveAction("hybrid", t)).toBe("copy"); // twitch é landscape
    t.encoding.hybridOverride = "transcode";
    expect(effectiveAction("hybrid", t)).toBe("transcode");
  });
});

describe("lowestCommonDenominator", () => {
  it("passthrough: teto = plataforma mais apertada em cópia", () => {
    const lcd = lowestCommonDenominator(
      cfg("passthrough", ["twitch", "facebook"]),
    );
    expect(lcd.videoKbps).toBe(4000); // facebook 4000 < twitch 6000
    expect(lcd.capBy).toBe("Facebook");
  });

  it("per-platform: ninguém copia → null (não limita o OBS)", () => {
    expect(
      lowestCommonDenominator(cfg("per-platform", ["twitch", "facebook"]))
        .videoKbps,
    ).toBeNull();
  });

  it("desabilitado não conta", () => {
    const c = cfg("passthrough", ["twitch", "facebook"]);
    c.targets[1].enabled = false; // desliga o facebook (o mais apertado)
    expect(lowestCommonDenominator(c).videoKbps).toBe(6000); // sobra só a twitch
  });
});

describe("bandFit", () => {
  it("exige 20% de folga pra 'ok'", () => {
    expect(bandFit(6000, null)).toBe("unknown");
    expect(bandFit(6000, 7.2)).toBe("ok"); // 6 Mbps * 1.2 = 7.2
    expect(bandFit(6000, 6.5)).toBe("warn"); // acima do necessário, mas sem folga
    expect(bandFit(6000, 5)).toBe("bad");
  });
});

describe("estimate", () => {
  it("conta cópias/transcodes e soma o upload", () => {
    // passthrough: tudo cópia; upload = soma de vídeo(=lcd) + áudio de cada.
    const e = estimate(cfg("passthrough", ["twitch", "facebook"]));
    expect(e.enabledCount).toBe(2);
    expect(e.copyCount).toBe(2);
    expect(e.transcodeCount).toBe(0);
  });

  it("per-platform: todos transcode; hw conta só com placa", () => {
    const withHw = estimate(cfg("per-platform", ["twitch", "youtube"]), {
      anyHwAvailable: true,
    });
    expect(withHw.transcodeCount).toBe(2);
    expect(withHw.hwTranscodeCount).toBe(2); // encoder "auto" + placa disponível
    const noHw = estimate(cfg("per-platform", ["twitch", "youtube"]), {
      anyHwAvailable: false,
    });
    expect(noHw.hwTranscodeCount).toBe(0); // "auto" cai pro processador (não disputa sessão da GPU)
    // Nota: a `load` NÃO muda com anyHwAvailable — o loop de carga usa o encoder cru "auto"
    // (peso de hardware), sem resolver pra software. Gap de modelagem PRÉ-EXISTENTE em estimates.ts.
    expect(withHw.load).toBeGreaterThan(0);
    expect(noHw.load).toBe(withHw.load);
  });
});
