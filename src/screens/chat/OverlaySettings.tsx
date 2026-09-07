import { Bell, Check, Copy, MonitorPlay, RefreshCw, Tv2 } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Select } from "../../components/Select";
import { Slider } from "../../components/Slider";
import { Button, Toggle } from "../../components/ui";
import { api, IS_TAURI, type OverlayInfo } from "../../lib/api";
import { bold, useT } from "../../lib/i18n";
import { toast } from "../../lib/toast";
import type { AppSettings } from "../../lib/types";
import { errMsg } from "../../lib/utils";
import { chatPosOpts, overlayPosOpts, scaleOpts } from "./constants";
import { OptRow } from "./primitives";

function OverlayBlock({
  title,
  url,
  onTest,
  testMsg,
  children,
}: {
  title: string;
  url: string;
  onTest: () => Promise<void>;
  testMsg: string;
  children?: ReactNode;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* Clipboard access may be denied; manual copying remains available. */
    }
  };
  const addToObs = () =>
    api
      .overlayObsAddSource(url)
      .then(() =>
        toast.success(
          t("chat.overlay.added.toast", { block: title.toLowerCase() }),
        ),
      )
      .catch((e) => toast.error(errMsg(e)));
  const test = () =>
    onTest()
      .then(() => toast.success(testMsg))
      .catch((e) => toast.error(errMsg(e)));
  return (
    <div className="rounded-md bg-surface-2/60 p-2.5 ring-1 ring-border">
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-brass">
        {title}
      </div>
      <div className="flex items-center gap-1.5">
        <code className="min-w-0 flex-1 truncate rounded-md bg-surface px-2.5 py-2 text-[11px] text-ink-muted ring-1 ring-border">
          {url}
        </code>
        <Button variant="subtle" size="sm" onClick={() => void copy()}>
          {copied ? (
            <Check className="size-3.5" />
          ) : (
            <Copy className="size-3.5" />
          )}
          {copied ? t("chat.common.copied") : t("chat.common.copy")}
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="subtle" size="sm" onClick={() => void addToObs()}>
          <Tv2 className="size-3.5" /> {t("chat.overlay.addToObs")}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void test()}>
          <Bell className="size-3.5" /> {t("chat.common.test")}
        </Button>
      </div>
      {children && (
        <div className="mt-2 flex flex-col gap-2 rounded-md bg-surface px-3 py-2">
          {children}
        </div>
      )}
      <p className="mt-1.5 text-[11px] text-ink-faint">
        {bold(t, "chat.overlay.reAddNote")}
      </p>
    </div>
  );
}

export function OverlayCard({
  settings,
  setSettings,
}: {
  settings: AppSettings;
  setSettings: (patch: Partial<AppSettings>) => void;
}) {
  const t = useT();
  const enabled = settings.overlayEnabled ?? false;
  const [info, setInfo] = useState<OverlayInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchFailed, setFetchFailed] = useState(false);

  const fetchInfo = useCallback(async () => {
    if (!IS_TAURI) return;
    setFetching(true);
    try {
      const i = await api.overlayStatus();
      setInfo(i);
      setFetchFailed(!i);
    } catch {
      setFetchFailed(true);
    } finally {
      setFetching(false);
    }
  }, []);
  // Retry on enable and focus because the local server may still be starting.
  useEffect(() => {
    if (!IS_TAURI || !enabled) return;
    void fetchInfo();
    const onFocus = () => void fetchInfo();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [enabled, fetchInfo]);

  const alertUrl = info
    ? `${info.url}?sound=${(settings.overlaySound ?? true) ? 1 : 0}` +
      `&pos=${settings.overlayPosition || "top"}` +
      `&dur=${settings.overlayDurationSecs ?? 6}` +
      `&scale=${settings.overlayScale || "md"}` +
      `&follows=${(settings.overlayShowFollows ?? true) ? 1 : 0}`
    : "";
  const chatUrl = info
    ? `${info.chatUrl}?pos=${settings.overlayChatPosition || "bottom"}` +
      `&size=${settings.overlayChatSize ?? 22}` +
      `&max=${settings.overlayChatMax ?? 12}` +
      `&badges=${(settings.overlayChatBadges ?? true) ? 1 : 0}` +
      `&platform=${(settings.overlayChatPlatform ?? true) ? 1 : 0}` +
      `&nocmd=${(settings.overlayChatHideCommands ?? false) ? 1 : 0}` +
      `&fade=${settings.overlayChatFadeSecs ?? 0}`
    : "";

  const toggle = async (on: boolean) => {
    setSettings({ overlayEnabled: on });
    if (!IS_TAURI) return;
    setBusy(true);
    try {
      if (on) {
        setInfo(await api.overlayStart());
        setFetchFailed(false);
      } else {
        await api.overlayStop();
        setInfo(null);
      }
    } catch (e) {
      toast.error(errMsg(e));
      setSettings({ overlayEnabled: !on });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MonitorPlay className="size-4 text-brass" />
          <span className="text-xs font-bold uppercase tracking-wide text-ink-faint">
            {t("chat.overlay.section")}
          </span>
        </div>
        <Toggle
          checked={enabled}
          onChange={(v) => void toggle(v)}
          disabled={busy}
          label={t("chat.overlay.section")}
        />
      </div>
      <p className="mb-2 text-[11px] text-ink-faint">
        {bold(t, "chat.overlay.lede")}
      </p>

      {enabled &&
        (!IS_TAURI ? (
          <p className="text-xs text-ink-muted">
            {t("chat.account.desktopOnly")}
          </p>
        ) : !info ? (
          <div className="flex flex-col items-center gap-2 rounded-md border-2 border-dashed border-border bg-surface-2 px-3 py-3 text-center text-xs text-ink-muted">
            {busy || fetching || !fetchFailed ? (
              t("chat.overlay.starting")
            ) : (
              <>
                {t("chat.overlay.fetchError")}
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={() => void fetchInfo()}
                >
                  <RefreshCw className="size-3.5" /> {t("golive.error.retry")}
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <OverlayBlock
              title={t("chat.overlay.block.alerts")}
              url={alertUrl}
              onTest={() => api.overlayTest()}
              testMsg={t("chat.overlay.test.alerts")}
            >
              <OptRow label={t("chat.overlay.opt.position")}>
                <Select
                  className="w-40"
                  value={settings.overlayPosition || "top"}
                  options={overlayPosOpts(t)}
                  onChange={(v) => setSettings({ overlayPosition: v })}
                  aria-label={t("chat.overlay.aria.alertPosition")}
                />
              </OptRow>
              <OptRow label={t("chat.overlay.opt.size")}>
                <Select
                  className="w-40"
                  value={settings.overlayScale || "md"}
                  options={scaleOpts(t)}
                  onChange={(v) => setSettings({ overlayScale: v })}
                  aria-label={t("chat.overlay.aria.alertSize")}
                />
              </OptRow>
              <OptRow label={t("chat.overlay.opt.duration")}>
                <Slider
                  className="w-40"
                  value={settings.overlayDurationSecs ?? 6}
                  min={3}
                  max={15}
                  suffix="s"
                  onChange={(v) => setSettings({ overlayDurationSecs: v })}
                  aria-label={t("chat.overlay.opt.duration")}
                />
              </OptRow>
              <OptRow label={t("chat.overlay.opt.sound")}>
                <Toggle
                  checked={settings.overlaySound ?? true}
                  onChange={(v) => setSettings({ overlaySound: v })}
                  label={t("chat.overlay.opt.sound")}
                />
              </OptRow>
              <OptRow label={t("chat.overlay.opt.follows")}>
                <Toggle
                  checked={settings.overlayShowFollows ?? true}
                  onChange={(v) => setSettings({ overlayShowFollows: v })}
                  label={t("chat.overlay.opt.follows")}
                />
              </OptRow>
            </OverlayBlock>

            <OverlayBlock
              title={t("chat.overlay.block.chat")}
              url={chatUrl}
              onTest={() => api.overlayChatTest()}
              testMsg={t("chat.overlay.test.chat")}
            >
              <OptRow label={t("chat.overlay.opt.position")}>
                <Select
                  className="w-40"
                  value={settings.overlayChatPosition || "bottom"}
                  options={chatPosOpts(t)}
                  onChange={(v) => setSettings({ overlayChatPosition: v })}
                  aria-label={t("chat.overlay.aria.chatPosition")}
                />
              </OptRow>
              <OptRow label={t("chat.overlay.opt.fontSize")}>
                <Slider
                  className="w-40"
                  value={settings.overlayChatSize ?? 22}
                  min={12}
                  max={40}
                  suffix="px"
                  onChange={(v) => setSettings({ overlayChatSize: v })}
                  aria-label={t("chat.display.chatFontSize")}
                />
              </OptRow>
              <OptRow label={t("chat.overlay.opt.maxMessages")}>
                <Slider
                  className="w-40"
                  value={settings.overlayChatMax ?? 12}
                  min={3}
                  max={30}
                  onChange={(v) => setSettings({ overlayChatMax: v })}
                  aria-label={t("chat.overlay.aria.maxMessages")}
                />
              </OptRow>
              <OptRow label={t("chat.overlay.opt.fade")}>
                <Slider
                  className="w-40"
                  value={settings.overlayChatFadeSecs ?? 0}
                  min={0}
                  max={60}
                  suffix="s"
                  onChange={(v) => setSettings({ overlayChatFadeSecs: v })}
                  aria-label={t("chat.overlay.aria.fade")}
                />
              </OptRow>
              <OptRow label={t("chat.overlay.opt.badges")}>
                <Toggle
                  checked={settings.overlayChatBadges ?? true}
                  onChange={(v) => setSettings({ overlayChatBadges: v })}
                  label={t("chat.overlay.aria.badges")}
                />
              </OptRow>
              <OptRow label={t("chat.overlay.opt.platformIcon")}>
                <Toggle
                  checked={settings.overlayChatPlatform ?? true}
                  onChange={(v) => setSettings({ overlayChatPlatform: v })}
                  label={t("chat.overlay.opt.platformIcon")}
                />
              </OptRow>
              <OptRow label={t("chat.overlay.opt.hideCommands")}>
                <Toggle
                  checked={settings.overlayChatHideCommands ?? false}
                  onChange={(v) => setSettings({ overlayChatHideCommands: v })}
                  label={t("chat.overlay.aria.hideCommands")}
                />
              </OptRow>
            </OverlayBlock>
          </div>
        ))}
    </div>
  );
}
