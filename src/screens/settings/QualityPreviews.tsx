import { AudioLines } from "lucide-react";
import { useId } from "react";
import { useT } from "../../lib/i18n";
import { useStore } from "../../lib/store";
import { cn } from "../../lib/utils";

export function BitratePreview() {
  return (
    <div className="absolute inset-0 bg-surface-2">
      <svg
        viewBox="0 0 128 72"
        preserveAspectRatio="none"
        className="h-full w-full"
      >
        <path
          d="M2 16 H44 L64 40 H84 L126 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="4 3"
          className="text-bad/70"
        />
        <path
          d="M2 26 H44 L64 50 H84 L126 26 V72 H2 Z"
          fill="currentColor"
          className="text-brass/20"
        />
        <path
          d="M2 26 H44 L64 50 H84 L126 26"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
          className="text-brass"
        />
      </svg>
    </div>
  );
}

export function LoudnessPreview() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-surface-2 px-2.5">
      <div className="relative h-2.5 w-4/5 overflow-hidden rounded-sm bg-night">
        <div className="absolute inset-y-0 left-[45%] right-[25%] bg-ok/40" />
        <div className="absolute inset-y-0 left-[58%] w-1 rounded-sm bg-ok" />
      </div>
      <AudioLines
        className="absolute right-1.5 top-1.5 size-3.5 text-brass"
        strokeWidth={2.4}
      />
    </div>
  );
}

export function LoudnessTarget() {
  const t = useT();
  const target = useStore((s) => s.config!.settings.loudnessTargetLufs);
  const setSettings = useStore((s) => s.setSettings);
  // LUFS targets are persisted values; only their labels are localized.
  const opts = [
    { v: -14, label: t("settings.loudness.target.minus14") },
    { v: -16, label: t("settings.loudness.target.minus16") },
    { v: -18, label: t("settings.loudness.target.minus18") },
  ];
  const labelId = useId();
  return (
    <div
      className="flex flex-wrap items-center gap-2 py-3.5"
      role="group"
      aria-labelledby={labelId}
    >
      <span id={labelId} className="text-xs font-semibold text-ink-faint">
        {t("settings.loudness.target.label")}
      </span>
      {opts.map((o) => (
        <button
          key={o.v}
          aria-pressed={target === o.v}
          onClick={() => setSettings({ loudnessTargetLufs: o.v })}
          className={cn(
            "rounded-md border-2 px-2.5 py-1 text-xs font-bold transition-colors",
            target === o.v
              ? "border-brass bg-brass/10 text-brass"
              : "border-border text-ink-muted hover:border-brass/60",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
