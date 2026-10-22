import { useState } from "react";
import { useT } from "../../lib/i18n";
import { useStore } from "../../lib/store";
import { NO_OAUTH_MODES } from "..";
import { LoginRow, runModeAction } from "../../screens/chat/AccountSettings";
import type { AccountUi, ChatUi } from "../uiTypes";
import { YoutubeChannelSettings } from "./ApiKeyField";
import { YoutubeBroadcastRecovery } from "./BroadcastRecovery";
import { YoutubeCredsForm } from "./CredsForm";

/** Official sign-in when the setup API provides it; otherwise, or on request, the user's own Google app. */
function YoutubeAccountPanel() {
  const t = useT();
  const state = useStore((s) => s.chatLogin.youtube);
  const accountLogin = useStore((s) => s.accountLogin);
  const accountLogout = useStore((s) => s.accountLogout);
  const login = () => accountLogin("youtube");
  const logout = () => accountLogout("youtube");
  const oauthReady = useStore((s) => s.oauthReady.youtube ?? false);
  const modes = useStore((s) => s.oauthModes.youtube) ?? NO_OAUTH_MODES;
  const saveOwnOauth = useStore((s) => s.saveOwnOauth);
  const clearOwnOauth = useStore((s) => s.clearOwnOauth);
  const switchToOfficialOauth = useStore((s) => s.switchToOfficialOauth);
  const switchToOwnOauth = useStore((s) => s.switchToOwnOauth);
  const setOauth = (id: string, secret: string) =>
    saveOwnOauth("youtube", id, secret);
  const clearOauth = () => clearOwnOauth("youtube");
  const switchToOfficial = () => switchToOfficialOauth("youtube");
  const switchToOwnCreds = () => switchToOwnOauth("youtube");
  const [showByok, setShowByok] = useState(false);
  const mode = runModeAction(setShowByok);
  const save = async (id: string, secret: string) => {
    await setOauth(id, secret);
    setShowByok(false);
  };
  const restoreSaved = () =>
    void mode(switchToOwnCreds(), t("chat.account.youtube.ownCreds.toast"));

  if (!oauthReady)
    return (
      <YoutubeCredsForm onSave={save} modes={modes} onUseSaved={restoreSaved} />
    );
  return (
    <div className="flex flex-col gap-1">
      <LoginRow
        platform="youtube"
        label="YouTube"
        state={state}
        enabled
        onLogin={login}
        onLogout={logout}
        extra={<YoutubeBroadcastRecovery />}
      />
      <button
        onClick={() => setShowByok((value) => !value)}
        className="self-end text-[11px] font-semibold text-ink-faint hover:text-ink"
      >
        {showByok ? t("chat.account.byok.hide") : t("chat.account.byok.show")}
      </button>
      {showByok && (
        <YoutubeCredsForm
          onSave={save}
          modes={modes}
          onUseOfficial={() =>
            void mode(
              switchToOfficial(),
              t("chat.account.youtube.official.toast"),
            )
          }
          onUseSaved={restoreSaved}
          onForget={() =>
            void mode(clearOauth(), t("chat.account.youtube.forgot.toast"))
          }
        />
      )}
    </div>
  );
}

/** Without the official client, the user can still sign in with their own Google app. */
export const youtubeUi: AccountUi = {
  AccountPanel: YoutubeAccountPanel,
  setupAvailable: true,
};

export const youtubeChatUi: ChatUi = {
  ChannelSettings: YoutubeChannelSettings,
};
