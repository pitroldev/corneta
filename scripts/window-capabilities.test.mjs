import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const capability = (label) =>
  JSON.parse(readFileSync(`src-tauri/capabilities/${label}.json`, "utf8"));
const source = (path) => readFileSync(path, "utf8");

// core:window:default already covers the read-only getters, so isMaximized and
// isMinimized work everywhere. Every state change needs its own grant instead.
// Double-clicking a drag region is handled natively through
// allow-internal-toggle-maximize, which is in the default set, so a missing grant
// here breaks only our own buttons and does so silently.
const GRANT_FOR_METHOD = {
  close: "core:window:allow-close",
  hide: "core:window:allow-hide",
  maximize: "core:window:allow-maximize",
  minimize: "core:window:allow-minimize",
  setFocus: "core:window:allow-set-focus",
  show: "core:window:allow-show",
  startDragging: "core:window:allow-start-dragging",
  toggleMaximize: "core:window:allow-toggle-maximize",
  unmaximize: "core:window:allow-unmaximize",
  unminimize: "core:window:allow-unminimize",
};

const methodsCalledIn = (code) =>
  Object.keys(GRANT_FOR_METHOD).filter((method) =>
    new RegExp(`\\.${method}\\(`).test(code),
  );

describe("window capabilities cover the window actions each screen calls", () => {
  it("grants the chat popout every window action it performs", () => {
    const granted = new Set(capability("chat").permissions);
    const called = methodsCalledIn(source("src/screens/ChatPopout.tsx"));

    // Guard the exact regression: the restore button was dead because this
    // capability granted minimize and close but never toggleMaximize.
    expect(called).toContain("toggleMaximize");
    expect(called).toContain("setFocus");

    for (const method of called) {
      const grant = GRANT_FOR_METHOD[method];
      expect(
        granted,
        `ChatPopout calls ${method}() but the chat capability lacks ${grant}`,
      ).toContain(grant);
    }
  });

  it("grants the main title bar every window action it performs", () => {
    const granted = new Set(capability("default").permissions);
    const called = methodsCalledIn(source("src/components/TitleBar.tsx"));

    expect(called).toContain("toggleMaximize");

    for (const method of called) {
      const grant = GRANT_FOR_METHOD[method];
      expect(
        granted,
        `TitleBar calls ${method}() but the default capability lacks ${grant}`,
      ).toContain(grant);
    }
  });
});
