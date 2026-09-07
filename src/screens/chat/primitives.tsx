import { Smile } from "lucide-react";
import { type ReactNode } from "react";
import { PlatformGlyph, Toggle } from "../../components/ui";
import type { ChatPlatform } from "../../lib/types";
import { cn } from "../../lib/utils";

/** Parte a frase traduzida no ponto marcado (um `{buraco}` ou um nome de produto)
 *  pra encaixar um link no meio dela sem picar a chave em duas. */
export function splitAt(text: string, mark: string): [string, string] {
  const i = text.indexOf(mark);
  return i < 0 ? [text, ""] : [text.slice(0, i), text.slice(i + mark.length)];
}

export function FilterChip({
  label,
  id,
  on,
  onClick,
}: {
  label: string;
  id: ChatPlatform;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md border-2 px-2.5 py-1 text-xs font-bold transition-colors",
        on
          ? "border-brass bg-brass/10 text-ink"
          : "border-border bg-surface text-ink-faint hover:text-ink-muted",
      )}
    >
      <PlatformGlyph id={id} size={14} /> {label}
    </button>
  );
}

/** Linha de opção: rótulo à esquerda, controle à direita. */
export function OptRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-xs font-semibold text-ink-muted">
        {label}
      </span>
      {children}
    </div>
  );
}

export function ToggleRow({
  icon: Icon,
  label,
  hint,
  checked,
  onChange,
}: {
  icon: typeof Smile;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  // A dica é texto visível (não `title`): teclado e leitor de tela também recebem.
  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-surface-2 px-2.5 py-2">
      <span className="flex min-w-0 items-center gap-2">
        <Icon className="size-4 shrink-0 text-brass" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold text-ink-muted">
            {label}
          </span>
          {hint && (
            <span className="text-[11px] leading-snug text-ink-faint">
              {hint}
            </span>
          )}
        </span>
      </span>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

// Linha de login OAuth: abre o navegador e acompanha device flow ou callback loopback.
/** Passo numerado do fluxo de login (bolinha com o número). */
export function StepNum({ n }: { n: number }) {
  return (
    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brass text-[11px] font-extrabold text-brass-ink">
      {n}
    </span>
  );
}
