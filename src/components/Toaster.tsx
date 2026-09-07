import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { useToasts, type ToastKind } from "../lib/toast";
import { useT } from "../lib/i18n";

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
  const t = useT();
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  const pause = useToasts((s) => s.pause);
  const resume = useToasts((s) => s.resume);

  return (
    <div
      role="region"
      aria-label={t("components.toaster.region.aria")}
      aria-live="polite"
      className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-80 flex-col gap-2"
    >
      <AnimatePresence>
        {toasts.map((item) => {
          const Icon = ICON[item.kind];
          return (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, x: 40, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              role={item.kind === "error" ? "alert" : undefined}
              // Pause dismissal while hovered or focused so actions remain reachable.
              onMouseEnter={() => pause(item.id)}
              onMouseLeave={() => resume(item.id)}
              onFocus={() => pause(item.id)}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) resume(item.id);
              }}
              className={`pointer-events-auto flex items-start gap-3 rounded-md border-l-4 bg-surface-2 pop p-3.5 ${STRIPE[item.kind]}`}
            >
              <Icon
                className={`mt-0.5 size-5 shrink-0 ${ACCENT[item.kind]}`}
                aria-hidden
              />
              <p className="flex-1 text-sm text-ink">{item.message}</p>
              {item.action && (
                <button
                  onClick={() => {
                    item.action?.onClick();
                    dismiss(item.id);
                  }}
                  className="shrink-0 font-display text-xs font-extrabold uppercase text-brass hover:underline"
                >
                  {item.action.label}
                </button>
              )}
              <button
                aria-label={t("components.toaster.dismiss.aria")}
                onClick={() => dismiss(item.id)}
                className="-m-1 grid size-6 shrink-0 place-items-center text-ink-faint hover:text-ink"
              >
                <X className="size-4" aria-hidden />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
