import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, m } from "framer-motion";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ExternalLink,
  Loader2,
  Power,
  RefreshCw,
  Wrench,
  Zap,
} from "lucide-react";
import { api } from "../lib/api";
import { useStore } from "../lib/store";
import { toast } from "../lib/toast";
import { byHandTitleKey, ENCODER_APPS, encoderApp } from "../lib/encoder";
import { obsEnvSignature, obsLights } from "../lib/obsLights";
import { draftInputProps, useDraft } from "../lib/useDraft";
import { useFocusRescue } from "../lib/useFocusRescue";
import {
  ObsConfigChangedError,
  ObsConfigSaveError,
} from "../lib/obsCoordinator";
import { obsIngestUrl } from "../lib/factory";
import { bold, useT, type I18n, type MessageKey } from "../lib/i18n";
import type { EncoderApp, ObsErrorCode } from "../lib/types";
import { obsFailure, obsHelpKind, type ObsFailure } from "../lib/obsErrors";
import { cn, openExternal } from "../lib/utils";
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

type LightKind = "ok" | "todo" | "wait" | "busy";

function LightDot({ kind, n }: { kind: LightKind; n: number }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-full font-display text-sm font-extrabold",
        kind === "ok" && "bg-ok text-night",
        kind === "todo" && "bg-warn text-night",
        kind === "wait" &&
          "border-2 border-dashed border-border text-ink-faint",
        kind === "busy" && "border-2 border-brass text-brass",
      )}
    >
      {kind === "ok" ? (
        <Check className="size-4" strokeWidth={3.2} />
      ) : kind === "todo" ? (
        <AlertTriangle className="size-3.5" strokeWidth={2.6} />
      ) : kind === "busy" ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        n
      )}
    </span>
  );
}

function LightRow({
  kind,
  n,
  title,
  body,
  children,
}: {
  kind: LightKind;
  n: number;
  title: string;
  body?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li
      className={cn(
        "flex items-start gap-3.5 border-b border-border-soft px-4 py-4 last:border-0",
        kind === "todo" && "bg-surface-2",
      )}
    >
      <LightDot kind={kind} n={n} />
      <div className="min-w-0 flex-1">
        <h3
          className={cn(
            "text-base leading-tight",
            kind === "wait" && "text-ink-muted",
          )}
        >
          {title}
        </h3>
        {body && <p className="mt-0.5 text-sm text-ink-muted">{body}</p>}
        {children}
      </div>
    </li>
  );
}

const OBS_MENU_ITEMS = [
  "components.obsLights.menu.file",
  "components.obsLights.menu.edit",
  "components.obsLights.menu.view",
] as const;

/** OBS's own menu, drawn with its labels, for people who would rather flip the switch themselves. */
function ObsMenuHint() {
  const t = useT();
  return (
    <div
      aria-hidden
      className="mt-2 flex flex-wrap items-start gap-3 text-xs text-[#dfe1e7]"
    >
      <div className="w-72 overflow-hidden rounded-md border border-[#454a59] bg-[#2b2e38]">
        <div className="flex whitespace-nowrap bg-[#1f2128] px-1">
          {OBS_MENU_ITEMS.map((key) => (
            <span key={key} className="px-2 py-1.5">
              {t(key)}
            </span>
          ))}
          <span className="bg-[#3d6ee0] px-2 py-1.5 text-white">
            {t("components.obsLights.menu.tools")}
          </span>
        </div>
        <div className="py-1.5">
          <div className="px-3.5 py-1">
            {t("components.obsLights.menu.wizard")}
          </div>
          <div className="bg-[#3d6ee0] px-3.5 py-1 text-white">
            {t("components.obsLights.menu.websocket")}
          </div>
        </div>
      </div>
      <div className="w-60 overflow-hidden rounded-md border border-[#454a59] bg-[#2b2e38]">
        <div className="bg-[#1f2128] px-3 py-1.5">
          {t("components.obsLights.menu.websocket")}
        </div>
        <div className="flex items-center gap-2 px-3.5 py-2.5">
          <span className="grid size-3.5 place-items-center rounded-xs border border-[#9aa0b3] bg-[#3d6ee0] text-white">
            <Check className="size-2.5" strokeWidth={4} />
          </span>
          {t("components.obsLights.menu.enable")}
        </div>
      </div>
    </div>
  );
}

const OBS_DOWNLOAD_URL = "https://obsproject.com/download";

const ENCODER_OPTION: Record<
  EncoderApp,
  { name: MessageKey; sub: MessageKey }
> = {
  obs: {
    name: "components.encoder.obs.name",
    sub: "components.encoder.obs.sub",
  },
  streamlabs: {
    name: "components.encoder.streamlabs.name",
    sub: "components.encoder.streamlabs.sub",
  },
  other: {
    name: "components.encoder.other.name",
    sub: "components.encoder.other.sub",
  },
};

/** Which program sends the picture. Detection pre-selects; the streamer's answer is what counts. */
function EncoderPicker({
  app,
  onChoose,
  disabled,
}: {
  app: EncoderApp;
  onChoose: (app: EncoderApp) => void;
  disabled: boolean;
}) {
  const t = useT();
  return (
    <div
      role="group"
      aria-label={t("components.encoder.label")}
      className="grid grid-cols-3 gap-2"
    >
      {ENCODER_APPS.map((id) => {
        const active = id === app;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChoose(id)}
            className={cn(
              "flex items-center gap-2.5 rounded-lg border-2 px-3 py-2 text-left transition-colors disabled:opacity-60",
              active
                ? "border-brass bg-surface"
                : "border-transparent bg-surface-2 hover:bg-surface-3",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "grid size-4 shrink-0 place-items-center rounded-full border-2",
                active ? "border-brass" : "border-border",
              )}
            >
              {active && <span className="size-2 rounded-full bg-brass" />}
            </span>
            <span className="min-w-0">
              <span className="block font-display text-base font-bold leading-tight">
                {t(ENCODER_OPTION[id].name)}
              </span>
              <span className="block truncate text-xs text-ink-faint">
                {t(ENCODER_OPTION[id].sub)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

const PASTE_COPY: Record<
  EncoderApp,
  { lede: MessageKey; confirm: MessageKey }
> = {
  obs: {
    lede: "encoding.wizard.manual.lede",
    confirm: "encoding.wizard.manual.confirm",
  },
  streamlabs: {
    lede: "encoding.wizard.manual.lede.streamlabs",
    confirm: "encoding.wizard.manual.confirm.streamlabs",
  },
  other: {
    lede: "encoding.wizard.manual.lede.other",
    confirm: "encoding.wizard.manual.confirm.other",
  },
};

/** The two fields any RTMP program needs, with the menu path of the one in use. */
export function PasteFields({
  app,
  stacked,
}: {
  app: EncoderApp;
  /** Labels above the values, for a narrow container such as the Live drawer. */
  stacked?: boolean;
}) {
  const t = useT();
  const settings = useStore((s) => s.config!.settings);
  const ingest = useStore((s) => s.config!.ingest);
  const setSettings = useStore((s) => s.setSettings);
  const note: MessageKey =
    app === "streamlabs"
      ? "encoding.wizard.manual.note.streamlabs"
      : app === "other"
        ? "encoding.wizard.manual.note.other"
        : settings.autoStartObs
          ? "encoding.wizard.manual.note.autostart"
          : "encoding.wizard.manual.note.manual";
  return (
    <div className="flex flex-col gap-3">
      <p className="text-pretty text-sm text-ink-muted">
        {bold(t, PASTE_COPY[app].lede)}
      </p>
      <CopyField
        label={t("encoding.wizard.manual.server")}
        value={obsIngestUrl(ingest)}
        stacked={stacked}
      />
      <CopyField
        label={t("encoding.wizard.manual.key")}
        value={ingest.key}
        mono
        stacked={stacked}
      />
      <p className="text-pretty text-sm text-ink-muted">{bold(t, note)}</p>
      {settings.obsManual ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-ok/10 px-3 py-2 text-sm">
          <span className="flex items-center gap-1.5 font-semibold">
            <Check className="size-4 text-ok" strokeWidth={2.6} />
            {t("encoding.wizard.manual.confirmed")}
          </span>
          <button
            type="button"
            onClick={() => setSettings({ obsManual: false })}
            className="inline-flex min-h-6 items-center text-xs font-bold text-brass hover:underline"
          >
            {t("encoding.wizard.manual.undo")}
          </button>
        </p>
      ) : (
        <div>
          <Button
            variant="subtle"
            size="sm"
            onClick={() => setSettings({ obsManual: true })}
          >
            <Check className="size-4" strokeWidth={2.6} />{" "}
            {t(PASTE_COPY[app].confirm)}
          </Button>
        </div>
      )}
    </div>
  );
}

/** A program Corneta cannot reach: the whole step is two fields to paste, shown at once. */
function ByHandPanel({
  app,
  autoPicked,
}: {
  app: Exclude<EncoderApp, "obs">;
  /** Detection chose this program; say so, since the streamer did not. */
  autoPicked: boolean;
}) {
  const t = useT();
  const done = useStore((s) => s.config!.settings.obsManual);
  return (
    <div className="overflow-hidden rounded-lg bg-surface">
      <div
        className={cn(
          "flex items-start gap-3.5 border-b border-border-soft px-4 py-4",
          !done && "bg-surface-2",
        )}
      >
        <LightDot kind={done ? "ok" : "todo"} n={1} />
        <div className="min-w-0 flex-1">
          <h3 className="text-base leading-tight">
            {t(byHandTitleKey(app, done))}
          </h3>
          <p className="mt-0.5 text-pretty text-sm text-ink-muted">
            {autoPicked &&
              app === "streamlabs" &&
              `${t("components.encoder.byHand.detected")} `}
            {t("components.encoder.byHand.body")}
          </p>
        </div>
      </div>
      <div className="p-4">
        <PasteFields app={app} />
      </div>
    </div>
  );
}

/**
 * Three lights Corneta checks on its own (OBS open, its WebSocket on, the stream pointed here),
 * each with a single action. Shared by first-run setup and the "Set it up for me" dialog.
 */
export function ObsSetupPanel({
  onStatus,
}: {
  onStatus?: (status: ObsSetupStatus) => void;
}) {
  const t = useT();
  const settings = useStore((s) => s.config!.settings);
  const setSettings = useStore((s) => s.setSettings);
  const configureObs = useStore((s) => s.configureObs);
  const runObsCheck = useStore((s) => s.runObsCheck);
  const refreshObsEnv = useStore((s) => s.refreshObsEnv);
  const pollObs = useStore((s) => s.pollObs);
  const obs = useStore((s) => s.obs);
  const env = useStore((s) => s.obsEnv);
  const passwordDraft = useDraft(settings.obsPassword, (obsPassword) =>
    setSettings({ obsPassword }),
  );
  const [status, setStatus] = useState<ObsSetupStatus>("idle");
  const [error, setError] = useState<ObsFailure | null>(null);
  const [configError, setConfigError] = useState<"save" | "changed" | null>(
    null,
  );
  const [opening, setOpening] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
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

  // The lights turn on by themselves: watch the process list and OBS's settings, and try the
  // WebSocket again whenever they change or it is still expected to answer.
  useEffect(() => {
    let cancelled = false;
    let busy = false;
    let last = "";
    const tick = async () => {
      if (busy || connecting.current) return;
      busy = true;
      try {
        const next = await refreshObsEnv();
        if (cancelled) return;
        const signature = obsEnvSignature(next);
        const current = useStore.getState().obs;
        const reachable =
          current !== null && current !== "loading" && current.reachable;
        const expected = next
          ? next.running && next.websocketEnabled !== false
          : true;
        if (signature !== last || (expected && !reachable)) {
          last = signature;
          await pollObs();
        }
      } finally {
        busy = false;
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [refreshObsEnv, pollObs]);

  const lights = obsLights(env, obs);
  const app = encoderApp(settings, env);
  const chooseApp = (next: EncoderApp) => {
    if (settings.encoderApp === next) return;
    // The "pasted by hand" mark was about the program being left.
    setSettings(
      next === app
        ? { encoderApp: next }
        : { encoderApp: next, obsManual: false },
    );
  };
  const help =
    error && obsHelpKind(error.code) === "generic"
      ? obsErrorHelp(t, error.code)
      : null;

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
      else setError(obsFailure(e));
      setStatus("error");
      void runObsCheck(true);
    } finally {
      connecting.current = false;
    }
  };

  const openObs = async () => {
    setOpening(true);
    try {
      await api.openObs();
      await refreshObsEnv();
    } catch {
      toast.error(t("components.obsLights.open.failed"));
    } finally {
      if (active.current) setOpening(false);
    }
  };

  const rescueRef = useFocusRescue<HTMLDivElement>();
  const video =
    obs !== null && obs !== "loading" && obs.reachable && obs.width
      ? `${obs.width}×${obs.height} · ${Math.round(obs.fps)} fps`
      : null;
  const busy = status === "connecting";
  const checking = obs === null || obs === "loading";

  return (
    <div ref={rescueRef} className="flex flex-col gap-3">
      <EncoderPicker app={app} onChoose={chooseApp} disabled={busy} />
      {app !== "obs" ? (
        <ByHandPanel app={app} autoPicked={settings.encoderApp === null} />
      ) : (
        <>
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
              <m.ul
                key="lights"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                aria-live="polite"
                className="overflow-hidden rounded-lg bg-surface"
              >
                {lights.open === "ok" ? (
                  <LightRow
                    kind="ok"
                    n={1}
                    title={t("components.obsLights.open.ok")}
                  />
                ) : lights.action === "install" ? (
                  <LightRow
                    kind="todo"
                    n={1}
                    title={t("components.obsLights.open.missing.title")}
                    body={t("components.obsLights.open.missing.body")}
                  >
                    <div className="mt-3">
                      <Button
                        variant="primary"
                        onClick={() => void openExternal(OBS_DOWNLOAD_URL)}
                      >
                        <ExternalLink className="size-4" />
                        {t("components.obsLights.open.missing.cta")}
                      </Button>
                    </div>
                  </LightRow>
                ) : lights.action === "open" ? (
                  <LightRow
                    kind="todo"
                    n={1}
                    title={t("components.obsLights.open.closed.title")}
                    body={t("components.obsLights.open.closed.body")}
                  >
                    <div className="mt-3">
                      <Button
                        variant="primary"
                        onClick={() => void openObs()}
                        loading={opening}
                        disabled={opening}
                      >
                        {!opening && <Power className="size-4" />}
                        {t("components.obsLights.open.closed.cta")}
                      </Button>
                    </div>
                  </LightRow>
                ) : (
                  <LightRow
                    kind="busy"
                    n={1}
                    title={t("components.obsLights.open.checking")}
                  />
                )}

                {lights.remote === "ok" ? (
                  <LightRow
                    kind="ok"
                    n={2}
                    title={t("components.obsLights.remote.ok")}
                  />
                ) : lights.action === "enableRemote" ? (
                  <LightRow
                    kind="todo"
                    n={2}
                    title={t("components.obsLights.remote.off.title")}
                    body={t("components.obsLights.remote.off.body")}
                  >
                    <p className="mt-2 text-sm text-ink-muted">
                      {bold(t, "components.obsLights.remote.off.steps")}
                    </p>
                    <ObsMenuHint />
                  </LightRow>
                ) : lights.action === "password" ? (
                  <LightRow
                    kind="todo"
                    n={2}
                    title={t("components.obsLights.remote.password.title")}
                    body={bold(t, "encoding.wizard.step2.body")}
                  >
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Input
                        type="password"
                        aria-label={t("encoding.wizard.step2.title")}
                        placeholder={t("encoding.wizard.step2.placeholder")}
                        className="max-w-64"
                        {...draftInputProps(passwordDraft)}
                        disabled={busy}
                      />
                      <Button
                        variant="primary"
                        onClick={() => {
                          passwordDraft.flush();
                          void runObsCheck(true);
                        }}
                      >
                        {t("encoding.wizard.cta.retry")}
                      </Button>
                    </div>
                  </LightRow>
                ) : lights.action === "retry" ? (
                  <LightRow
                    kind="todo"
                    n={2}
                    title={t("components.obsLights.remote.retry.title")}
                    body={t("components.obsLights.remote.retry.body", {
                      port: env?.websocketPort ?? 4455,
                    })}
                  >
                    <div className="mt-3">
                      <Button
                        variant="subtle"
                        onClick={() => void runObsCheck(true)}
                        loading={obs === "loading"}
                        disabled={obs === "loading"}
                      >
                        {obs !== "loading" && <RefreshCw className="size-4" />}
                        {t("encoding.wizard.cta.retry")}
                      </Button>
                    </div>
                  </LightRow>
                ) : (
                  <LightRow
                    kind={lights.open === "ok" && checking ? "busy" : "wait"}
                    n={2}
                    title={t("components.obsLights.remote.waiting.title")}
                    body={t(
                      lights.open === "ok"
                        ? "components.obsLights.remote.checking.body"
                        : "components.obsLights.remote.waiting.body",
                    )}
                  />
                )}

                {lights.pointed === "ok" ? (
                  <LightRow
                    kind="ok"
                    n={3}
                    title={t("components.obsLights.pointed.title")}
                    body={video ?? undefined}
                  >
                    <button
                      type="button"
                      onClick={() => void connect()}
                      disabled={busy}
                      className="mt-1.5 inline-flex min-h-6 items-center text-xs font-bold text-brass hover:underline disabled:opacity-40"
                    >
                      {t("components.obsLights.pointed.again")}
                    </button>
                  </LightRow>
                ) : lights.action === "point" ? (
                  <LightRow
                    kind={busy ? "busy" : "todo"}
                    n={3}
                    title={t(
                      busy
                        ? "components.obsSetup.connecting.title"
                        : "components.obsLights.pointed.todo.title",
                    )}
                    body={t(
                      busy
                        ? "components.obsSetup.connecting.body"
                        : "components.obsLights.pointed.todo.body",
                    )}
                  >
                    <div className="mt-3">
                      <Button
                        variant="primary"
                        onClick={() => void connect()}
                        loading={busy}
                        disabled={busy}
                      >
                        {!busy && <Zap className="size-4" />}
                        {busy
                          ? t("encoding.wizard.cta.connecting")
                          : t("components.obsSetup.cta")}
                      </Button>
                    </div>
                  </LightRow>
                ) : (
                  <LightRow
                    kind="wait"
                    n={3}
                    title={t("components.obsLights.pointed.title")}
                    body={t("components.obsLights.pointed.waiting.body")}
                  />
                )}
              </m.ul>
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
              <p className="text-sm font-semibold text-ink">{help.title}</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink-muted">
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
            icon={<Wrench className="size-4 text-brass" />}
            title={t("encoding.wizard.manual.toggle")}
            open={manualOpen}
            onToggle={() => setManualOpen((open) => !open)}
          >
            <PasteFields app="obs" />
          </Disclosure>
        </>
      )}
    </div>
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
            <div className="border-t border-border-soft p-4">{children}</div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
