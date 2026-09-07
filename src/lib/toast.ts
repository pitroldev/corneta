import { create } from "zustand";

export type ToastKind = "success" | "error" | "info";
export interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
  action?: { label: string; onClick: () => void };
}

interface ToastState {
  toasts: ToastItem[];
  push: (
    kind: ToastKind,
    message: string,
    action?: ToastItem["action"],
    duration?: number,
  ) => void;
  dismiss: (id: string) => void;
  pause: (id: string) => void;
  resume: (id: string) => void;
}

/** Keep timers outside reactive state so pause and resume do not rerender. */
interface Clock {
  handle: ReturnType<typeof setTimeout> | null;
  endsAt: number;
  left: number;
}
const clocks = new Map<string, Clock>();
/** After resume, retain enough time to reach the toast action. */
const RESUME_MIN_MS = 1500;

export const useToasts = create<ToastState>((set) => {
  const remove = (id: string) => {
    clocks.delete(id);
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  };
  const arm = (id: string, ms: number) => {
    clocks.set(id, {
      handle: setTimeout(() => remove(id), ms),
      endsAt: Date.now() + ms,
      left: ms,
    });
  };
  return {
    toasts: [],
    push: (kind, message, action, duration = 3400) => {
      const id = Math.random().toString(36).slice(2);
      set((s) => ({ toasts: [...s.toasts, { id, kind, message, action }] }));
      arm(id, duration);
    },
    dismiss: (id) => {
      const clock = clocks.get(id);
      if (clock?.handle) clearTimeout(clock.handle);
      remove(id);
    },
    pause: (id) => {
      const clock = clocks.get(id);
      if (!clock?.handle) return;
      clearTimeout(clock.handle);
      clock.handle = null;
      clock.left = Math.max(clock.endsAt - Date.now(), 0);
    },
    resume: (id) => {
      const clock = clocks.get(id);
      if (!clock || clock.handle) return;
      arm(id, Math.max(clock.left, RESUME_MIN_MS));
    },
  };
});

export const toast = {
  success: (m: string) => useToasts.getState().push("success", m),
  error: (m: string) =>
    useToasts
      .getState()
      .push("error", m, undefined, m.length > 60 ? 10000 : 6000),
  info: (m: string) => useToasts.getState().push("info", m),
  action: (m: string, label: string, onClick: () => void) =>
    useToasts.getState().push("info", m, { label, onClick }, 6000),
  errorAction: (m: string, label: string, onClick: () => void) =>
    useToasts.getState().push("error", m, { label, onClick }, 15000),
};
