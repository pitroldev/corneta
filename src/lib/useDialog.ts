import { useEffect, useRef } from "react";

/**
 * A11y de modal num hook: foco inicial dentro do diálogo, trap de Tab (cicla nos
 * focáveis), Esc pra fechar e restaura o foco anterior ao fechar. Retorna o ref
 * pro container do diálogo — que deve ter `tabIndex={-1}`, `role="dialog"`,
 * `aria-modal="true"` e `aria-labelledby`.
 */
export function useDialog<T extends HTMLElement>(active: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;
    const prev = document.activeElement as HTMLElement | null;

    const SEL =
      'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
    const focusables = () =>
      Array.from(node.querySelectorAll<HTMLElement>(SEL)).filter(
        (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement,
      );

    // Foco inicial: primeiro elemento focável, senão o próprio container.
    (focusables()[0] ?? node).focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const f = focusables();
      if (f.length === 0) {
        e.preventDefault();
        return;
      }
      const idx = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey) {
        if (idx <= 0) {
          e.preventDefault();
          f[f.length - 1].focus();
        }
      } else if (idx === f.length - 1 || idx === -1) {
        e.preventDefault();
        f[0].focus();
      }
    };

    node.addEventListener("keydown", onKey);
    return () => {
      node.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [active]);

  return ref;
}
