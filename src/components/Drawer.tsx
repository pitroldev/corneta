import { useRef, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../lib/utils";
import { useT } from "../lib/i18n";

// Portaled poppers (selects, tooltips) live outside the sheet but must not close it.
function fromRadixPopper(target: EventTarget | null): boolean {
  const el = target as Element | null;
  return !!el?.closest?.("[data-radix-popper-content-wrapper]");
}

/** Side sheet for details that belong to the current screen; Escape and the backdrop close it. */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const t = useT();
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-night/60 data-[state=open]:animate-[overlay-in_140ms_ease-out]" />
        <Dialog.Content
          aria-describedby={undefined}
          onPointerDownOutside={(e) => {
            if (fromRadixPopper(e.detail.originalEvent.target))
              e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (fromRadixPopper(e.detail.originalEvent.target))
              e.preventDefault();
          }}
          onOpenAutoFocus={() => {
            const active = document.activeElement;
            returnFocus.current =
              active instanceof HTMLElement && active !== document.body
                ? active
                : null;
          }}
          onCloseAutoFocus={(e) => {
            const el = returnFocus.current;
            if (!el?.isConnected) return;
            e.preventDefault();
            el.focus({ preventScroll: true });
          }}
          className={cn(
            "drawer-sheet fixed inset-y-0 right-0 z-[80] flex w-[26rem] max-w-[calc(100%-3rem)] flex-col border-l-2 border-border bg-surface outline-none",
            "data-[state=open]:animate-[drawer-in_200ms_cubic-bezier(0.2,0.8,0.2,1)]",
            className,
          )}
        >
          <div className="flex items-start gap-3 border-b border-border-soft px-5 pb-4 pt-5">
            {icon && (
              <span className="grid size-10 shrink-0 -rotate-3 place-items-center rounded-md bg-brass text-brass-ink pop-sm">
                {icon}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <Dialog.Title className="font-display text-xl font-extrabold leading-tight">
                {title}
              </Dialog.Title>
              {subtitle && (
                <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>
              )}
            </div>
            <Dialog.Close
              aria-label={t("components.drawer.close")}
              className="grid size-8 shrink-0 place-items-center rounded-md text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            {children}
          </div>
          {footer && (
            <div className="border-t border-border-soft px-5 py-3.5">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
