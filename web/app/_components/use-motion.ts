"use client";

import { useEffect, useRef, useState } from "react";

// Start motion-free until the client's reduced-motion preference is known.
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

// Background tabs and off-screen demonstrations must not run animation loops.
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

// Use discrete ticks for content; per-frame visuals belong in MotionValues.
export function useHeartbeat(
  ref: React.RefObject<HTMLElement | null>,
  ms: number,
  on: boolean,
  fn: () => void,
  paused = false,
) {
  // Refresh the callback after commit, not during render; keep the interval stable.
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
