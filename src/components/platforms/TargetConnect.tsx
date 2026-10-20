import { useEffect, useRef, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import {
  Check,
  ClipboardPaste,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LogIn,
  Pencil,
  RefreshCw,
  X,
} from "lucide-react";
import { useStore } from "../../lib/store";
import type { LoginState } from "../../lib/store/types";
import { HAS_TWITCH_OAUTH } from "../../lib/oauth";
import { PLATFORMS, platformName } from "../../lib/platforms";
import { toast } from "../../lib/toast";
import { useConfirm } from "../../lib/useConfirm";
import { cn, errMsg, openExternal, uid } from "../../lib/utils";
import { sanitizeStreamKey } from "../../lib/validation";
import { useI18n, useT, type I18n, type Locale } from "../../lib/i18n";
import type { PlatformId, Target } from "../../lib/types";
import {
  connectAction,
  finishConnect,
  isAccountPlatform,
  loginOutcome,
  startLogin,
  type AccountPlatform,
} from "../../lib/connectAccount";
import { Button, Input } from "../ui";

// Portuguese platform names require gendered prepositions; English uses the catalog name.
const PT_OF: Record<AccountPlatform, string> = {
  twitch: "da Twitch",
  youtube: "do YouTube",
  kick: "da Kick",
};
const PT_WITH: Record<AccountPlatform, string> = {
  twitch: "com a Twitch",
  youtube: "com o YouTube",
  kick: "com a Kick",
};

/** Whether this build can sign in to the platform; without it, pasting the key is the only path. */
export function useCanLogin(platformId: PlatformId): boolean {
  const youtube = useStore((s) => s.youtubeOauthReady);
  const kick = useStore((s) => s.kickOauthReady);
  if (platformId === "twitch") return HAS_TWITCH_OAUTH;
  if (platformId === "youtube") return youtube;
  if (platformId === "kick") return kick;
  return false;
}

/** "Entrar com a Twitch": the label keeps the Portuguese article next to the platform name. */
export function loginLabel(
  platformId: PlatformId,
  t: I18n["t"],
  locale: Locale,
): string {
  const name = platformName(platformId, t);
  if (locale === "pt-BR" && isAccountPlatform(platformId))
    return t("components.connect.login", { platform: PT_WITH[platformId] });
  return t("components.connect.login", { platform: name });
}

type ConnectPhase = "idle" | "login" | "fetching";

/**
 * Signs in and finishes the platform's setup in one action: Twitch and Kick fetch the stream key,
 * YouTube turns on the automatic broadcast. A login that is already connected skips the browser.
 */
export function useConnectAccount(target: Target, onDone?: () => void) {
  const { t } = useI18n();
  const platform = target.platformId;
  const account = useStore((s) =>
    isAccountPlatform(platform) ? s.chatLogin[platform] : null,
  );
  const canLogin = useCanLogin(platform);
  const [phase, setPhase] = useState<ConnectPhase>("idle");
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const finish = async (platform: AccountPlatform) => {
    const st = useStore.getState();
    setPhase("fetching");
    try {
      const result = await finishConnect(platform, target.id, {
        youtubeAutoLive: !!st.config?.settings.youtubeAutoLive,
        setSettings: st.setSettings,
        fetchTwitchKey: st.fetchTwitchKey,
        fetchKickKey: st.fetchKickKey,
      });
      toast.success(
        result.kind === "youtubeAuto"
          ? t("components.connect.youtubeReady")
          : result.login
            ? t("platforms.key.fetchedToast", { login: result.login })
            : t("platforms.key.fetchedToastAccount"),
      );
      setPhase("idle");
      onDoneRef.current?.();
    } catch (e) {
      setPhase("idle");
      toast.error(errMsg(e));
    }
  };

  const login = async (platform: AccountPlatform) => {
    setPhase("login");
    try {
      await startLogin(platform, useStore.getState());
    } catch (e) {
      setPhase("idle");
      toast.error(errMsg(e));
    }
  };

  const connect = () => {
    if (!isAccountPlatform(platform) || phase !== "idle") return;
    if (connectAction(platform, account) === "finish") void finish(platform);
    else void login(platform);
  };

  const accountState = account?.state;
  useEffect(() => {
    if (phaseRef.current !== "login" || !isAccountPlatform(platform)) return;
    const outcome = loginOutcome(accountState);
    if (outcome === "finish") void finish(platform);
    else if (outcome === "cancel") setPhase("idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountState]);

  return {
    canLogin: canLogin && isAccountPlatform(platform),
    account,
    phase,
    busy: phase !== "idle",
    connect,
    cancel: () => setPhase("idle"),
  };
}

/** Browser or device-code hint shown while a login waits for the user to authorize. */
export function LoginWaitNotice({
  account,
  className,
}: {
  account: LoginState;
  className?: string;
}) {
  const t = useT();
  const url = account.verifyUriComplete || account.verifyUri;
  return (
    <m.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-md bg-brass/10 px-3 py-2 text-xs text-ink-muted ring-1 ring-brass/25",
        className,
      )}
      role="status"
    >
      <Loader2 className="size-3.5 shrink-0 animate-spin text-brass" />
      <span className="min-w-0 flex-1">
        {account.userCode && !account.verifyUriComplete
          ? t("components.connect.waitCode")
          : t("components.connect.waitBrowser")}
      </span>
      {account.userCode && (
        <span
          data-selectable
          className="select-all rounded-sm bg-brass px-2 py-0.5 font-mono text-sm font-extrabold tracking-widest text-brass-ink"
        >
          {account.userCode}
        </span>
      )}
      {url && (
        <button
          type="button"
          onClick={() => void openExternal(url)}
          className="flex items-center gap-1 font-bold text-brass hover:underline"
        >
          <ExternalLink className="size-3" />{" "}
          {t("chat.loginrow.browser.openAgain")}
        </button>
      )}
    </m.div>
  );
}

/** Saves a pasted key; returns whether it was stored. */
export function useSaveKey(target: Target) {
  const t = useT();
  const setKey = useStore((s) => s.setKey);
  return async (raw: string): Promise<boolean> => {
    try {
      const { key, strippedUrl } = sanitizeStreamKey(raw, target.ingestUrl);
      if (!key) {
        if (strippedUrl) toast.error(t("platforms.key.pastedUrlOnly"));
        return false;
      }
      await setKey(target.id, key);
      if (strippedUrl) toast.info(t("platforms.key.strippedUrl"));
      toast.success(t("platforms.key.savedToast"));
      return true;
    } catch (e) {
      toast.error(t("platforms.key.saveFailed", { err: String(e) }));
      return false;
    }
  };
}

/**
 * The one action a target without a key needs: sign in (primary when available) or paste the key.
 * Used by the Platforms list, the Live drawer and first-run setup.
 */
export function QuickConnect({
  target,
  onDone,
  chatBridge = true,
  size = "sm",
  className,
}: {
  target: Target;
  onDone?: () => void;
  /** Offer to add the platform's chat after connecting; first-run setup handles chat itself. */
  chatBridge?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const { t, locale } = useI18n();
  const done = () => {
    if (chatBridge) offerChatBridge(target.platformId, t, locale);
    onDone?.();
  };
  const connect = useConnectAccount(target, done);
  const saveKey = useSaveKey(target);
  const preset = PLATFORMS[target.platformId];
  const [pasting, setPasting] = useState(!connect.canLogin);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (raw = value) => {
    if (!raw.trim() || saving) return;
    setSaving(true);
    const ok = await saveKey(raw);
    setSaving(false);
    if (ok) {
      setValue("");
      done();
    }
  };
  const pasteFromClipboard = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip.trim()) await save(clip);
    } catch {
      /* Clipboard access may be denied; typing the key remains available. */
    }
  };

  const waiting =
    connect.phase === "login" && connect.account?.state === "code";

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {connect.canLogin && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button
            variant="primary"
            size={size}
            onClick={connect.connect}
            loading={connect.busy}
            disabled={connect.busy}
          >
            {!connect.busy && <LogIn className="size-4" />}
            {connect.phase === "fetching"
              ? t(
                  target.platformId === "youtube"
                    ? "components.connect.turningOnAuto"
                    : "components.connect.fetching",
                )
              : connect.phase === "login"
                ? t("components.connect.waiting")
                : loginLabel(target.platformId, t, locale)}
          </Button>
          {connect.phase === "login" ? (
            <button
              type="button"
              onClick={connect.cancel}
              className="text-xs font-semibold text-ink-faint hover:text-ink"
            >
              {t("components.connect.cancel")}
            </button>
          ) : (
            !pasting && (
              <button
                type="button"
                onClick={() => setPasting(true)}
                className="text-xs font-bold text-brass hover:underline"
              >
                {t("components.connect.pasteInstead")}
              </button>
            )
          )}
        </div>
      )}
      <AnimatePresence initial={false}>
        {waiting && connect.account && (
          <LoginWaitNotice account={connect.account} />
        )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {pasting && (
          <m.div
            key="paste"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-2 pt-0.5">
              <div className="relative min-w-0 flex-1">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
                <Input
                  type="password"
                  className="pl-9"
                  aria-label={t("platforms.key.placeholder")}
                  placeholder={t("components.connect.pastePlaceholder")}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void save()}
                />
              </div>
              <Button
                variant={connect.canLogin ? "subtle" : "primary"}
                disabled={!value.trim() || saving}
                loading={saving}
                onClick={() => void save()}
              >
                {t("platforms.key.save")}
              </Button>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 pb-0.5">
              {preset.keyUrl && (
                <button
                  type="button"
                  onClick={() => void openExternal(preset.keyUrl!)}
                  className="flex items-center gap-1 text-xs font-semibold text-brass hover:underline"
                >
                  {t("components.connect.whereKey")}{" "}
                  <ExternalLink className="size-3" />
                </button>
              )}
              <button
                type="button"
                onClick={() => void pasteFromClipboard()}
                title={t("platforms.key.pasteSaveTitle")}
                className="ml-auto flex items-center gap-1 text-xs font-semibold text-ink-muted hover:text-ink"
              >
                <ClipboardPaste className="size-3.5" />
                {t("platforms.key.pasteSave")}
              </button>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Pass the caller's locale to avoid shared-state races between webviews.
export function offerChatBridge(
  platformId: PlatformId,
  t: I18n["t"],
  locale: Locale,
) {
  if (!isAccountPlatform(platformId)) return;
  const sources = useStore.getState().config?.settings.chatSources ?? [];
  if (sources.some((s) => s.platform === platformId)) return;
  // Record the offer immediately, regardless of whether it is accepted or dismissed.
  const offeredKey = `corneta.chatBridgeOffered.${platformId}`;
  try {
    if (localStorage.getItem(offeredKey)) return;
    localStorage.setItem(offeredKey, "1");
  } catch {
    /* Unavailable storage may repeat the offer; it must not prevent offering chat setup. */
  }
  const platformLabel =
    locale === "pt-BR" ? PT_OF[platformId] : platformName(platformId, t);
  toast.action(
    t("platforms.chatBridge.ask", { platform: platformLabel }),
    t("platforms.chatBridge.cta"),
    () => {
      const st = useStore.getState();
      const cur = st.config?.settings.chatSources ?? [];
      // A connected account is offered in the Channels tab with its channel filled in.
      const loggedIn = st.chatLogin[platformId].state === "connected";
      // The source may have been created while the toast was visible.
      if (!loggedIn && !cur.some((s) => s.platform === platformId)) {
        st.setSettings({
          chatSources: [
            ...cur,
            {
              id: uid("src"),
              platform: platformId,
              value: "",
              name: "",
              enabled: true,
            },
          ],
        });
      }
      st.requestChatConfig("canais");
      st.requestNavigate("chat");
    },
  );
}

/** The full key editor shown inside an expanded platform: saved state, change, remove, fetch. */
export function KeyField({
  target,
  autoFocusKey,
}: {
  target: Target;
  autoFocusKey?: boolean;
}) {
  const { t, locale } = useI18n();
  const clearKey = useStore((s) => s.clearKey);
  const saveKey = useSaveKey(target);
  const connect = useConnectAccount(target, () =>
    offerChatBridge(target.platformId, t, locale),
  );
  const isKeyPlatform =
    target.platformId === "twitch" || target.platformId === "kick";
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [reveal, setReveal] = useState(false);
  const clearKeyStep = useConfirm();

  const save = async (raw: string = value) => {
    if (await saveKey(raw)) {
      setValue("");
      setEditing(false);
      offerChatBridge(target.platformId, t, locale);
    }
  };
  const paste = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (!clip.trim()) return;
      await save(clip);
    } catch {
      /* Clipboard access may be denied; manual entry remains available. */
    }
  };

  if (target.hasKey && !editing) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2">
        <Check className="size-4 text-ok" strokeWidth={2.6} />
        <span className="text-sm font-semibold">
          {t("platforms.key.saved")}
        </span>
        <span className="font-mono text-sm text-ink-faint">•••••••••••</span>
        <div className="ml-auto flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setValue("");
              setEditing(true);
            }}
          >
            <Pencil className="size-3.5" /> {t("platforms.key.change")}
          </Button>
          <Button
            variant={clearKeyStep.armed ? "danger" : "ghost"}
            size="sm"
            onClick={async () => {
              if (!clearKeyStep.confirm()) return;
              try {
                await clearKey(target.id);
                toast.info(t("platforms.key.removed"));
              } catch (e) {
                toast.error(
                  t("platforms.key.removeFailed", { err: String(e) }),
                );
              }
            }}
          >
            {clearKeyStep.armed
              ? t("platforms.key.removeConfirm")
              : t("platforms.key.remove")}
          </Button>
        </div>
      </div>
    );
  }

  const accountReady = connect.account?.state === "connected";
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            type={reveal ? "text" : "password"}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- Only focus after editing or adding a destination, never on initial load.
            autoFocus={editing || autoFocusKey}
            aria-label={t("platforms.key.placeholder")}
            className="pl-9 pr-9"
            placeholder={t("platforms.key.placeholder")}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && value.trim() && void save()}
          />
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-ink-faint hover:text-ink"
            aria-label={
              reveal ? t("platforms.key.hide") : t("platforms.key.show")
            }
            title={reveal ? t("platforms.key.hide") : t("platforms.key.show")}
          >
            {reveal ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
        </div>
        {isKeyPlatform && connect.canLogin && accountReady && (
          <Button
            variant="subtle"
            size="sm"
            disabled={connect.busy}
            loading={connect.busy}
            onClick={connect.connect}
            title={
              target.platformId === "twitch"
                ? t("platforms.key.fetchTitle", {
                    login: connect.account?.login ?? "",
                  })
                : t("platforms.key.fetchTitleKick")
            }
          >
            {!connect.busy &&
              ((connect.account?.missingScopes ?? []).length > 0 ? (
                <RefreshCw className="size-4" />
              ) : (
                <Download className="size-4" />
              ))}
            {t("platforms.key.fetch")}
          </Button>
        )}
        <Button
          variant="subtle"
          size="sm"
          onClick={paste}
          title={t("platforms.key.pasteSaveTitle")}
        >
          <ClipboardPaste className="size-4" /> {t("platforms.key.pasteSave")}
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={!value.trim()}
          onClick={() => void save()}
        >
          {t("platforms.key.save")}
        </Button>
        {editing && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing(false)}
            aria-label={t("platforms.key.cancelEdit")}
            title={t("platforms.key.cancelEdit")}
          >
            <X className="size-4" />
          </Button>
        )}
      </div>
      {connect.phase === "login" && connect.account?.state === "code" && (
        <LoginWaitNotice account={connect.account} />
      )}
    </div>
  );
}
