"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

// Abas do "chat unificado" e da "mesa de qualidade".
//
// Substitui a versão em CSS puro, que funcionava com radios escondidos e pares
// de seletor por ID (`#hub-chat:checked ~ .switch-tabs [for="hub-chat"]`). Aquilo
// não escalava: cada aba nova exigia editar três listas de seletor no
// globals.css, e o componente ficava amarrado a IDs globais — dois switches na
// mesma página só não colidiam porque os nomes foram escolhidos à mão.
//
// O que se ganha além de sumir com o CSS: a faixa de latão agora DESLIZA entre
// as abas (layoutId), em vez de piscar de uma pra outra, e o painel entra com
// transição em vez de trocar de `display`.
//
// O que se perde, e é honesto registrar: isto é um client component. Antes as
// abas respondiam sem JavaScript nenhum, inclusive antes da hidratação.

export interface SwitchItem {
  id: string;
  title: string;
  hint: string;
  panel: ReactNode;
}

export function Switch({
  items,
  label,
}: {
  items: SwitchItem[];
  label: string;
}) {
  const [active, setActive] = useState(items[0]!.id);
  const group = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  // Os radios davam navegação por seta de graça; o padrão de tablist precisa
  // implementar, senão o teclado regride em relação ao que existia.
  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const delta =
      e.key === "ArrowRight"
        ? 1
        : e.key === "ArrowLeft"
          ? -1
          : e.key === "Home"
            ? -index
            : e.key === "End"
              ? items.length - 1 - index
              : 0;
    if (delta === 0) return;
    e.preventDefault();
    const next = (index + delta + items.length) % items.length;
    setActive(items[next]!.id);
    tabs.current[next]?.focus();
  };

  const current = items.find((i) => i.id === active) ?? items[0]!;

  return (
    <div className="relative">
      <div
        role="tablist"
        aria-label={label}
        className="mb-5.5 flex flex-wrap gap-2.25"
      >
        {items.map((item, i) => {
          const on = item.id === active;
          return (
            <button
              key={item.id}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              role="tab"
              id={`${group}-tab-${item.id}`}
              aria-selected={on}
              aria-controls={`${group}-panel-${item.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => setActive(item.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={[
                "relative cursor-pointer rounded-md px-3.75 py-2.5 text-left max-[760px]:px-3 max-[760px]:py-2",
                "outline-offset-[3px] focus-visible:outline-[3px] focus-visible:outline-brass",
                on
                  ? "text-brass-ink"
                  : "bg-surface-2 text-muted hover:bg-surface-3 hover:text-cream",
              ].join(" ")}
            >
              {/* A faixa desliza entre as abas. Ela vem ANTES do texto no DOM e
                  os dois são posicionados, então o texto pinta por cima sem
                  precisar de z-index negativo — que jogaria o latão pra trás do
                  fundo da página e deixaria tinta escura sobre escuro. */}
              {on && (
                <motion.span
                  layoutId={`${group}-active`}
                  className="absolute inset-0 rounded-md bg-brass shadow-pop-brass"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative block font-display text-[1.05rem] leading-[1.1] font-bold max-[760px]:text-[0.94rem]">
                {item.title}
              </span>
              <span className="relative mt-0.5 block text-[0.66rem] font-extrabold uppercase tracking-[0.08em] opacity-75">
                {item.hint}
              </span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={current.id}
          role="tabpanel"
          id={`${group}-panel-${current.id}`}
          aria-labelledby={`${group}-tab-${current.id}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
        >
          {current.panel}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
