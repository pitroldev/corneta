import { useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  LogIn,
  Megaphone,
} from "lucide-react";
import { api } from "../../lib/api";
import { useStore } from "../../lib/store";
import { toast } from "../../lib/toast";
import { cn, errMsg } from "../../lib/utils";
import { rich, useT } from "../../lib/i18n";
import { Button, Card, Input, PlatformGlyph } from "../../components/ui";
import { Select } from "../../components/Select";
import { OptionCheck } from "./parts";

const PLAT_LABEL: Record<string, string> = {
  twitch: "Twitch",
  youtube: "YouTube",
  kick: "Kick",
};

/** Title and category for every signed-in platform, plus the automatic YouTube broadcast options. */
export function StreamInfoCard() {
  const t = useT();
  const chatLogin = useStore((s) => s.chatLogin);
  const settings = useStore((s) => s.config!.settings);
  const setSettings = useStore((s) => s.setSettings);
  const requestNavigate = useStore((s) => s.requestNavigate);
  const requestChatConfig = useStore((s) => s.requestChatConfig);
  const ready = {
    twitch: chatLogin.twitch.state === "connected",
    youtube: chatLogin.youtube.state === "connected",
    kick: chatLogin.kick.state === "connected",
  };
  const targets = (["twitch", "youtube", "kick"] as const).filter(
    (p) => ready[p],
  );
  const [title, setTitleLocal] = useState(settings.streamTitle ?? "");
  const [game, setGame] = useState("");
  const [youtubeOpen, setYoutubeOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Record<
    string,
    { ok: boolean; error?: string; warn?: string }
  > | null>(null);

  if (targets.length === 0) {
    return (
      <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-2 text-brass">
          <Megaphone className="size-5" />
        </span>
        <div className="min-w-48 flex-1">
          <h3 className="text-lg">{t("golive.streamInfo.title")}</h3>
          <p className="text-xs text-ink-faint">
            {t("golive.streamInfo.teaser")}
          </p>
        </div>
        <Button
          variant="subtle"
          size="sm"
          onClick={() => {
            requestChatConfig("conta");
            requestNavigate("chat");
          }}
        >
          <LogIn className="size-4" /> {t("golive.streamInfo.signIn")}
        </Button>
      </Card>
    );
  }

  // The persisted title also feeds automatic YouTube broadcast creation.
  const persistTitle = () => {
    const trimmed = title.trim();
    if (trimmed !== settings.streamTitle) setSettings({ streamTitle: trimmed });
  };
  const onTitle = (v: string) => {
    setTitleLocal(v);
    setResults(null);
  };
  const onGame = (v: string) => {
    setGame(v);
    setResults(null);
  };

  const apply = async () => {
    if (busy) return;
    if (!title.trim()) {
      toast.error(t("golive.streamInfo.needTitle"));
      return;
    }
    persistTitle();
    setBusy(true);
    setResults(null);
    try {
      const r = await api.setStreamInfo(title.trim(), game.trim() || undefined);
      setResults(r);
      const okN = Object.values(r).filter((x) => x.ok).length;
      const total = Object.keys(r).length;
      if (okN === total)
        toast.success(t("golive.streamInfo.applied", { n: okN }));
      else toast.error(t("golive.streamInfo.partial", { ok: okN, total }));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-2 text-brass">
          <Megaphone className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg">{t("golive.streamInfo.title")}</h3>
          <p className="text-xs text-ink-faint">
            {t("golive.streamInfo.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {targets.map((p) => (
            <span
              key={p}
              className="flex items-center gap-1 rounded-sm bg-surface-2 px-1.5 py-0.5 text-[11px] font-bold text-ink-muted"
            >
              <PlatformGlyph id={p} size={14} /> {PLAT_LABEL[p]}
            </span>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto] gap-2">
        <Input
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          onBlur={persistTitle}
          onKeyDown={(e) =>
            e.key === "Enter" && !busy && title.trim() && void apply()
          }
          placeholder={t("golive.streamInfo.title.placeholder")}
          aria-label={t("golive.streamInfo.title.placeholder")}
          maxLength={140}
        />
        <Input
          value={game}
          onChange={(e) => onGame(e.target.value)}
          onKeyDown={(e) =>
            e.key === "Enter" && !busy && title.trim() && void apply()
          }
          placeholder={t("golive.streamInfo.game.placeholder")}
          aria-label={t("golive.streamInfo.game.placeholder")}
        />
        <Button
          variant="primary"
          onClick={apply}
          loading={busy}
          disabled={busy || !title.trim()}
        >
          {t("golive.streamInfo.apply")}
        </Button>
      </div>
      <AnimatePresence initial={false}>
        {results && (
          <m.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2.5 flex flex-col gap-1">
              {Object.entries(results).map(([p, r]) => (
                <div
                  key={p}
                  className="flex min-w-0 items-center gap-1.5 text-xs"
                >
                  {!r.ok ? (
                    <AlertTriangle className="size-3.5 shrink-0 text-bad" />
                  ) : r.warn ? (
                    <AlertTriangle className="size-3.5 shrink-0 text-warn" />
                  ) : (
                    <Check
                      className="size-3.5 shrink-0 text-ok"
                      strokeWidth={2.6}
                    />
                  )}
                  <span className="shrink-0 font-semibold">
                    {PLAT_LABEL[p] ?? p}
                  </span>
                  {!r.ok && (
                    <span className="truncate text-bad">· {r.error}</span>
                  )}
                  {r.ok && r.warn && (
                    <span className="truncate text-warn">· {r.warn}</span>
                  )}
                </div>
              ))}
            </div>
          </m.div>
        )}
      </AnimatePresence>
      {ready.youtube && (
        <>
          <OptionCheck
            checked={settings.youtubeAutoLive}
            onToggle={() =>
              setSettings({ youtubeAutoLive: !settings.youtubeAutoLive })
            }
            title={t("golive.streamInfo.youtubeAuto.title")}
            desc={t("golive.streamInfo.youtubeAuto.desc")}
          />
          {settings.youtubeAutoLive && (
            <button
              type="button"
              onClick={() => setYoutubeOpen((v) => !v)}
              aria-expanded={youtubeOpen}
              className="mt-1.5 flex items-center gap-1 pl-7 text-xs font-semibold text-ink-muted hover:text-ink"
            >
              {t("golive.streamInfo.youtubeOptions", {
                privacy: t(
                  settings.youtubePrivacy === "unlisted"
                    ? "golive.streamInfo.youtubePrivacy.unlisted"
                    : settings.youtubePrivacy === "private"
                      ? "golive.streamInfo.youtubePrivacy.private"
                      : "golive.streamInfo.youtubePrivacy.public",
                ),
              })}
              <ChevronDown
                className={cn(
                  "size-3.5 transition-transform duration-200",
                  youtubeOpen && "rotate-180",
                )}
              />
            </button>
          )}
          <AnimatePresence initial={false}>
            {settings.youtubeAutoLive && youtubeOpen && (
              <m.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="overflow-hidden"
              >
                <div className="mt-1.5 space-y-1.5 pl-7">
                  <label className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-ink-muted">
                      {t("golive.streamInfo.youtubePrivacy.label")}
                    </span>
                    <Select
                      className="w-56 shrink-0"
                      value={settings.youtubePrivacy}
                      options={[
                        {
                          value: "public",
                          label: t("golive.streamInfo.youtubePrivacy.public"),
                        },
                        {
                          value: "unlisted",
                          label: t("golive.streamInfo.youtubePrivacy.unlisted"),
                        },
                        {
                          value: "private",
                          label: t("golive.streamInfo.youtubePrivacy.private"),
                        },
                      ]}
                      onChange={(youtubePrivacy) =>
                        setSettings({ youtubePrivacy })
                      }
                    />
                  </label>
                  <OptionCheck
                    className="mt-0"
                    checked={settings.youtubeMadeForKids}
                    onToggle={() =>
                      setSettings({
                        youtubeMadeForKids: !settings.youtubeMadeForKids,
                      })
                    }
                    title={t("golive.streamInfo.youtubeKids.title")}
                    desc={t("golive.streamInfo.youtubeKids.desc")}
                  />
                </div>
              </m.div>
            )}
          </AnimatePresence>
          <p className="mt-1.5 text-xs text-ink-faint">
            {rich(t, "golive.streamInfo.youtubeNote", {
              titulo: (
                <strong className="text-ink-muted">
                  {t("golive.streamInfo.title")}
                </strong>
              ),
            })}
          </p>
        </>
      )}
    </Card>
  );
}
