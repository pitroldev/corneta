import { useEffect, useState } from "react";

export interface Confirm {
  /** True from the first click until it times out, is confirmed or is reset. */
  armed: boolean;
  /** Arms on the first call; returns true only when an armed confirmation is accepted. */
  confirm(): boolean;
  disarm(): void;
}

/**
 * One timer per confirmation: arming again clears the previous timer, so an old timeout can never
 * disarm a newer confirmation early.
 */
export function createConfirm(
  ms: number,
  onArmedChange: (armed: boolean) => void,
  {
    minDelayMs = 0,
    now = Date.now,
  }: { minDelayMs?: number; now?: () => number } = {},
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let armedAt = 0;
  let armed = false;
  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const set = (next: boolean) => {
    if (armed === next) return;
    armed = next;
    onArmedChange(next);
  };
  return {
    confirm(): boolean {
      if (!armed) {
        clear();
        armedAt = now();
        set(true);
        timer = setTimeout(() => {
          timer = null;
          set(false);
        }, ms);
        return false;
      }
      // A pause between clicks keeps an accidental double-click from confirming.
      if (now() - armedAt < minDelayMs) return false;
      clear();
      set(false);
      return true;
    },
    disarm() {
      clear();
      set(false);
    },
  };
}

/** Two-step confirmation that disarms after `ms`, on unmount, and whenever `resetKey` changes. */
export function useConfirm(
  ms = 3000,
  { minDelayMs, resetKey }: { minDelayMs?: number; resetKey?: unknown } = {},
): Confirm {
  const [armed, setArmed] = useState(false);
  const [confirmer] = useState(() =>
    createConfirm(ms, setArmed, { minDelayMs }),
  );
  useEffect(() => confirmer.disarm, [confirmer]);
  useEffect(() => {
    confirmer.disarm();
  }, [confirmer, resetKey]);
  return { armed, confirm: confirmer.confirm, disarm: confirmer.disarm };
}
