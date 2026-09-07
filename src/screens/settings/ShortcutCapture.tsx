import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { captureShortcut } from "../../lib/shortcuts";

export function ShortcutCapture({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const [capturing, setCapturing] = useState(false);
  const [hint, setHint] = useState<"needsModifier" | "unsupported" | null>(
    null,
  );
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashHint = useCallback((kind: "needsModifier" | "unsupported") => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
    setHint(kind);
    hintTimer.current = setTimeout(() => setHint(null), 1500);
  }, []);
  useEffect(
    () => () => {
      if (hintTimer.current) clearTimeout(hintTimer.current);
    },
    [],
  );

  const onKey = (e: React.KeyboardEvent) => {
    if (!capturing || disabled) return;
    e.preventDefault();
    const result = captureShortcut({
      code: e.code,
      ctrlKey: e.ctrlKey,
      altKey: e.altKey,
      shiftKey: e.shiftKey,
      metaKey: e.metaKey,
      repeat: e.repeat,
      isComposing: e.nativeEvent.isComposing,
    });
    if (result.kind === "cancel") {
      setCapturing(false);
      setHint(null);
      return;
    }
    if (result.kind === "ignore") return;
    if (result.kind === "needsModifier" || result.kind === "unsupported") {
      flashHint(result.kind);
      return;
    }
    if (result.kind !== "shortcut") return;
    onChange(result.value);
    setCapturing(false);
    setHint(null);
  };

  return (
    <button
      disabled={disabled}
      onClick={() => setCapturing(true)}
      onBlur={() => {
        setCapturing(false);
        setHint(null);
      }}
      onKeyDown={onKey}
      className={cn(
        "rounded-md border-2 px-3 py-2 font-mono text-sm transition-colors",
        capturing && hint
          ? "border-warn text-warn"
          : capturing
            ? "border-brass text-brass"
            : "border-border text-ink hover:border-brass/60",
      )}
    >
      {capturing
        ? hint
          ? t(
              hint === "unsupported"
                ? "settings.hotkey.capture.unsupported"
                : "settings.hotkey.capture.needsModifier",
            )
          : t("settings.hotkey.capture.prompt")
        : value || t("settings.hotkey.capture.idle")}
    </button>
  );
}
