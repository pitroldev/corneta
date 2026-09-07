import { Check, Copy, ExternalLink, LogIn } from "lucide-react";
import { useState } from "react";
import { Button, Input, PlatformGlyph } from "../../components/ui";
import { bold, useT } from "../../lib/i18n";
import { toast } from "../../lib/toast";
import type { ChatPlatform } from "../../lib/types";
import { openExternal } from "../../lib/utils";
import { sanitizeToken } from "../../lib/validation";
import { splitAt, StepNum } from "./primitives";
import { useAccountAction } from "./useAccountAction";
import { YoutubeBroadcastRecovery } from "./YoutubeBroadcastRecovery";

type ByokModes = {
  officialReady: boolean;
  ownCreds: boolean;
  usingOwnCreds: boolean;
};

/** Switching modes preserves client credentials; forgetting them is a separate action. */
function ByokModeActions({
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

export function YoutubeCredsForm({
  onSave,
  modes,
  onUseOfficial,
  onUseSaved,
  onForget,
}: {
  onSave: (clientId: string, clientSecret: string) => Promise<void>;
  modes?: ByokModes;
  onUseOfficial?: () => void;
  onUseSaved?: () => void;
  onForget?: () => void;
}) {
  const t = useT();
  const [id, setId] = useState("");
  const [secret, setSecret] = useState("");
  const [guide, setGuide] = useState(false);
  const { busy, run } = useAccountAction();
  const can = id.trim() !== "" && secret.trim() !== "";
  const save = () => {
    if (!can) return;
    void run(
      () => onSave(sanitizeToken(id), sanitizeToken(secret)),
      () => {
        setId("");
        setSecret("");
        toast.success(t("chat.youtube.creds.saved.toast"));
      },
    );
  };
  const [step1Before, step1After] = splitAt(
    t("chat.youtube.guide.step1"),
    "Google Cloud Console",
  );
  return (
    <div className="rounded-md border-2 border-border-soft bg-surface-2 p-2.5">
      <div className="mb-2 flex items-center gap-2">
        <PlatformGlyph id="youtube" size={20} />
        <span className="font-display text-sm font-bold">YouTube</span>
        <button
          onClick={() => setGuide((v) => !v)}
          className="ml-auto text-xs font-bold text-brass hover:underline"
        >
          {guide
            ? t("chat.youtube.creds.guide.hide")
            : t("chat.youtube.creds.guide.show")}
        </button>
      </div>

      <ByokModeActions
        modes={modes}
        onUseOfficial={onUseOfficial}
        onUseSaved={onUseSaved}
        onForget={onForget}
      />

      {guide && (
        <>
          <ol className="mb-2.5 list-decimal space-y-2 rounded-md bg-surface px-5 py-3 text-[11px] leading-relaxed text-ink-muted marker:font-bold marker:text-brass">
            <li>
              {step1Before}
              <button
                onClick={() =>
                  void openExternal(
                    "https://console.cloud.google.com/projectcreate",
                  )
                }
                className="font-bold text-brass hover:underline"
              >
                Google Cloud Console
              </button>
              {step1After}
            </li>
            <li>{bold(t, "chat.youtube.guide.step2")}</li>
            <li>{bold(t, "chat.youtube.guide.step3")}</li>
            <li>{bold(t, "chat.youtube.guide.step4")}</li>
            <li>{bold(t, "chat.youtube.guide.step5")}</li>
            <li>{bold(t, "chat.youtube.guide.step6")}</li>
            <li>{bold(t, "chat.youtube.guide.step7")}</li>
          </ol>
          <p className="mb-2.5 rounded-md border-2 border-warn/40 bg-warn/10 px-3 py-2 text-[11px] leading-relaxed text-ink-muted">
            <strong className="text-ink">
              {t("chat.youtube.guide.warn.label")}
            </strong>{" "}
            {bold(t, "chat.youtube.guide.warn.text")}
          </p>
        </>
      )}

      <div className="flex flex-col gap-2">
        <Input
          name="youtube-client-id"
          disabled={busy}
          autoComplete="off"
          placeholder="Client ID"
          aria-label="YouTube — Client ID"
          value={id}
          onChange={(e) => setId(e.target.value)}
        />
        <div className="flex items-center gap-2">
          <Input
            type="password"
            name="youtube-client-secret"
            disabled={busy}
            autoComplete="off"
            placeholder="Client Secret"
            aria-label="YouTube — Client Secret"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && can && save()}
            className="flex-1"
          />
          <Button
            variant="primary"
            size="sm"
            disabled={!can || busy}
            loading={busy}
            onClick={save}
          >
            {t("chat.common.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function KickCredsForm({
  onSave,
  modes,
  onUseOfficial,
  onUseSaved,
  onForget,
}: {
  onSave: (clientId: string, clientSecret: string) => Promise<void>;
  modes?: ByokModes;
  onUseOfficial?: () => void;
  onUseSaved?: () => void;
  onForget?: () => void;
}) {
  const t = useT();
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const { busy, run } = useAccountAction();
  const canSave = clientId.trim() !== "" && clientSecret.trim() !== "";
  const save = () => {
    if (!canSave) return;
    void run(
      () => onSave(sanitizeToken(clientId), sanitizeToken(clientSecret)),
      () => {
        setClientId("");
        setClientSecret("");
        toast.success(t("chat.kick.creds.saved.toast"));
      },
    );
  };
  return (
    <div className="rounded-md border-2 border-border-soft bg-surface-2 p-2.5">
      <div className="mb-2 flex items-center gap-2">
        <PlatformGlyph id="kick" size={20} />
        <span className="font-display text-sm font-bold">Kick</span>
        <button
          className="ml-auto text-xs font-bold text-brass hover:underline"
          onClick={() =>
            void openExternal("https://kick.com/settings/developer")
          }
        >
          {t("chat.kick.creds.openDeveloper")}
        </button>
      </div>
      <p className="mb-2 text-[11px] text-ink-muted">
        {bold(t, "chat.kick.creds.redirect")}
      </p>
      <ByokModeActions
        modes={modes}
        onUseOfficial={onUseOfficial}
        onUseSaved={onUseSaved}
        onForget={onForget}
      />
      <div className="flex flex-col gap-2">
        <Input
          name="kick-client-id"
          disabled={busy}
          autoComplete="off"
          placeholder="Client ID"
          aria-label="Kick — Client ID"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
        />
        <div className="flex items-center gap-2">
          <Input
            name="kick-client-secret"
            disabled={busy}
            autoComplete="off"
            type="password"
            placeholder="Client Secret"
            aria-label="Kick — Client Secret"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && canSave && save()}
            className="flex-1"
          />
          <Button
            variant="primary"
            size="sm"
            disabled={!canSave || busy}
            loading={busy}
            onClick={save}
          >
            {t("chat.common.save")}
          </Button>
        </div>
      </div>
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
  };
  enabled: boolean;
  onLogin: () => Promise<void>;
  onLogout: () => Promise<void>;
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
      {platform === "youtube" ? <YoutubeBroadcastRecovery /> : null}
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
