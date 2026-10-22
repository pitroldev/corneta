import { HAS_TWITCH_OAUTH } from "../../lib/oauth";
import { useStore } from "../../lib/store";
import { LoginRow } from "../../screens/chat/AccountSettings";
import type { AccountUi } from "../uiTypes";

function TwitchAccountPanel() {
  const state = useStore((s) => s.chatLogin.twitch);
  const accountLogin = useStore((s) => s.accountLogin);
  const accountLogout = useStore((s) => s.accountLogout);
  const login = () => accountLogin("twitch");
  const logout = () => accountLogout("twitch");
  return (
    <LoginRow
      platform="twitch"
      label="Twitch"
      state={state}
      enabled={HAS_TWITCH_OAUTH}
      onLogin={login}
      onLogout={logout}
    />
  );
}

/** Twitch signs in only with the client ID built into the app. */
export const twitchUi: AccountUi = {
  AccountPanel: TwitchAccountPanel,
  setupAvailable: HAS_TWITCH_OAUTH,
  loginReady: HAS_TWITCH_OAUTH,
};
