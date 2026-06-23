import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { Globe } from "lucide-react";
import {
  siTwitch, siYoutube, siFacebook, siKick, siTiktok, siX, siInstagram,
} from "simple-icons";
import { cn, readableOn } from "../lib/utils";
import { PLATFORMS } from "../lib/platforms";
import type { PlatformId } from "../lib/types";

const PLATFORM_ICON: Partial<Record<PlatformId, string>> = {
  twitch: siTwitch.path,
  youtube: siYoutube.path,
  facebook: siFacebook.path,
  kick: siKick.path,
  tiktok: siTiktok.path,
  x: siX.path,
  instagram: siInstagram.path,
};

// ---------------- Button ----------------
type Variant = "primary" | "pop" | "ghost" | "outline" | "danger" | "subtle";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brass text-brass-ink hover:bg-brass-strong pop-brass active:translate-x-1 active:translate-y-1 active:shadow-none font-display font-bold",
  pop: "bg-tomate text-white hover:bg-tomate-strong pop active:translate-x-1 active:translate-y-1 active:shadow-none font-display font-bold",
  ghost: "text-ink-muted hover:text-ink hover:bg-surface-2",
  outline: "border-2 border-border text-ink hover:border-brass",
  danger: "bg-bad/15 text-bad hover:bg-bad/25 border-2 border-bad/40 font-display font-bold",
  subtle: "bg-surface-2 text-ink hover:bg-surface-3",
};
const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-sm gap-1.5 rounded-sm",
  md: "h-10 px-4 text-sm gap-2 rounded-md",
  lg: "h-14 px-7 text-lg gap-2.5 rounded-md",
};

export function Button({
  variant = "subtle",
  size = "md",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap transition-all duration-75 disabled:opacity-40 disabled:pointer-events-none disabled:shadow-none",
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// ---------------- Panel (ex-"Card") ----------------
// Bloco sólido, canto seco. Sem borda/glow por padrão — diferencia pela cor de
// preenchimento. Acentos opcionais: barra de latão (`accent`) e sombra dura (`pop`).
export function Card({
  className,
  accent,
  pop,
  children,
  ...rest
}: {
  className?: string;
  accent?: boolean;
  pop?: boolean;
  children: ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg bg-surface p-5",
        accent && "accent-l",
        pop && "pop",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

// ---------------- Badge (adesivo) ----------------
export function Badge({
  children,
  className,
  color,
}: {
  children: ReactNode;
  className?: string;
  color?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide",
        className
      )}
      style={color ? { backgroundColor: color, color: readableOn(color) } : undefined}
    >
      {children}
    </span>
  );
}

// ---------------- Toggle / Switch ----------------
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-md transition-colors",
        checked ? "bg-brass" : "bg-surface-3"
      )}
    >
      <span
        className={cn(
          "absolute left-1 top-1 size-4 rounded-[4px] transition-transform",
          checked ? "translate-x-5 bg-brass-ink" : "translate-x-0 bg-ink-faint"
        )}
      />
    </button>
  );
}

// ---------------- Platform glyph (logo oficial em chip de marca) ----------------
export function PlatformGlyph({
  id,
  size = 44,
}: {
  id: PlatformId;
  size?: number;
}) {
  const preset = PLATFORMS[id];
  const fg = readableOn(preset.color);
  const path = PLATFORM_ICON[id];
  const glyph = size * 0.52;
  return (
    <div
      className="grid shrink-0 place-items-center rounded-md pop-sm"
      style={{ width: size, height: size, backgroundColor: preset.color }}
    >
      {path ? (
        <svg viewBox="0 0 24 24" width={glyph} height={glyph} fill={fg} aria-hidden>
          <path d={path} />
        </svg>
      ) : (
        <Globe width={glyph} height={glyph} style={{ color: fg }} strokeWidth={2.4} />
      )}
    </div>
  );
}

// ---------------- Section title (editorial) ----------------
export function SectionTitle({
  kicker,
  title,
  subtitle,
  right,
}: {
  kicker?: string;
  title: ReactNode;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        {kicker && (
          <div className="mb-1.5 text-xs font-bold uppercase tracking-[0.18em] text-brass">
            {kicker}
          </div>
        )}
        <h2 className="text-3xl">{title}</h2>
        {subtitle && <p className="mt-2 max-w-lg text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

// ---------------- Stat (bloco com topo de latão) ----------------
export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "ok" | "warn" | "bad";
}) {
  const toneColor =
    tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : "text-ink";
  return (
    <div className="rounded-md border-t-2 border-brass/50 bg-surface-2 px-4 py-3">
      <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">{label}</div>
      <div className={cn("mt-1 font-display text-2xl font-extrabold tabular-nums", toneColor)}>
        {value}
      </div>
      {hint && <div className="text-xs text-ink-faint">{hint}</div>}
    </div>
  );
}

// ---------------- Text input ----------------
export function Input({
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-md border-2 border-border bg-surface-2 px-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-brass",
        className
      )}
      {...rest}
    />
  );
}
