import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../lib/utils";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

/**
 * Combobox on-brand (padrão ARIA 1.2 com aria-activedescendant): teclado completo
 * — setas/Home/End, Enter/Espaço, Esc e typeahead — sem roubar o foco do gatilho.
 */
export function Select<T extends string>({
  value,
  options,
  onChange,
  className,
  "aria-label": ariaLabel,
}: {
  value: T;
  options: SelectOption<T>[];
  onChange: (v: T) => void;
  className?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const typed = useRef<{ buf: string; t: number }>({ buf: "", t: 0 });
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optId = (i: number) => `${baseId}-opt-${i}`;

  const foundIndex = options.findIndex((o) => o.value === value);
  const selectedIndex = Math.max(0, foundIndex);
  const current = foundIndex >= 0 ? options[foundIndex] : undefined;

  const openMenu = () => {
    setActive(selectedIndex);
    setOpen(true);
  };
  const close = (focusBtn = true) => {
    setOpen(false);
    if (focusBtn) btnRef.current?.focus();
  };
  const choose = (i: number) => {
    const o = options[i];
    if (o) onChange(o.value);
    close();
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDoc);
    return () => window.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Mantém o item ativo visível na rolagem.
  useEffect(() => {
    if (!open) return;
    document.getElementById(optId(active))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const k = e.key;
    if (!open) {
      if (k === "ArrowDown" || k === "ArrowUp" || k === "Enter" || k === " ") {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (k === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (k === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (k === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (k === "End") {
      e.preventDefault();
      setActive(options.length - 1);
    } else if (k === "Enter" || k === " ") {
      e.preventDefault();
      choose(active);
    } else if (k === "Escape") {
      e.preventDefault();
      close();
    } else if (k === "Tab") {
      setOpen(false);
    } else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = Date.now();
      const buf = now - typed.current.t < 600 ? typed.current.buf + k : k;
      typed.current = { buf, t: now };
      const lower = buf.toLowerCase();
      const idx = options.findIndex((o) => o.label.toLowerCase().startsWith(lower));
      if (idx >= 0) setActive(idx);
    }
  };

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        ref={btnRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? optId(active) : undefined}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-md border-2 border-border bg-surface-2 px-2.5 text-sm font-medium outline-none transition-colors hover:border-brass/60 focus:border-brass"
      >
        <span className="truncate">{current?.label ?? value}</span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-ink-faint transition-transform", open && "rotate-180")}
          strokeWidth={2.4}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            id={listId}
            aria-label={ariaLabel}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 z-40 mt-1 max-h-64 min-w-full overflow-auto rounded-md bg-surface-2 pop"
          >
            {options.map((o, i) => {
              const sel = o.value === value;
              const act = i === active;
              return (
                <div
                  key={o.value}
                  id={optId(i)}
                  role="option"
                  aria-selected={sel}
                  onClick={() => choose(i)}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "flex w-full cursor-pointer items-center justify-between gap-4 whitespace-nowrap px-3 py-2 text-left text-sm transition-colors",
                    act && "bg-surface-3",
                    sel ? "font-bold text-brass" : "text-ink",
                  )}
                >
                  {o.label}
                  {sel && <Check className="size-4 shrink-0" strokeWidth={2.6} />}
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
