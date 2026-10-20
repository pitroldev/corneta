import { memo, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { AnimatePresence, m } from "framer-motion";
import {
  ChevronRight,
  ExternalLink,
  MessageSquare,
  Pause,
  Play,
  Plug,
  Send,
} from "lucide-react";
import { api } from "../../lib/api";
import { useStore } from "../../lib/store";
import { PLATFORMS } from "../../lib/platforms";
import { resolveSendTargets } from "../../lib/chatSend";
import { toast } from "../../lib/toast";
import { cn, errMsg, fmtUptime, openExternal } from "../../lib/utils";
import { useI18n, useT } from "../../lib/i18n";
import type { Target } from "../../lib/types";
import type { Screen } from "../../components/Sidebar";
import type { ChatView } from "../../components/ChatFeed";
import { LiveChatFeed } from "../chat/LiveFeeds";
import { Button, Card, PlatformGlyph } from "../../components/ui";
import { MiniStat, StatePill, Usage } from "./parts";

/** While on air: platform numbers and machine load on the left, the unified chat beside them. */
export function LiveCockpit({
  targets,
  onNavigate,
}: {
  targets: Target[];
  onNavigate?: (s: Screen) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-3">
        <LiveTargetList targets={targets} onNavigate={onNavigate} />
        <MachineUsage />
      </div>
      <LiveChatPanel onNavigate={onNavigate} />
    </div>
  );
}

function MachineUsage() {
  const t = useT();
  const cpu = useStore((s) => s.snapshot.cpu);
  const gpu = useStore((s) => s.snapshot.gpu);
  return (
    <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 bg-surface-2 py-3">
      <span className="text-xs font-bold uppercase tracking-wide text-ink-faint">
        {t("golive.machine.label")}
      </span>
      <Usage label="CPU" value={cpu} />
      <Usage label="GPU" value={gpu} />
    </Card>
  );
}

// Rows read their own metrics, so a stats update re-renders one row and never re-measures the list.
const LiveTargetList = memo(function LiveTargetList({
  targets,
  onNavigate,
}: {
  targets: Target[];
  onNavigate?: (s: Screen) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <AnimatePresence>
        {targets.map((target, i) => (
          <m.div
            key={target.id}
            layout
            layoutDependency={i}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{
              delay: i * 0.05,
              type: "spring",
              stiffness: 320,
              damping: 28,
            }}
          >
            <LiveTargetRow target={target} onNavigate={onNavigate} />
          </m.div>
        ))}
      </AnimatePresence>
    </div>
  );
});

const LiveTargetRow = memo(function LiveTargetRow({
  target,
  onNavigate,
}: {
  target: Target;
  onNavigate?: (s: Screen) => void;
}) {
  const { t, fmt } = useI18n();
  const st = useStore(
    useShallow((s) => {
      const metrics = s.snapshot.targets[target.id];
      return {
        state: metrics?.state,
        message: metrics?.message,
        bitrateKbps: metrics?.bitrateKbps,
        fps: metrics?.fps,
        droppedFrames: metrics?.droppedFrames,
        uptimeSec: metrics?.uptimeSec,
      };
    }),
  );
  const paused = st.state === "paused";
  // Show only observed metrics, never preset values for a destination that is not transmitting.
  const flowing = st.state === "live" || st.state === "brb";
  return (
    <Card
      className={cn(
        "flex items-center gap-4 py-3 transition-opacity",
        paused && "opacity-70",
      )}
    >
      <PlatformGlyph id={target.platformId} size={36} />
      <div className="min-w-28 flex-1">
        <div className="font-display font-bold">{target.name}</div>
        <StatePill state={st.state ?? "idle"} />
        {st.message && (
          <div className="mt-0.5 text-xs text-bad">{st.message}</div>
        )}
        {st.state === "error" && (
          <div className="mt-0.5 flex flex-wrap gap-x-3">
            <button
              onClick={() =>
                void api
                  .retryTarget(target.id)
                  .catch((e) => toast.error(errMsg(e)))
              }
              className="text-xs font-bold text-brass hover:underline"
            >
              {t("golive.target.retry")}
            </button>
            <button
              onClick={() => onNavigate?.("platforms")}
              className="text-xs font-bold text-brass hover:underline"
            >
              {t("golive.target.swapKey")}
            </button>
          </div>
        )}
      </div>
      <div className="flex gap-5">
        <MiniStat
          label={t("golive.stat.bitrate")}
          value={flowing ? fmt.bitrate(st.bitrateKbps ?? 0) : "—"}
        />
        <MiniStat
          label={t("golive.stat.drops")}
          value={flowing ? String(st.droppedFrames ?? 0) : "—"}
          tone={flowing && (st.droppedFrames ?? 0) > 0 ? "warn" : "default"}
        />
        <MiniStat
          label={t("golive.stat.fps")}
          value={flowing ? String(st.fps ?? 0) : "—"}
        />
        <div className="hidden 2xl:block">
          <MiniStat
            label={t("golive.stat.uptime")}
            value={flowing ? fmtUptime(st.uptimeSec ?? 0) : "—"}
          />
        </div>
      </div>
      {PLATFORMS[target.platformId].liveUrl && (
        <button
          onClick={() =>
            void openExternal(PLATFORMS[target.platformId].liveUrl!)
          }
          className="grid size-9 shrink-0 place-items-center rounded-md text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
          title={t("golive.target.openChannel.title")}
          aria-label={t("golive.target.openChannel.aria", {
            nome: target.name,
          })}
        >
          <ExternalLink className="size-4" />
        </button>
      )}
      <button
        onClick={() => void api.setTargetPaused(target.id, !paused)}
        className={cn(
          "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-bold uppercase tracking-wide transition-colors",
          paused
            ? "bg-brass/15 text-brass hover:bg-brass/25"
            : "bg-surface-2 text-ink-muted hover:bg-surface-3 hover:text-ink",
        )}
        title={
          paused
            ? t("golive.target.resume.title")
            : t("golive.target.pause.title")
        }
      >
        {paused ? (
          <Play className="size-3.5" />
        ) : (
          <Pause className="size-3.5" />
        )}
        {paused ? t("golive.target.resume") : t("golive.target.pause")}
      </button>
    </Card>
  );
});

function LiveChatPanel({ onNavigate }: { onNavigate?: (s: Screen) => void }) {
  const t = useT();
  const settings = useStore((s) => s.config!.settings);
  const connected = useStore((s) => s.chatConnected);
  const chatLogin = useStore((s) => s.chatLogin);
  const chatAuth = useStore((s) => s.chatAuth);
  const sendChat = useStore((s) => s.sendChat);
  const connectChat = useStore((s) => s.connectChat);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const sources = settings.chatSources ?? [];
  const hasSources = sources.some((x) => x.enabled && x.value.trim() !== "");
  const view: ChatView = useMemo(
    () => ({
      emotes: settings.chatShowEmotes,
      badges: settings.chatShowBadges,
      platform: settings.chatShowPlatform,
      source: settings.chatShowSource,
      timestamps: settings.chatShowTimestamps,
      fontSize: Math.min(settings.chatFontSize, 15),
    }),
    [
      settings.chatShowEmotes,
      settings.chatShowBadges,
      settings.chatShowPlatform,
      settings.chatShowSource,
      settings.chatShowTimestamps,
      settings.chatFontSize,
    ],
  );
  const { targets, canSend } = resolveSendTargets(
    sources,
    "all",
    {
      twitch: chatLogin.twitch.state === "connected",
      youtube: chatLogin.youtube.state === "connected",
      kick: chatLogin.kick.state === "connected",
    },
    chatAuth,
  );

  const send = async () => {
    const text = draft.trim();
    if (!text || sending || !canSend) return;
    setSending(true);
    try {
      await sendChat(
        text,
        targets.map((x) => x.id),
      );
      setDraft("");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSending(false);
    }
  };
  const connect = async () => {
    setConnecting(true);
    try {
      await connectChat(t);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setConnecting(false);
    }
  };

  return (
    <Card
      className={cn(
        "flex min-w-0 flex-col overflow-hidden p-0",
        connected
          ? "h-[28rem] xl:sticky xl:top-0 xl:h-[calc(100vh-15rem)] xl:min-h-[22rem]"
          : "xl:self-start",
      )}
    >
      <div className="flex items-center gap-2 border-b border-border-soft px-4 py-3">
        <MessageSquare className="size-4 text-brass" />
        <h3 className="text-base">{t("golive.chat.title")}</h3>
        {connected && (
          <span className="flex items-center gap-1 text-xs font-semibold text-ok">
            <span className="size-1.5 rounded-full bg-ok" />
            {t("golive.chat.connected")}
          </span>
        )}
        <button
          type="button"
          onClick={() => onNavigate?.("chat")}
          className="ml-auto flex items-center gap-0.5 text-xs font-bold text-brass hover:underline"
        >
          {t("golive.chat.open")} <ChevronRight className="size-3.5" />
        </button>
      </div>
      {connected ? (
        <>
          <LiveChatFeed
            platformFilter={null}
            view={view}
            connected
            className="min-h-0 flex-1"
            aria-label={t("golive.chat.title")}
          />
          <form
            className="flex items-center gap-2 border-t border-border-soft p-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                canSend
                  ? t("golive.chat.placeholder")
                  : t("golive.chat.cantSend")
              }
              aria-label={t("golive.chat.placeholder")}
              disabled={!canSend}
              maxLength={500}
              className="h-9 min-w-0 flex-1 rounded-md border-2 border-border bg-surface-2 px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-brass disabled:opacity-60"
            />
            <Button
              type="submit"
              variant="primary"
              size="sm"
              className="h-9"
              disabled={!draft.trim() || sending || !canSend}
              loading={sending}
              aria-label={t("golive.chat.send")}
            >
              {!sending && <Send className="size-4" />}
            </Button>
          </form>
        </>
      ) : (
        <div className="grid flex-1 place-items-center px-6 py-8 text-center">
          <div>
            <span className="mx-auto mb-3 grid size-12 -rotate-3 place-items-center rounded-lg bg-surface-2 text-brass">
              <Plug className="size-6" />
            </span>
            <p className="font-display text-lg font-extrabold">
              {t(
                hasSources ? "golive.chat.off.title" : "golive.chat.none.title",
              )}
            </p>
            <p className="mx-auto mt-1 max-w-56 text-xs text-ink-muted">
              {t(hasSources ? "golive.chat.off.body" : "golive.chat.none.body")}
            </p>
            {hasSources ? (
              <Button
                variant="primary"
                size="sm"
                className="mt-3"
                onClick={() => void connect()}
                loading={connecting}
              >
                {t("golive.chat.connect")}
              </Button>
            ) : (
              <Button
                variant="subtle"
                size="sm"
                className="mt-3"
                onClick={() => onNavigate?.("chat")}
              >
                {t("golive.chat.setup")}
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
