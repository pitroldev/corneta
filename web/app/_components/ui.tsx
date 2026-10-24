import type { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

// Tailwind conflicts follow stylesheet order; twMerge makes the caller's last utility win.
export function cn(...parts: (string | false | null | undefined)[]) {
  return twMerge(parts.filter(Boolean).join(" "));
}

export function Shell({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "header" | "footer" | "main";
}) {
  return (
    <Tag
      className={cn(
        "mx-auto w-[min(calc(100%-3rem),1220px)] max-[980px]:w-[min(calc(100%-2.5rem),780px)] max-[760px]:w-[min(calc(100%-2rem),560px)]",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function Section({
  children,
  tone = "dark",
  className,
  id,
}: {
  children: ReactNode;
  tone?: "paper" | "paper-raised" | "dark";
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "below-fold bg-[length:20px_20px] py-[clamp(78px,8vw,122px)]",
        tone === "dark"
          ? "bg-charcoal bg-[image:var(--halftone-dark)]"
          : cn(
              "text-ink bg-[image:var(--halftone-light)]",
              tone === "paper-raised" ? "bg-paper-raised" : "bg-paper",
            ),
        className,
      )}
    >
      {children}
    </section>
  );
}

// Use an explicit width: ch would measure the body font, not the display heading.
export function SectionHeading({
  kicker,
  title,
  children,
  tone = "dark",
  centered = false,
  tight = false,
  className,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  tone?: "paper" | "dark";
  centered?: boolean;
  tight?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        centered ? "mx-auto max-w-[780px] text-center" : "max-w-[660px]",
        className,
      )}
    >
      {kicker && (
        <span
          className={cn(
            "mb-5 inline-flex items-center gap-2.5 text-[0.78rem] font-extrabold tracking-[0.1em] uppercase",
            "before:h-1 before:w-[26px] before:bg-brass before:content-['']",
            tone === "dark" ? "text-brass" : "text-tomato-ink",
          )}
        >
          {kicker}
        </span>
      )}
      <h2
        className={cn(
          "leading-[0.98] tracking-[-0.03em]",
          tight
            ? "text-[clamp(2.1rem,3.2vw,3.05rem)]"
            : "text-[clamp(2.35rem,4.2vw,3.9rem)] max-[760px]:text-[clamp(2.1rem,10.5vw,3rem)]",
        )}
      >
        {title}
      </h2>
      {children && (
        <div
          className={cn(
            "[&>p]:mt-[22px] [&>p]:max-w-[62ch] [&>p]:text-[1.05rem] [&>p]:leading-[1.68] [&>p]:font-medium",
            centered && "[&>p]:mx-auto",
            tone === "dark" ? "[&>p]:text-muted" : "[&>p]:text-ink-muted",
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function TwoCol({
  children,
  cols,
  align = "center",
  className,
}: {
  children: ReactNode;
  cols: string;
  align?: "center" | "start" | "stretch";
  className?: string;
}) {
  return (
    <div
      className={cn(
        // The responsive override must beat the runtime inline grid-template-columns value.
        "grid max-[980px]:grid-cols-1!",
        align === "start"
          ? "items-start"
          : align === "stretch"
            ? "items-stretch"
            : "items-center",
        className,
      )}
      style={{ gridTemplateColumns: cols }}
    >
      {children}
    </div>
  );
}

export function Sticker({
  children,
  tone = "brass",
  className,
}: {
  children: ReactNode;
  tone?: "brass" | "tomato";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-sm px-3 py-[7px]",
        "text-[0.72rem] font-extrabold tracking-[0.1em] text-brass-ink uppercase",
        "[&>svg]:h-[15px] [&>svg]:w-[15px] [&>svg]:shrink-0",
        tone === "tomato"
          ? "rotate-[1.8deg] bg-tomato shadow-pop"
          : "rotate-[-2.2deg] bg-brass shadow-pop-brass",
        className,
      )}
    >
      {children}
    </span>
  );
}

export const downloadButton = cn(
  "inline-flex min-h-16 items-center justify-center gap-[13px] px-[26px]",
  "max-[420px]:min-h-[58px] max-[420px]:px-4 max-[420px]:text-base",
  "rounded-md bg-tomato text-brass-ink shadow-pop-cream",
  "font-display text-[1.14rem] leading-none font-extrabold",
  "transition-[background-color,transform,box-shadow] duration-90 ease-out",
  "hover:bg-tomato-strong active:translate-x-1 active:translate-y-1 active:shadow-none",
  "[&>svg]:h-[23px] [&>svg]:w-[23px] [&>svg]:shrink-0 [&>svg]:fill-current",
  "[&>svg:last-child]:fill-none [&>svg:last-child]:stroke-current [&>svg:last-child]:[stroke-width:2.4] [&>svg:last-child]:[stroke-linecap:round] [&>svg:last-child]:[stroke-linejoin:round]",
);

export function Slab({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <em
      className={cn(
        "mt-[0.1em] mb-[0.16em] inline-block px-[0.2em] pt-[0.04em] pb-[0.1em]",
        "-rotate-[1.4deg] bg-brass text-[0.94em] whitespace-nowrap text-brass-ink not-italic max-[760px]:text-[0.82em]",
        "shadow-[7px_7px_0_0_var(--tomato)] max-[760px]:shadow-[5px_5px_0_0_var(--tomato)]",
        className,
      )}
    >
      {children}
    </em>
  );
}

export const heroWaves =
  "pointer-events-none absolute -top-[90px] -right-[150px] -z-10 w-[620px] text-brass opacity-20 max-[760px]:-top-10 max-[760px]:-right-60 max-[760px]:w-[480px]";

export function Tag({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: "copy" | "warn";
}) {
  return (
    <span
      className={cn(
        "rounded-sm px-2 py-1 text-[0.6rem] font-extrabold tracking-[0.06em] whitespace-nowrap uppercase",
        tone === "copy"
          ? "bg-surface-3 text-muted"
          : tone === "warn"
            ? "bg-warn text-night"
            : "bg-brass text-brass-ink",
      )}
    >
      {children}
    </span>
  );
}
