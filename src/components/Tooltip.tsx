import { Fragment, isValidElement, type ReactNode } from "react";
import * as RTooltip from "@radix-ui/react-tooltip";
import { cn } from "../lib/utils";

/**
 * Tooltip on-brand via Radix: portal (sem clipping por overflow), posicionamento
 * automático e abertura no hover e no foco. Visual de bloco com borda dura.
 *
 * Um filho único (botão, span…) vira o próprio gatilho (asChild): é nele que o
 * Radix põe `aria-describedby` ao abrir. Embrulhado num <span>, a descrição caía
 * no span e o leitor de tela, focado no botão, nunca ouvia a dica. Texto solto,
 * fragmento ou vários filhos ainda ganham o <span>, por não terem um elemento só.
 * `className` vai pro gatilho, seja ele qual for (o Slot do Radix junta as classes).
 */
export function Tooltip({
  children,
  content,
  className,
}: {
  children: ReactNode;
  content: ReactNode;
  className?: string;
}) {
  const single = isValidElement(children) && children.type !== Fragment;
  return (
    <RTooltip.Provider delayDuration={150}>
      <RTooltip.Root>
        <RTooltip.Trigger asChild className={className}>
          {single ? children : <span className="inline-flex">{children}</span>}
        </RTooltip.Trigger>
        <RTooltip.Portal>
          <RTooltip.Content
            side="top"
            sideOffset={6}
            collisionPadding={8}
            className={cn(
              "z-[100] w-max max-w-64 rounded-md border-2 border-ink bg-panel px-2.5 py-1.5",
              "text-left text-[11px] font-medium normal-case leading-snug text-ink",
              "shadow-[2px_2px_0_0_rgba(0,0,0,0.45)]",
            )}
          >
            {content}
          </RTooltip.Content>
        </RTooltip.Portal>
      </RTooltip.Root>
    </RTooltip.Provider>
  );
}
