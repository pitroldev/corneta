import { useEffect, useRef, useState } from "react";
import { m } from "framer-motion";
import {
  Activity,
  Bug,
  Check,
  ChevronRight,
  Clock,
  Gauge,
  Plus,
  Plug,
  Shield,
  Tv2,
  Wifi,
} from "lucide-react";
import { useStore } from "../../lib/store";
import { bandFit, estimate } from "../../lib/estimates";
import { PLATFORMS, platformName, platformTagline } from "../../lib/platforms";
import {
  joinNames,
  obsConfigured,
  youtubeAutoTargetId,
} from "../../lib/readiness";
import { shortcutLabel } from "../../lib/shortcuts";
import { useReadiness, useReadinessContext } from "../../lib/useReadiness";
import { useFocusRescue } from "../../lib/useFocusRescue";
import { cn } from "../../lib/utils";
import { INGEST_URL_RE } from "../../lib/validation";
import { useI18n, useT } from "../../lib/i18n";
import type { PlatformId } from "../../lib/types";
import { ObsSetupPanel, type ObsSetupStatus } from "../ObsSetup";
import { QualityModeCards, modeTitleKey } from "../QualityModes";
import { QuickConnect } from "../platforms/TargetConnect";
import { Mascot } from "../decor";
import { Badge, Button, ExperimentalBadge, PlatformGlyph, Toggle } from "../ui";

const SETUP_ORDER: PlatformId[] = ["twitch", "youtube", "kick", "facebook"];

/** Platforms first-run setup offers: complete presets with a key page, never experimental ones. */
export const SETUP_PLATFORMS: PlatformId[] = Object.values(PLATFORMS)
  .filter((p) => !p.experimental && p.keyUrl && INGEST_URL_RE.test(p.ingestUrl))
  .map((p) => p.id)
  .sort(
    (a, b) =>
      (SETUP_ORDER.indexOf(a) + 1 || 99) - (SETUP_ORDER.indexOf(b) + 1 || 99),
  );

export function StepHeader({
  kicker,
  title,
  lead,
  titleRef,
  badge,
}: {
  kicker: string;
  title: string;
  lead: string;
  titleRef: React.RefObject<HTMLHeadingElement | null>;
  /** Sits beside the title rather than above it, so the step still fits the default window. */
  badge?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start gap-5">
      {badge}
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 text-xs font-bold uppercase tracking-[0.18em] text-brass">
          {kicker}
        </div>
        <h2
          ref={titleRef}
          tabIndex={-1}
          className="text-4xl leading-none outline-none"
        >
          {title}
        </h2>
        <p className="mt-2.5 max-w-xl text-base text-ink-muted">{lead}</p>
      </div>
    </div>
  );
}

/* ---------- Welcome ---------- */

export interface ConsentDraft {
  usage: boolean;
  crashReports: boolean;
}

export function WelcomeStep({
  titleRef,
  consent,
  onConsent,
}: {
  titleRef: React.RefObject<HTMLHeadingElement | null>;
  /** Present only while a telemetry decision is still pending. */
  consent: ConsentDraft | null;
  onConsent: (next: ConsentDraft) => void;
}) {
  const t = useT();
  const todo = [
    { icon: Tv2, label: t("components.setup.welcome.todo.platforms") },
    { icon: Plug, label: t("components.setup.welcome.todo.obs") },
    { icon: Wifi, label: t("components.setup.welcome.todo.internet") },
  ];
  return (
    <div>
      <StepHeader
        kicker={t("components.setup.welcome.kicker")}
        title={t("components.setup.welcome.title")}
        lead={t("components.setup.welcome.lead")}
        titleRef={titleRef}
        badge={
          <m.div
            initial={{ scale: 0.6, rotate: -14, opacity: 0 }}
            animate={{ scale: 1, rotate: -6, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 16 }}
            className="brand-tile mt-1 grid size-16 shrink-0 place-items-center rounded-lg bg-brass text-brass-ink"
          >
            <Mascot className="size-9 animate-shout" />
          </m.div>
        }
      />
      <FlowDiagram />
      <ol className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {todo.map((item, i) => (
          <m.li
            key={item.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 + i * 0.08 }}
            className="flex items-center gap-3 rounded-lg bg-surface p-3.5"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-surface-2 font-display text-sm font-extrabold text-brass">
              {i + 1}
            </span>
            <span className="text-sm font-semibold leading-snug">
              {item.label}
            </span>
          </m.li>
        ))}
      </ol>
      {consent && (
        <m.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.75 }}
          className="mt-5 rounded-lg bg-surface p-4"
        >
          <div className="mb-1 flex items-center gap-2">
            <Shield className="size-4 text-brass" />
            <h3 className="text-base">{t("components.setup.privacy.title")}</h3>
          </div>
          <ConsentRow
            icon={Bug}
            title={t("components.telemetry.crashes.title")}
            body={t("components.telemetry.crashes.body")}
            checked={consent.crashReports}
            onChange={(crashReports) => onConsent({ ...consent, crashReports })}
          />
          <ConsentRow
            icon={Activity}
            title={t("components.telemetry.usage.title")}
            body={t("components.telemetry.usage.body")}
            checked={consent.usage}
            onChange={(usage) => onConsent({ ...consent, usage })}
          />
          <p className="mt-1 text-xs text-ink-faint">
            {t("components.setup.privacy.note")}
          </p>
        </m.div>
      )}
    </div>
  );
}

function ConsentRow({
  icon: Icon,
  title,
  body,
  checked,
  onChange,
}: {
  icon: typeof Bug;
  title: string;
  body: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-border-soft py-3 last:border-0">
      <Icon className="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold">{title}</div>
        <p className="text-xs leading-relaxed text-ink-muted">{body}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

/** OBS → Corneta → every platform, drawn left to right. */
function FlowDiagram() {
  const ids: PlatformId[] = ["twitch", "youtube", "kick", "facebook"];
  return (
    <div className="flex items-center gap-3 rounded-lg bg-surface px-5 py-4">
      <m.span
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.15 }}
        className="rounded-md bg-surface-2 px-3.5 py-2 font-display text-base font-extrabold"
      >
        OBS
      </m.span>
      <Line delay={0.25} />
      <m.span
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.4, type: "spring", stiffness: 380, damping: 20 }}
        className="flex items-center gap-2 rounded-md bg-brass px-3.5 py-2 font-display text-base font-extrabold text-brass-ink pop-brass"
      >
        <Mascot className="size-5" /> Corneta
      </m.span>
      <Line delay={0.5} />
      <div className="flex gap-1.5">
        {ids.map((id, i) => (
          <m.span
            key={id}
            initial={{ opacity: 0, y: 6, scale: 0.7 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              delay: 0.65 + i * 0.07,
              type: "spring",
              stiffness: 420,
              damping: 18,
            }}
          >
            <PlatformGlyph id={id} size={30} />
          </m.span>
        ))}
      </div>
    </div>
  );
}

function Line({ delay }: { delay: number }) {
  return (
    <span className="relative h-[3px] min-w-6 flex-1 overflow-hidden rounded-sm bg-surface-3">
      <m.span
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay, duration: 0.35, ease: "easeOut" }}
        className="absolute inset-0 origin-left bg-brass"
      />
    </span>
  );
}

/* ---------- Platforms ---------- */

const cardEntrance = (i: number) => ({
  delay: 0.04 + i * 0.05,
  duration: 0.2,
  ease: "easeOut" as const,
});

export function PlatformsStep({
  titleRef,
}: {
  titleRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const t = useT();
  return (
    <div>
      <StepHeader
        kicker={t("components.setup.step", { n: 1, total: 3 })}
        title={t("components.setup.platforms.title")}
        lead={t("components.setup.platforms.lead")}
        titleRef={titleRef}
      />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {SETUP_PLATFORMS.map((id, i) => (
          <m.div
            key={id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={cardEntrance(i)}
          >
            <PlatformSetupCard platformId={id} />
          </m.div>
        ))}
      </div>
      <m.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={cardEntrance(SETUP_PLATFORMS.length)}
        className="mt-4 flex flex-wrap items-center gap-2 text-sm text-ink-muted"
      >
        <Plus className="size-4" />
        {t("components.setup.platforms.more")}
        <ExperimentalBadge />
      </m.p>
    </div>
  );
}

function PlatformSetupCard({ platformId }: { platformId: PlatformId }) {
  const t = useT();
  const targets = useStore((s) => s.config!.targets);
  const addTarget = useStore((s) => s.addTarget);
  const toggleTarget = useStore((s) => s.toggleTarget);
  const r = useReadiness();
  const ctx = useReadinessContext();
  const target = targets.find((x) => x.platformId === platformId);
  const ready = !!target && r.ready.some((x) => x.id === target.id);
  const auto =
    !!target &&
    target.id === youtubeAutoTargetId(targets, ctx) &&
    !target.hasKey;
  const name = platformName(platformId, t);
  const [justReady, setJustReady] = useState(false);
  const wasReady = useRef(ready);
  useEffect(() => {
    if (ready && !wasReady.current) setJustReady(true);
    wasReady.current = ready;
  }, [ready]);
  const cardRef = useFocusRescue<HTMLDivElement>();

  return (
    <div
      ref={cardRef}
      className={cn(
        "flex h-full flex-col gap-3 rounded-lg border-2 bg-surface p-4 transition-colors duration-300",
        ready ? "border-ok/60" : "border-transparent",
      )}
    >
      <div className="flex items-center gap-3">
        <PlatformGlyph id={platformId} size={40} />
        <div className="min-w-0 flex-1">
          <div className="font-display text-lg font-extrabold leading-tight">
            {name}
          </div>
          <div className="text-xs text-ink-faint">
            {platformTagline(platformId, t)}
          </div>
        </div>
        {ready && (
          <m.span
            initial={justReady ? { scale: 0, rotate: -30 } : false}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 480, damping: 18 }}
            className="grid size-8 shrink-0 place-items-center rounded-full bg-ok text-night"
          >
            <Check className="size-4" strokeWidth={3.2} />
          </m.span>
        )}
      </div>
      {ready && target ? (
        // Saving with Enter lands here rather than on "Not now", so a repeated Enter cannot undo it.
        <div
          data-focus-first=""
          tabIndex={-1}
          className="mt-auto flex items-center gap-2 rounded-md bg-ok/10 px-3 py-2 text-sm"
        >
          <span className="min-w-0 flex-1 text-ink">
            {auto
              ? t("components.setup.platforms.readyAuto")
              : t("components.setup.platforms.ready")}
          </span>
          {target.enabled && (
            <button
              type="button"
              onClick={() => toggleTarget(target.id)}
              className="shrink-0 text-xs font-semibold text-ink-faint hover:text-ink"
            >
              {t("components.setup.platforms.notNow")}
            </button>
          )}
        </div>
      ) : target ? (
        target.enabled ? (
          <QuickConnect
            target={target}
            chatBridge={false}
            className="mt-auto"
          />
        ) : (
          <Button
            variant="subtle"
            size="sm"
            className="mt-auto self-start"
            onClick={() => toggleTarget(target.id)}
          >
            {t("components.setup.platforms.use", { platform: name })}
          </Button>
        )
      ) : (
        <Button
          variant="subtle"
          size="sm"
          className="mt-auto self-start"
          onClick={() => addTarget(platformId)}
        >
          <Plus className="size-4" />{" "}
          {t("components.setup.platforms.use", { platform: name })}
        </Button>
      )}
    </div>
  );
}

/* ---------- OBS ---------- */

export function ObsStep({
  titleRef,
}: {
  titleRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const t = useT();
  const obs = useStore((s) => s.obs);
  const runObsCheck = useStore((s) => s.runObsCheck);
  useEffect(() => {
    void runObsCheck();
  }, [runObsCheck]);
  const already = obsConfigured(obs);
  const [status, setStatus] = useState<ObsSetupStatus>("idle");
  return (
    <div>
      <StepHeader
        kicker={t("components.setup.step", { n: 2, total: 3 })}
        title={t("components.setup.obs.title")}
        lead={t("components.setup.obs.lead")}
        titleRef={titleRef}
      />
      {already && status !== "ok" && obs !== null && obs !== "loading" && (
        <m.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-3 flex items-center gap-2 rounded-md bg-ok/10 px-3 py-2 text-sm"
        >
          <Check className="size-4 shrink-0 text-ok" strokeWidth={3} />
          {t("components.setup.obs.already", {
            video: `${obs.width}×${obs.height} · ${Math.round(obs.fps)} fps`,
          })}
        </m.p>
      )}
      <ObsSetupPanel onStatus={setStatus} />
    </div>
  );
}

/* ---------- Internet, quality and safety nets ---------- */

export function QualityStep({
  titleRef,
}: {
  titleRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const { t, fmt } = useI18n();
  const config = useStore((s) => s.config!);
  const uploadMbps = useStore((s) => s.uploadMbps);
  const runUploadTest = useStore((s) => s.runUploadTest);
  const setSettings = useStore((s) => s.setSettings);
  const [testing, setTesting] = useState(false);
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  const test = async () => {
    setTesting(true);
    setFailed(false);
    try {
      await runUploadTest();
    } catch {
      setFailed(true);
    } finally {
      setTesting(false);
    }
  };
  useEffect(() => {
    if (started.current || uploadMbps != null) return;
    started.current = true;
    void test();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const neededKbps = estimate(config).uploadKbps;
  const fit = bandFit(neededKbps, uploadMbps);
  const s = config.settings;

  return (
    <div>
      <StepHeader
        kicker={t("components.setup.step", { n: 3, total: 3 })}
        title={t("components.setup.quality.title")}
        lead={t("components.setup.quality.lead")}
        titleRef={titleRef}
      />
      <div className="flex flex-wrap items-center gap-5 rounded-lg bg-surface p-5">
        <span className="grid size-12 shrink-0 -rotate-3 place-items-center rounded-lg bg-brass text-brass-ink pop-sm">
          <Gauge className="size-6" />
        </span>
        <div className="min-w-40 flex-1">
          {testing ? (
            <>
              <div className="font-display text-lg font-extrabold">
                {t("components.setup.quality.testing")}
              </div>
              <div className="mt-2 h-2 w-full max-w-72 overflow-hidden rounded-sm bg-surface-3">
                <m.div
                  className="h-full w-1/3 rounded-sm bg-brass"
                  animate={{ x: ["-100%", "300%"] }}
                  transition={{
                    duration: 1.2,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
              </div>
            </>
          ) : uploadMbps != null ? (
            <m.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="font-display text-4xl font-extrabold leading-none tabular-nums">
                {fmt.num(uploadMbps)}
                <span className="ml-1.5 text-base text-ink-muted">Mbps</span>
              </div>
              <div
                className={cn(
                  "mt-1 text-sm font-semibold",
                  fit === "ok"
                    ? "text-ok"
                    : fit === "warn"
                      ? "text-warn"
                      : "text-bad",
                )}
              >
                {t(
                  fit === "ok"
                    ? "components.setup.quality.fit.ok"
                    : fit === "warn"
                      ? "components.setup.quality.fit.warn"
                      : "components.setup.quality.fit.bad",
                  {
                    mode: t(modeTitleKey(config.mode)),
                    mbps: fmt.dec(neededKbps / 1000, 1),
                  },
                )}
              </div>
            </m.div>
          ) : (
            <div className="font-display text-lg font-extrabold">
              {t(
                failed
                  ? "components.setup.quality.failed"
                  : "components.setup.quality.untested",
              )}
            </div>
          )}
        </div>
        <Button
          variant={uploadMbps == null && !testing ? "primary" : "subtle"}
          size="sm"
          onClick={() => void test()}
          loading={testing}
          disabled={testing}
        >
          {!testing && <Wifi className="size-4" />}
          {uploadMbps == null
            ? t("golive.band.test")
            : t("components.setup.quality.retest")}
        </Button>
      </div>

      <h3 className="mb-2.5 mt-6 flex items-center gap-2 text-lg">
        {t("components.setup.quality.modes")}
      </h3>
      <QualityModeCards />

      <h3 className="mb-2.5 mt-6 flex items-center gap-2 text-lg">
        {t("components.setup.quality.safety")}
      </h3>
      <div className="rounded-lg bg-surface px-4">
        <SafetyRow
          title={t("golive.security.bitrate.label")}
          body={t("golive.security.bitrate.desc")}
          checked={s.autoBitrate}
          onChange={(autoBitrate) => setSettings({ autoBitrate })}
          recommended
        />
        <SafetyRow
          title={t("golive.security.brb.label")}
          body={t("golive.security.brb.desc")}
          checked={s.brbEnabled}
          onChange={(brbEnabled) => setSettings({ brbEnabled })}
          recommended
        />
        <div className="flex items-start gap-3 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
              {t("golive.security.guardian.label")}
              <ExperimentalBadge />
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
              {t("components.setup.quality.guardian")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SafetyRow({
  title,
  body,
  checked,
  onChange,
  recommended,
}: {
  title: string;
  body: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  recommended?: boolean;
}) {
  const t = useT();
  return (
    <div className="flex items-start gap-3 border-b border-border-soft py-3.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
          {title}
          {recommended && (
            <Badge tone="brass">
              {t("components.setup.quality.recommended")}
            </Badge>
          )}
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{body}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

/* ---------- Done ---------- */

export function DoneStep({
  titleRef,
  onChat,
}: {
  titleRef: React.RefObject<HTMLHeadingElement | null>;
  onChat: () => void;
}) {
  const { t, fmt } = useI18n();
  const config = useStore((s) => s.config!);
  const obs = useStore((s) => s.obs);
  const uploadMbps = useStore((s) => s.uploadMbps);
  const r = useReadiness();
  const ok = r.ready.length > 0 && obsConfigured(obs);
  const s = config.settings;
  const nets = [
    s.autoBitrate && t("golive.security.bitrate.label"),
    s.brbEnabled && t("golive.security.brb.label"),
    s.guardianEnabled && t("golive.security.guardian.label"),
  ].filter((x): x is string => !!x);
  const need = estimate(config).uploadKbps / 1000;
  const rows: {
    icon: typeof Tv2;
    label: string;
    value: string;
    done: boolean;
  }[] = [
    {
      icon: Tv2,
      label: t("components.setup.done.platforms"),
      value: r.ready.length
        ? joinNames(
            r.ready.map((x) => x.name || platformName(x.platformId, t)),
            t,
          )
        : t("components.setup.done.later"),
      done: r.ready.length > 0,
    },
    {
      icon: Plug,
      label: t("components.setup.done.obs"),
      value:
        obs !== null && obs !== "loading" && obsConfigured(obs)
          ? `${t("golive.tile.obs.ok")} · ${obs.width}×${obs.height} · ${Math.round(obs.fps)} fps`
          : t("components.setup.done.later"),
      done: obsConfigured(obs),
    },
    {
      icon: Gauge,
      label: t("components.setup.done.quality"),
      value:
        uploadMbps != null
          ? `${t(modeTitleKey(config.mode))} · ${t("golive.bar.readyUpload", {
              need: fmt.dec(need, 1),
              have: fmt.num(uploadMbps),
            })}`
          : t(modeTitleKey(config.mode)),
      done: true,
    },
    {
      icon: Shield,
      label: t("components.setup.done.safety"),
      value: nets.length ? joinNames(nets, t) : t("golive.tile.safety.noneSub"),
      done: true,
    },
  ];
  const hasChat = (s.chatSources ?? []).length > 0;
  return (
    <div>
      <StepHeader
        kicker={t("components.setup.done.kicker")}
        title={t(
          ok
            ? "components.setup.done.title"
            : "components.setup.done.titleLater",
        )}
        lead={t(
          ok ? "components.setup.done.lead" : "components.setup.done.leadLater",
        )}
        titleRef={titleRef}
        badge={
          <m.div
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 320, damping: 14 }}
            className={cn(
              "mt-1 grid size-16 shrink-0 -rotate-6 place-items-center rounded-lg pop",
              ok ? "bg-ok text-night" : "bg-brass text-brass-ink",
            )}
          >
            {ok ? (
              <Check className="size-9" strokeWidth={3.2} />
            ) : (
              <Clock className="size-8" />
            )}
          </m.div>
        }
      />
      <ul className="overflow-hidden rounded-lg bg-surface">
        {rows.map((row, i) => (
          <m.li
            key={row.label}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 + i * 0.08 }}
            className="flex items-center gap-4 border-b border-border-soft px-4 py-3.5 last:border-0"
          >
            <span
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-full",
                row.done ? "bg-ok/15 text-ok" : "bg-warn/15 text-warn",
              )}
            >
              {row.done ? (
                <Check className="size-4" strokeWidth={3} />
              ) : (
                <Clock className="size-4" />
              )}
            </span>
            <span className="w-32 shrink-0 font-display font-bold">
              {row.label}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-ink-muted">
              {row.value}
            </span>
            <row.icon className="size-4 shrink-0 text-ink-faint" />
          </m.li>
        ))}
      </ul>
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="mt-4 flex flex-col gap-2.5"
      >
        {s.liveShortcut && (
          <p className="flex items-center gap-2 rounded-md border-2 border-dashed border-border px-3 py-2.5 text-sm text-ink-muted">
            <kbd className="rounded-sm bg-surface-3 px-1.5 py-0.5 font-mono text-xs font-bold text-ink">
              {shortcutLabel(s.liveShortcut)}
            </kbd>
            {t("components.setup.done.shortcut")}
          </p>
        )}
        {!hasChat && (
          <button
            type="button"
            onClick={onChat}
            className="group flex items-center gap-3 rounded-md bg-surface px-3 py-2.5 text-left text-sm transition-colors hover:bg-surface-2"
          >
            <span className="font-semibold">
              {t("components.setup.done.chat")}
            </span>
            <span className="text-ink-faint">
              {t("components.setup.done.chatHint")}
            </span>
            <ChevronRight className="ml-auto size-4 text-ink-faint transition-transform group-hover:translate-x-0.5" />
          </button>
        )}
      </m.div>
    </div>
  );
}
