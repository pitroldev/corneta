import { encoderApp, encoderName, startedByHand } from "./encoder";
import { useT } from "./i18n";
import { useStore } from "./store";
import type { EncoderApp } from "./types";

/** The streaming program in use, its name for a sentence, and whether the user starts it. */
export function useEncoder(): {
  app: EncoderApp;
  name: string;
  byHand: boolean;
} {
  const t = useT();
  const chosen = useStore((s) => s.config?.settings.encoderApp ?? null);
  const obsManual = useStore((s) => s.config?.settings.obsManual ?? false);
  const env = useStore((s) => s.obsEnv);
  const app = encoderApp({ encoderApp: chosen }, env);
  return {
    app,
    name: encoderName(app, t),
    byHand: startedByHand(app, obsManual),
  };
}
