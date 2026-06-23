import type { AppConfig, EncodingAction, EncodingMode, Target } from "./types";
import { PLATFORMS } from "./platforms";

/** Ação efetiva de um destino, considerando o modo global. */
export function effectiveAction(mode: EncodingMode, t: Target): EncodingAction {
  if (mode === "passthrough") return "copy";
  if (mode === "per-platform") return "transcode";
  return t.encoding.action; // hybrid
}

function recommended(t: Target) {
  return PLATFORMS[t.platformId].recommended;
}

/** Menor denominador comum: o bitrate seguro para o modo "Encodar uma vez". */
export function lowestCommonDenominator(config: AppConfig) {
  const enabled = config.targets.filter((t) => t.enabled);
  if (enabled.length === 0) return { videoKbps: 6000, capBy: null as string | null };
  let capBy = enabled[0];
  for (const t of enabled) {
    if (recommended(t).videoBitrateKbps < recommended(capBy).videoBitrateKbps) capBy = t;
  }
  return { videoKbps: recommended(capBy).videoBitrateKbps, capBy: capBy.name };
}

export interface EngineEstimate {
  uploadKbps: number;
  transcodeCount: number;
  copyCount: number;
  enabledCount: number;
  /** Carga relativa 0..1 (heurística para a barra de CPU/GPU). */
  load: number;
}

/** Estima banda e carga para a config atual. */
export function estimate(config: AppConfig): EngineEstimate {
  const enabled = config.targets.filter((t) => t.enabled);
  const lcd = lowestCommonDenominator(config).videoKbps;

  let uploadKbps = 0;
  let transcodeCount = 0;
  let copyCount = 0;

  for (const t of enabled) {
    const act = effectiveAction(config.mode, t);
    const rec = recommended(t);
    const video =
      act === "copy" ? lcd : t.encoding.preset?.videoBitrateKbps ?? rec.videoBitrateKbps;
    const audio = t.encoding.preset?.audioBitrateKbps ?? rec.audioBitrateKbps;
    uploadKbps += video + audio;
    if (act === "transcode") transcodeCount++;
    else copyCount++;
  }

  // Carga: cada transcode pesa; software pesa muito mais que hardware.
  let load = 0;
  for (const t of enabled) {
    if (effectiveAction(config.mode, t) === "transcode") {
      load += t.encoding.encoder === "software" ? 0.45 : 0.14;
    }
  }
  load = Math.min(1, load);

  return {
    uploadKbps,
    transcodeCount,
    copyCount,
    enabledCount: enabled.length,
    load,
  };
}
