import { accountProvider, type AccountPlatform } from "../platforms";
import { PLATFORMS } from "./platforms";
import type { LoginState } from "./store/types";
import type { PlatformId } from "./types";

export type { AccountPlatform } from "../platforms";

/** The account that can sign in and fill a destination, if the destination has one. */
export function destinationAccount(
  platformId: PlatformId,
): AccountPlatform | undefined {
  return PLATFORMS[platformId]?.account;
}

/** A login from before the key scope existed can chat but cannot read the key; it must sign in again. */
export function missingKeyScope(
  platform: AccountPlatform,
  account: LoginState | null,
): boolean {
  const scope = accountProvider(platform)?.keyScope;
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
  fetchStreamKey: (
    platform: AccountPlatform,
    targetId: string,
  ) => Promise<string>;
}

export type ConnectResult =
  { kind: "autoBroadcast" } | { kind: "key"; login: string };

/** Fetch-key accounts read the stream key through the login; the others turn on the automatic broadcast. */
export async function finishConnect(
  platform: AccountPlatform,
  targetId: string,
  deps: ConnectDeps,
): Promise<ConnectResult> {
  if (accountProvider(platform)?.connect === "auto-broadcast") {
    if (!deps.youtubeAutoLive) deps.setSettings({ youtubeAutoLive: true });
    return { kind: "autoBroadcast" };
  }
  const login = await deps.fetchStreamKey(platform, targetId);
  return { kind: "key", login };
}

export interface LoginDeps {
  accountLogin: (
    platform: AccountPlatform,
    options?: { streamKey?: boolean },
  ) => Promise<void>;
}

/** Platforms that grant scopes on demand only give the key scope when asked, so this login asks for it. */
export function startLogin(
  platform: AccountPlatform,
  deps: LoginDeps,
): Promise<void> {
  return deps.accountLogin(
    platform,
    accountProvider(platform)?.scopesOnDemand ? { streamKey: true } : undefined,
  );
}
