import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint();
describe("lint contract for new desktop code", () => {
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
