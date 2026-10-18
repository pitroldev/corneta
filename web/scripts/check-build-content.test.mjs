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
  it("reports overdue content without blocking automatic Vercel production deploys", () => {
    expect(editorialBuildChecks({ VERCEL_ENV: "production" })).toEqual([
      ["scripts/check-editorial-content.ts", "--manifest"],
      ["scripts/check-editorial-maintenance.ts"],
    ]);
  });
  it("fails closed on overdue content in explicit release builds", () => {
    for (const env of [
      { CORNETA_RELEASE_CHECK: "1" },
      { CORNETA_RELEASE_CHECK: "1", VERCEL_ENV: "production" },
    ]) {
      expect(editorialBuildChecks(env)).toContainEqual([
        "scripts/check-editorial-maintenance.ts",
        "--fail-on-overdue",
      ]);
    }
  });
});
