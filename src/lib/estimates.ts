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

/** Menor denominador comum: o bitrate seguro do OBS entre os destinos cuja
 *  ação EFETIVA é cópia (respeita o modo e o hybridOverride). Um destino
 *  transcodificado não entra — ele recebe o próprio encode, não o do OBS.
 *  Passthrough: todos copiam → varre todos. Híbrido: só os em cópia.
 *  Per-platform: ninguém copia → videoKbps null (o LCD não limita nada). */
export function lowestCommonDenominator(config: AppConfig) {
  const copies = config.targets.filter(
    (t) => t.enabled && effectiveAction(config.mode, t) === "copy",
  );
  if (copies.length === 0)
    return { videoKbps: null as number | null, capBy: null as string | null };
  let capBy = copies[0];
  for (const t of copies) {
    if (recommended(t).videoBitrateKbps < recommended(capBy).videoBitrateKbps)
      capBy = t;
  }
  return {
    videoKbps: recommended(capBy).videoBitrateKbps as number | null,
    capBy: capBy.name as string | null,
  };
}

/** Semáforo de banda compartilhado (Qualidade e Ao Vivo): "ok" exige 20% de folga
 *  — a mesma régua nas duas telas, pra config não sair verde numa e amarela na outra. */
export function bandFit(
  neededKbps: number,
  uploadMbps: number | null,
): "unknown" | "ok" | "warn" | "bad" {
  if (uploadMbps == null) return "unknown";
  const neededMbps = neededKbps / 1000;
  if (uploadMbps >= neededMbps * 1.2) return "ok";
  if (uploadMbps >= neededMbps) return "warn";
  return "bad";
}

export interface EngineEstimate {
  uploadKbps: number;
  transcodeCount: number;
  /** Transcodes que caem na placa de vídeo — é ESSE número que disputa o limite
   *  de sessões da GPU (x264 explícito roda na CPU e não conta). */
  hwTranscodeCount: number;
  copyCount: number;
  enabledCount: number;
  /** Carga relativa 0..1 (heurística para a barra de CPU/GPU). */
  load: number;
}

/** Estima banda e carga para a config atual. anyHwAvailable resolve o encoder
 *  "auto" (mesma regra do autoResolved da UI); sem info, assume hardware. */
export function estimate(
  config: AppConfig,
  opts?: { anyHwAvailable?: boolean },
): EngineEstimate {
  const anyHw = opts?.anyHwAvailable ?? true;
  const enabled = config.targets.filter((t) => t.enabled);
  const lcd = lowestCommonDenominator(config).videoKbps;

  let uploadKbps = 0;
  let transcodeCount = 0;
  let hwTranscodeCount = 0;
  let copyCount = 0;

  for (const t of enabled) {
    const act = effectiveAction(config.mode, t);
    const rec = recommended(t);
    const video =
      act === "copy"
        ? (lcd ?? rec.videoBitrateKbps)
        : (t.encoding.preset?.videoBitrateKbps ?? rec.videoBitrateKbps);
    const audio = t.encoding.preset?.audioBitrateKbps ?? rec.audioBitrateKbps;
    uploadKbps += video + audio;
    if (act === "transcode") {
      transcodeCount++;
      const onHw =
        t.encoding.encoder === "software"
          ? false
          : t.encoding.encoder === "auto"
            ? anyHw
            : true;
      if (onHw) hwTranscodeCount++;
    } else copyCount++;
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
    hwTranscodeCount,
    copyCount,
    enabledCount: enabled.length,
    load,
  };
}
