"use client";

import { useEffect, useRef, useState } from "react";

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
 * `true` enquanto o elemento está VISÍVEL na tela e a aba em primeiro plano.
 *
 * Animações por quadro devem retornar cedo quando este valor for falso.
 */
export function useOnScreen(
  ref: React.RefObject<HTMLElement | null>,
  amount = 0.15,
) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let visible = false;
    const sync = () => setOn(visible && !document.hidden);
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        sync();
      },
      { threshold: amount },
    );
    io.observe(el);
    document.addEventListener("visibilitychange", sync);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [ref, amount]);
  return on;
}

/**
 * Roda `fn` a cada `ms` — mas só enquanto o elemento está VISÍVEL na tela e a
 * aba está em primeiro plano.
 *
 * Para conteúdo discreto, não animação contínua; esta usa MotionValue.
 * `paused` interrompe trocas durante hover/foco para preservar a leitura.
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
