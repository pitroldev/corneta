import type { I18n, MessageKey } from "./i18n";
import type { AppSettings, EncoderApp, ObsEnvironment } from "./types";

export const ENCODER_APPS: readonly EncoderApp[] = [
  "obs",
  "streamlabs",
  "other",
];

/** What this PC suggests before the streamer says which program they stream with. */
export function detectedEncoder(env: ObsEnvironment | null): EncoderApp {
  return env && !env.installed && !env.running && env.streamlabs
    ? "streamlabs"
    : "obs";
}

/** The streamer's own answer wins; detection only pre-selects. */
export function encoderApp(
  settings: Pick<AppSettings, "encoderApp">,
  env: ObsEnvironment | null,
): EncoderApp {
  const chosen = settings.encoderApp;
  return chosen && ENCODER_APPS.includes(chosen)
    ? chosen
    : detectedEncoder(env);
}

/** Corneta can press play only in an OBS it set up itself; anything else is started by the user. */
export function startedByHand(app: EncoderApp, obsManual: boolean): boolean {
  return app !== "obs" || obsManual;
}

/** The program's name inside a sentence, such as "start the stream in {app}". */
export function encoderName(app: EncoderApp, t: I18n["t"]): string {
  return app === "obs"
    ? "OBS"
    : app === "streamlabs"
      ? "Streamlabs"
      : t("components.encoder.other.inSentence");
}

/** Heading of the paste-by-hand step for a program Corneta cannot reach. */
export function byHandTitleKey(
  app: Exclude<EncoderApp, "obs">,
  done: boolean,
): MessageKey {
  if (app === "streamlabs")
    return done
      ? "components.encoder.byHand.streamlabs.done"
      : "components.encoder.byHand.streamlabs.title";
  return done
    ? "components.encoder.byHand.other.done"
    : "components.encoder.byHand.other.title";
}

/** The program's name on its own, as a label. */
export function encoderLabel(app: EncoderApp, t: I18n["t"]): string {
  return app === "obs"
    ? "OBS"
    : app === "streamlabs"
      ? "Streamlabs"
      : t("components.encoder.other.label");
}
