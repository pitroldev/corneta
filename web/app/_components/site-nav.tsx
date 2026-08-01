"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CloseIcon, MenuIcon } from "./icons";
import { cn } from "./ui";

// ============================================================
// A navegação do site.
// ============================================================
// Antes: seis links que sumiam inteiros abaixo de 980px, sem nenhuma noção de
// lugar. Isso foi resolvido — o menu do celular e a marcação da seção atual (por
// observador de interseção) vieram daí e continuam aqui.
//
// O QUE ESTA REVISÃO CONSERTOU, tudo medido na tela:
//
//  1. A barra era torta. Entre o fim da marca e o primeiro link havia 278px de
//     nada, porque a navegação vinha com `ml-auto` e ia toda pro canto direito.
//     O resultado é que os seis links, a troca de idioma e o botão de baixar
//     disputavam o mesmo pedaço, com metade da barra vazia do outro lado.
//     Agora a navegação ocupa o MEIO e o vazio se divide nos dois lados.
//
//  2. O idioma agrupava com o botão errado. Ele ficava a 10px do "Baixar
//     grátis" e a 28px do último link — ou seja, aos olhos ele fazia parte da
//     ação de conversão, que é justamente o vizinho que um controle de
//     preferência não pode ter. Agora ele entra no grupo da navegação, separado
//     por um traço, e o CTA fica sozinho na direita.
//
//  3. Havia uma faixa morta de ~120px de largura. O ponto de virada pro menu
//     estava em 980px, mas o conteúdo da barra precisa de ~1030px pra caber.
//     Entre 980 e 1100 a barra ficava montada e espremida: "Por que", "Chat e
//     alertas" e o próprio "Baixar grátis" quebravam em DUAS LINHAS. O ponto de
//     virada subiu pra 1100px, que é onde a barra realmente cabe.
//
// O 1100 aparece literal em quatro lugares (aqui e no cabeçalho) porque o
// Tailwind só gera classe escrita por extenso — classe montada por variável não
// existe no CSS final. Mexeu num, mexe nos quatro.
//
// A copy chega RESOLVIDA: função não atravessa a fronteira servidor→cliente —
// e é por isso que a troca de idioma entra como dois `ReactNode` prontos, um
// pra barra e outro pra folha, em vez de um render prop.

export interface NavItem {
  /** Id da seção, sem `#`. É a âncora E a chave do observador. */
  id: string;
  label: string;
}

export interface SiteNavCopy {
  aria: string;
  open: string;
  close: string;
  items: NavItem[];
}

/** O sublinhado cresce da esquerda no hover e recolhe pela direita ao sair — o
 *  `transform-origin` inverte entre os dois estados, que é o truque que faz o
 *  traço parecer "voltar" em vez de piscar. */
const LINK =
  "relative py-2 transition-colors duration-150 " +
  "after:absolute after:inset-x-0 after:bottom-0.5 after:h-[3px] after:origin-right after:scale-x-0 after:bg-brass after:transition-transform after:duration-140 after:content-[''] " +
  "hover:after:origin-left hover:after:scale-x-100";

/**
 * Qual seção está na tela.
 *
 * A faixa de leitura é a parte de CIMA da janela (`-45%` embaixo): é lá que o
 * olho está quando se rola. Sem isso, a seção seguinte assumia assim que
 * encostava na borda inferior, e a marca ficava um passo à frente da leitura.
 */
function useCurrentSection(ids: string[]) {
  const [current, setCurrent] = useState<string | null>(null);
  // A dependência é a lista ACHATADA, não o array: um array literal é novo a
  // cada render e refaria o observador sem parar. A chave só muda quando os ids
  // mudam de verdade.
  const key = ids.join(",");

  useEffect(() => {
    const list = key.split(",");
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        // A PRIMEIRA da ordem do documento entre as visíveis: com duas seções na
        // faixa, quem manda é a de cima — a que a pessoa está terminando de ler.
        setCurrent(list.find((id) => seen.get(id)) ?? null);
      },
      { rootMargin: "-20% 0px -45% 0px" },
    );
    for (const id of list) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [key]);

  return current;
}

export function SiteNav({
  copy,
  localeBar,
  localeSheet,
}: {
  copy: SiteNavCopy;
  /** Troca de idioma compacta, ao lado dos links. */
  localeBar: React.ReactNode;
  /** A mesma troca em alvo de dedo, no rodapé da folha do celular. */
  localeSheet: React.ReactNode;
}) {
  const reduce = useReducedMotion() ?? false;
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const current = useCurrentSection(copy.items.map((i) => i.id));

  // Fechar no Esc e no clique fora. Um menu que só fecha no próprio botão é uma
  // armadilha em tela pequena, onde ele cobre a página inteira.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div ref={box} className="contents">
      <div className="flex flex-1 items-center justify-center gap-5 max-[1100px]:hidden">
        <nav
          className="flex items-center gap-6.5 text-[0.88rem] font-[650] whitespace-nowrap text-muted"
          aria-label={copy.aria}
        >
          {copy.items.map((item) => {
            const on = current === item.id;
            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                aria-current={on ? "location" : undefined}
                className={cn(
                  LINK,
                  "hover:text-cream",
                  // A seção atual fica com o traço aceso e a tinta cheia. É o
                  // mesmo sublinhado do hover, então não há vocabulário novo — só
                  // um estado a mais para ele.
                  on && "text-cream after:origin-left after:scale-x-100",
                )}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        {/* O traço faz o trabalho que a distância sozinha não faz: sem ele,
            "English" ao lado de "Dúvidas" lê como um sétimo link de seção. */}
        <span aria-hidden="true" className="h-5 w-px shrink-0 bg-border-soft" />
        {localeBar}
      </div>

      {/* --- celular: o botão do menu ---
           `ml-auto` continua porque abaixo de 1100 o bloco do meio some do
           fluxo, e sem ele o botão ficaria solto no vão entre marca e CTA. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="menu-do-site"
        aria-label={open ? copy.close : copy.open}
        className={cn(
          "ml-auto hidden size-11 shrink-0 cursor-pointer place-items-center rounded-md text-muted max-[1100px]:grid",
          "outline-offset-2 transition-colors duration-150 hover:bg-surface-2 hover:text-cream focus-visible:outline-[3px] focus-visible:outline-brass",
          "[&>svg]:h-[22px] [&>svg]:w-[22px]",
          open && "bg-surface-2 text-cream",
        )}
      >
        {open ? <CloseIcon /> : <MenuIcon />}
      </button>

      {/* --- a folha --- */}
      <AnimatePresence>
        {open && (
          <motion.div
            id="menu-do-site"
            initial={reduce ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8, transition: { duration: 0.14 } }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-x-0 top-full hidden border-b border-border-soft bg-night shadow-pop-lg max-[1100px]:block"
          >
            <nav
              aria-label={copy.aria}
              className="mx-auto flex w-[min(calc(100%-2rem),560px)] flex-col py-2"
            >
              {copy.items.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={() => setOpen(false)}
                  aria-current={current === item.id ? "location" : undefined}
                  className={cn(
                    "flex min-h-12 items-center rounded-md px-3 font-display text-[1.02rem] font-bold text-muted",
                    "outline-offset-2 transition-colors duration-150 hover:bg-surface-2 hover:text-cream focus-visible:outline-[3px] focus-visible:outline-brass",
                    current === item.id &&
                      "bg-surface-2 text-cream shadow-[inset_3px_0_0_0_var(--brass)]",
                  )}
                >
                  {item.label}
                </a>
              ))}

              <div className="mt-2 flex items-center justify-between gap-3 border-t border-border-soft pt-3 pb-1">
                {localeSheet}
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
