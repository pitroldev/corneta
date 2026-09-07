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

// Reference workload: one 1080p60 encode.
const REF_PIXELS_PER_SEC = 1920 * 1080 * 60;

/** Relative transcode cost based on resolution, frame rate, encoder and bitrate. */
function transcodeCost(p: VideoPreset, encoder: EncoderKind): number {
  const pixelFactor = (p.width * p.height * p.fps) / REF_PIXELS_PER_SEC;
  const encoderWeight = encoder === "software" ? 0.5 : 0.12;
  const bitrateFactor = 0.8 + 0.2 * Math.min(2, p.videoBitrateKbps / 6000);
  return pixelFactor * encoderWeight * bitrateFactor;
}

export function smartHybridAction(platformId: PlatformId): EncodingAction {
  const r = PLATFORMS[platformId].recommended;
  return r.height > r.width ? "transcode" : "copy";
}

export function effectiveAction(mode: EncodingMode, t: Target): EncodingAction {
  if (mode === "passthrough") return "copy";
  if (mode === "per-platform") return "transcode";
  return t.encoding.hybridOverride ?? smartHybridAction(t.platformId);
}

function recommended(t: Target) {
  return PLATFORMS[t.platformId].recommended;
}

/** Only copied destinations constrain OBS input bitrate; re-encoded destinations use their own settings. */
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

/** Use a shared 20% upload margin across quality and live checks. */
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
  /** Only hardware transcodes consume GPU session capacity. */
  hwTranscodeCount: number;
  copyCount: number;
  enabledCount: number;
  /** Relative load heuristic, 0–1. */
  load: number;
}

/** Resolve auto encoder availability for hardware session counts; assume hardware when unknown. */
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
