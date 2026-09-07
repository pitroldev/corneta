import type { ChatSource } from "./types";
import type { I18n } from "./i18n";

/** Inject translation rather than sharing mutable locale state across webviews. */
export type Translate = I18n["t"];

/** Match the backend source-label fallback so moderation resolves the same source. */
export const srcLabel = (x: ChatSource) =>
  x.name.trim() === "" ? x.value : x.name;

export interface SendReady {
  twitch: boolean;
  youtube: boolean;
  kick: boolean;
}

/** Twitch requires authenticated IRC; YouTube and Kick send over HTTP after login. */
export function sendStatusLine(
  sendTargets: ChatSource[],
  chatAuth: Record<string, { login: string; ok: boolean } | undefined>,
  ready: SendReady,
  t: Translate,
): string {
  return sendTargets
    .map((x) => {
      const label = srcLabel(x);
      if (x.platform === "youtube")
        return ready.youtube
          ? t("chat.send.status.signedIn", { platform: "YouTube" })
          : t("chat.send.status.signIn", { label, platform: "YouTube" });
      if (x.platform === "kick")
        return ready.kick
          ? t("chat.send.status.signedIn", { platform: "Kick" })
          : t("chat.send.status.signIn", { label, platform: "Kick" });
      const a = chatAuth[x.id];
      if (a?.ok) return t("chat.loginrow.signedInAs", { login: a.login });
      if (ready.twitch) return t("chat.send.status.reconnect", { label });
      if (a && !a.ok) return t("chat.send.status.invalidToken", { label });
      return t("chat.send.status.connect", { label });
    })
    .join(" · ");
}
