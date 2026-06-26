import { cn } from "../lib/utils";

/** Slider on-brand (thumb chunky brass com borda dura). Mostra o valor + sufixo opcional. */
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
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn(
          "h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-surface-3 outline-none disabled:cursor-not-allowed",
          "[&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-[3px]",
          "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-brass-ink [&::-webkit-slider-thumb]:bg-brass",
          "[&::-webkit-slider-thumb]:shadow-[1px_1px_0_0_rgba(0,0,0,0.35)] [&::-webkit-slider-thumb]:transition-transform",
          "[&::-webkit-slider-thumb]:hover:scale-110",
          "[&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-[3px] [&::-moz-range-thumb]:border-2",
          "[&::-moz-range-thumb]:border-brass-ink [&::-moz-range-thumb]:bg-brass",
        )}
      />
      {suffix != null && (
        <span className="min-w-10 shrink-0 text-right text-xs font-bold tabular-nums text-ink-muted">
          {value}
          {suffix}
        </span>
      )}
    </div>
  );
}
