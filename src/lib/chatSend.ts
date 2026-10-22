import { chatProvider, type AccountPlatform } from "../platforms";
import type { ChatSource } from "./types";
import type { I18n } from "./i18n";

/** Inject translation rather than sharing mutable locale state across webviews. */
export type Translate = I18n["t"];

/** Match the backend source-label fallback so moderation resolves the same source. */
export const srcLabel = (x: ChatSource) =>
  x.name.trim() === "" ? x.value : x.name;

/** Which account logins are connected. */
export type SendReady = Record<AccountPlatform, boolean>;

/** A session sender (Twitch IRC) needs its own authentication; account senders send over HTTP after login. */
export function sendStatusLine(
  sendTargets: ChatSource[],
  chatAuth: Record<string, { login: string; ok: boolean } | undefined>,
  ready: SendReady,
  t: Translate,
): string {
  return sendTargets
    .map((x) => {
      const label = srcLabel(x);
      const provider = chatProvider(x.platform);
      if (provider?.send === "account" && provider.account)
        return ready[provider.account]
          ? t("chat.send.status.signedIn", { platform: provider.name })
          : t("chat.send.status.signIn", { label, platform: provider.name });
      const a = chatAuth[x.id];
      if (a?.ok) return t("chat.loginrow.signedInAs", { login: a.login });
      if (provider?.account && ready[provider.account])
        return t("chat.send.status.reconnect", { label });
      if (a && !a.ok) return t("chat.send.status.invalidToken", { label });
      return t("chat.send.status.connect", { label });
    })
    .join(" · ");
}

export type ChatAuth = Record<
  string,
  { login: string; ok: boolean } | undefined
>;

/** The shortest limit among the targets, since one draft goes to all of them. */
export function sendMaxLength(
  targets: readonly ChatSource[],
): number | undefined {
  const limits = targets
    .map((x) => chatProvider(x.platform)?.maxLength)
    .filter((n): n is number => n !== undefined);
  return limits.length ? Math.min(...limits) : undefined;
}

export interface SendTargets {
  /** Sources the composer can address, in configuration order. */
  sendable: ChatSource[];
  /** The chosen source id, or "all" when that source can no longer send. */
  effectiveSendTo: string;
  targets: ChatSource[];
  canSend: boolean;
}

function canAddress(x: ChatSource, ready: SendReady): boolean {
  const provider = chatProvider(x.platform);
  if (!provider?.send || !provider.account) return false;
  const signedIn = ready[provider.account];
  return provider.send === "session" ? !!x.hasSendToken || signedIn : signedIn;
}

/** Resolve where a typed message goes; disabled sources and sources without a channel never receive it. */
export function resolveSendTargets(
  sources: readonly ChatSource[],
  sendTo: string,
  ready: SendReady,
  chatAuth: ChatAuth,
): SendTargets {
  const sendable = sources.filter(
    (x) => x.enabled && x.value.trim() !== "" && canAddress(x, ready),
  );
  const effectiveSendTo =
    sendTo !== "all" && sendable.some((x) => x.id === sendTo) ? sendTo : "all";
  const targets =
    effectiveSendTo === "all"
      ? sendable
      : sendable.filter((x) => x.id === effectiveSendTo);
  // A session sender must have authenticated its chat connection; account senders only need the login.
  const canSend = targets.some((x) => {
    const provider = chatProvider(x.platform);
    return provider?.send === "account" && provider.account
      ? ready[provider.account]
      : !!chatAuth[x.id]?.ok;
  });
  return { sendable, effectiveSendTo, targets, canSend };
}
