import { describe, expect, it } from "vitest";
import { entryFiles } from "./entry-budget.mjs";

describe("entry budget", () => {
  it("counts transitive static dependencies once and excludes deferred features", () => {
    const manifest = {
      main: {
        file: "main.js",
        imports: ["react", "shared"],
        dynamicImports: ["reports"],
        css: ["base.css"],
      },
      react: { file: "react.js" },
      shared: {
        file: "shared.js",
        imports: ["react", "main"],
        css: ["base.css"],
        assets: ["font.woff2"],
      },
      reports: { file: "reports.js" },
    };
    expect(entryFiles(manifest, "main").sort()).toEqual([
      "base.css",
      "font.woff2",
      "main.js",
      "react.js",
      "shared.js",
    ]);
  });
  it("fails closed for an incomplete dependency graph", () => {
    expect(() =>
      entryFiles({ main: { file: "main.js", imports: ["missing"] } }, "main"),
    ).toThrow("Missing build manifest chunk");
  });
});
