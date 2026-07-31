"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "./ui";

// A mensagem sendo APAGADA, não já apagada.
//
// A seção "A galera junta" mostrava a quarta fala do chat com o risco já
// aplicado — o resultado, sem o ato. O que essa seção promete é justamente o
// ato: apagar de qualquer plataforma sem sair daqui. Vendo o risco atravessar a
// frase e ela apagar, o botão "apagar" logo acima deixa de ser enfeite.
//
// Por que NÃO é mais um chat rolando: o herói já faz mensagem chegando. Repetir
// aqui seria dizer duas vezes a mesma coisa e não dizer esta.
//
// Roda uma vez, quando o painel aparece. Com `prefers-reduced-motion` a
// mensagem já nasce apagada — que era o estado anterior desta peça, e continua
// contando o fato, só sem o gesto.

/** Espera antes de apagar: tempo de ler a frase inteira. Apagar antes disso
 *  esconderia justamente o que o exemplo quer mostrar (o que foi moderado). */
const DELAY_MS = 1500;

export function Moderated({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [gone, setGone] = useState(false);

  // Não há estado de "calma" aqui: o bloco global de `prefers-reduced-motion`
  // no globals.css já zera `transition-duration`. Quem pediu menos movimento vê
  // a mensagem virar apagada sem o traço correndo — que é o comportamento certo
  // (o FATO continua, o gesto some) e dispensa um segundo caminho de código.
  //
  // O `setState` mora dentro do timeout, nunca no corpo do efeito: mudar estado
  // de forma síncrona ali dispara renders em cascata, e o lint do projeto pega.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || timer) return;
        timer = setTimeout(() => setGone(true), DELAY_MS);
        io.disconnect();
      },
      { threshold: 0.9 },
    );
    io.observe(el);
    return () => {
      if (timer) clearTimeout(timer);
      io.disconnect();
    };
  }, []);

  return (
    <p
      ref={ref}
      className={cn(
        "relative w-fit transition-colors duration-500 ease-out",
        gone ? "text-faint-raised" : "text-cream",
        // O risco é um pseudo-elemento que CRESCE da esquerda, em vez do
        // `line-through`, que só liga e desliga. É a diferença entre a linha ser
        // desenhada e ela aparecer pronta.
        "after:absolute after:top-1/2 after:left-0 after:h-px after:w-full after:origin-left after:bg-current after:transition-transform after:duration-[420ms] after:ease-out after:content-['']",
        gone ? "after:scale-x-100" : "after:scale-x-0",
      )}
    >
      {children}
    </p>
  );
}
