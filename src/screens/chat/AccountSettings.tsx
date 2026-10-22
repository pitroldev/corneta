import { Check, Copy, ExternalLink, LogIn } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { Button, PlatformGlyph } from "../../components/ui";
import { useT } from "../../lib/i18n";
import type { ChatPlatform } from "../../lib/types";
import { toast } from "../../lib/toast";
import { errMsg, openExternal } from "../../lib/utils";
import { accountProvider } from "../../platforms";
import { StepNum } from "./primitives";
import { useAccountAction } from "./useAccountAction";

/** Switches a login mode, confirms it, and closes the user's own app form. */
export const runModeAction =
  (close: (open: boolean) => void) =>
  async (action: Promise<void>, ok?: string) => {
    try {
      await action;
      if (ok) toast.success(ok);
      close(false);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

export type ByokModes = {
  officialReady: boolean;
  ownCreds: boolean;
  usingOwnCreds: boolean;
};

/** Switching modes preserves client credentials; forgetting them is a separate action. */
export function ByokModeActions({
  modes,
  onUseOfficial,
  onUseSaved,
  onForget,
}: {
  modes?: ByokModes;
  onUseOfficial?: () => void;
  onUseSaved?: () => void;
  onForget?: () => void;
}) {
  const t = useT();
  if (!modes) return null;
  const back = modes.ownCreds && !modes.usingOwnCreds;
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      {modes.usingOwnCreds && onUseOfficial && (
        <button
          onClick={onUseOfficial}
          className="text-[11px] font-bold text-brass hover:underline"
        >
          {t("chat.byok.useOfficial")}
        </button>
      )}
      {back && onUseSaved && (
        <button
          onClick={onUseSaved}
          className="text-[11px] font-bold text-brass hover:underline"
        >
          {t("chat.byok.useSaved")}
        </button>
      )}
      {modes.ownCreds && modes.officialReady && onForget && (
        <button
          onClick={onForget}
          className="text-[11px] font-semibold text-ink-faint hover:text-danger hover:underline"
        >
          {t("chat.byok.forget")}
        </button>
      )}
      {modes.usingOwnCreds && !modes.officialReady && (
        <span className="text-[11px] text-ink-faint">
          {t("chat.byok.officialDown")}
        </span>
      )}
    </div>
  );
}

export function LoginRow({
  platform,
  label,
  state,
  enabled,
  onLogin,
  onLogout,
  extra,
}: {
  platform: ChatPlatform;
  label: string;
  state: {
    state: string;
    login?: string;
    userCode?: string;
    verifyUri?: string;
    verifyUriComplete?: string;
    message?: string;
    missingScopes?: string[];
  };
  enabled: boolean;
  onLogin: () => Promise<void>;
  onLogout: () => Promise<void>;
  /** Platform-specific status below the row, such as a broadcast left to clean up. */
  extra?: ReactNode;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const { busy, run: act } = useAccountAction();
  const openPage = () => {
    const url = state.verifyUriComplete || state.verifyUri;
    if (url) void openExternal(url);
  };
  const copyCode = async () => {
    if (!state.userCode) return;
    try {
      await navigator.clipboard.writeText(state.userCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* Clipboard access may be denied; manual copying remains available. */
    }
  };
  return (
    <div className="rounded-md border-2 border-border-soft bg-surface-2 p-2.5">
      <div className="flex items-center gap-2">
        <PlatformGlyph id={platform} size={20} />
        <span className="font-display text-sm font-bold">{label}</span>
        {state.state === "connected" && (
          <span className="truncate text-xs font-semibold text-ok">
            ·{" "}
            {state.login
              ? t("chat.loginrow.signedInAs", { login: state.login })
              : t("chat.loginrow.signedIn")}
          </span>
        )}
        {state.state === "error" && (
          <span className="truncate text-xs text-bad">· {state.message}</span>
        )}
        <div className="ml-auto shrink-0">
          {!enabled ? (
            <span className="text-[11px] text-ink-faint">
              {t("chat.loginrow.unavailable")}
            </span>
          ) : state.state === "connected" ? (
            <Button
              variant="ghost"
              size="sm"
              loading={busy}
              disabled={busy}
              onClick={() => void act(onLogout)}
            >
              {t("chat.loginrow.signout")}
            </Button>
          ) : (
            <Button
              variant="subtle"
              size="sm"
              loading={busy || state.state === "code"}
              disabled={busy || state.state === "code"}
              onClick={() => void act(onLogin)}
            >
              <LogIn className="size-3.5" /> {t("chat.loginrow.signin")}
            </Button>
          )}
        </div>
      </div>
      {/* Platforms that ask for scopes on demand are expected to lack some until a feature needs them. */}
      {!accountProvider(platform)?.scopesOnDemand &&
      state.state === "connected" &&
      enabled &&
      state.missingScopes?.length ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-warn">
          <span>{t("chat.loginrow.missingScopes")}</span>
          <Button
            variant="subtle"
            size="sm"
            loading={busy}
            disabled={busy}
            onClick={() => void act(onLogin)}
          >
            <LogIn className="size-3.5" /> {t("chat.loginrow.reconnect")}
          </Button>
        </div>
      ) : null}
      {extra}
      {state.state === "code" &&
        (state.userCode && !state.verifyUriComplete ? (
          <div className="mt-2 rounded-md bg-brass/5 px-3 py-2.5 ring-1 ring-brass/25">
            <div className="mb-2 text-xs font-bold text-ink">
              {t("chat.loginrow.device.title")}
            </div>
            <div className="flex flex-col gap-2 text-xs text-ink-muted">
              <div className="flex flex-wrap items-center gap-2">
                <StepNum n={1} />
                <span className="shrink-0">
                  {t("chat.loginrow.device.step1")}
                </span>
                <span className="select-all rounded bg-brass px-2 py-0.5 font-mono text-sm font-extrabold tracking-widest text-brass-ink">
                  {state.userCode}
                </span>
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={() => void copyCode()}
                >
                  {copied ? (
                    <Check className="size-3.5" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                  {copied ? t("chat.common.copied") : t("chat.common.copy")}
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StepNum n={2} />
                <span className="shrink-0">
                  {t("chat.loginrow.device.step2")}
                </span>
                <Button variant="subtle" size="sm" onClick={openPage}>
                  <ExternalLink className="size-3.5" />{" "}
                  {t("chat.loginrow.device.openPage")}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <StepNum n={3} />
                <span>
                  {t("chat.loginrow.device.step3")}{" "}
                  <span className="text-ink-faint">
                    {t("chat.loginrow.device.waitingParens")}
                  </span>
                </span>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-ink-faint">
              {t("chat.loginrow.device.note")}
            </p>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-surface px-2.5 py-2 text-xs text-ink-muted">
            <span>{t("chat.loginrow.browser.note")}</span>
            {state.userCode && (
              <span className="rounded bg-brass px-2 py-0.5 font-mono text-sm font-extrabold tracking-widest text-brass-ink">
                {state.userCode}
              </span>
            )}
            <Button
              variant="subtle"
              size="sm"
              className="ml-auto"
              onClick={openPage}
            >
              <ExternalLink className="size-3.5" />{" "}
              {t("chat.loginrow.browser.openAgain")}
            </Button>
            <span className="text-ink-faint">{t("chat.loginrow.waiting")}</span>
          </div>
        ))}
    </div>
  );
}
