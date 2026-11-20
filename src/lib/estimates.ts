import type {
  AppConfig,
  EncoderKind,
  EncodingAction,
  EncodingMode,
  InputFeed,
  PlatformId,
  Target,
  VideoCodec,
  VideoPreset,
} from "./types";
import { PLATFORMS, isVertical, presetOf } from "./platforms";
import { reframeKey } from "./reframe";

// Reference workload: one 1080p60 encode.
const REF_PIXELS_PER_SEC = 1920 * 1080 * 60;

/** Relative transcode cost based on resolution, frame rate, encoder and bitrate. */
function transcodeCost(p: VideoPreset, encoder: EncoderKind): number {
  const pixelFactor = (p.width * p.height * p.fps) / REF_PIXELS_PER_SEC;
  const encoderWeight = encoder === "software" ? 0.5 : 0.12;
  const bitrateFactor = 0.8 + 0.2 * Math.min(2, p.videoBitrateKbps / 6000);
  return pixelFactor * encoderWeight * bitrateFactor;
}

/** Custom RTMP accepts Enhanced RTMP as-is; catalog platforms default to H.264 unless listed in `acceptedCodecs`. */
export function acceptsCodec(
  platformId: PlatformId,
  sourceCodec: VideoCodec = "h264",
): boolean {
  const preset = presetOf(platformId);
  if (preset.fallback) return true;
  const accepted = preset.copyLimits?.acceptedCodecs ?? ["h264"];
  return accepted.includes(sourceCodec);
}

export function smartHybridAction(
  platformId: PlatformId,
  sourceCodec: VideoCodec = "h264",
  sourceFeed: InputFeed = "primary",
): EncodingAction {
  if (sourceFeed === "vertical") {
    return "copy";
  }
  return isVertical(platformId) || !acceptsCodec(platformId, sourceCodec)
    ? "transcode"
    : "copy";
}

export function effectiveAction(
  mode: EncodingMode,
  t: Target,
  sourceCodec: VideoCodec = "h264",
): EncodingAction {
  if (mode === "passthrough") return "copy";
  if (mode === "per-platform") return "transcode";
  return (
    t.encoding.hybridOverride ??
    smartHybridAction(
      t.platformId,
      sourceCodec,
      t.encoding.sourceFeed ?? "primary",
    )
  );
}

function recommended(t: Target) {
  return PLATFORMS[t.platformId].recommended;
}

function renditionKey(t: Target, p: VideoPreset): string {
  const feed = t.encoding.sourceFeed ?? "primary";
  const rf =
    feed === "primary" && p.height > p.width
      ? reframeKey(t.encoding.reframe)
      : feed;
  return `${feed}:${p.width}x${p.height}@${p.fps}:${p.videoBitrateKbps}:${p.audioBitrateKbps}:${p.keyframeSec}:${t.encoding.encoder}:${rf}`;
}

/** Only copied primary-feed destinations constrain OBS input bitrate; re-encoded or separate vertical feeds do not. */
export function lowestCommonDenominator(
  config: AppConfig,
  sourceCodec: VideoCodec = "h264",
) {
  const copies = config.targets.filter(
    (t) =>
      t.enabled &&
      t.encoding.sourceFeed !== "vertical" &&
      effectiveAction(config.mode, t, sourceCodec) === "copy",
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
  /** Only hardware transcodes consume GPU session capacity; identical renditions share one session. */
  hwTranscodeCount: number;
  copyCount: number;
  enabledCount: number;
  /** Relative load heuristic, 0–1. */
  load: number;
}

/** Resolve auto encoder availability for hardware session counts; assume hardware when unknown. */
export function estimate(
  config: AppConfig,
  opts?: { anyHwAvailable?: boolean; sourceCodec?: VideoCodec },
): EngineEstimate {
  const anyHw = opts?.anyHwAvailable ?? true;
  const sourceCodec = opts?.sourceCodec ?? "h264";
  const enabled = config.targets.filter((t) => t.enabled);
  const lcd = lowestCommonDenominator(config, sourceCodec).videoKbps;

  let uploadKbps = 0;
  let transcodeCount = 0;
  let hwTranscodeCount = 0;
  let copyCount = 0;
  let load = 0;
  const seenRenditions = new Set<string>();

  for (const t of enabled) {
    const act = effectiveAction(config.mode, t, sourceCodec);
    const rec = recommended(t);
    const p = t.encoding.preset ?? rec;
    const video =
      act === "copy" && t.encoding.sourceFeed !== "vertical"
        ? (lcd ?? rec.videoBitrateKbps)
        : p.videoBitrateKbps;
    const audio = p.audioBitrateKbps;
    uploadKbps += video + audio;
    if (act === "transcode") {
      transcodeCount++;
      const key = renditionKey(t, p);
      if (!seenRenditions.has(key)) {
        seenRenditions.add(key);
        const onHw =
          t.encoding.encoder === "software"
            ? false
            : t.encoding.encoder === "auto"
              ? anyHw
              : true;
        if (onHw) hwTranscodeCount++;
        load += transcodeCost(p, t.encoding.encoder);
      }
    } else copyCount++;
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
