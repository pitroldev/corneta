import { useEffect, useRef, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Gauge,
  Plug,
  Sparkles,
  Tv2,
} from "lucide-react";
import { useStore } from "../../lib/store";
import { obsConfigured } from "../../lib/readiness";
import { useReadiness } from "../../lib/useReadiness";
import { cn } from "../../lib/utils";
import { useI18n, type MessageKey } from "../../lib/i18n";
import { Mascot, SoundWaves } from "../decor";
import { LegalAcceptNote } from "../legal";
import { Button } from "../ui";
import {
  DoneStep,
  ObsStep,
  PlatformsStep,
  QualityStep,
  WelcomeStep,
  type ConsentDraft,
} from "./steps";

export type SetupStep = "welcome" | "platforms" | "obs" | "quality" | "done";

const STEPS: { id: SetupStep; labelKey: MessageKey; icon: typeof Tv2 }[] = [
  { id: "welcome", labelKey: "components.setup.rail.welcome", icon: Sparkles },
  { id: "platforms", labelKey: "components.setup.rail.platforms", icon: Tv2 },
  { id: "obs", labelKey: "components.setup.rail.obs", icon: Plug },
  { id: "quality", labelKey: "components.setup.rail.quality", icon: Gauge },
  { id: "done", labelKey: "components.setup.rail.done", icon: Check },
];

/**
 * Full-window first-run setup: every step finishes something real (connected platform, OBS pointed
 * at Corneta, measured upload) instead of describing it. Any step can be left for later.
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
  /** `chat` asks to continue into chat setup instead of the Live screen. */
  onFinish: (next: "golive" | "chat") => void;
  onSkip: () => void;
}) {
  const { t, tp } = useI18n();
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [visited, setVisited] = useState<Set<SetupStep>>(
    () => new Set(["welcome"]),
  );
  const titleRef = useRef<HTMLHeadingElement>(null);
  const step = STEPS[index].id;
  const r = useReadiness();
  const obs = useStore((s) => s.obs);
  const uploadMbps = useStore((s) => s.uploadMbps);

  const done: Record<SetupStep, boolean> = {
    welcome: visited.has("platforms"),
    platforms: r.ready.length > 0,
    obs: obsConfigured(obs),
    quality: uploadMbps != null && visited.has("done"),
    done: false,
  };

  // Move focus to the new step's heading so keyboard and screen-reader users follow along.
  useEffect(() => {
    const id = requestAnimationFrame(() =>
      titleRef.current?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(id);
  }, [index]);

  const go = (next: number) => {
    if (next < 0 || next >= STEPS.length || next === index) return;
    setDirection(next > index ? 1 : -1);
    setIndex(next);
    setVisited((prev) => new Set(prev).add(STEPS[next].id));
  };
  const advance = () => {
    onStepCompleted(step);
    go(index + 1);
  };

  const primary: { label: string; disabled?: boolean; action: () => void } =
    step === "welcome"
      ? { label: t("components.setup.cta.start"), action: advance }
      : step === "done"
        ? {
            label: t("components.setup.cta.finish"),
            action: () => onFinish("golive"),
          }
        : step === "platforms"
          ? {
              label: t("components.setup.cta.next"),
              disabled: r.ready.length === 0,
              action: advance,
            }
          : step === "obs"
            ? {
                label: t("components.setup.cta.next"),
                disabled: !obsConfigured(obs),
                action: advance,
              }
            : { label: t("components.setup.cta.next"), action: advance };
  const canDefer = step === "platforms" || step === "obs";

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
          {STEPS.map((s, i) => {
            const current = i === index;
            const complete = done[s.id];
            const skipped = !complete && visited.has(s.id) && i < index;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-current={current ? "step" : undefined}
                  data-on-brass=""
                  className={cn(
                    "relative flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left font-display text-base font-bold transition-colors",
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
                        <m.span key="n">{i + 1}</m.span>
                      )}
                    </AnimatePresence>
                  </span>
                  {t(s.labelKey)}
                </button>
              </li>
            );
          })}
        </ol>
        <div className="relative mt-auto text-sm font-semibold">
          <p className="opacity-80">{t("components.setup.rail.time")}</p>
          <button
            type="button"
            onClick={onSkip}
            data-on-brass=""
            className="mt-2 font-bold underline decoration-2 underline-offset-2 opacity-80 hover:opacity-100"
          >
            {t("components.setup.rail.skip")}
          </button>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]">
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <m.div
              key={step}
              custom={direction}
              initial={{ opacity: 0, x: 28 * direction }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -28 * direction }}
              transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
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
              {step === "quality" && <QualityStep titleRef={titleRef} />}
              {step === "done" && (
                <DoneStep titleRef={titleRef} onChat={() => onFinish("chat")} />
              )}
            </m.div>
          </AnimatePresence>
        </div>

        <footer className="border-t border-border-soft bg-bg">
          <div className="mx-auto flex max-w-3xl items-center gap-2 px-10 py-4">
            {index > 0 ? (
              <Button variant="ghost" onClick={() => go(index - 1)}>
                <ArrowLeft className="size-4" />{" "}
                {t("components.setup.cta.back")}
              </Button>
            ) : (
              // Starting setup accepts the terms, so the notice sits next to the button that does it.
              <LegalAcceptNote className="max-w-sm text-left text-xs" />
            )}
            {canDefer && (
              <Button
                variant="ghost"
                onClick={() => {
                  onStepCompleted(step);
                  go(index + 1);
                }}
              >
                {t("components.setup.cta.later")}
              </Button>
            )}
            <span className="flex-1" />
            {step === "platforms" && (
              <span className="mr-2 text-sm text-ink-muted" aria-live="polite">
                {r.ready.length === 0
                  ? t("components.setup.platforms.needOne")
                  : tp("components.setup.platforms.count", r.ready.length)}
              </span>
            )}
            <Button
              variant="primary"
              size="lg"
              disabled={primary.disabled}
              onClick={primary.action}
            >
              {primary.label} <ArrowRight className="size-5" />
            </Button>
          </div>
        </footer>
      </section>
    </div>
  );
}
