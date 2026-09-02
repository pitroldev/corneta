import { type ButtonHTMLAttributes, type ReactNode, useState } from "react";
import * as Switch from "@radix-ui/react-switch";
import { Check, Copy, FlaskConical, Globe, Info, Loader2 } from "lucide-react";
import {
  siTwitch,
  siYoutube,
  siFacebook,
  siKick,
  siTiktok,
  siX,
  siInstagram,
} from "simple-icons";
import { cn, readableOn } from "../lib/utils";
import { useT } from "../lib/i18n";
import { PLATFORMS } from "../lib/platforms";
import type { ChatPlatform, PlatformId } from "../lib/types";
import { Mascot } from "./decor";
import { Tooltip } from "./Tooltip";

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
// "tomate" é o nome canônico do botão de ação (bloco tomate, sombra dura).
// "pop" segue como alias retrocompatível — a utility `.pop` é a sombra, não a variante.
type Variant =
  "primary" | "tomate" | "pop" | "ghost" | "outline" | "danger" | "subtle";
type Size = "sm" | "md" | "lg";

// Tinta night sobre tomate: ≈6:1 no breu (branco dava 3,1:1 — e BORA AO VIVO em
// 18px bold não conta como texto grande). No papel o index.css troca por branco.
const TOMATE =
  "bg-tomate text-night hover:bg-tomate-strong pop active:translate-x-1 active:translate-y-1 active:shadow-none font-display font-bold";
const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brass text-brass-ink hover:bg-brass-strong pop-brass active:translate-x-1 active:translate-y-1 active:shadow-none font-display font-bold",
  tomate: TOMATE,
  pop: TOMATE,
  ghost: "text-ink-muted hover:text-ink hover:bg-surface-2",
  outline: "border-2 border-border text-ink hover:border-brass",
  danger:
    "bg-bad/15 text-bad hover:bg-bad/25 border-2 border-bad/40 font-display font-bold",
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
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}) {
  return (
    <button
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      // `cursor-not-allowed` em vez de `pointer-events-none`: com pointer-events
      // zerado o `title` (motivo do bloqueio) nunca abria no hover.
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap transition duration-75 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading && (
        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
      )}
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
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

// ---------------- Badge (adesivo) ----------------
// Texto de 11px bold pede 4,5:1: night sobre bad/live dá ≈7:1 no breu (branco dava
// 3:1). No papel o index.css troca a night por branco nesses blocos.
type BadgeTone = "ok" | "warn" | "bad" | "live" | "brass" | "neutral";
const BADGE_TONES: Record<BadgeTone, string> = {
  ok: "bg-ok text-night",
  warn: "bg-warn text-night",
  bad: "bg-bad text-night",
  live: "bg-live text-night",
  brass: "bg-brass text-brass-ink",
  neutral: "bg-surface-3 text-ink-muted",
};

export function Badge({
  children,
  className,
  color,
  tone,
}: {
  children: ReactNode;
  className?: string;
  color?: string;
  tone?: BadgeTone;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide",
        tone && BADGE_TONES[tone],
        className,
      )}
      style={
        color ? { backgroundColor: color, color: readableOn(color) } : undefined
      }
    >
      {children}
    </span>
  );
}

// ---------------- Experimental (adesivo de feature beta) ----------------
// Selo de gibi torto com frasco — sinaliza "ainda em teste, pode falhar/mudar".
// A explicação chega ao leitor de tela como texto (sr-only) e ao mouse pelo title.
// `interactive` troca o span por um botão que abre a explicação no foco e no hover
// (Tooltip do kit) — só fora de outro botão: nos pickers de plataforma o selo fica
// DENTRO de um <button>, e HTML não aceita botão em botão.
export function ExperimentalBadge({
  className,
  interactive = false,
  size = "sm",
}: {
  className?: string;
  interactive?: boolean;
  /** `icon` é só o frasco, pra linha de texto corrido (a lista de proteções do Ao vivo):
   *  a palavra fica no `title` e no leitor de tela, pra não brigar com o nome ao lado. */
  size?: "sm" | "icon";
}) {
  const t = useT();
  const label = t("components.ui.experimental.label");
  const title = t("components.ui.experimental.title");
  const iconOnly = size === "icon";
  const cls = cn(
    "inline-flex shrink-0 items-center bg-tomate text-night",
    iconOnly
      ? "size-4 justify-center rounded-xs"
      : "-rotate-2 gap-1 rounded-sm px-1.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider pop-sm",
    className,
  );
  const inner = (
    <>
      <FlaskConical className="size-3" strokeWidth={2.6} aria-hidden />
      {iconOnly ? null : <> {label}</>}
    </>
  );
  // Sem a palavra na tela, ela precisa ir inteira pro leitor de tela e pro title.
  const spoken = iconOnly ? `${label} — ${title}` : ` — ${title}`;
  if (interactive) {
    return (
      <Tooltip content={title}>
        <button type="button" className={cn(cls, "cursor-help")}>
          {inner}
        </button>
      </Tooltip>
    );
  }
  return (
    <span title={iconOnly ? spoken : title} className={cls}>
      {inner}
      <span className="sr-only">{spoken}</span>
    </span>
  );
}

// ---------------- Toggle / Switch ----------------
export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <Switch.Root
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "inline-flex h-6 w-11 shrink-0 items-center rounded-md px-1 transition-colors",
        "bg-surface-3 data-[state=checked]:bg-brass",
        "disabled:pointer-events-none disabled:opacity-40",
      )}
    >
      <Switch.Thumb
        className={cn(
          "block size-4 rounded-[4px] bg-ink-faint transition-transform",
          "data-[state=checked]:translate-x-5 data-[state=checked]:bg-brass-ink",
        )}
      />
    </Switch.Root>
  );
}

// ---------------- Platform glyph (logo oficial em chip de marca) ----------------
export function PlatformGlyph({
  id,
  size = 44,
}: {
  id: PlatformId | ChatPlatform;
  size?: number;
}) {
  // Cinefy é uma fonte de chat, não um destino RTMP: sua marca vive nesta borda
  // visual sem contaminar o catálogo de plataformas de transmissão.
  const isCinefy = id === "cinefy";
  const preset = isCinefy ? undefined : PLATFORMS[id as PlatformId];
  // Configs antigas ou editadas à mão podem trazer um identificador desconhecido.
  // O glyph vira neutro em vez de derrubar toda a tela tentando ler `.color` de undefined.
  const color = isCinefy ? "#FFD200" : (preset?.color ?? "#64748B");
  const fg = readableOn(color);
  const path = isCinefy
    ? "M8 5.14v13.72L19 12 8 5.14z"
    : PLATFORM_ICON[id as PlatformId];
  const glyph = size * 0.52;
  return (
    <div
      className="grid shrink-0 place-items-center rounded-md pop-sm"
      style={{ width: size, height: size, backgroundColor: color }}
    >
      {path ? (
        <svg
          viewBox="0 0 24 24"
          width={glyph}
          height={glyph}
          fill={fg}
          aria-hidden
        >
          <path d={path} />
        </svg>
      ) : (
        <Globe
          width={glyph}
          height={glyph}
          style={{ color: fg }}
          strokeWidth={2.4}
        />
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
        {subtitle && (
          <p className="mt-2 max-w-xl text-sm text-ink-muted">{subtitle}</p>
        )}
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
    tone === "ok"
      ? "text-ok"
      : tone === "warn"
        ? "text-warn"
        : tone === "bad"
          ? "text-bad"
          : "text-ink";
  return (
    <div className="rounded-md border-t-2 border-brass/50 bg-surface-2 px-4 py-3">
      <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-display text-2xl font-extrabold tabular-nums",
          toneColor,
        )}
      >
        {value}
      </div>
      {hint && <div className="text-xs text-ink-faint">{hint}</div>}
    </div>
  );
}

// ---------------- Hint (tooltip didático) ----------------
// Gatilho focável: abre no hover E no foco/tap (teclado também vê). Usa o Tooltip
// (tokens, sem hex fixo) pra não quebrar no tema claro. O nome do botão é a própria
// dica: o leitor de tela recebe o texto ao focar, em vez de ouvir um "Ajuda"
// genérico três vezes na mesma tela.
export function Hint({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <Tooltip content={text}>
      <button
        type="button"
        aria-label={text}
        className={cn(
          "inline-flex cursor-help align-middle text-ink-faint transition-colors hover:text-ink",
          className,
        )}
      >
        <Info className="size-3.5" aria-hidden />
      </button>
    </Tooltip>
  );
}

// ---------------- Text input ----------------
export function Input({
  className,
  invalid,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        "h-10 w-full rounded-md border-2 border-border bg-surface-2 px-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-brass disabled:cursor-not-allowed disabled:opacity-50",
        invalid && "border-bad focus:border-bad",
        className,
      )}
      {...rest}
    />
  );
}

// ---------------- CopyField (valor copiável com 1 clique) ----------------
// Feedback é inline no próprio botão — sem toast duplicado.
export function CopyField({
  label,
  value,
  mono,
  className,
}: {
  label?: string;
  value: string;
  mono?: boolean;
  className?: string;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* área de transferência bloqueada */
    }
  };
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {label && (
        <div className="w-40 shrink-0 text-xs font-bold uppercase tracking-wide text-ink-faint">
          {label}
        </div>
      )}
      <div
        data-selectable
        className={cn(
          "min-w-0 flex-1 truncate rounded-md bg-surface px-3 py-2 text-sm",
          mono && "font-mono",
        )}
      >
        {value}
      </div>
      <Button
        variant="subtle"
        size="sm"
        onClick={copy}
        // Duas chaves em vez de concatenar "Copiar" + rótulo: em outros idiomas
        // a ordem das palavras muda, e a frase montada no código sairia torta.
        aria-label={
          label
            ? t("components.ui.copy.aria", { label })
            : t("components.ui.copy")
        }
      >
        {copied ? (
          <Check className="size-4 text-ok" />
        ) : (
          <Copy className="size-4" />
        )}
        {copied ? t("components.ui.copied") : t("components.ui.copy")}
      </Button>
    </div>
  );
}

// ---------------- EmptyState (palco vazio com mascote) ----------------
// Estado vazio on-brand: bloco sólido com sombra dura, mascote e CTA. Centraliza
// o padrão que telas vazias improvisavam (Plataformas/Relatórios).
export function EmptyState({
  title,
  children,
  action,
  className,
}: {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl bg-surface px-6 py-12 text-center pop",
        className,
      )}
    >
      <div className="mx-auto mb-4 grid size-16 -rotate-3 place-items-center rounded-lg bg-brass text-brass-ink pop-brass">
        <Mascot className="size-9 animate-shout" />
      </div>
      <h3 className="text-2xl">{title}</h3>
      {children && (
        <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">
          {children}
        </p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
