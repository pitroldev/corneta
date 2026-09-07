import type { MessageKey } from "./i18n";

export type ShortcutFailureCode =
  "invalid" | "inUse" | "registerFailed" | "unregisterFailed" | "cleanupFailed";

const failureKeys: Record<ShortcutFailureCode, MessageKey> = {
  invalid: "settings.hotkey.toast.invalid",
  inUse: "settings.hotkey.toast.inUse",
  registerFailed: "settings.hotkey.toast.registerFailed",
  unregisterFailed: "settings.hotkey.toast.unregisterFailed",
  cleanupFailed: "settings.hotkey.toast.cleanupFailed",
};

export function shortcutErrorKey(error: unknown): MessageKey {
  const code =
    error && typeof error === "object" && "code" in error ? error.code : null;
  return typeof code === "string" &&
    Object.prototype.hasOwnProperty.call(failureKeys, code)
    ? failureKeys[code as ShortcutFailureCode]
    : failureKeys.registerFailed;
}

export type ShortcutCaptureResult =
  | { kind: "cancel" | "ignore" | "needsModifier" | "unsupported" }
  | { kind: "shortcut"; value: string };

const namedCodes = new Set([
  "Backquote",
  "Backslash",
  "BracketLeft",
  "BracketRight",
  "Pause",
  "Comma",
  "Equal",
  "Minus",
  "Period",
  "Quote",
  "Semicolon",
  "Slash",
  "Backspace",
  "CapsLock",
  "Enter",
  "Space",
  "Tab",
  "Delete",
  "End",
  "Home",
  "Insert",
  "PageDown",
  "PageUp",
  "PrintScreen",
  "ScrollLock",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "NumLock",
  "NumpadAdd",
  "NumpadDecimal",
  "NumpadDivide",
  "NumpadEnter",
  "NumpadEqual",
  "NumpadMultiply",
  "NumpadSubtract",
  "AudioVolumeDown",
  "AudioVolumeUp",
  "AudioVolumeMute",
  "MediaPlay",
  "MediaPause",
  "MediaPlayPause",
  "MediaStop",
  "MediaTrackNext",
  "MediaTrackPrevious",
]);

/** Match backend physical Code names, not layout-dependent characters. */
export function captureShortcut(
  event: Pick<
    KeyboardEvent,
    | "code"
    | "ctrlKey"
    | "altKey"
    | "shiftKey"
    | "metaKey"
    | "isComposing"
    | "repeat"
  >,
): ShortcutCaptureResult {
  const code = event.code;
  if (event.isComposing || event.repeat) return { kind: "ignore" };
  if (code === "Escape") return { kind: "cancel" };
  if (/^(Control|Alt|Shift|Meta|OS)(Left|Right)$/.test(code))
    return { kind: "ignore" };
  const modifiers = [];
  if (event.ctrlKey) modifiers.push("Control");
  if (event.metaKey) modifiers.push("Super");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  if (!modifiers.length) return { kind: "needsModifier" };
  if (
    !namedCodes.has(code) &&
    !/^(Key[A-Z]|Digit[0-9]|Numpad[0-9]|F(?:[1-9]|1[0-9]|2[0-4]))$/.test(code)
  )
    return { kind: "unsupported" };
  return { kind: "shortcut", value: [...modifiers, code].join("+") };
}
