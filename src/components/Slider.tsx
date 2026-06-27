import * as RSlider from "@radix-ui/react-slider";
import { cn } from "../lib/utils";

/** Slider on-brand via Radix (thumb chunky brass com borda dura). Mostra o valor + sufixo opcional. */
export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  suffix,
  disabled = false,
  "aria-label": ariaLabel,
  className,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  suffix?: string;
  disabled?: boolean;
  "aria-label"?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", disabled && "opacity-40", className)}>
      <RSlider.Root
        min={min}
        max={max}
        step={step}
        value={[value]}
        disabled={disabled}
        onValueChange={(v) => onChange(v[0])}
        className="relative flex h-4 flex-1 cursor-pointer touch-none select-none items-center disabled:cursor-not-allowed"
      >
        <RSlider.Track className="relative h-1.5 flex-1 rounded-full bg-surface-3">
          <RSlider.Range className="absolute h-full rounded-full bg-brass/40" />
        </RSlider.Track>
        <RSlider.Thumb
          aria-label={ariaLabel}
          className={cn(
            "block size-4 rounded-[3px] border-2 border-brass-ink bg-brass outline-none",
            "shadow-[1px_1px_0_0_rgba(0,0,0,0.35)] transition-transform hover:scale-110",
            "focus-visible:ring-2 focus-visible:ring-brass",
          )}
        />
      </RSlider.Root>
      {suffix != null && (
        <span className="min-w-10 shrink-0 text-right text-xs font-bold tabular-nums text-ink-muted">
          {value}
          {suffix}
        </span>
      )}
    </div>
  );
}
