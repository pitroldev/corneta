"use client";

import { useEffect, useRef, useState } from "react";

// Ferramentas de movimento compartilhadas pelas duas peças animadas da LP: a
// janela do herói (dado em tempo real) e o replay do relatório (playback).
//
// Estavam dentro da janela do herói; saíram daqui porque a regra que elas
// carregam vale pras duas — e mais ainda pra segunda, que fica no meio da
// página e passa a maior parte do tempo fora da tela.

/** `true` quando a pessoa pediu menos movimento no sistema.
 *
 *  Começa em `true`: o servidor não tem como saber a preferência, e nascer
 *  parado significa que quem pediu calma nunca vê um quadro de animação antes
 *  da hidratação. */
export function useCalm() {
  const [calm, setCalm] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setCalm(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return calm;
}

/**
 * Roda `fn` a cada `ms` — mas só enquanto o elemento está VISÍVEL na tela e a
 * aba está em primeiro plano.
 *
 * Um laço decorativo não pode gastar bateria de quem deixou a página aberta
 * numa segunda janela, e a peça do relatório fica fora da tela na maior parte
 * da visita. `paused` é o freio de mão: hover e foco usam ele pra não trocar o
 * conteúdo debaixo de quem está lendo.
 */
export function useHeartbeat(
  ref: React.RefObject<HTMLElement | null>,
  ms: number,
  on: boolean,
  fn: () => void,
  paused = false,
) {
  // O callback vive num ref pra o intervalo não ser recriado a cada tique (a
  // `fn` é nova a cada render). A escrita fica num efeito: mexer em ref durante
  // o render é o que faz o React perder atualização em modo concorrente.
  const saved = useRef(fn);
  useEffect(() => {
    saved.current = fn;
  });

  useEffect(() => {
    const el = ref.current;
    if (!on || paused || !el) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    let visible = false;

    const start = () => {
      if (timer == null && visible && !document.hidden) {
        timer = setInterval(() => saved.current(), ms);
      }
    };
    const stop = () => {
      if (timer != null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const sync = () => (visible && !document.hidden ? start() : stop());

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        sync();
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    document.addEventListener("visibilitychange", sync);
    return () => {
      stop();
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [ref, ms, on, paused]);
}
