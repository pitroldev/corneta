import { useRef, type ReactNode, type RefObject } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "../lib/utils";

// Portaled poppers are outside the dialog DOM but must not dismiss it.
function fromRadixPopper(target: EventTarget | null): boolean {
  const el = target as Element | null;
  return !!el?.closest?.("[data-radix-popper-content-wrapper]");
}

/** lockOutside blocks outside clicks and Escape. Preserve the opening focus target when no Dialog.Trigger exists. */
export function Modal({
  title,
  onClose,
  children,
  className,
  lockOutside = false,
  initialFocusRef,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  lockOutside?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
}) {
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-night/80 data-[state=open]:animate-[overlay-in_120ms_ease-out]" />
        <Dialog.Content
          aria-describedby={undefined}
          onPointerDownOutside={(e) => {
            if (fromRadixPopper(e.detail.originalEvent.target) || lockOutside)
              e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (fromRadixPopper(e.detail.originalEvent.target) || lockOutside)
              e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (lockOutside) e.preventDefault();
          }}
          onOpenAutoFocus={(e) => {
            const active = document.activeElement;
            returnFocus.current =
              active instanceof HTMLElement && active !== document.body
                ? active
                : null;
            const el = initialFocusRef?.current;
            if (!el) return;
            e.preventDefault();
            el.focus();
          }}
          onCloseAutoFocus={(e) => {
            const el = returnFocus.current;
            if (!el?.isConnected) return;
            e.preventDefault();
            el.focus({ preventScroll: true });
          }}
          className={cn(
            "fixed left-1/2 top-1/2 z-[90] max-h-[90vh] w-[calc(100%-3rem)] -translate-x-1/2 -translate-y-1/2 overscroll-contain overflow-y-auto outline-none",
            "data-[state=open]:animate-[modal-in_150ms_ease-out]",
            className,
          )}
        >
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
