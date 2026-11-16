import { useEffect, useRef, useState } from "react";
import { m } from "framer-motion";
import { Activity, Bug, Check, Plus, Shield } from "lucide-react";
import { useStore } from "../../lib/store";
import {
  SETUP_PLATFORMS,
  platformName,
  platformTagline,
} from "../../lib/platforms";
import { youtubeAutoTargetId } from "../../lib/readiness";
import { useEncoder } from "../../lib/useEncoder";
import { useReadiness, useReadinessContext } from "../../lib/useReadiness";
import { useFocusRescue } from "../../lib/useFocusRescue";
import { cn } from "../../lib/utils";
import { bold, useT } from "../../lib/i18n";
import type { PlatformId } from "../../lib/types";
import { ObsSetupPanel } from "../ObsSetup";
import { RehearsalPanel } from "../Rehearsal";
import { QuickConnect } from "../platforms/TargetConnect";
import { Mascot } from "../decor";
import { Button, ExperimentalBadge, PlatformGlyph, Toggle } from "../ui";

export function StepHeader({
  kicker,
  title,
  lead,
  titleRef,
  badge,
}: {
  kicker?: string;
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
        {kicker && (
          <div className="mb-1.5 text-xs font-bold uppercase tracking-[0.18em] text-brass">
            {kicker}
          </div>
        )}
        <h2
          ref={titleRef}
          tabIndex={-1}
          className="text-4xl leading-none outline-none"
        >
          {title}
        </h2>
        <p className="mt-2.5 max-w-2xl text-balance text-base text-ink-muted">
          {lead}
        </p>
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
  return (
    <div>
      <StepHeader
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
      <p className="mt-5 max-w-xl text-pretty text-base text-ink">
        {bold(t, "components.setup.welcome.promise")}
      </p>
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
  const ids = SETUP_PLATFORMS;
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
        title={t("components.setup.platforms.title")}
        lead={t("components.setup.platforms.lead")}
        titleRef={titleRef}
      />
      {/* One platform per row: its sign-in or key field needs the full width, not half of it. */}
      <div className="flex flex-col gap-3">
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

/** Every row's control starts at the same x, so the four actions read as one column. */
const ACTION_COLUMN = "w-80 max-w-full";

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

  const addButton = (added: boolean) => (
    <Button
      variant="subtle"
      size="sm"
      onClick={() => (target ? toggleTarget(target.id) : addTarget(platformId))}
    >
      {!added && <Plus className="size-4" />}
      {t("components.setup.platforms.use", { platform: name })}
    </Button>
  );

  return (
    <div
      ref={cardRef}
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border-2 bg-surface px-5 py-4 transition-colors duration-300",
        ready ? "border-ok/60" : "border-transparent",
      )}
    >
      <div className="flex min-w-52 flex-1 items-center gap-3">
        <span className="relative shrink-0">
          <PlatformGlyph id={platformId} size={40} />
          {ready && (
            <m.span
              initial={justReady ? { scale: 0, rotate: -30 } : false}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 480, damping: 18 }}
              className="absolute -bottom-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-ok text-night ring-2 ring-surface"
            >
              <Check className="size-3" strokeWidth={3.6} />
            </m.span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-lg font-extrabold leading-tight">
            {name}
          </div>
          {ready && target ? (
            // Saving with Enter lands here rather than on the opt-out, so a repeated Enter cannot undo it.
            <p
              data-focus-first=""
              tabIndex={-1}
              className="-mx-1 w-fit rounded-sm px-1 text-sm text-ink"
            >
              {auto
                ? t("components.setup.platforms.readyAuto")
                : t("components.setup.platforms.ready")}
            </p>
          ) : (
            <p className="text-sm text-ink-faint">
              {platformTagline(platformId, t)}
            </p>
          )}
        </div>
      </div>
      {ready && target ? (
        target.enabled && (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => toggleTarget(target.id)}
          >
            {t("components.setup.platforms.notNow", { platform: name })}
          </Button>
        )
      ) : target?.enabled ? (
        <QuickConnect
          target={target}
          chatBridge={false}
          className={ACTION_COLUMN}
        />
      ) : (
        <div className={ACTION_COLUMN}>{addButton(!!target)}</div>
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
  // The step is named after the program the streamer uses.
  const { app } = useEncoder();
  return (
    <div>
      <StepHeader
        title={t(
          app === "obs"
            ? "components.setup.obs.title"
            : app === "streamlabs"
              ? "components.setup.obs.title.streamlabs"
              : "components.setup.obs.title.other",
        )}
        lead={t(
          app === "obs"
            ? "components.setup.obs.lead"
            : "components.setup.obs.lead.byHand",
        )}
        titleRef={titleRef}
      />
      <ObsSetupPanel />
    </div>
  );
}

/* ---------- Rehearsal ---------- */

export function RehearsalStep({
  titleRef,
  onFixObs,
}: {
  titleRef: React.RefObject<HTMLHeadingElement | null>;
  onFixObs: () => void;
}) {
  const t = useT();
  return (
    <div>
      <StepHeader
        title={t("components.setup.rehearsal.title")}
        lead={t("components.setup.rehearsal.lead")}
        titleRef={titleRef}
      />
      <RehearsalPanel onFixObs={onFixObs} />
    </div>
  );
}
