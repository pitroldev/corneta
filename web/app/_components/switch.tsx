"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";

// Abas do "chat unificado" e da "mesa de qualidade".
//
// Substitui a versão em CSS puro, que funcionava com radios escondidos e pares
// de seletor por ID (`#hub-chat:checked ~ .switch-tabs [for="hub-chat"]`). Aquilo
// não escalava: cada aba nova exigia editar três listas de seletor no
// globals.css, e o componente ficava amarrado a IDs globais — dois switches na
// mesma página só não colidiam porque os nomes foram escolhidos à mão.
//
// A animação aqui é deliberadamente contida: transição de cor na aba e fade no
// painel, nada que mexa em layout. Uma versão anterior deslizava a faixa de
// latão entre as abas com `layoutId` — bonito, mas com dois defeitos reais que
// os comentários abaixo detalham.
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
                "cursor-pointer rounded-md px-3.75 py-2.5 text-left max-[760px]:px-3 max-[760px]:py-2",
                "transition-[background-color,color,box-shadow] duration-150 ease-out",
                "outline-offset-[3px] focus-visible:outline-[3px] focus-visible:outline-brass",
                on
                  ? "bg-brass text-brass-ink shadow-pop-brass"
                  : "bg-surface-2 text-muted hover:bg-surface-3 hover:text-cream",
              ].join(" ")}
            >
              {/* O latão é fundo do PRÓPRIO botão, não uma faixa que desliza por
                  cima com layoutId. A faixa era mais bonita, mas durante o voo
                  de ~250ms o texto da aba recém-ativa (tinta escura) ficava sem
                  latão embaixo — 1.18:1, ilegível, num piscar a cada clique.
                  Fundo direto com transição de cor não tem esse buraco. */}
              <span className="block font-display text-[1.05rem] leading-[1.1] font-bold max-[760px]:text-[0.94rem]">
                {item.title}
              </span>
              <span className="mt-0.5 block text-[0.66rem] font-extrabold tracking-[0.08em] uppercase opacity-75">
                {item.hint}
              </span>
            </button>
          );
        })}
      </div>

      {/* SEM AnimatePresence de propósito.
          Com `mode="wait"` o painel antigo desmontava, o container colapsava
          pra zero e só então o novo montava — tudo abaixo da seção pulava pra
          cima e voltava a cada troca de aba. Trocando o painel direto, a
          mudança de altura acontece uma vez só, e a entrada é só opacidade:
          nada de `y`, que somava um solavanco por cima do salto. */}
      <motion.div
        key={current.id}
        role="tabpanel"
        id={`${group}-panel-${current.id}`}
        aria-labelledby={`${group}-tab-${current.id}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.14, ease: "easeOut" }}
      >
        {current.panel}
      </motion.div>
    </div>
  );
}
