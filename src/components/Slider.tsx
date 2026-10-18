import { useState } from "react";
import * as RSlider from "@radix-ui/react-slider";
import { cn } from "../lib/utils";

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  onPreview,
  suffix,
  disabled = false,
  "aria-label": ariaLabel,
  className,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Receives the value once per drag or key press, so persisted settings are written once. */
  onChange: (v: number) => void;
  /** Receives every step while dragging, then `null` when the drag ends. */
  onPreview?: (v: number | null) => void;
  suffix?: string;
  disabled?: boolean;
  "aria-label"?: string;
  className?: string;
}) {
  const [dragged, setDragged] = useState<number | null>(null);
  const shown = dragged ?? value;
  return (
    <div
      className={cn(
        "flex items-center gap-2.5",
        disabled && "opacity-40",
        className,
      )}
    >
      <RSlider.Root
        min={min}
        max={max}
        step={step}
        value={[shown]}
        disabled={disabled}
        onValueChange={(v) => {
          setDragged(v[0]);
          onPreview?.(v[0]);
        }}
        onValueCommit={(v) => {
          setDragged(null);
          onPreview?.(null);
          if (v[0] !== value) onChange(v[0]);
        }}
        className="relative flex h-4 flex-1 cursor-pointer touch-none select-none items-center disabled:cursor-not-allowed"
      >
        <RSlider.Track className="relative h-1.5 flex-1 rounded-full bg-surface-3">
          <RSlider.Range className="absolute h-full rounded-full bg-brass/40" />
        </RSlider.Track>
        <RSlider.Thumb
          aria-label={ariaLabel}
          // Expose the displayed value and unit to assistive technology.
          aria-valuetext={suffix != null ? `${shown}${suffix}` : undefined}
          className={cn(
            "block size-4 rounded-[3px] border-2 border-brass-ink bg-brass outline-none",
            "shadow-[1px_1px_0_0_rgba(0,0,0,0.35)] transition-transform hover:scale-110",
            "focus-visible:ring-2 focus-visible:ring-brass",
          )}
        />
      </RSlider.Root>
      {suffix != null && (
        <span className="min-w-10 shrink-0 text-right text-xs font-bold tabular-nums text-ink-muted">
          {shown}
          {suffix}
        </span>
      )}
    </div>
  );
}
