import type { ReactNode } from "react";
import { cn } from "../lib/utils";

/**
 * Tooltip on-brand no hover (sem `title` nativo — sem delay/estilo do SO).
 * Aparece acima do gatilho. Pra casos sem ancestral com `overflow-hidden`
 * (senão precisaria de portal/Radix).
 */
export function Tooltip({
  children,
  content,
  className,
}: {
  children: ReactNode;
  content: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("group/tt relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-64 -translate-x-1/2 translate-y-1",
          "rounded-md border-2 border-ink bg-panel px-2.5 py-1.5 text-left text-[11px] font-medium normal-case leading-snug text-ink",
          "opacity-0 shadow-[2px_2px_0_0_rgba(0,0,0,0.45)] transition-all duration-100",
          "group-hover/tt:translate-y-0 group-hover/tt:opacity-100",
          "group-focus-within/tt:translate-y-0 group-focus-within/tt:opacity-100",
        )}
      >
        {content}
      </span>
    </span>
  );
}
