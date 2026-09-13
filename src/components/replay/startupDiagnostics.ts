import type { RecordVideoStats } from "../../lib/api/types";

export interface ReplayStartupDiagnostic {
  outcome: "first-frame" | "timeout" | "media-error";
  metadataMs?: number;
  firstFrameMs?: number;
  elapsedMs: number;
  transport?: RecordVideoStats;
}

const recent: ReplayStartupDiagnostic[] = [];

export function recentReplayStartupDiagnostics(): readonly ReplayStartupDiagnostic[] {
  return recent.slice();
}

export function recordReplayStartupDiagnostic(value: ReplayStartupDiagnostic) {
  recent.push(value);
  if (recent.length > 20) recent.shift();
}

export function observeReplayStartup(
  video: HTMLVideoElement,
  stats: () => Promise<RecordVideoStats>,
  onSlow: () => void,
  onDiagnostic: (value: ReplayStartupDiagnostic) => void,
  startedAt = performance.now(),
) {
  let metadataMs: number | undefined;
  let finished = false;
  let disposed = false;
  let frame: number | undefined;
  let captured: ReplayStartupDiagnostic | undefined;

  const finish = async (outcome: ReplayStartupDiagnostic["outcome"]) => {
    if (disposed) return;
    if (finished) {
      if (
        outcome === "first-frame" &&
        captured &&
        captured.firstFrameMs == null
      ) {
        captured = {
          ...captured,
          firstFrameMs: Math.round(performance.now() - startedAt),
        };
        recordReplayStartupDiagnostic(captured);
        onDiagnostic(captured);
      }
      return;
    }
    finished = true;
    clearTimeout(timeout);
    const elapsedMs = Math.round(performance.now() - startedAt);
    const diagnostic: ReplayStartupDiagnostic = {
      outcome,
      metadataMs,
      elapsedMs,
      ...(outcome === "first-frame" ? { firstFrameMs: elapsedMs } : {}),
    };
    captured = diagnostic;
    try {
      const transport = await stats();
      captured = { ...(captured ?? diagnostic), transport };
    } catch {
      // Playback must remain usable when optional diagnostics are unavailable.
    }
    if (disposed) return;
    const value = captured ?? diagnostic;
    recordReplayStartupDiagnostic(value);
    onDiagnostic(value);
  };

  const timeout = setTimeout(
    () => {
      if (finished || disposed) return;
      if (video.readyState < 1 || (video.readyState < 2 && !video.paused))
        onSlow();
      void finish("timeout");
    },
    Math.max(0, 12_000 - (performance.now() - startedAt)),
  );
  const metadata = () => {
    metadataMs ??= Math.round(performance.now() - startedAt);
  };
  const error = () => void finish("media-error");
  video.addEventListener("loadedmetadata", metadata);
  video.addEventListener("error", error);
  if (typeof video.requestVideoFrameCallback === "function") {
    frame = video.requestVideoFrameCallback(() => void finish("first-frame"));
  }

  return () => {
    disposed = true;
    clearTimeout(timeout);
    video.removeEventListener("loadedmetadata", metadata);
    video.removeEventListener("error", error);
    if (frame !== undefined) video.cancelVideoFrameCallback(frame);
  };
}
