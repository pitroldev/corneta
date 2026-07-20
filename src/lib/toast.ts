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
}

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (kind, message, action, duration = 3400) => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { id, kind, message, action }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, duration);
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Atalho para disparar toasts de qualquer lugar (fora de componentes também). */
export const toast = {
  success: (m: string) => useToasts.getState().push("success", m),
  // Erro fica mais tempo na tela: instrução de correção precisa dar tempo de ler.
  error: (m: string) =>
    useToasts
      .getState()
      .push("error", m, undefined, m.length > 60 ? 10000 : 6000),
  info: (m: string) => useToasts.getState().push("info", m),
  /** Toast com botão de ação (ex.: "desfazer"), com tempo maior. */
  action: (m: string, label: string, onClick: () => void) =>
    useToasts.getState().push("info", m, { label, onClick }, 6000),
};
