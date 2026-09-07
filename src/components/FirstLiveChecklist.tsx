import { useEffect, useState } from "react";
import { Check, ChevronRight, Radio, X } from "lucide-react";
import { useStore } from "../lib/store";
import { useT } from "../lib/i18n";
import { cn } from "../lib/utils";

const FLAG = "corneta.firstlive";

function flagDone(): boolean {
  try {
    return localStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}

function setFlagDone() {
  try {
    localStorage.setItem(FLAG, "1");
  } catch {
    /* Storage may be unavailable; the checklist remains dismissible for this session. */
  }
}

export function FirstLiveChecklist({
  onSetupObs,
}: {
  onSetupObs?: () => void;
}) {
  const t = useT();
  const config = useStore((s) => s.config);
  const obs = useStore((s) => s.obs);
  const runObsCheck = useStore((s) => s.runObsCheck);
  const requestNavigate = useStore((s) => s.requestNavigate);
  const state = useStore((s) => s.snapshot.state);
  const [hidden, setHidden] = useState(flagDone);

  useEffect(() => {
    if (!hidden && state === "live") {
      setFlagDone();
      setHidden(true);
    }
  }, [state, hidden]);

  useEffect(() => {
    if (!hidden) void runObsCheck();
  }, [hidden, runObsCheck]);

  if (hidden || !config) return null;

  const keyOk = config.targets.some((t) => t.enabled && t.hasKey);
  const obsOk =
    obs !== null && obs !== "loading" && obs.reachable && obs.pointingAtCorneta;

  const steps: { label: string; done: boolean; onClick: () => void }[] = [
    {
      label: t("components.firstLive.step.key"),
      done: keyOk,
      onClick: () => requestNavigate("platforms"),
    },
    {
      label: t("components.firstLive.step.obs"),
      done: obsOk,
      onClick: () => {
        if (onSetupObs) onSetupObs();
        else requestNavigate("golive");
      },
    },
    {
      label: t("components.firstLive.step.golive"),
      done: false,
      onClick: () => requestNavigate("golive"),
    },
  ];

  return (
    <div className="mb-4 rounded-lg border-2 border-brass/40 bg-brass/[0.06] px-4 py-3">
      <div className="flex items-center gap-2">
        <Radio className="size-4 text-brass" strokeWidth={2.6} />
        <span className="font-display text-sm font-extrabold">
          {t("components.firstLive.title")}
        </span>
        <button
          onClick={() => {
            setFlagDone();
            setHidden(true);
          }}
          aria-label={t("components.firstLive.dismiss.aria")}
          title={t("components.firstLive.dismiss.title")}
          className="ml-auto grid size-6 place-items-center rounded-md text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
        {steps.map((s, i) => (
          <button
            key={s.label}
            onClick={s.onClick}
            className={cn(
              "group flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm transition-colors hover:bg-surface-2",
              s.done ? "text-ink-faint" : "text-ink",
            )}
          >
            <span
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded-full border-2 text-[11px] font-extrabold",
                s.done
                  ? "border-ok bg-ok text-night"
                  : "border-brass text-brass",
              )}
            >
              {s.done ? (
                <Check className="size-3.5" strokeWidth={3.2} />
              ) : (
                i + 1
              )}
            </span>
            <span className={cn("font-semibold", s.done && "line-through")}>
              {s.label}
            </span>
            {!s.done && (
              <ChevronRight className="size-3.5 text-ink-faint transition-transform group-hover:translate-x-0.5" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
