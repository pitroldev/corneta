import { useMemo } from "react";
import { useStore } from "./store";
import { readiness, type Readiness, type ReadinessContext } from "./readiness";
import type { Target } from "./types";

const NO_TARGETS: Target[] = [];

export function useReadinessContext(): ReadinessContext {
  const youtubeAuto = useStore(
    (s) =>
      !!s.config?.settings.youtubeAutoLive &&
      s.chatLogin.youtube.state === "connected",
  );
  return useMemo(() => ({ youtubeAuto }), [youtubeAuto]);
}

export function useReadiness(): Readiness {
  const targets = useStore((s) => s.config?.targets ?? NO_TARGETS);
  const ctx = useReadinessContext();
  return useMemo(() => readiness(targets, ctx), [targets, ctx]);
}
