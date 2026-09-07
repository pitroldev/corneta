import { ESLint } from "eslint";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const eslint = new ESLint();
// Loading the TypeScript/React plugins is setup, not the behavior under test.
beforeAll(async () => {
  await eslint.calculateConfigForFile("scripts/smoke-reports.mjs");
}, 30_000);
it("rejects browser globals accidentally used in the Node smoke harness", async () => {
  const [result] = await eslint.lintText("console.log(document.title);", {
    filePath: "scripts/smoke-reports.mjs",
  });
  expect(result.messages.some((message) => message.ruleId === "no-undef")).toBe(
    true,
  );
});
describe("lint contract for new desktop code", () => {
  it("enforces the shared language rule in the website ESLint config", async () => {
    const webLint = new ESLint({ cwd: resolve(import.meta.dirname, "../web") });
    const [result] = await webLint.lintText(
      "// salva os dados\nexport const numero = 1;",
      {
        filePath: "lib/source-language-probe.ts",
      },
    );
    expect(
      result.messages.some(
        (message) => message.ruleId === "corneta-source/english-source",
      ),
    ).toBe(true);
  }, 30_000);
  it.each([
    "// salva os dados\nexport const numero = 1;",
    "// Set the value to one.\nexport const value = 1;",
  ])(
    "rejects source-language regressions in the real ESLint config",
    async (source) => {
      const [result] = await eslint.lintText(source, {
        filePath: "src/source-language-probe.ts",
      });
      expect(
        result.messages.some(
          (message) => message.ruleId === "corneta-source/english-source",
        ),
      ).toBe(true);
    },
  );
  it.each([
    ["@typescript-eslint/no-explicit-any", "export const value: any = 1;"],
    ["no-empty", "export function task() { try { JSON.parse(''); } catch {} }"],
    [
      "jsx-a11y/label-has-associated-control",
      "export const view = <label>Unbound label</label>;",
    ],
    ["jsx-a11y/no-autofocus", "export const view = <input autoFocus />;"],
    ["jsx-a11y/media-has-caption", "export const view = <video controls />;"],
    [
      "no-restricted-syntax",
      "export const view = <select aria-label='Bad design system' />;",
    ],
  ])(
    "rejects %s instead of inheriting blanket exceptions",
    async (ruleId, code) => {
      const [result] = await eslint.lintText(code, {
        filePath: "src/lint-contract-fixture.tsx",
      });
      expect(result.messages.some((message) => message.ruleId === ruleId)).toBe(
        true,
      );
    },
  );
  it("rejects unused disable directives", async () => {
    const [result] = await eslint.lintText(
      "// eslint-disable-next-line no-empty -- obsolete exception\nexport const value = 1;",
      { filePath: "src/lint-contract-fixture.ts" },
    );
    expect(
      result.messages.some((message) =>
        message.message.includes("Unused eslint-disable"),
      ),
    ).toBe(true);
  });
});
