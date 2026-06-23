import type {
  AppConfig,
  EncoderKind,
  EncodingAction,
  EncodingMode,
  PlatformId,
  Target,
  VideoPreset,
} from "./types";
import { PLATFORMS } from "./platforms";

// Referência de carga: um encode 1080p60.
const REF_PIXELS_PER_SEC = 1920 * 1080 * 60;

/** Custo relativo de transcodificar um destino (0..~). Considera resolução×fps,
 *  encoder (hardware vs software) e, em menor grau, bitrate. */
function transcodeCost(p: VideoPreset, encoder: EncoderKind): number {
  const pixelFactor = (p.width * p.height * p.fps) / REF_PIXELS_PER_SEC;
  // Software (x264) pesa MUITO mais que encoders de hardware (NVENC/QSV/AMF).
  const encoderWeight = encoder === "software" ? 0.5 : 0.12;
  const bitrateFactor = 0.8 + 0.2 * Math.min(2, p.videoBitrateKbps / 6000);
  return pixelFactor * encoderWeight * bitrateFactor;
}

/** No híbrido sem override: copia plataformas landscape, recodifica as verticais
 *  (ex.: TikTok/Instagram), que precisam de formato diferente do stream do OBS. */
export function smartHybridAction(platformId: PlatformId): EncodingAction {
  const r = PLATFORMS[platformId].recommended;
  return r.height > r.width ? "transcode" : "copy";
}

/** Ação efetiva de um destino, considerando o modo global. */
export function effectiveAction(mode: EncodingMode, t: Target): EncodingAction {
  if (mode === "passthrough") return "copy";
  if (mode === "per-platform") return "transcode";
  return t.encoding.hybridOverride ?? smartHybridAction(t.platformId); // híbrido
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

  // Carga: soma o custo de cada transcode (resolução×fps×encoder×bitrate). Cópia ~0.
  let load = 0;
  for (const t of enabled) {
    if (effectiveAction(config.mode, t) === "transcode") {
      const p = t.encoding.preset ?? recommended(t);
      load += transcodeCost(p, t.encoding.encoder);
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
