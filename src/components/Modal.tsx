import type { ReactNode, RefObject } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "../lib/utils";

// Cliques num popper portalado (Select/Dropdown/Tooltip) ficam FORA do DOM do Dialog,
// mas são "dentro" pra UX — não podem fechar o modal nem cancelar a seleção.
function fromRadixPopper(target: EventTarget | null): boolean {
  const el = target as Element | null;
  return !!el?.closest?.("[data-radix-popper-content-wrapper]");
}

/**
 * Modal on-brand via Radix Dialog: overlay, foco preso, Esc, trava de scroll e
 * portal — a11y de graça. O visual (bloco sólido, sombra dura) continua nosso.
 * `title` vira o nome acessível (Dialog.Title sr-only); o título visível segue
 * dentro de `children`. `lockOutside` bloqueia o fechar-clicando-fora e o Esc.
 * `initialFocusRef` escolhe onde o foco cai ao abrir — sem ele o Radix foca o
 * primeiro focável, que em modais com X no canto é justamente o botão de fechar.
 */
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
            const el = initialFocusRef?.current;
            if (!el) return;
            e.preventDefault();
            el.focus();
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
