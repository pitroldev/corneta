import { describe, expect, it } from "vitest";
import { captureShortcut, shortcutErrorKey } from "./shortcuts";

const event = {
  code: "KeyK",
  ctrlKey: true,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  isComposing: false,
  repeat: false,
};

describe("global shortcut capture", () => {
  it.each([
    ["Space", false, "Control+Space"],
    ["Digit1", true, "Control+Shift+Digit1"],
    ["Equal", true, "Control+Shift+Equal"],
    ["NumpadAdd", false, "Control+NumpadAdd"],
    ["NumpadEnter", false, "Control+NumpadEnter"],
    ["NumpadDecimal", false, "Control+NumpadDecimal"],
    ["KeyQ", false, "Control+KeyQ"],
    ["F24", false, "Control+F24"],
  ])(
    "encodes %s with Shift=%s independently of the typed character",
    (code, shiftKey, value) => {
      expect(captureShortcut({ ...event, code, shiftKey })).toEqual({
        kind: "shortcut",
        value,
      });
    },
  );

  it("keeps the Windows/Super modifier distinct from Control", () => {
    expect(
      captureShortcut({ ...event, ctrlKey: false, metaKey: true }),
    ).toEqual({ kind: "shortcut", value: "Super+KeyK" });
    expect(captureShortcut({ ...event, metaKey: true })).toEqual({
      kind: "shortcut",
      value: "Control+Super+KeyK",
    });
  });

  it("cancels on Escape and ignores modifier-only, repeated and composition events", () => {
    expect(captureShortcut({ ...event, code: "Escape" })).toEqual({
      kind: "cancel",
    });
    for (const patch of [
      { code: "ControlLeft" },
      { code: "MetaRight" },
      { repeat: true },
      { isComposing: true },
    ])
      expect(captureShortcut({ ...event, ...patch })).toEqual({
        kind: "ignore",
      });
  });

  it("rejects unsupported codes without manufacturing an accelerator", () => {
    for (const code of ["", "Unidentified", "IntlBackslash", "F25"])
      expect(captureShortcut({ ...event, code })).toEqual({
        kind: "unsupported",
      });
    expect(captureShortcut({ ...event, ctrlKey: false })).toEqual({
      kind: "needsModifier",
    });
  });

  it("classifies typed errors without treating every failure as a conflict", () => {
    for (const code of [
      "invalid",
      "inUse",
      "registerFailed",
      "unregisterFailed",
      "cleanupFailed",
    ])
      expect(shortcutErrorKey({ code })).toBe(`settings.hotkey.toast.${code}`);
    expect(shortcutErrorKey("transport failed")).toBe(
      "settings.hotkey.toast.registerFailed",
    );
    expect(shortcutErrorKey({ code: "toString" })).toBe(
      "settings.hotkey.toast.registerFailed",
    );
  });
});
