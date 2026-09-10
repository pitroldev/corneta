import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  collectReleaseReadiness,
  evaluateReleaseReadiness,
  githubRead,
  RELEASE_ENVIRONMENTS,
  RELEASE_NOTICE_VERSION,
} from "./release-readiness.mjs";

const ok = (data) => ({ ok: true, data });
const denied = { ok: false, code: "ACCESS_DENIED" };
const missing = { ok: false, code: "NOT_FOUND" };
const syntheticToken = "phc_synthetic_readiness_fixture";
const reviewedManifest = { schemaVersion: 1, reviewed: true };
function configured() {
  return {
    repository: ok({ private: false, archived: false }),
    actions: ok({ enabled: true }),
    workflowPermissions: ok({ default_workflow_permissions: "read" }),
    main: ok({ protected: false }),
    rulesets: ok([]),
    secrets: ok(
      [
        "TAURI_SIGNING_PRIVATE_KEY",
        "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
        "POSTHOG_API_KEY",
      ].map((name) => ({ name })),
    ),
    variables: ok(
      Object.entries({
        POSTHOG_DESKTOP_TOKEN: syntheticToken,
        NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: syntheticToken,
        POSTHOG_PROJECT_TOKEN: syntheticToken,
        POSTHOG_HOST: "https://us.i.posthog.com",
        NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com/",
        POSTHOG_PROJECT_ID: "1234",
        TELEMETRY_DISABLED: "0",
        TELEMETRY_POLICY_PUBLISHED_VERSION: RELEASE_NOTICE_VERSION,
      }).map(([name, value]) => ({ name, value })),
    ),
    environments: Object.fromEntries(
      RELEASE_ENVIRONMENTS.map((name) => [
        name,
        {
          info: ok({
            name,
            can_admins_bypass: false,
            protection_rules: [
              {
                type: "required_reviewers",
                reviewers: [{ type: "User", reviewer: { id: 1 } }],
              },
            ],
            deployment_branch_policy: {
              custom_branch_policies: true,
              protected_branches: false,
            },
          }),
          secrets: ok([]),
          variables: ok([]),
          policies: ok([{ type: "tag", name: "v*" }]),
        },
      ]),
    ),
  };
}
const check = (report, code, name) =>
  report.checks.find(
    (item) => item.code === code && (!name || item.name === name),
  );

describe("manual release readiness", () => {
  it("reports configuration readiness without claiming publication or restoring branch protection", () => {
    const report = evaluateReleaseReadiness(configured(), reviewedManifest);
    expect(report.configurationReady).toBe(true);
    expect(report.publicationVerified).toBe(false);
    expect(check(report, "MAIN_BRANCH_PROTECTED")).toMatchObject({
      passed: false,
      blocking: false,
    });
    expect(check(report, "NOTICE_PUBLICATION_UNVERIFIED")).toMatchObject({
      passed: false,
      known: false,
    });
  });
  it("blocks anonymous GitHub downloads from a private repository", () => {
    const snapshot = configured();
    snapshot.repository.data.private = true;
    expect(
      check(
        evaluateReleaseReadiness(snapshot, reviewedManifest),
        "PUBLIC_REPOSITORY_FOR_DOWNLOADS",
      ).passed,
    ).toBe(false);
    expect(
      evaluateReleaseReadiness(snapshot, reviewedManifest).configurationReady,
    ).toBe(false);
  });
  it.each(RELEASE_ENVIRONMENTS)(
    "requires real reviewers in %s, not an implicitly created environment",
    (name) => {
      const snapshot = configured();
      snapshot.environments[name].info.data.protection_rules = [];
      expect(
        check(
          evaluateReleaseReadiness(snapshot, reviewedManifest),
          "ENVIRONMENT_REQUIRED_REVIEWERS",
          name,
        ).passed,
      ).toBe(false);
      snapshot.environments[name] = { absent: true };
      expect(
        check(
          evaluateReleaseReadiness(snapshot, reviewedManifest),
          "ENVIRONMENT_PRESENT",
          name,
        ),
      ).toMatchObject({ passed: false, known: true });
    },
  );
  it.each(RELEASE_ENVIRONMENTS)(
    "rejects admin bypass or unknown bypass protection in %s",
    (name) => {
      const snapshot = configured();
      snapshot.environments[name].info.data.can_admins_bypass = true;
      expect(
        evaluateReleaseReadiness(snapshot, reviewedManifest).configurationReady,
      ).toBe(false);
      delete snapshot.environments[name].info.data.can_admins_bypass;
      expect(
        check(
          evaluateReleaseReadiness(snapshot, reviewedManifest),
          "ENVIRONMENT_ADMIN_BYPASS_DISABLED",
          name,
        ),
      ).toMatchObject({ passed: false, known: false });
    },
  );
  it.each([
    [{ type: "branch", name: "v*" }],
    [{ type: "tag", name: "*" }],
    [
      { type: "tag", name: "v*" },
      { type: "branch", name: "main" },
    ],
    [],
  ])(
    "rejects deployment policies outside the release tag contract: %j",
    (...policies) => {
      const snapshot = configured();
      snapshot.environments["production-release"].policies = ok(policies);
      expect(
        check(
          evaluateReleaseReadiness(snapshot, reviewedManifest),
          "ENVIRONMENT_RELEASE_TAG_POLICY",
          "production-release",
        ).passed,
      ).toBe(false);
    },
  );
  it("does not treat inaccessible metadata as a confirmed absence", () => {
    const snapshot = configured();
    snapshot.secrets = denied;
    snapshot.environments["production-release"].info = missing;
    const report = evaluateReleaseReadiness(snapshot, reviewedManifest);
    expect(check(report, "ACCESS_DENIED", "repository/secrets").known).toBe(
      false,
    );
    expect(check(report, "NOT_FOUND", "production-release").known).toBe(false);
    expect(check(report, "REQUIRED_SECRET_PRESENT").known).toBe(false);
    expect(report.configurationReady).toBe(false);
  });
  it("blocks divergent environment overrides without printing their values", () => {
    const snapshot = configured();
    const environment = snapshot.environments["production-telemetry"];
    environment.variables = ok([
      { name: "POSTHOG_PROJECT_TOKEN", value: "phc_other_synthetic_fixture" },
    ]);
    environment.secrets = ok([
      { name: "POSTHOG_API_KEY", value: "never-output-this-unexpected-field" },
    ]);
    const report = evaluateReleaseReadiness(snapshot, reviewedManifest);
    expect(
      check(
        report,
        "ENVIRONMENT_VARIABLE_MATCHES_REPOSITORY",
        "POSTHOG_PROJECT_TOKEN",
      ).passed,
    ).toBe(false);
    expect(report.configurationReady).toBe(false);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain(syntheticToken);
    expect(serialized).not.toContain("other_synthetic");
    expect(serialized).not.toContain("never-output");
    for (const item of report.checks) {
      expect(Object.keys(item).sort()).toEqual([
        "blocking",
        "code",
        "known",
        "name",
        "passed",
      ]);
      expect(typeof item.passed).toBe("boolean");
    }
  });
  it("rejects environment-only variables and accepts identical duplicates", () => {
    const snapshot = configured();
    snapshot.environments["production-telemetry"].variables = ok(
      snapshot.variables.data.map((item) => ({ ...item })),
    );
    expect(
      evaluateReleaseReadiness(snapshot, reviewedManifest).configurationReady,
    ).toBe(true);
    snapshot.variables = ok([]);
    expect(
      evaluateReleaseReadiness(snapshot, reviewedManifest).configurationReady,
    ).toBe(false);
  });
  it("blocks a mismatched project token in repository variables", () => {
    const snapshot = configured();
    snapshot.variables.data.find(
      (item) => item.name === "POSTHOG_PROJECT_TOKEN",
    ).value = "phc_another_synthetic_fixture";
    expect(
      check(
        evaluateReleaseReadiness(snapshot, reviewedManifest),
        "PUBLIC_PROJECT_TOKENS_MATCH",
      ).passed,
    ).toBe(false);
  });
  it("accepts environment secrets without requiring duplicate repository secrets", () => {
    const snapshot = configured();
    snapshot.environments["production-telemetry"].secrets = snapshot.secrets;
    snapshot.secrets = ok([]);
    expect(
      evaluateReleaseReadiness(snapshot, reviewedManifest).configurationReady,
    ).toBe(true);
  });
  it("uses the enabled workflow default but does not hide its missing credentials", () => {
    const snapshot = configured();
    snapshot.variables = ok([]);
    snapshot.secrets = ok([]);
    const report = evaluateReleaseReadiness(snapshot, reviewedManifest);
    expect(check(report, "TELEMETRY_SWITCH_VALID").passed).toBe(true);
    expect(check(report, "TELEMETRY_SWITCH_EXPLICIT").passed).toBe(false);
    expect(
      check(report, "REQUIRED_SECRET_PRESENT", "POSTHOG_API_KEY").passed,
    ).toBe(false);
    expect(report.configurationReady).toBe(false);
  });
  it("permits the explicit disabled path without claiming deployed switches or policy were verified", () => {
    const snapshot = configured();
    snapshot.variables.data = snapshot.variables.data.filter(
      (item) => !item.name.includes("POSTHOG"),
    );
    snapshot.variables.data.find(
      (item) => item.name === "TELEMETRY_DISABLED",
    ).value = "1";
    snapshot.secrets.data = snapshot.secrets.data.filter(
      (item) => item.name !== "POSTHOG_API_KEY",
    );
    const report = evaluateReleaseReadiness(snapshot, reviewedManifest);
    expect(report.configurationReady).toBe(true);
    expect(
      check(report, "REQUIRED_SECRET_PRESENT", "POSTHOG_API_KEY"),
    ).toBeUndefined();
    expect(check(report, "DEPLOYMENT_RELEASE_SHA_UNVERIFIED").known).toBe(
      false,
    );
  });
  it.each(["true", " 1", "01", ["1"], false])(
    "rejects the invalid switch %s",
    (value) => {
      const snapshot = configured();
      snapshot.variables.data.find(
        (item) => item.name === "TELEMETRY_DISABLED",
      ).value = value;
      expect(
        evaluateReleaseReadiness(snapshot, reviewedManifest).configurationReady,
      ).toBe(false);
    },
  );
  it.each([
    null,
    { schemaVersion: 1, reviewed: false },
    { schemaVersion: 1, reviewed: "true" },
  ])(
    "requires explicit local corresponding-source approval: %j",
    (manifest) => {
      expect(
        evaluateReleaseReadiness(configured(), manifest).configurationReady,
      ).toBe(false);
    },
  );
  it("keeps the expected notice aligned with the executable release gate", () => {
    const source = readFileSync(
      new URL("./check-telemetry-release.mjs", import.meta.url),
      "utf8",
    );
    expect(source).toContain(
      `const EXPECTED_NOTICE_VERSION = "${RELEASE_NOTICE_VERSION}"`,
    );
  });
});

describe("read-only GitHub collection", () => {
  it("uses only bounded GET requests and never emits child diagnostics", () => {
    const run = vi.fn(() => ({
      status: 0,
      stdout:
        'HTTP/2.0 200 OK\r\ncontent-type: application/json\r\n\r\n{"private":true}',
      stderr: "sensitive-diagnostic",
    }));
    expect(
      githubRead("repos/pitroldev/corneta", { run, env: { GH_DEBUG: "api" } }),
    ).toEqual(ok({ private: true }));
    const [command, args, options] = run.mock.calls[0];
    expect(command).toBe("gh");
    expect(args).toEqual([
      "api",
      "--hostname",
      "github.com",
      "--method",
      "GET",
      "--include",
      "repos/pitroldev/corneta",
    ]);
    expect(options).toMatchObject({
      shell: false,
      windowsHide: true,
      timeout: 20_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    expect(options.env).not.toHaveProperty("GH_DEBUG");
  });
  it.each([
    ["403", "ACCESS_DENIED"],
    ["404", "NOT_FOUND"],
    ["500", "GITHUB_READ_FAILED"],
  ])("sanitizes HTTP %s", (status, code) => {
    const run = () => ({
      status: 1,
      stdout: `HTTP/2.0 ${status} Error\n\nsecret-response`,
      stderr: "secret-diagnostic",
    });
    expect(githubRead("repos/pitroldev/corneta", { run })).toEqual({
      ok: false,
      code,
    });
  });
  it("rejects malformed JSON, tool failures and endpoint injection without leaking data", () => {
    expect(
      githubRead("repos/pitroldev/corneta", {
        run: () => ({ status: 0, stdout: "HTTP/2.0 200 OK\n\nsecret" }),
      }),
    ).toEqual({ ok: false, code: "INVALID_RESPONSE" });
    expect(
      githubRead("repos/pitroldev/corneta", {
        run: () => {
          throw new Error("sensitive");
        },
      }),
    ).toEqual({ ok: false, code: "GH_UNAVAILABLE" });
    const run = vi.fn();
    expect(githubRead("https://untrusted.example", { run }).ok).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });
  it("confirms environment absence only against a successfully enumerated inventory", async () => {
    const read = (path) =>
      path.endsWith("/production-telemetry") ||
      path.endsWith("/production-release")
        ? missing
        : path.includes("/environments?")
          ? ok({ environments: [] })
          : denied;
    const snapshot = await collectReleaseReadiness("pitroldev/corneta", {
      read,
    });
    expect(snapshot.environments["production-release"].absent).toBe(true);
    const unavailable = await collectReleaseReadiness("pitroldev/corneta", {
      read: () => missing,
    });
    expect(unavailable.environments["production-release"].absent).toBe(false);
  });
  it("paginates without trusting a partial inventory", async () => {
    const read = vi.fn((path) =>
      path.includes("/actions/secrets?")
        ? ok({
            secrets: path.endsWith("page=1")
              ? Array.from({ length: 100 }, (_, index) => ({
                  name: `SYNTHETIC_${index}`,
                }))
              : [{ name: "TAURI_SIGNING_PRIVATE_KEY" }],
          })
        : denied,
    );
    const snapshot = await collectReleaseReadiness("pitroldev/corneta", {
      read,
    });
    expect(snapshot.secrets.data).toHaveLength(101);
    expect(snapshot.secrets.data.at(-1).name).toBe("TAURI_SIGNING_PRIVATE_KEY");
    const partial = await collectReleaseReadiness("pitroldev/corneta", {
      read: (path) =>
        path.includes("/actions/secrets?") && path.endsWith("page=1")
          ? ok({ secrets: Array(100).fill({ name: "FIXTURE" }) })
          : denied,
    });
    expect(partial.secrets).toEqual(denied);
  });
  it("bounds pagination instead of accepting an unbounded or malformed inventory", async () => {
    const read = vi.fn((path) =>
      path.includes("/actions/secrets?")
        ? ok({ secrets: Array(100).fill({ name: "FIXTURE" }) })
        : denied,
    );
    const snapshot = await collectReleaseReadiness("pitroldev/corneta", {
      read,
    });
    expect(snapshot.secrets).toEqual({ ok: false, code: "PAGINATION_LIMIT" });
    expect(
      read.mock.calls.filter(([path]) => path.includes("/actions/secrets?")),
    ).toHaveLength(10);
    const malformed = await collectReleaseReadiness("pitroldev/corneta", {
      read: () => ok({ secrets: "not-an-array" }),
    });
    expect(malformed.secrets).toEqual({ ok: false, code: "INVALID_RESPONSE" });
  });
});
