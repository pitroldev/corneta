import { GUIDE_KEY, TOPIC_KEY } from "../../lib/platformCheckText";
import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { AnimatePresence, m } from "framer-motion";
import {
  AlertTriangle,
  BadgeCheck,
  ChevronRight,
  Circle,
  ExternalLink,
  Eye,
  MessageSquare,
  Pause,
  Play,
  Plug,
  Send,
} from "lucide-react";
import { api } from "../../lib/api";
import {
  audienceTooltip,
  audienceTotal,
  showAudience,
} from "../../lib/audience";
import { useStore } from "../../lib/store";
import { useNow } from "../../lib/useNow";
import { acceptsCodec } from "../../lib/estimates";
import { PLATFORMS, platformName } from "../../lib/platforms";
import { resolveSendTargets } from "../../lib/chatSend";
import {
  describePlatformCheck,
  obsGuide,
  platformFix,
  type ObsGuide,
  type PlatformIssueTopic,
} from "../../lib/platformCheck";
import { toast } from "../../lib/toast";
import { cn, errMsg, fmtUptime, openExternal } from "../../lib/utils";
import { useI18n, useT } from "../../lib/i18n";
import type { EncodingAction, PlatformCheck } from "../../lib/types";
import type { LiveTarget } from "../../lib/liveTargets";
import type { Screen } from "../../components/Sidebar";
import type { ChatView } from "../../components/ChatFeed";
import { LiveChatFeed } from "../chat/LiveFeeds";
import { Button, Card, PlatformGlyph } from "../../components/ui";
import { MiniStat, StatePill, Usage } from "./parts";

/** While on air: unified vital strip + per-platform status on the left, unified chat beside them. */
export function LiveCockpit({
  targets,
  onNavigate,
}: {
  targets: LiveTarget[];
  onNavigate?: (s: Screen) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-3">
        <VitalsStrip />
        <VerticalIngestBanner />
        <LiveTargetList targets={targets} onNavigate={onNavigate} />
      </div>
      <LiveChatPanel onNavigate={onNavigate} />
    </div>
  );
}

function VerticalIngestBanner() {
  const t = useT();
  const state = useStore((s) => s.snapshot.state);
  const ingestLive = useStore((s) => s.snapshot.ingestLive);
  const verticalLive = useStore((s) => s.snapshot.verticalIngestLive);
  const key = useStore((s) => s.config?.ingest.key ?? "obs");
  if (state !== "live" || !ingestLive || verticalLive !== false) return null;
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-lg border border-warn/40 bg-warn/10 px-3.5 py-2.5 text-xs text-ink"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
      <span className="leading-relaxed">
        {t("golive.verticalIngest.waiting", { key: `${key}_vertical` })}
      </span>
    </div>
  );
}

function VitalsStrip() {
  const { t, fmt } = useI18n();
  const state = useStore((s) => s.snapshot.state);
  const startedAt = useStore((s) => s.snapshot.startedAt);
  const cpu = useStore((s) => s.snapshot.cpu);
  const gpu = useStore((s) => s.snapshot.gpu);
  const recordVideo = useStore((s) => s.config?.settings.recordVideo ?? false);
  const viewers = useStore((s) => s.viewers);
  const totalKbps = useStore((s) =>
    Object.values(s.snapshot.targets).reduce(
      (sum, item) =>
        item.state === "live" || item.state === "brb"
          ? sum + (item.bitrateKbps ?? 0)
          : sum,
      0,
    ),
  );
  const live = state === "live";
  const now = useNow(live);
  const audience = live && showAudience(viewers);

  return (
    <Card className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2.5 border border-border-soft bg-surface-2 px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {live && startedAt ? (
          <span className="inline-flex items-center gap-1.5 rounded-sm bg-live px-2 py-0.5 font-display text-xs font-extrabold uppercase tracking-wide text-white tabular-nums">
            <span className="live-dot size-2 rounded-full bg-white" />
            {t("sidebar.state.live")} · {fmtUptime((now - startedAt) / 1000)}
          </span>
        ) : (
          <span className="text-xs font-bold uppercase tracking-wide text-ink-faint">
            {t("golive.machine.label")}
          </span>
        )}
        {live && recordVideo && (
          <span className="inline-flex items-center gap-1 rounded-sm border border-bad/35 bg-bad/12 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-bad">
            <Circle className="size-2 fill-current" aria-hidden />
            {t("golive.vitals.rec")}
          </span>
        )}
        {audience && (
          <span
            className="inline-flex items-center gap-1 rounded-sm border border-ok/35 bg-ok/12 px-2 py-0.5 text-[11px] font-bold tabular-nums text-ok"
            title={audienceTooltip(viewers.items, { t, fmt })}
          >
            <Eye className="size-3.5" aria-hidden />
            {audienceTotal(viewers, fmt)}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
        {live && totalKbps > 0 && (
          <span className="flex items-baseline gap-1.5 text-xs">
            <span className="font-bold uppercase tracking-wide text-ink-faint">
              {t("golive.vitals.upload")}
            </span>
            <span className="font-display text-sm font-extrabold tabular-nums text-ink">
              {fmt.bitrate(totalKbps)}
            </span>
          </span>
        )}
        <Usage label="CPU" value={cpu} />
        <Usage label="GPU" value={gpu} />
      </div>
    </Card>
  );
}

const VU_SLOTS = 6;

function BitrateMeter({
  samples,
  flowing,
  hasDrops,
}: {
  samples: readonly number[];
  flowing: boolean;
  hasDrops: boolean;
}) {
  const t = useT();
  const peak = Math.max(1000, ...samples);
  const padded = [
    ...Array<number>(Math.max(0, VU_SLOTS - samples.length)).fill(0),
    ...samples.slice(-VU_SLOTS),
  ];

  return (
    <div
      className="hidden h-5 items-end gap-0.5 rounded bg-surface-2 px-1.5 py-0.5 sm:inline-flex"
      role="img"
      aria-label={t("golive.stability.aria")}
    >
      {padded.map((kbps, i) => {
        const ratio = flowing && kbps > 0 ? kbps / peak : 0;
        const pct = ratio > 0 ? Math.max(22, Math.round(ratio * 100)) : 16;
        const tone =
          !flowing || kbps <= 0
            ? "bg-surface-3"
            : ratio < 0.45
              ? "bg-bad"
              : ratio < 0.72 || hasDrops
                ? "bg-warn"
                : "bg-ok";
        return (
          <span
            key={i}
            className={cn("w-1 rounded-[1px] transition-[height]", tone)}
            style={{ height: `${pct}%` }}
          />
        );
      })}
    </div>
  );
}

// Rows read their own metrics, so a stats update re-renders one row and never re-measures the list.
const LiveTargetList = memo(function LiveTargetList({
  targets,
  onNavigate,
}: {
  targets: LiveTarget[];
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

function useBitrateHistory(targetId: string): number[] {
  const [samples, setSamples] = useState<number[]>(() => {
    const initial = useStore.getState().snapshot.targets[targetId]?.bitrateKbps;
    return initial && initial > 0 ? [initial] : [];
  });
  useEffect(
    () =>
      useStore.subscribe((state, prev) => {
        const next = state.snapshot.targets[targetId]?.bitrateKbps;
        const before = prev.snapshot.targets[targetId]?.bitrateKbps;
        if (next === before) return;
        if (next == null || next <= 0) return;
        setSamples((list) => [...list.slice(-(VU_SLOTS - 1)), next]);
      }),
    [targetId],
  );
  return samples;
}

const LiveTargetRow = memo(function LiveTargetRow({
  target,
  onNavigate,
}: {
  target: LiveTarget;
  onNavigate?: (s: Screen) => void;
}) {
  const { t, fmt } = useI18n();
  const st = useStore(
    useShallow((s) => {
      const metrics = s.snapshot.targets[target.id];
      const cfg = s.config?.targets.find((item) => item.id === target.id);
      const preset =
        cfg?.encoding.preset ?? PLATFORMS[target.platformId]?.recommended;
      const obsCodec =
        s.obs && s.obs !== "loading" ? s.obs.videoCodec : undefined;
      return {
        state: metrics?.state,
        message: metrics?.message,
        bitrateKbps: metrics?.bitrateKbps,
        fps: metrics?.fps,
        droppedFrames: metrics?.droppedFrames,
        uptimeSec: metrics?.uptimeSec,
        platform: metrics?.platform,
        action: metrics?.action ?? "copy",
        reencoded: metrics?.reencoded ?? false,
        isPortrait: preset ? preset.height > preset.width : false,
        videoCodec:
          obsCodec &&
          obsCodec !== "h264" &&
          acceptsCodec(target.platformId, obsCodec)
            ? obsCodec
            : undefined,
      };
    }),
  );
  const samples = useBitrateHistory(target.id);
  const paused = st.state === "paused";
  // Show only observed metrics, never preset values for a destination that is not transmitting.
  const flowing = st.state === "live" || st.state === "brb";
  const isError = st.state === "error" || st.state === "signal-lost";
  const isWarn =
    st.state === "reconnecting" ||
    st.state === "connecting" ||
    (flowing && (st.droppedFrames ?? 0) > 0);
  const accentCls = isError
    ? "border-l-bad border-bad/35 bg-bad/8"
    : isWarn
      ? "border-l-warn border-warn/35 bg-warn/8"
      : st.state === "brb"
        ? "border-l-brass border-border-soft"
        : flowing
          ? "border-l-ok border-border-soft"
          : "border-l-border border-border-soft";

  const codecTag =
    st.videoCodec === "av1" ? "AV1" : st.videoCodec === "hevc" ? "HEVC" : null;
  const routeLabel =
    st.action === "copy" && !st.reencoded
      ? codecTag
        ? `${t("golive.route.copy")} · ${codecTag}`
        : t("golive.route.copy")
      : st.isPortrait
        ? `${t("golive.route.vertical")} · ${t("golive.route.gpu")}`
        : codecTag
          ? `${t("golive.route.gpu")} · ${codecTag}`
          : t("golive.route.gpu");
  const routeTone =
    st.action === "copy" && !st.reencoded
      ? codecTag
        ? "bg-info/15 text-info"
        : "bg-surface-3 text-ink-muted"
      : st.isPortrait
        ? "bg-brass text-brass-ink"
        : "bg-surface-3 text-ink-muted";

  return (
    <Card
      className={cn(
        "flex items-center gap-3.5 border border-l-4 py-3 pl-3.5 transition-colors",
        accentCls,
        paused && "opacity-70",
      )}
    >
      <PlatformGlyph id={target.platformId} size={36} />
      <div className="min-w-28 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-display font-bold">{target.name}</span>
          {flowing && (
            <span
              className={cn(
                "rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide",
                routeTone,
              )}
            >
              {routeLabel}
            </span>
          )}
        </div>
        <StatePill state={st.state ?? "idle"} />
        {flowing && (st.platform || st.reencoded) && (
          <PlatformCheckNote
            check={st.platform}
            target={target}
            action={st.action}
            reencoded={st.reencoded}
            onNavigate={onNavigate}
          />
        )}
        {st.message && (
          <div className="mt-0.5 text-xs font-medium text-bad">
            {st.message}
          </div>
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
      <div className="flex items-center gap-4">
        <BitrateMeter
          samples={samples}
          flowing={flowing}
          hasDrops={(st.droppedFrames ?? 0) > 0}
        />
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
      {PLATFORMS[target.platformId]?.liveUrl && (
        <button
          onClick={() =>
            void openExternal(PLATFORMS[target.platformId]!.liveUrl!)
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
        onClick={() =>
          void api
            .setTargetPaused(target.id, !paused)
            .catch((e) => toast.error(errMsg(e)))
        }
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

// The warning that led to a re-encode, so the OBS step stays reachable once the platform is happy.
const fixedGuides = new Map<string, ObsGuide>();

/** The platform's own word on the live, and what the row can do about a warning. */
function PlatformCheckNote({
  check,
  target,
  action,
  reencoded,
  onNavigate,
}: {
  check?: PlatformCheck;
  target: LiveTarget;
  action: EncodingAction;
  reencoded: boolean;
  onNavigate?: (s: Screen) => void;
}) {
  const t = useT();
  const [guideOpen, setGuideOpen] = useState(false);
  const [fixing, setFixing] = useState(false);
  const line = check ? describePlatformCheck(check) : null;
  const platform = platformName(target.platformId, t);
  const fix = platformFix(
    line,
    action,
    reencoded,
    fixedGuides.get(target.id) ?? null,
  );
  const guide =
    fix.kind === "reencode" || fix.kind === "reencoded" ? fix.guide : null;

  const reencode = async (topic: PlatformIssueTopic) => {
    setFixing(true);
    try {
      await api.reencodeTarget(target.id);
      const fixed = obsGuide(topic);
      if (fixed) fixedGuides.set(target.id, fixed);
      toast.success(t("golive.toast.reencoding", { target: target.name }));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setFixing(false);
    }
  };

  const guideToggle = guide && (
    <button
      onClick={() => setGuideOpen((open) => !open)}
      className="text-xs font-bold text-brass hover:underline"
      aria-expanded={guideOpen}
    >
      {t("golive.target.platform.guide.toggle")}
    </button>
  );
  const guideText = guide && guideOpen && (
    <p className="mt-0.5 max-w-prose text-xs text-ink-muted">
      {t(GUIDE_KEY[guide])}
    </p>
  );

  let headline: ReactNode = null;
  if (line?.kind === "confirmed") {
    headline = (
      <div className="mt-0.5 flex items-center gap-1 text-xs text-ok">
        <BadgeCheck className="size-3.5 shrink-0" aria-hidden />
        {t("golive.target.platform.confirmed", { platform })}
      </div>
    );
  } else if (line?.kind === "notLive") {
    headline = (
      <div className="mt-0.5 flex items-start gap-1 text-xs text-warn">
        <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
        {t("golive.target.platform.notLive", { platform })}
      </div>
    );
  } else if (line?.kind === "confirmedWithIssue" && fix.kind !== "reencoded") {
    headline = (
      <div className="mt-0.5 flex items-start gap-1 text-xs text-warn">
        <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
        {t("golive.target.platform.issue", {
          platform,
          issue: t(TOPIC_KEY[line.topic]),
        })}
      </div>
    );
  }

  return (
    <>
      {headline}
      {fix.kind === "reencode" && line?.kind === "confirmedWithIssue" && (
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3">
          <button
            onClick={() => void reencode(line.topic)}
            disabled={fixing}
            title={t("golive.target.platform.fix.title")}
            className="text-xs font-bold text-brass hover:underline disabled:opacity-60"
          >
            {t("golive.target.platform.fix")}
          </button>
          {guideToggle}
        </div>
      )}
      {fix.kind === "reencoded" && (
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-ink-muted">
          <span>
            {line?.kind === "confirmedWithIssue"
              ? t("golive.target.platform.reencodedPending")
              : t("golive.target.platform.reencoded")}
          </span>
          {guideToggle}
        </div>
      )}
      {fix.kind === "preset" && (
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-ink-muted">
          <span>{t("golive.target.platform.transcoded")}</span>
          <button
            onClick={() => onNavigate?.("encoding")}
            className="font-bold text-brass hover:underline"
          >
            {t("golive.target.platform.transcoded.open")}
          </button>
        </div>
      )}
      {guideText}
    </>
  );
}

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
