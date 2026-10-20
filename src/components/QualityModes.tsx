import { useMemo } from "react";
import { m } from "framer-motion";
import { Layers, Sparkles, Wand2 } from "lucide-react";
import { useStore } from "../lib/store";
import { bandFit, estimate, type EngineEstimate } from "../lib/estimates";
import { useI18n, useT, type MessageKey } from "../lib/i18n";
import { cn } from "../lib/utils";
import type { EncodingMode } from "../lib/types";
import { Badge } from "./ui";

// IDs are persisted Rust enum values; only translation keys are display copy.
export const QUALITY_MODES: {
  id: EncodingMode;
  titleKey: MessageKey;
  tagKey: MessageKey;
  tone: "brass" | "neutral";
  icon: typeof Wand2;
  descKey: MessageKey;
}[] = [
  {
    id: "passthrough",
    titleKey: "encoding.mode.passthrough.title",
    tagKey: "encoding.mode.passthrough.tag",
    tone: "neutral",
    icon: Layers,
    descKey: "encoding.mode.passthrough.desc",
  },
  {
    id: "hybrid",
    titleKey: "encoding.mode.hybrid.title",
    tagKey: "encoding.mode.hybrid.tag",
    tone: "brass",
    icon: Wand2,
    descKey: "encoding.mode.hybrid.desc",
  },
  {
    id: "per-platform",
    titleKey: "encoding.mode.perPlatform.title",
    tagKey: "encoding.mode.perPlatform.tag",
    tone: "neutral",
    icon: Sparkles,
    descKey: "encoding.mode.perPlatform.desc",
  },
];

export function modeTitleKey(mode: EncodingMode): MessageKey {
  return (
    QUALITY_MODES.find((x) => x.id === mode)?.titleKey ??
    "encoding.mode.hybrid.title"
  );
}

/** Estimate for every mode; estimate() is pure, so compute each once per config change. */
export function useModeEstimates(): Map<EncodingMode, EngineEstimate> | null {
  const config = useStore((s) => s.config);
  const encoders = useStore((s) => s.encoders);
  const anyHw = encoders.some((e) => e.available && e.kind !== "software");
  return useMemo(
    () =>
      config
        ? new Map(
            QUALITY_MODES.map((mode) => [
              mode.id,
              estimate({ ...config, mode: mode.id }, { anyHwAvailable: anyHw }),
            ]),
          )
        : null,
    [config, anyHw],
  );
}

export function LoadBar({ load }: { load: number }) {
  const t = useT();
  const pct = Math.round(load * 100);
  const tone = load > 0.66 ? "bg-bad" : load > 0.33 ? "bg-warn" : "bg-ok";
  const word = t(
    load >= 0.95
      ? "encoding.load.word.max"
      : load > 0.66
        ? "encoding.load.word.heavy"
        : load > 0.33
          ? "encoding.load.word.warm"
          : "encoding.load.word.easy",
  );
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-semibold text-ink-faint">
          {t("encoding.load.label")}
        </span>
        <span className="font-display font-bold text-ink-muted">{word}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-sm bg-surface">
        <m.div
          className={cn("h-full rounded-sm", tone)}
          animate={{ width: `${Math.max(4, pct)}%` }}
          transition={{ type: "spring", stiffness: 200, damping: 26 }}
        />
      </div>
    </div>
  );
}

/** The three quality modes with upload, PC load and whether each fits the measured upload. */
export function QualityModeCards({
  compact = false,
  className,
}: {
  /** One column with the description hidden, for narrow panels. */
  compact?: boolean;
  className?: string;
}) {
  const { t, fmt } = useI18n();
  const mode = useStore((s) => s.config?.mode);
  const setMode = useStore((s) => s.setMode);
  const uploadMbps = useStore((s) => s.uploadMbps);
  const estimates = useModeEstimates();
  if (!estimates || !mode) return null;
  return (
    <div
      className={cn(
        "grid gap-3",
        compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-3",
        className,
      )}
    >
      {QUALITY_MODES.map((item) => {
        const est = estimates.get(item.id)!;
        const fit = bandFit(est.uploadKbps, uploadMbps);
        const active = mode === item.id;
        const Icon = item.icon;
        return (
          <m.button
            key={item.id}
            type="button"
            onClick={() => setMode(item.id)}
            whileTap={{ scale: 0.97 }}
            aria-pressed={active}
            className={cn(
              "relative flex flex-col rounded-lg text-left transition",
              compact ? "p-3" : "p-4",
              active
                ? "border-2 border-brass bg-surface pop-brass"
                : "border-2 border-transparent bg-surface-2 hover:bg-surface-3",
            )}
          >
            {!compact && (
              <Badge tone={item.tone} className="mb-2 self-start">
                {t(item.tagKey)}
              </Badge>
            )}
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-md transition-colors",
                  active
                    ? "bg-brass text-brass-ink"
                    : "bg-surface text-ink-muted",
                )}
              >
                <Icon className="size-4" strokeWidth={2.4} />
              </span>
              <span className="font-display text-lg font-bold">
                {t(item.titleKey)}
              </span>
              {compact && (
                <Badge tone={item.tone} className="ml-auto">
                  {t(item.tagKey)}
                </Badge>
              )}
            </div>
            {!compact && (
              <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
                {t(item.descKey)}
              </p>
            )}
            <div className="mt-auto space-y-2 pt-3">
              <LoadBar load={est.load} />
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-ink-faint">
                  {t("encoding.card.upload.label")}
                </span>
                <span className="font-display font-extrabold tabular-nums">
                  {fmt.bitrate(est.uploadKbps)}
                </span>
              </div>
              <div
                className={cn(
                  "min-h-4 text-xs font-bold",
                  fit === "ok"
                    ? "text-ok"
                    : fit === "warn"
                      ? "text-warn"
                      : fit === "bad"
                        ? "text-bad"
                        : "text-ink-faint/60",
                )}
              >
                {fit === "ok"
                  ? t("encoding.fit.ok")
                  : fit === "warn"
                    ? t("encoding.fit.warn")
                    : fit === "bad"
                      ? t("encoding.fit.bad")
                      : " "}
              </div>
            </div>
          </m.button>
        );
      })}
    </div>
  );
}
