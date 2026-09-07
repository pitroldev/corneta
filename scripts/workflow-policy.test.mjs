import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertLockedWorkflows, workflowSteps } from "./workflow-policy.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workflow = (name) =>
  readFileSync(resolve(root, `.github/workflows/${name}.yml`), "utf8");

describe("workflow safety contracts", () => {
  it.each(["ci", "release", "editorial-maintenance"])(
    "pins every external action implementation in %s",
    (name) => {
      const actions = workflowSteps(workflow(name)).filter((step) => step.uses);
      expect(actions.length).toBeGreaterThan(0);
      for (const { uses: action } of actions) {
        if (action.startsWith("./")) continue;
        expect(action).toMatch(/^[\w-]+\/[\w./-]+@[a-f\d]{40}$/);
      }
    },
  );
  it("keeps Rust dependency resolution locked and its toolchain explicitly versioned", () => {
    const sources = [workflow("ci"), workflow("release")];
    expect(
      assertLockedWorkflows(sources, {
        "cargo clippy": 1,
        "cargo test": 2,
        "pnpm tauri build": 1,
      }),
    ).toEqual({ "cargo clippy": 1, "cargo test": 2, "pnpm tauri build": 1 });
    const toolchains = sources
      .flatMap(workflowSteps)
      .filter((step) => step.uses?.startsWith("dtolnay/rust-toolchain@"));
    expect(toolchains).toHaveLength(3);
    for (const step of toolchains) expect(step.with.toolchain).toBe("1.97.1");
  });
  it("cancels superseded checks without sharing the release concurrency group", () => {
    const ci = workflow("ci");
    expect(ci).toContain("group: ci-");
    expect(ci).toContain(
      "cancel-in-progress: ${{ !inputs.checkout_ref && !startsWith(github.ref, 'refs/tags/') }}",
    );
    expect(workflow("release")).toContain("group: release-");
    expect(workflow("release")).toContain("cancel-in-progress: false");
    expect(ci).not.toContain("pull_request_target:");
    expect(ci).not.toMatch(/\$\{\{\s*secrets\./);
  });
  it("gives every directly executed CI job an explicit timeout", () => {
    const jobs = workflow("ci")
      .split(/^jobs:\s*$/m)[1]
      .split(/^ {2}[\w-]+:\s*$/m)
      .slice(1);
    expect(jobs.length).toBeGreaterThanOrEqual(6);
    for (const job of jobs) expect(job).toMatch(/timeout-minutes: \d+/);
    expect(workflow("release")).toContain("timeout-minutes: 90");
  });
  it("runs both browser locales without app secrets and retains only smoke artifacts", () => {
    const ci = workflow("ci");
    expect(ci).toContain("node scripts/smoke-reports.mjs");
    expect(ci).toContain("@('pt-BR', 'en')");
    expect(ci).toContain("path: .artifacts/browser-smoke/");
    expect(ci).toContain("retention-days: 7");
  });
  it("fails the existing frontend check when browser smoke fails or is skipped", () => {
    const frontend = workflow("ci")
      .split("  frontend:\n")[1]
      .split("  browser-smoke:\n")[0];
    expect(frontend).toContain("needs: [resolve, browser-smoke]");
    expect(frontend).toContain("if: ${{ always() && !cancelled() }}");
    expect(frontend).toContain("RESOLVE_RESULT: ${{ needs.resolve.result }}");
    expect(frontend).toContain(
      "BROWSER_RESULT: ${{ needs.browser-smoke.result }}",
    );
    expect(frontend).toContain(
      'if [[ "$RESOLVE_RESULT" != success || "$BROWSER_RESULT" != success ]]; then',
    );
    expect(frontend.indexOf("exit 1")).toBeLessThan(
      frontend.indexOf("uses: actions/checkout@"),
    );
  });
  it("does not create recurring maintainer issues in forks without an opt-in", () => {
    expect(workflow("editorial-maintenance")).toContain(
      "vars.ENABLE_EDITORIAL_AUTOMATION == 'true'",
    );
  });
  it.each(["open", "closed"])(
    "stops editorial issue creation when the %s query fails or returns invalid JSON",
    (state) => {
      const editorial = workflow("editorial-maintenance");
      const query = editorial.split(`$${state}IssuesJson = gh issue list`)[1];
      expect(query).toBeTruthy();
      expect(query).toContain(
        `if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($${state}IssuesJson)) {`,
      );
      const parse = `$${state}Issues = @($${state}IssuesJson | ConvertFrom-Json -ErrorAction Stop)`;
      expect(query.indexOf("throw '")).toBeLessThan(query.indexOf(parse));
      expect(query.indexOf(parse)).toBeLessThan(
        query.indexOf("gh issue create"),
      );
    },
  );
});
