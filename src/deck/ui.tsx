import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { useT } from "../lib/i18n";
import { chatProvider } from "../platforms";
import { preset } from "./model";

function look(platform: string): {
  name: string;
  color: string;
  icon?: string;
} {
  const destination = preset(platform);
  if (destination) return destination;
  const chat = chatProvider(platform);
  return chat ?? { name: platform, color: "var(--ink-faint)" };
}

export function PlatformGlyph({
  platform,
  size = 16,
}: {
  platform: string;
  size?: number;
}) {
  const p = look(platform);
  if (!p.icon)
    return (
      <span
        aria-hidden
        className="pg pg-dot"
        style={{ width: size * 0.62, height: size * 0.62, background: p.color }}
      />
    );
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden
      className="pg"
      style={{ color: p.color }}
    >
      <path d={p.icon} fill="currentColor" />
    </svg>
  );
}

export function platformLabel(platform: string): string {
  return look(platform).name;
}

export type ToastKind = "ok" | "info" | "bad";
export interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
}

export function useToasts() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const push = useCallback((kind: ToastKind, text: string) => {
    const id = ++seq.current;
    // One at a time: the deck keys under it stay readable.
    setItems([{ id, kind, text }]);
    setTimeout(
      () => setItems((list) => list.filter((t) => t.id !== id)),
      kind === "bad" ? 5200 : 3400,
    );
  }, []);
  const dismiss = useCallback(
    (id: number) => setItems((list) => list.filter((t) => t.id !== id)),
    [],
  );
  return { items, push, dismiss };
}

export function Toasts({
  items,
  onDismiss,
}: {
  items: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  const t = useT();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((item) => {
        const Icon =
          item.kind === "bad"
            ? TriangleAlert
            : item.kind === "info"
              ? Info
              : CircleCheck;
        return (
          <div key={item.id} className={`toast ${item.kind}`}>
            <Icon className="ic" aria-hidden />
            <p>{item.text}</p>
            <button
              className="close"
              onClick={() => onDismiss(item.id)}
              aria-label={t("deck.toast.close")}
            >
              <X className="ic" aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}

let haptics = true;

export function setHaptics(on: boolean) {
  haptics = on;
}

export function buzz(ms = 15) {
  if (haptics && typeof navigator !== "undefined" && "vibrate" in navigator)
    navigator.vibrate(ms);
}

/** Interface size for the whole page; the root box shrinks by the same factor it grows. */
export function applyUiScale(scale: number) {
  document.documentElement.style.setProperty("--ui-scale", String(scale));
}

const THEME_COLOR: Record<string, string> = {
  dark: "#100b07",
  light: "#f3ead7",
  contrast: "#000000",
};

/** Theme for the page and the browser bar around it. */
export function applyTheme(theme: string) {
  const root = document.documentElement;
  if (theme === "dark") delete root.dataset.theme;
  else root.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLOR[theme] ?? THEME_COLOR.dark!);
  document
    .querySelector('meta[name="color-scheme"]')
    ?.setAttribute("content", theme === "light" ? "light" : "dark");
}

/**
 * Hold-to-confirm for the two actions that reach the audience: going live and cutting.
 * A short tap only explains; the fill shows how long is left.
 */
export function useHold<T extends HTMLElement>(
  ms: number,
  onDone: () => void,
  onTooShort: () => void,
  disabled = false,
) {
  const ref = useRef<T>(null) as RefObject<T | null>;
  const [holding, setHolding] = useState(false);
  const state = useRef<{ t0: number; raf: number } | null>(null);
  const done = useRef(onDone);
  const short = useRef(onTooShort);
  done.current = onDone;
  short.current = onTooShort;

  const cancel = useCallback((explain: boolean) => {
    const s = state.current;
    if (!s) return;
    cancelAnimationFrame(s.raf);
    state.current = null;
    ref.current?.style.setProperty("--p", "0");
    setHolding(false);
    if (explain && performance.now() - s.t0 < 450) short.current();
  }, []);

  const start = useCallback(() => {
    if (disabled || state.current) return;
    const t0 = performance.now();
    state.current = { t0, raf: 0 };
    setHolding(true);
    buzz(10);
    const step = (now: number) => {
      if (!state.current) return;
      const p = Math.min(1, (now - t0) / ms);
      ref.current?.style.setProperty("--p", String(p));
      if (p >= 1) {
        state.current = null;
        setHolding(false);
        ref.current?.style.setProperty("--p", "0");
        buzz(30);
        done.current();
        return;
      }
      state.current.raf = requestAnimationFrame(step);
    };
    state.current.raf = requestAnimationFrame(step);
  }, [disabled, ms]);

  useEffect(() => () => cancel(false), [cancel]);

  const handlers = {
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      start();
    },
    onPointerUp: () => cancel(true),
    onPointerLeave: () => cancel(false),
    onPointerCancel: () => cancel(false),
    onKeyDown: (e: ReactKeyboardEvent) => {
      if ((e.key === " " || e.key === "Enter") && !e.repeat) {
        e.preventDefault();
        start();
      }
    },
    onKeyUp: (e: ReactKeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") cancel(true);
    },
    onContextMenu: (e: ReactMouseEvent) => e.preventDefault(),
  };
  return { ref, holding, handlers };
}

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  useEffect(() => {
    opener.current = document.activeElement;
    ref.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const back = opener.current;
      if (back instanceof HTMLElement && back.isConnected)
        back.focus({ preventScroll: true });
    };
  }, [onClose]);
  return (
    <>
      <div className="scrim" aria-hidden="true" onClick={onClose} />
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        tabIndex={-1}
        ref={ref}
      >
        <div className="grabber" />
        <h3 id="sheet-title">{title}</h3>
        {children}
      </div>
    </>
  );
}

/** Copy without the Clipboard API, which plain-http pages on the network do not get. */
export function copyText(text: string): boolean {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}
