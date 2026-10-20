import type { LoginState } from "./store/types";
import type { PlatformId } from "./types";

export type AccountPlatform = "twitch" | "youtube" | "kick";

export function isAccountPlatform(id: PlatformId): id is AccountPlatform {
  return id === "twitch" || id === "youtube" || id === "kick";
}

/** OAuth scope each platform needs before its stream key can be read through the login. */
const KEY_SCOPE: Partial<Record<AccountPlatform, string>> = {
  twitch: "channel:read:stream_key",
  kick: "streamkey:read",
};

/** A login from before the key scope existed can chat but cannot read the key; it must sign in again. */
export function missingKeyScope(
  platform: AccountPlatform,
  account: LoginState | null,
): boolean {
  const scope = KEY_SCOPE[platform];
  return (
    !!scope &&
    account?.state === "connected" &&
    (account.missingScopes ?? []).includes(scope)
  );
}

/** What one "Sign in" click does: finish right away with a usable login, or open the browser. */
export function connectAction(
  platform: AccountPlatform,
  account: LoginState | null,
): "finish" | "login" {
  return account?.state === "connected" && !missingKeyScope(platform, account)
    ? "finish"
    : "login";
}

/** While waiting for the browser, a connected login finishes the setup; an error or logout ends the wait. */
export function loginOutcome(
  state: string | undefined,
): "finish" | "cancel" | "wait" {
  if (state === "connected") return "finish";
  if (state === "error" || state === "out") return "cancel";
  return "wait";
}

export interface ConnectDeps {
  youtubeAutoLive: boolean;
  setSettings: (patch: { youtubeAutoLive: boolean }) => void;
  fetchTwitchKey: (targetId: string) => Promise<string>;
  fetchKickKey: (targetId: string) => Promise<string>;
}

export type ConnectResult =
  { kind: "youtubeAuto" } | { kind: "key"; login: string };

/** Twitch and Kick read the stream key through the login; YouTube turns on the automatic broadcast. */
export async function finishConnect(
  platform: AccountPlatform,
  targetId: string,
  deps: ConnectDeps,
): Promise<ConnectResult> {
  if (platform === "youtube") {
    if (!deps.youtubeAutoLive) deps.setSettings({ youtubeAutoLive: true });
    return { kind: "youtubeAuto" };
  }
  const login =
    platform === "twitch"
      ? await deps.fetchTwitchKey(targetId)
      : await deps.fetchKickKey(targetId);
  return { kind: "key", login };
}

export interface LoginDeps {
  twitchLogin: () => Promise<void>;
  youtubeLogin: () => Promise<void>;
  kickLogin: (options?: { streamKey?: boolean }) => Promise<void>;
}

/** Kick only grants the key scope when asked, so its login always requests it here. */
export function startLogin(
  platform: AccountPlatform,
  deps: LoginDeps,
): Promise<void> {
  if (platform === "twitch") return deps.twitchLogin();
  if (platform === "youtube") return deps.youtubeLogin();
  return deps.kickLogin({ streamKey: true });
}
