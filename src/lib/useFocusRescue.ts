import { useEffect, useRef } from "react";

const CONTROLS = "input:not([disabled]), button:not([disabled])";

/**
 * Keeps focus inside a container when the focused control is replaced by the container's next
 * state (a button that becomes a form, a form that becomes a confirmation). Focus goes to the
 * element marked `data-focus-first`, else the first enabled control, else the container.
 */
export function useFocusRescue<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let inside = false;
    const onFocusIn = () => {
      inside = true;
    };
    // A removed control blurs with no related target; moving focus elsewhere names the new target.
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget;
      if (next instanceof Node && !root.contains(next)) inside = false;
    };
    const observer = new MutationObserver(() => {
      const active = document.activeElement;
      if (!inside || (active && active !== document.body)) return;
      const target =
        root.querySelector<HTMLElement>("[data-focus-first]") ??
        root.querySelector<HTMLElement>(CONTROLS) ??
        root;
      target.focus({ preventScroll: true });
    });
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
    };
  }, []);
  return ref;
}
