import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, m, useIsPresent } from "framer-motion";
import { ArrowRight, ScrollText } from "lucide-react";
import { acceptedCurrent, recordAcceptance } from "../lib/legal";
import { useStore } from "../lib/store";
import { readiness } from "../lib/readiness";
import { toast } from "../lib/toast";
import { useT } from "../lib/i18n";
import {
  captureOnboarding,
  setTelemetryConsent,
  TELEMETRY_DECISION_READY_EVENT,
  useTelemetry,
} from "../lib/telemetry";
import {
  needsTelemetryDecision,
  telemetryConsentDraft,
} from "../lib/telemetry-schema";
import { durationBucket } from "../lib/telemetry-schema";
import { LegalAcceptNote } from "./legal";
import { Modal } from "./Modal";
import { SoundWaves } from "./decor";
import { Button } from "./ui";
import { SetupWizard, type SetupStep } from "./setup/SetupWizard";
import type { ConsentDraft } from "./setup/steps";

const FLAG = "corneta.welcomed";

type Flow = "setup" | "reaccept" | null;

function initialFlow(): Flow {
  let welcomed = false;
  try {
    welcomed = localStorage.getItem(FLAG) === "1";
  } catch {
    // If storage is unavailable, show setup rather than assuming it was completed.
  }
  if (!welcomed) return "setup";
  return acceptedCurrent() ? null : "reaccept";
}

/** First-run setup, its replay from About, and the notice when the legal terms change. */
export function Onboarding({
  onDone,
}: {
  onDone: (next: "golive" | "chat") => void;
}) {
  const t = useT();
  const [flow, setFlow] = useState<Flow>(initialFlow);
  const setSetupOpen = useStore((s) => s.setSetupOpen);
  const replayNonce = useStore((s) => s.tourNonce);
  const telemetry = useTelemetry();
  const startedAt = useRef(Date.now());
  const run = useRef(0);
  const capturedRun = useRef(-1);
  // A configuration without keys is the app's default; setup may trim the platforms left unused.
  const pristineAtStart = useRef<boolean | null>(null);
  const config = useStore((s) => s.config);
  if (pristineAtStart.current === null && config)
    pristineAtStart.current = config.targets.every((x) => !x.hasKey);

  const askConsent =
    telemetry.ready &&
    telemetry.available &&
    needsTelemetryDecision(telemetry.status);
  const [consent, setConsent] = useState<ConsentDraft>(() =>
    telemetryConsentDraft(telemetry.status),
  );
  useEffect(() => {
    setConsent(telemetryConsentDraft(telemetry.status));
  }, [telemetry.status]);

  useEffect(() => {
    setSetupOpen(flow === "setup");
  }, [flow, setSetupOpen]);

  useEffect(() => {
    if (flow !== "setup" || capturedRun.current === run.current) return;
    capturedRun.current = run.current;
    captureOnboarding({
      event: "onboarding_started",
      properties: { entry_point: run.current === 0 ? "first_run" : "replay" },
    });
  }, [flow]);

  useEffect(() => {
    if (replayNonce > 0) {
      run.current += 1;
      startedAt.current = Date.now();
      pristineAtStart.current = null;
      setFlow("setup");
    }
  }, [replayNonce]);

  const saveConsent = async () => {
    if (!askConsent) return;
    try {
      await setTelemetryConsent({
        usage: consent.usage ? "enabled" : "disabled",
        crashReports: consent.crashReports ? "enabled" : "disabled",
      });
    } catch {
      toast.error(t("components.telemetry.notice.error"));
    }
  };

  /** Keep only the platforms that ended up ready, so the panel does not start with pending ones. */
  const trimUnusedPlatforms = () => {
    const st = useStore.getState();
    const cfg = st.config;
    if (!cfg || !pristineAtStart.current) return;
    const ctx = {
      youtubeAuto:
        cfg.settings.youtubeAutoLive &&
        st.chatLogin.youtube.state === "connected",
    };
    const ready = readiness(cfg.targets, ctx).ready;
    if (ready.length === 0) return;
    st.setPlatforms([...new Set(ready.map((x) => x.platformId))]);
  };

  const close = (next: "golive" | "chat") => {
    try {
      localStorage.setItem(FLAG, "1");
    } catch {
      /* Storage may be unavailable; in-memory dismissal still works. */
    }
    // Every exit enters the app, so record acceptance for every exit path.
    recordAcceptance();
    trimUnusedPlatforms();
    setFlow(null);
    window.dispatchEvent(new Event(TELEMETRY_DECISION_READY_EVENT));
    onDone(next);
  };

  const onStepCompleted = (step: SetupStep) => {
    if (step === "welcome") void saveConsent();
    // The optional deck step is outside the telemetry schema, which lists what may be collected.
    if (step === "deck") return;
    captureOnboarding({
      event: "onboarding_step_completed",
      properties: { step_id: step },
    });
  };

  if (flow === "reaccept")
    return (
      <LegalUpdate
        onClose={() => {
          recordAcceptance();
          setFlow(null);
          window.dispatchEvent(new Event(TELEMETRY_DECISION_READY_EVENT));
        }}
      />
    );
  return (
    <AnimatePresence>
      {/* Setup edits platforms and settings, so it waits for the configuration to load. */}
      {flow === "setup" && config && (
        <SetupOverlay key="setup" label={t("components.setup.aria")}>
          <SetupWizard
            consent={askConsent ? consent : null}
            onConsent={setConsent}
            onStepCompleted={onStepCompleted}
            onFinish={(next) => {
              captureOnboarding({
                event: "onboarding_completed",
                properties: {
                  duration_bucket: durationBucket(
                    Date.now() - startedAt.current,
                  ),
                },
              });
              close(next);
            }}
            onSkip={() => {
              if (run.current === 0)
                toast.info(t("components.onboarding.dismissed.toast"));
              close("golive");
            }}
          />
        </SetupOverlay>
      )}
    </AnimatePresence>
  );
}

/** Fades out over the panel it hands off to; inert while leaving so a second click cannot finish twice. */
function SetupOverlay({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const present = useIsPresent();
  return (
    <m.div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      inert={!present}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="fixed inset-x-0 bottom-0 top-9 z-[70] bg-bg"
    >
      {children}
    </m.div>
  );
}

function LegalUpdate({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <Modal
      title={t("components.onboarding.legalUpdate.title")}
      onClose={onClose}
      className="max-w-md overflow-hidden rounded-xl bg-surface pop"
    >
      <SoundWaves className="pointer-events-none absolute -right-10 -top-10 size-48 text-brass/15" />
      <div className="bg-brass px-6 py-6 text-brass-ink">
        <div className="mb-3 grid size-14 rotate-[-4deg] place-items-center rounded-lg bg-brass-ink text-brass pop">
          <ScrollText className="size-8" />
        </div>
        <h2 className="text-3xl">
          {t("components.onboarding.legalUpdate.title")}
        </h2>
      </div>

      <div className="p-6">
        <p className="text-sm leading-relaxed text-ink-muted">
          {t("components.onboarding.legalUpdate.body")}
        </p>

        <LegalAcceptNote className="mt-4 border-t-2 border-border pt-3" />

        <div className="mt-5 flex justify-end">
          <Button variant="primary" size="lg" onClick={onClose}>
            {t("components.onboarding.legalUpdate.cta")}{" "}
            <ArrowRight className="size-5" />
          </Button>
        </div>
      </div>
    </Modal>
  );
}
