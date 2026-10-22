import { useState } from "react";
import { useT } from "../../lib/i18n";
import { useStore } from "../../lib/store";
import { NO_OAUTH_MODES } from "..";
import { LoginRow, runModeAction } from "../../screens/chat/AccountSettings";
import type { AccountUi } from "../uiTypes";
import { KickCredsForm } from "./CredsForm";

/** Official sign-in through the setup API broker; otherwise, or on request, the user's own Kick app. */
function KickAccountPanel() {
  const t = useT();
  const state = useStore((s) => s.chatLogin.kick);
  const accountLogin = useStore((s) => s.accountLogin);
  const accountLogout = useStore((s) => s.accountLogout);
  const login = () => accountLogin("kick");
  const logout = () => accountLogout("kick");
  const oauthReady = useStore((s) => s.oauthReady.kick ?? false);
  const modes = useStore((s) => s.oauthModes.kick) ?? NO_OAUTH_MODES;
  const saveOwnOauth = useStore((s) => s.saveOwnOauth);
  const clearOwnOauth = useStore((s) => s.clearOwnOauth);
  const switchToOfficialOauth = useStore((s) => s.switchToOfficialOauth);
  const switchToOwnOauth = useStore((s) => s.switchToOwnOauth);
  const setOauth = (id: string, secret: string) =>
    saveOwnOauth("kick", id, secret);
  const clearOauth = () => clearOwnOauth("kick");
  const switchToOfficial = () => switchToOfficialOauth("kick");
  const switchToOwnCreds = () => switchToOwnOauth("kick");
  const [showByok, setShowByok] = useState(false);
  const mode = runModeAction(setShowByok);
  const save = async (id: string, secret: string) => {
    await setOauth(id, secret);
    setShowByok(false);
  };
  const restoreSaved = () =>
    void mode(switchToOwnCreds(), t("chat.account.kick.ownCreds.toast"));

  if (!oauthReady)
    return (
      <KickCredsForm onSave={save} modes={modes} onUseSaved={restoreSaved} />
    );
  return (
    <div className="flex flex-col gap-1">
      <LoginRow
        platform="kick"
        label="Kick"
        state={state}
        enabled={oauthReady}
        onLogin={login}
        onLogout={logout}
      />
      <button
        onClick={() => setShowByok((value) => !value)}
        className="self-end text-[11px] font-semibold text-ink-faint hover:text-ink"
      >
        {showByok ? t("chat.account.byok.hide") : t("chat.account.byok.show")}
      </button>
      {showByok && (
        <KickCredsForm
          onSave={save}
          modes={modes}
          onUseOfficial={() =>
            void mode(switchToOfficial(), t("chat.account.kick.official.toast"))
          }
          onUseSaved={restoreSaved}
          onForget={() =>
            void mode(clearOauth(), t("chat.account.kick.forgot.toast"))
          }
        />
      )}
    </div>
  );
}

/** Without the broker, the user can still sign in with their own Kick app. */
export const kickUi: AccountUi = {
  AccountPanel: KickAccountPanel,
  setupAvailable: true,
};
