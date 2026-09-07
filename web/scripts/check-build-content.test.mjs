import { describe, expect, it } from "vitest";
import { editorialBuildChecks } from "./check-build-content.mjs";

describe("editorial build gates", () => {
  it("checks content integrity without calendar deadlines for local builds and PRs", () => {
    for (const env of [{}, { CI: "true" }, { VERCEL_ENV: "preview" }]) {
      expect(editorialBuildChecks(env)).toEqual([
        ["scripts/check-editorial-content.ts", "--manifest"],
      ]);
    }
  });
  it("fails closed on overdue content in official production and explicit release builds", () => {
    for (const env of [
      { VERCEL_ENV: "production" },
      { CORNETA_RELEASE_CHECK: "1" },
    ]) {
      expect(editorialBuildChecks(env)).toContainEqual([
        "scripts/check-editorial-maintenance.ts",
        "--fail-on-overdue",
      ]);
    }
  });
});
