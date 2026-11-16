import type { ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  Clapperboard,
  Info,
  Loader2,
  Radio,
  RotateCcw,
  Square,
  Unplug,
} from "lucide-react";
import { useStore } from "../lib/store";
import { useEncoder } from "../lib/useEncoder";
import { toast } from "../lib/toast";
import { issueTopic, obsGuide } from "../lib/platformCheck";
import { GUIDE_KEY, TOPIC_KEY } from "../lib/platformCheckText";
import { platformName } from "../lib/platforms";
import { rehearsalVerdict, type RehearsalVerdict } from "../lib/rehearsal";
import { errMsg } from "../lib/utils";
import { cn } from "../lib/utils";
import { useI18n, type MessageKey } from "../lib/i18n";
import type {
  PlatformId,
  RehearsalReport,
  RehearsalTarget,
} from "../lib/types";
import { Button, PlatformGlyph } from "./ui";

type Tone = "ok" | "warn" | "bad" | "info" | "busy";

function Dot({ tone }: { tone: Tone }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-full",
        tone === "ok" && "bg-ok text-night",
        tone === "warn" && "bg-warn text-night",
        tone === "bad" && "bg-bad text-night",
        tone === "info" && "bg-surface-3 text-ink-muted",
        tone === "busy" && "border-2 border-brass text-brass",
      )}
    >
      {tone === "ok" ? (
        <Check className="size-4" strokeWidth={3.2} />
      ) : tone === "busy" ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : tone === "info" ? (
        <Info className="size-3.5" />
      ) : (
        <AlertTriangle className="size-3.5" strokeWidth={2.6} />
      )}
    </span>
  );
}

function Row({
  tone,
  glyph,
  title,
  body,
  children,
}: {
  tone: Tone;
  glyph?: ReactNode;
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 border-b border-border-soft px-4 py-3 last:border-0">
      <Dot tone={tone} />
      {glyph}
      <div className="min-w-0 flex-1">
        <h4 className="font-display text-base font-extrabold leading-tight">
          {title}
        </h4>
        {body && (
          <p className="mt-0.5 text-pretty text-sm text-ink-muted">{body}</p>
        )}
        {children}
      </div>
    </li>
  );
}

const OUTCOME_TONE: Record<RehearsalTarget["outcome"], Tone> = {
  pending: "busy",
  received: "ok",
  warned: "warn",
  refused: "bad",
  failed: "bad",
  skipped: "info",
};

function TargetRow({ target }: { target: RehearsalTarget }) {
  const { t } = useI18n();
  const name = target.name || platformName(target.platformId as PlatformId, t);
  const topic = target.issues?.[0] ? issueTopic(target.issues[0].kind) : null;
  const guide = topic ? obsGuide(topic) : null;
  const leftPrivateVideo =
    target.route === "privateBroadcast" &&
    (target.outcome === "received" || target.outcome === "warned");
  const body =
    target.outcome === "pending"
      ? t("components.rehearsal.target.pending")
      : target.outcome === "received"
        ? t(
            target.route === "privateBroadcast"
              ? "components.rehearsal.target.receivedPrivate"
              : "components.rehearsal.target.receivedTest",
          )
        : target.outcome === "warned" && topic
          ? t("components.rehearsal.target.warned", {
              issue: t(TOPIC_KEY[topic]),
            })
          : target.outcome === "refused"
            ? (target.detail ?? t("components.rehearsal.target.refused"))
            : target.outcome === "failed"
              ? (target.detail ?? t("components.rehearsal.target.failed"))
              : target.skip === "noKey"
                ? t("components.rehearsal.target.skippedNoKey")
                : t("components.rehearsal.target.skipped");
  return (
    <Row
      tone={OUTCOME_TONE[target.outcome]}
      glyph={<PlatformGlyph id={target.platformId as PlatformId} size={28} />}
      title={name}
      body={body}
    >
      {target.outcome === "warned" &&
        (guide ? (
          <details className="mt-1 text-xs text-ink-faint">
            <summary className="flex min-h-6 cursor-pointer select-none flex-wrap items-center gap-x-2">
              <span>{t("components.rehearsal.target.warned.fix")}</span>
              <span className="font-bold text-brass">
                {t("golive.target.platform.guide.toggle")}
              </span>
            </summary>
            <p className="mt-1 text-pretty">{t(GUIDE_KEY[guide])}</p>
          </details>
        ) : (
          <p className="mt-1 text-xs text-ink-faint">
            {t("components.rehearsal.target.warned.fix")}
          </p>
        ))}
      {leftPrivateVideo && (
        <p className="mt-1 text-xs text-ink-faint">
          {t("components.rehearsal.privateVideo")}
        </p>
      )}
    </Row>
  );
}

const VERDICT_TITLE: Record<RehearsalVerdict, MessageKey> = {
  passed: "components.rehearsal.verdict.passed.title",
  passedWithNotes: "components.rehearsal.verdict.notes.title",
  noSignal: "components.rehearsal.verdict.noSignal.title",
  failed: "components.rehearsal.verdict.failed.title",
  cancelled: "components.rehearsal.verdict.cancelled.title",
};
const VERDICT_LEAD: Record<RehearsalVerdict, MessageKey> = {
  passed: "components.rehearsal.verdict.passed.lead",
  passedWithNotes: "components.rehearsal.verdict.notes.lead",
  noSignal: "components.rehearsal.verdict.noSignal.lead",
  failed: "components.rehearsal.verdict.failed.lead",
  cancelled: "components.rehearsal.verdict.cancelled.lead",
};

function SignalRow({ report }: { report: RehearsalReport }) {
  const { t, fmt } = useI18n();
  // Only an OBS that Corneta set up can be started for the user; otherwise they are told where.
  const encoder = useEncoder();
  if (!report.signalArrived)
    return (
      <Row
        tone={report.phase === "done" ? "bad" : "busy"}
        title={t(
          report.phase === "done"
            ? "components.rehearsal.signal.missing"
            : report.obsStarted
              ? "components.rehearsal.signal.waiting"
              : encoder.byHand
                ? "components.rehearsal.signal.pressPlay.byHand"
                : "components.rehearsal.signal.pressPlay",
          { app: encoder.name },
        )}
        body={
          report.phase === "done" || report.obsStarted
            ? undefined
            : t(
                encoder.byHand
                  ? "components.rehearsal.signal.pressPlay.byHand.body"
                  : "components.rehearsal.signal.pressPlay.body",
              )
        }
      />
    );
  return (
    <Row
      tone={report.hasAudio ? "ok" : "warn"}
      title={t(
        report.hasAudio
          ? "components.rehearsal.signal.ok"
          : "components.rehearsal.signal.silent",
      )}
      body={
        report.signalKbps
          ? t("components.rehearsal.signal.kbps", {
              kbps: fmt.num(report.signalKbps),
            })
          : undefined
      }
    />
  );
}

/** Starts a rehearsal and reports a refusal, for the panel and for a host that offers "again". */
export function useStartRehearsal() {
  const { t } = useI18n();
  const runRehearsal = useStore((s) => s.runRehearsal);
  return () => {
    runRehearsal().catch((error: unknown) =>
      toast.error(
        t("components.rehearsal.startFailed", { erro: errMsg(error) }),
      ),
    );
  };
}

/**
 * A private run of the whole chain before the first real live. Shared by first-run setup and the
 * Live screen, so the result reads the same in both.
 */
export function RehearsalPanel({
  onGoLive,
  onFixObs,
}: {
  /** GO LIVE after a passed rehearsal. Without it the host owns the way forward, as first-run
   * setup does in its footer. */
  onGoLive?: () => void;
  onFixObs: () => void;
}) {
  const { t } = useI18n();
  const report = useStore((s) => s.rehearsal);
  const rehearsing = useStore((s) => s.rehearsing);
  const cancelRehearsal = useStore((s) => s.cancelRehearsal);
  const encoder = useEncoder();
  const start = useStartRehearsal();

  if (!report && !rehearsing)
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-4 rounded-lg bg-surface p-5">
          <span className="grid size-12 shrink-0 -rotate-3 place-items-center rounded-lg bg-brass text-brass-ink pop-sm">
            <Clapperboard className="size-6" />
          </span>
          <ul className="flex flex-col gap-1.5 text-sm text-ink-muted">
            <li>
              {t(
                encoder.byHand
                  ? "components.rehearsal.intro.signal.byHand"
                  : "components.rehearsal.intro.signal",
                { app: encoder.name },
              )}
            </li>
            <li>{t("components.rehearsal.intro.platforms")}</li>
            <li>{t("components.rehearsal.intro.rest")}</li>
          </ul>
        </div>
        <div>
          <Button variant="primary" size="lg" onClick={start}>
            <Clapperboard className="size-5" />
            {t("components.rehearsal.start")}
          </Button>
        </div>
      </div>
    );

  if (!report || report.phase !== "done")
    return (
      <div className="flex flex-col gap-4" aria-live="polite">
        <ul className="overflow-hidden rounded-lg bg-surface">
          {report ? (
            <>
              <SignalRow report={report} />
              {report.targets.map((target) => (
                <TargetRow
                  key={target.targetId}
                  target={
                    report.signalArrived || target.outcome === "skipped"
                      ? target
                      : { ...target, outcome: "pending" }
                  }
                />
              ))}
            </>
          ) : (
            <Row tone="busy" title={t("components.rehearsal.starting")} />
          )}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" onClick={() => void cancelRehearsal()}>
            <Square className="size-3.5" />
            {t("components.rehearsal.stop")}
          </Button>
          <span className="text-sm text-ink-muted tabular-nums">
            {t("components.rehearsal.running", {
              seconds: report?.secondsLeft ?? 0,
            })}
          </span>
        </div>
      </div>
    );

  const verdict = rehearsalVerdict(report);
  const good = verdict === "passed" || verdict === "passedWithNotes";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <span
          className={cn(
            "grid size-14 shrink-0 -rotate-6 place-items-center rounded-lg pop",
            good ? "bg-ok text-night" : "bg-bad text-night",
          )}
        >
          {good ? (
            <Check className="size-8" strokeWidth={3.2} />
          ) : (
            <Unplug className="size-7" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-2xl leading-tight">
            {t(VERDICT_TITLE[verdict])}
          </h3>
          <p className="mt-1 text-pretty text-sm text-ink-muted">
            {t(VERDICT_LEAD[verdict])}
          </p>
        </div>
        {/* The frame sits with the verdict it proves, leaving the rows the full width. */}
        {report.thumbnail && (
          <img
            src={report.thumbnail}
            alt={t("components.rehearsal.frame.alt")}
            className="aspect-video w-32 shrink-0 rounded-md bg-night object-cover"
          />
        )}
      </div>
      <ul className="overflow-hidden rounded-lg bg-surface">
        <SignalRow report={report} />
        {report.signalArrived &&
          report.targets.map((target) => (
            <TargetRow key={target.targetId} target={target} />
          ))}
        {verdict === "noSignal" && (
          <>
            <Row
              tone="info"
              title={t("components.rehearsal.cause.elsewhere")}
              body={t("components.rehearsal.cause.elsewhere.body")}
            >
              <div className="mt-2">
                <Button variant="subtle" size="sm" onClick={onFixObs}>
                  {t("components.rehearsal.cause.elsewhere.cta")}
                </Button>
              </div>
            </Row>
            <Row
              tone="info"
              title={t("components.rehearsal.cause.dialog")}
              body={t("components.rehearsal.cause.dialog.body")}
            />
          </>
        )}
      </ul>
      {!good ? (
        <div>
          <Button variant="primary" size="lg" onClick={start}>
            <RotateCcw className="size-5" />
            {t("components.rehearsal.again")}
          </Button>
        </div>
      ) : (
        onGoLive && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="tomato" size="lg" onClick={onGoLive}>
              <Radio className="size-5" />
              {t("golive.cta")}
            </Button>
            <Button variant="ghost" onClick={start}>
              {t("components.rehearsal.again")}
            </Button>
          </div>
        )
      )}
    </div>
  );
}
