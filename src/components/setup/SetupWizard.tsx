import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, m, type Variants } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Wifi } from "lucide-react";
import { useStore } from "../../lib/store";
import { bandFit, estimate } from "../../lib/estimates";
import { encoderLabel } from "../../lib/encoder";
import { obsConfigured } from "../../lib/readiness";
import { rehearsalVerdict } from "../../lib/rehearsal";
import { useEncoder } from "../../lib/useEncoder";
import { useReadiness } from "../../lib/useReadiness";
import { cn } from "../../lib/utils";
import { useI18n, type MessageKey } from "../../lib/i18n";
import { Mascot, SoundWaves } from "../decor";
import { LegalAcceptNote } from "../legal";
import { useStartRehearsal } from "../Rehearsal";
import { Button } from "../ui";
import {
  ObsStep,
  PlatformsStep,
  RehearsalStep,
  WelcomeStep,
  type ConsentDraft,
} from "./steps";

export type SetupStep = "welcome" | "platforms" | "obs" | "rehearsal";

/** The cover is not a step: the rail only lists what ends with the stream reaching a platform. */
const STEPS: SetupStep[] = ["welcome", "platforms", "obs", "rehearsal"];
const RAIL: { id: SetupStep; labelKey: MessageKey; subKey: MessageKey }[] = [
  {
    id: "platforms",
    labelKey: "components.setup.rail.platforms",
    subKey: "components.setup.rail.platforms.sub",
  },
  {
    id: "obs",
    labelKey: "components.setup.rail.obs",
    subKey: "components.setup.rail.obs.sub",
  },
  {
    id: "rehearsal",
    labelKey: "components.setup.rail.rehearsal",
    subKey: "components.setup.rail.rehearsal.sub",
  },
];

// Variants read the direction through AnimatePresence's custom prop, so the step leaving after
// "Back" slides out the way it came instead of the direction it was entered with.
const STEP_MOTION: Variants = {
  enter: (direction: number) => ({ opacity: 0, x: 24 * direction }),
  center: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.18, ease: [0.2, 0.8, 0.2, 1] },
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: -24 * direction,
    transition: { duration: 0.12, ease: "easeIn" },
  }),
};

/**
 * Full-window first-run setup in three steps that end with a private rehearsal, so the first real
 * live is not the first test. Any step can be left for later.
 */
export function SetupWizard({
  consent,
  onConsent,
  onStepCompleted,
  onFinish,
  onSkip,
}: {
  consent: ConsentDraft | null;
  onConsent: (next: ConsentDraft) => void;
  onStepCompleted: (step: SetupStep) => void;
  onFinish: () => void;
  onSkip: () => void;
}) {
  const { t, tp, fmt } = useI18n();
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [visited, setVisited] = useState<Set<SetupStep>>(
    () => new Set(["welcome"]),
  );
  const titleRef = useRef<HTMLHeadingElement>(null);
  const step = STEPS[index];
  const r = useReadiness();
  const config = useStore((s) => s.config!);
  const obs = useStore((s) => s.obs);
  const uploadMbps = useStore((s) => s.uploadMbps);
  const runUploadTest = useStore((s) => s.runUploadTest);
  const refreshObsEnv = useStore((s) => s.refreshObsEnv);
  const rehearsal = useStore((s) => s.rehearsal);
  const rehearsing = useStore((s) => s.rehearsing);
  const startRehearsal = useStartRehearsal();
  const encoder = useEncoder();
  const verdict =
    rehearsal?.phase === "done" ? rehearsalVerdict(rehearsal) : null;
  const rehearsalPassed = verdict === "passed" || verdict === "passedWithNotes";

  // The upload is measured while the platforms are being connected, so it is never a step.
  const measured = useRef(false);
  useEffect(() => {
    if (measured.current || uploadMbps != null) return;
    measured.current = true;
    runUploadTest().catch(() => {});
  }, [runUploadTest, uploadMbps]);

  // Read ahead of the OBS step, so it opens already knowing which program is on this PC.
  useEffect(() => {
    void refreshObsEnv();
  }, [refreshObsEnv]);

  const done: Record<SetupStep, boolean> = {
    welcome: true,
    platforms: r.ready.length > 0,
    obs: obsConfigured(obs, config.settings.obsManual, encoder.app),
    rehearsal: rehearsal?.phase === "done" && rehearsal.signalArrived,
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  // With mode="wait" the next step mounts only after the previous one has left, so an effect on the
  // index would focus the leaving heading. Focus follows the step that actually mounted instead.
  const onStepMounted = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    scrollRef.current?.scrollTo({ top: 0 });
    requestAnimationFrame(() =>
      titleRef.current?.focus({ preventScroll: true }),
    );
  }, []);

  const go = (next: number) => {
    if (rehearsing || next < 0 || next >= STEPS.length || next === index)
      return;
    setDirection(next > index ? 1 : -1);
    setIndex(next);
    setVisited((prev) => new Set(prev).add(STEPS[next]));
  };
  const advance = () => {
    onStepCompleted(step);
    go(index + 1);
  };
  const finish = () => {
    onStepCompleted("rehearsal");
    onFinish();
  };

  // Only the platforms that are ready count: the starter ones a user never connected would
  // otherwise raise a false alarm about the upload.
  const neededKbps = r.ready.length
    ? estimate({ ...config, targets: r.ready }).uploadKbps
    : 0;
  const fit = r.ready.length ? bandFit(neededKbps, uploadMbps) : "ok";

  return (
    <div className="flex h-full">
      <aside className="relative flex w-72 shrink-0 flex-col overflow-hidden bg-brass p-6 text-brass-ink">
        <SoundWaves className="pointer-events-none absolute -bottom-16 -right-20 size-72 text-brass-ink/10" />
        <div className="mb-9 flex items-center gap-3">
          <div className="grid size-11 -rotate-6 place-items-center rounded-lg bg-brass-ink text-brass">
            <Mascot className="size-6" />
          </div>
          <div>
            <div className="font-display text-2xl font-extrabold leading-none">
              Corneta
            </div>
            <div className="text-xs font-bold opacity-70">
              {t("components.setup.rail.subtitle")}
            </div>
          </div>
        </div>
        <ol className="relative flex flex-col gap-1">
          {RAIL.map((item, i) => {
            const at = i + 1;
            const current = at === index;
            const complete = done[item.id] && visited.has(item.id);
            const skipped = !complete && visited.has(item.id) && at < index;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => go(at)}
                  aria-current={current ? "step" : undefined}
                  data-on-brass=""
                  className={cn(
                    "relative flex w-full items-center gap-3 rounded-md px-3 py-2 text-left font-display text-base font-bold leading-tight transition-colors",
                    current
                      ? "bg-brass-ink/12"
                      : "opacity-70 hover:bg-brass-ink/8 hover:opacity-100",
                  )}
                >
                  {current && (
                    <m.span
                      layoutId="setup-rail-active"
                      className="absolute inset-y-1.5 left-0 w-1 rounded-sm bg-brass-ink"
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 36,
                      }}
                    />
                  )}
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-full border-2 border-brass-ink text-sm font-extrabold transition-colors duration-300",
                      complete || current
                        ? "bg-brass-ink text-brass"
                        : skipped
                          ? "border-dashed"
                          : "",
                    )}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      {complete ? (
                        <m.span
                          key="check"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{
                            type: "spring",
                            stiffness: 500,
                            damping: 20,
                          }}
                        >
                          <Check className="size-4" strokeWidth={3.2} />
                        </m.span>
                      ) : (
                        <m.span key="n">{at}</m.span>
                      )}
                    </AnimatePresence>
                  </span>
                  <span>
                    {item.id === "obs" && encoder.app !== "obs"
                      ? encoderLabel(encoder.app, t)
                      : t(item.labelKey)}
                    <span className="block font-sans text-xs font-semibold">
                      {t(item.subKey)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="relative mt-auto text-sm font-semibold">
          {uploadMbps != null && (
            <p
              className="mb-4 flex gap-2.5 rounded-md bg-brass-ink/10 px-3 py-2.5 text-xs leading-snug"
              aria-live="polite"
            >
              <Wifi className="mt-0.5 size-4 shrink-0" />
              <span>
                <span className="block font-display text-sm font-extrabold">
                  {t("components.setup.rail.net.title", {
                    mbps: fmt.num(uploadMbps),
                  })}
                </span>
                {r.ready.length === 0
                  ? t("components.setup.rail.net.measured")
                  : t(
                      fit === "ok"
                        ? "components.setup.rail.net.ok"
                        : fit === "warn"
                          ? "components.setup.rail.net.warn"
                          : "components.setup.rail.net.bad",
                      { mbps: fmt.dec(neededKbps / 1000, 1) },
                    )}
              </span>
            </p>
          )}
          <p className="opacity-80">{t("components.setup.rail.time")}</p>
          <button
            type="button"
            onClick={onSkip}
            disabled={rehearsing}
            data-on-brass=""
            className="mt-1 inline-flex min-h-6 items-center font-bold underline decoration-2 underline-offset-2 opacity-80 hover:opacity-100 disabled:opacity-40"
          >
            {t("components.setup.rail.skip")}
          </button>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]"
        >
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <m.div
              key={step}
              ref={onStepMounted}
              custom={direction}
              variants={STEP_MOTION}
              initial="enter"
              animate="center"
              exit="exit"
              className="mx-auto max-w-3xl px-10 py-10"
            >
              {step === "welcome" && (
                <WelcomeStep
                  titleRef={titleRef}
                  consent={consent}
                  onConsent={onConsent}
                />
              )}
              {step === "platforms" && <PlatformsStep titleRef={titleRef} />}
              {step === "obs" && <ObsStep titleRef={titleRef} />}
              {step === "rehearsal" && (
                <RehearsalStep
                  titleRef={titleRef}
                  onFixObs={() => go(STEPS.indexOf("obs"))}
                />
              )}
            </m.div>
          </AnimatePresence>
        </div>

        <footer className="border-t border-border-soft bg-bg">
          <div className="mx-auto flex max-w-3xl items-center gap-2 px-10 py-4">
            {index > 0 ? (
              <Button
                variant="ghost"
                onClick={() => go(index - 1)}
                disabled={rehearsing}
              >
                <ArrowLeft className="size-4" />{" "}
                {t("components.setup.cta.back")}
              </Button>
            ) : (
              // Starting setup accepts the terms, so the notice sits next to the button that does it.
              <LegalAcceptNote className="max-w-sm text-left text-xs" />
            )}
            {(step === "platforms" || step === "obs") && (
              <Button variant="ghost" onClick={advance}>
                {t("components.setup.cta.later")}
              </Button>
            )}
            {/* The way forward stays in the footer, where the other steps keep it, so a long
                result never pushes it below the fold. */}
            {step === "rehearsal" &&
              !rehearsing &&
              (rehearsalPassed ? (
                <Button variant="ghost" onClick={startRehearsal}>
                  {t("components.rehearsal.again")}
                </Button>
              ) : (
                <Button variant="ghost" onClick={finish}>
                  {t("components.setup.rehearsal.skip")}
                </Button>
              ))}
            <span className="flex-1" />
            {step === "platforms" && (
              <span className="mr-2 text-sm text-ink-muted" aria-live="polite">
                {r.ready.length === 0
                  ? t("components.setup.platforms.needOne")
                  : tp("components.setup.platforms.count", r.ready.length)}
              </span>
            )}
            {step === "welcome" && (
              <Button variant="primary" size="lg" onClick={advance}>
                {t("components.setup.cta.start")}{" "}
                <ArrowRight className="size-5" />
              </Button>
            )}
            {step === "platforms" && (
              <Button
                variant="primary"
                size="lg"
                disabled={r.ready.length === 0}
                onClick={advance}
              >
                {t("components.setup.cta.next")}{" "}
                <ArrowRight className="size-5" />
              </Button>
            )}
            {step === "obs" && (
              <Button
                variant="primary"
                size="lg"
                disabled={
                  !obsConfigured(obs, config.settings.obsManual, encoder.app)
                }
                onClick={advance}
              >
                {t("components.setup.cta.rehearsal")}{" "}
                <ArrowRight className="size-5" />
              </Button>
            )}
            {step === "rehearsal" && (
              <Button
                variant="primary"
                size="lg"
                disabled={!rehearsalPassed || rehearsing}
                onClick={finish}
              >
                {t("components.setup.cta.finish")}{" "}
                <ArrowRight className="size-5" />
              </Button>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
}
