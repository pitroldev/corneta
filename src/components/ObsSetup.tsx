import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, m } from "framer-motion";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  KeyRound,
  Loader2,
  Plug,
  Wrench,
  Zap,
} from "lucide-react";
import { useStore } from "../lib/store";
import { draftInputProps, useDraft } from "../lib/useDraft";
import { useFocusRescue } from "../lib/useFocusRescue";
import {
  ObsConfigChangedError,
  ObsConfigSaveError,
} from "../lib/obsCoordinator";
import { obsIngestUrl } from "../lib/factory";
import { bold, useT, type I18n } from "../lib/i18n";
import type { ObsErrorCode } from "../lib/types";
import { obsFailure, obsHelpKind, type ObsFailure } from "../lib/obsErrors";
import { cn } from "../lib/utils";
import { ObsVideoFit } from "./ObsVideoFit";
import { Button, CopyField, Input } from "./ui";

export type ObsSetupStatus = "idle" | "connecting" | "ok" | "error";

function obsErrorHelp(
  t: I18n["t"],
  code: ObsErrorCode | undefined,
): { title: string; tips: string[]; auth: boolean } {
  const kind = obsHelpKind(code);
  if (kind === "auth") {
    return {
      auth: true,
      title: t("encoding.wizard.error.auth.title"),
      tips: [
        t("encoding.wizard.error.auth.tip1"),
        t("encoding.wizard.error.auth.tip2"),
        t("encoding.wizard.error.auth.tip3"),
      ],
    };
  }
  if (kind === "notFound") {
    return {
      auth: false,
      title: t("encoding.wizard.error.notfound.title"),
      tips: [
        t("encoding.wizard.error.notfound.tip1"),
        t("encoding.wizard.error.notfound.tip2"),
        t("encoding.wizard.error.notfound.tip3"),
        t("encoding.wizard.error.notfound.tip4"),
      ],
    };
  }
  return {
    auth: false,
    title: t("encoding.wizard.error.generic.title"),
    tips: [
      t("encoding.wizard.error.generic.tip1"),
      t("encoding.wizard.error.generic.tip2"),
    ],
  };
}

/**
 * Connects to OBS, points its stream at Corneta and checks the video, all from one button.
 * Shared by first-run setup and the "Set it up for me" dialog.
 */
export function ObsSetupPanel({
  onStatus,
}: {
  onStatus?: (status: ObsSetupStatus) => void;
}) {
  const t = useT();
  const settings = useStore((s) => s.config!.settings);
  const ingest = useStore((s) => s.config!.ingest);
  const setSettings = useStore((s) => s.setSettings);
  const configureObs = useStore((s) => s.configureObs);
  const runObsCheck = useStore((s) => s.runObsCheck);
  const obs = useStore((s) => s.obs);
  const passwordDraft = useDraft(settings.obsPassword, (obsPassword) =>
    setSettings({ obsPassword }),
  );
  const [status, setStatus] = useState<ObsSetupStatus>("idle");
  const [error, setError] = useState<ObsFailure | null>(null);
  const [configError, setConfigError] = useState<"save" | "changed" | null>(
    null,
  );
  const [open, setOpen] = useState<"websocket" | "manual" | null>(null);
  const active = useRef(true);
  const connecting = useRef(false);
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    onStatusRef.current?.(status);
  }, [status]);

  const help = error ? obsErrorHelp(t, error.code) : null;

  const connect = async () => {
    if (connecting.current) return;
    connecting.current = true;
    passwordDraft.flush();
    setStatus("connecting");
    setError(null);
    setConfigError(null);
    try {
      await configureObs();
      if (!active.current) return;
      setStatus("ok");
      void runObsCheck(true);
    } catch (e) {
      if (!active.current) return;
      if (e instanceof ObsConfigSaveError) setConfigError("save");
      else if (e instanceof ObsConfigChangedError) setConfigError("changed");
      else {
        const failure = obsFailure(e);
        setError(failure);
        if (obsHelpKind(failure.code) === "auth") setOpen("websocket");
      }
      setStatus("error");
    } finally {
      connecting.current = false;
    }
  };

  const rescueRef = useFocusRescue<HTMLDivElement>();
  const video =
    obs !== null && obs !== "loading" && obs.reachable && obs.width
      ? `${obs.width}×${obs.height} · ${Math.round(obs.fps)} fps`
      : null;

  return (
    <div ref={rescueRef} className="flex flex-col gap-3">
      <AnimatePresence mode="wait" initial={false}>
        {status === "ok" ? (
          <m.div
            key="ok"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-lg bg-surface-2 p-5"
            role="status"
            data-focus-first=""
            tabIndex={-1}
          >
            <ul className="flex flex-col gap-2.5">
              {[
                t("components.obsSetup.ok.connected"),
                t("components.obsSetup.ok.pointed"),
                video
                  ? t("components.obsSetup.ok.video", { video })
                  : t("components.obsSetup.ok.videoChecking"),
              ].map((line, i) => (
                <m.li
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.12 + i * 0.18, duration: 0.2 }}
                  className="flex items-center gap-3 text-sm font-semibold"
                >
                  <m.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{
                      delay: 0.12 + i * 0.18,
                      type: "spring",
                      stiffness: 500,
                      damping: 22,
                    }}
                    className="grid size-6 shrink-0 place-items-center rounded-full bg-ok text-night"
                  >
                    <Check className="size-3.5" strokeWidth={3.2} />
                  </m.span>
                  {line}
                </m.li>
              ))}
            </ul>
            <m.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="mt-4 rounded-md bg-ok/10 px-3 py-2 text-sm text-ink"
            >
              {settings.autoStartObs
                ? bold(t, "encoding.wizard.ok.autostart")
                : bold(t, "encoding.wizard.ok.manual")}
            </m.p>
            <div className="mt-3">
              <ObsVideoFit />
            </div>
          </m.div>
        ) : (
          <m.div
            key="action"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-wrap items-center gap-4 rounded-lg bg-surface-2 p-5"
          >
            <span
              className={cn(
                "grid size-12 shrink-0 -rotate-3 place-items-center rounded-lg pop-sm",
                status === "error"
                  ? "bg-bad text-night"
                  : "bg-brass text-brass-ink",
              )}
            >
              {status === "connecting" ? (
                <Loader2 className="size-6 animate-spin" />
              ) : status === "error" ? (
                <AlertTriangle className="size-6" />
              ) : (
                <Plug className="size-6" />
              )}
            </span>
            <div className="min-w-48 flex-1">
              <h3 className="text-lg">
                {status === "connecting"
                  ? t("components.obsSetup.connecting.title")
                  : status === "error" && help
                    ? help.title
                    : t("components.obsSetup.idle.title")}
              </h3>
              <p className="text-sm text-ink-muted">
                {status === "connecting"
                  ? t("components.obsSetup.connecting.body")
                  : status === "error"
                    ? t("components.obsSetup.error.body")
                    : t("components.obsSetup.idle.body")}
              </p>
            </div>
            <Button
              variant="primary"
              size="lg"
              onClick={() => void connect()}
              loading={status === "connecting"}
              disabled={status === "connecting"}
            >
              {status !== "connecting" && <Zap className="size-5" />}
              {status === "connecting"
                ? t("encoding.wizard.cta.connecting")
                : status === "error"
                  ? t("encoding.wizard.cta.retry")
                  : t("components.obsSetup.cta")}
            </Button>
          </m.div>
        )}
      </AnimatePresence>

      {status === "error" && configError && (
        <p
          role="alert"
          className="rounded-md bg-bad/10 p-3 text-sm font-semibold text-bad"
        >
          {t(
            configError === "save"
              ? "settings.obs.test.saveFailed"
              : "settings.obs.test.settingsChanged",
          )}
        </p>
      )}
      {status === "error" && help && (
        <m.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          role="alert"
          className="rounded-md border-2 border-bad/40 bg-bad/10 p-3"
        >
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-muted">
            {help.tips.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
          <details className="mt-2 text-xs text-ink-faint">
            <summary className="cursor-pointer select-none font-semibold">
              {t("encoding.wizard.error.details")}
            </summary>
            <p
              data-selectable
              className="mt-1 font-mono break-all text-ink-muted"
            >
              {error?.message}
            </p>
          </details>
        </m.div>
      )}

      <Disclosure
        icon={<KeyRound className="size-4 text-brass" />}
        title={t("components.obsSetup.websocket.toggle")}
        open={open === "websocket"}
        onToggle={() => setOpen(open === "websocket" ? null : "websocket")}
      >
        <ol className="flex flex-col gap-3 text-sm text-ink-muted">
          <li className="flex gap-3">
            <StepNum n={1} />
            <div>
              <div className="font-display font-bold text-ink">
                {t("encoding.wizard.step1.title")}
              </div>
              {bold(t, "encoding.wizard.step1.body")}
            </div>
          </li>
          <li className="flex gap-3">
            <StepNum n={2} />
            <div className="min-w-0 flex-1">
              <div className="font-display font-bold text-ink">
                {t("encoding.wizard.step2.title")}
              </div>
              {bold(t, "encoding.wizard.step2.body")}
              <Input
                type="password"
                aria-label={t("encoding.wizard.step2.title")}
                placeholder={t("encoding.wizard.step2.placeholder")}
                className="mt-2"
                {...draftInputProps(passwordDraft)}
                disabled={status === "connecting"}
              />
            </div>
          </li>
        </ol>
      </Disclosure>

      <Disclosure
        icon={<Wrench className="size-4 text-brass" />}
        title={t("encoding.wizard.manual.toggle")}
        open={open === "manual"}
        onToggle={() => setOpen(open === "manual" ? null : "manual")}
      >
        <div className="flex flex-col gap-2">
          <p className="text-xs text-ink-faint">
            {bold(t, "encoding.wizard.manual.lede")}
          </p>
          <CopyField
            label={t("encoding.wizard.manual.server")}
            value={obsIngestUrl(ingest)}
          />
          <CopyField
            label={t("encoding.wizard.manual.key")}
            value={ingest.key}
            mono
          />
          <p className="text-xs text-ink-faint">
            {settings.autoStartObs
              ? bold(t, "encoding.wizard.manual.note.autostart")
              : bold(t, "encoding.wizard.manual.note.manual")}
          </p>
        </div>
      </Disclosure>
    </div>
  );
}

function StepNum({ n }: { n: number }) {
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-md bg-surface font-display text-xs font-extrabold text-brass">
      {n}
    </span>
  );
}

export function Disclosure({
  icon,
  title,
  open,
  onToggle,
  children,
}: {
  icon: ReactNode;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-md border-2 border-border-soft bg-surface">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
      >
        {icon}
        {title}
        <ChevronDown
          className={cn(
            "ml-auto size-4 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-border-soft p-3">{children}</div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
