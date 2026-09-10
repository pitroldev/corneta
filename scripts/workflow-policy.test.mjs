import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { assertLockedWorkflows, workflowSteps } from "./workflow-policy.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workflow = (name) =>
  readFileSync(resolve(root, `.github/workflows/${name}.yml`), "utf8");

describe("workflow safety contracts", () => {
  it("passes the release override as a file without rebuilding the audited frontend", () => {
    const steps = parse(workflow("release")).jobs.release.steps;
    const build = steps.find(
      (step) => step.name === "Build Tauri and sign updater",
    );
    expect(build.shell).toBe("pwsh");
    expect(build.run).toBe(
      "node node_modules/@tauri-apps/cli/tauri.js build --config src-tauri/tauri.release.conf.json -- --locked",
    );
    const override = JSON.parse(
      readFileSync(resolve(root, "src-tauri/tauri.release.conf.json"), "utf8"),
    );
    expect(override).toEqual({
      $schema: "https://schema.tauri.app/config/2",
      build: { beforeBuildCommand: "pnpm --version" },
    });
    const base = JSON.parse(
      readFileSync(resolve(root, "src-tauri/tauri.conf.json"), "utf8"),
    );
    expect(base.build.beforeBuildCommand).toBe("pnpm build:release");
    expect(base.bundle.createUpdaterArtifacts).toBe(true);
  });

  it("scans both frontend build paths before native packaging", () => {
    const steps = parse(workflow("release")).jobs.release.steps;
    const frontendScan = steps.findIndex(
      (step) => step.run === "pnpm bundle:check",
    );
    const nativeBuild = steps.findIndex(
      (step) => step.name === "Build Tauri and sign updater",
    );
    for (const name of [
      "Build frontend and upload source maps",
      "Build frontend with telemetry disabled",
    ]) {
      const build = steps.findIndex((step) => step.name === name);
      expect(build).toBeGreaterThan(-1);
      expect(frontendScan).toBeGreaterThan(build);
    }
    expect(steps[frontendScan].if).toBeUndefined();
    expect(nativeBuild).toBeGreaterThan(frontendScan);
  });

  it("publishes only the approved build after a separate environment approval", () => {
    const release = parse(workflow("release"));
    const publish = release.jobs.publish;
    expect(publish.needs).toEqual(["quality", "release"]);
    expect(publish.environment.name).toBe("production-release");
    expect(publish.permissions).toEqual({ contents: "write", actions: "read" });
    expect(publish.concurrency).toEqual({
      group: "release-publication",
      "cancel-in-progress": false,
      queue: "max",
    });
    expect(publish.concurrency.group).not.toBe(release.concurrency.group);
    expect(publish.steps[0].with.ref).toBe("${{ needs.release.outputs.sha }}");
    const download = publish.steps.find((step) =>
      step.uses?.startsWith("actions/download-artifact@"),
    );
    expect(download.with["artifact-ids"]).toBe(
      "${{ needs.release.outputs.artifact_id }}",
    );
    expect(download.with["digest-mismatch"]).toBe("error");
    const promotion = publish.steps.find(
      (step) => step.run === "node scripts/promote-release.mjs",
    );
    expect(promotion.env.RELEASE_ASSETS_JSON).toBe(
      "${{ needs.release.outputs.assets }}",
    );
    expect(promotion.env.RELEASE_TELEMETRY_JSON).toBe(
      "${{ needs.release.outputs.telemetry }}",
    );
    expect(promotion.env.QUALITY_SHA).toBe(
      "${{ needs.quality.outputs.validated_sha }}",
    );
    expect(JSON.stringify(publish)).not.toContain("secrets.");
    expect(JSON.stringify(publish)).not.toContain("POSTHOG");
  });

  it("hands off only scanned assets and waits for the exact production deployment", () => {
    const job = parse(workflow("release")).jobs.release;
    const steps = job.steps;
    const scan = steps.findIndex((step) => step.run === "pnpm artifacts:check");
    const upload = steps.findIndex((step) =>
      step.uses?.startsWith("actions/upload-artifact@"),
    );
    expect(scan).toBeGreaterThan(0);
    expect(upload).toBeGreaterThan(scan);
    expect(steps[upload].with["if-no-files-found"]).toBe("error");
    expect(steps[upload].with.path).toBe(
      "${{ runner.temp }}/corneta-release-handoff/",
    );
    expect(steps[upload].with["retention-days"]).toBe(14);
    expect(
      steps.some(
        (step) =>
          step.id === "telemetry" &&
          step.run ===
            "pnpm telemetry:release:check --wait-for-deployment --github-output",
      ),
    ).toBe(true);
    expect(job.outputs.telemetry).toBe(
      "${{ steps.telemetry.outputs.configuration }}",
    );
    const handoff = steps.findIndex((step) => step.id === "handoff");
    const draft = steps.findIndex((step) =>
      step.run?.includes("gh release upload"),
    );
    expect(handoff).toBeGreaterThan(scan);
    expect(draft).toBeGreaterThan(handoff);
    expect(upload).toBeGreaterThan(draft);
    for (const [key, value] of Object.entries(steps[draft].env)) {
      if (key.endsWith("_PATH"))
        expect(value).toContain("${{ runner.temp }}/corneta-release-handoff/");
    }
    expect(steps.find((step) => step.id === "handoff").run).toContain(
      "Get-FileHash",
    );
  });

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
        "node node_modules/@tauri-apps/cli/tauri.js build": 1,
      }),
    ).toEqual({
      "cargo clippy": 1,
      "cargo test": 2,
      "node node_modules/@tauri-apps/cli/tauri.js build": 1,
    });
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
