import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { useToasts, type ToastKind } from "../lib/toast";

const ICON: Record<ToastKind, typeof Info> = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
};
const ACCENT: Record<ToastKind, string> = {
  success: "text-ok",
  error: "text-bad",
  info: "text-info",
};
const STRIPE: Record<ToastKind, string> = {
  success: "border-l-ok",
  error: "border-l-bad",
  info: "border-l-info",
};

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);

  return (
    <div
      role="region"
      aria-label="Avisos"
      aria-live="polite"
      className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-80 flex-col gap-2"
    >
      <AnimatePresence>
        {toasts.map((t) => {
          const Icon = ICON[t.kind];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 40, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className={`pointer-events-auto flex items-start gap-3 rounded-md border-l-4 bg-surface-2 pop p-3.5 ${STRIPE[t.kind]}`}
            >
              <Icon className={`mt-0.5 size-5 shrink-0 ${ACCENT[t.kind]}`} />
              <p className="flex-1 text-sm text-ink">{t.message}</p>
              {t.action && (
                <button
                  onClick={() => {
                    t.action?.onClick();
                    dismiss(t.id);
                  }}
                  className="shrink-0 font-display text-xs font-extrabold uppercase text-brass hover:underline"
                >
                  {t.action.label}
                </button>
              )}
              <button onClick={() => dismiss(t.id)} className="text-ink-faint hover:text-ink">
                <X className="size-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
