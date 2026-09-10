import { spawnSync } from "node:child_process";

export const RELEASE_ENVIRONMENTS = [
  "production-telemetry",
  "production-release",
];
export const RELEASE_NOTICE_VERSION = "2026-09-09";
const TOKEN = /^phc_[A-Za-z0-9_-]{8,}$/;
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const success = (data) => ({ ok: true, data });
const failure = (code) => ({ ok: false, code });

export function githubRead(
  endpoint,
  { run = spawnSync, env = process.env } = {},
) {
  if (
    !/^repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_./%-]+)?(?:\?[A-Za-z0-9_=&-]+)?$/.test(
      endpoint,
    )
  )
    return failure("INVALID_ENDPOINT");
  // gh diagnostics can include response bodies; only the parsed result may leave this adapter.
  const childEnv = { ...env, GH_PROMPT_DISABLED: "1" };
  delete childEnv.GH_DEBUG;
  let result;
  try {
    result = run(
      "gh",
      [
        "api",
        "--hostname",
        "github.com",
        "--method",
        "GET",
        "--include",
        endpoint,
      ],
      {
        encoding: "utf8",
        shell: false,
        windowsHide: true,
        timeout: 20_000,
        maxBuffer: 2 * 1024 * 1024,
        env: childEnv,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch {
    return failure("GH_UNAVAILABLE");
  }
  if (result.error) return failure("GH_UNAVAILABLE");
  const output = result.stdout ?? "";
  const status = /^HTTP\/[\d.]+ (\d{3})\b/.exec(output)?.[1];
  if (status !== "200" || result.status !== 0) {
    return failure(
      status === "404"
        ? "NOT_FOUND"
        : ["401", "403"].includes(status)
          ? "ACCESS_DENIED"
          : "GITHUB_READ_FAILED",
    );
  }
  try {
    const separator = /\r?\n\r?\n/.exec(output);
    if (!separator) return failure("INVALID_RESPONSE");
    return success(
      JSON.parse(output.slice(separator.index + separator[0].length)),
    );
  } catch {
    return failure("INVALID_RESPONSE");
  }
}

export async function collectReleaseReadiness(
  repository,
  { read = githubRead } = {},
) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository))
    throw new Error("Invalid repository name");
  const base = `repos/${repository}`;
  const request = async (path) => {
    try {
      return await read(`${base}${path}`);
    } catch {
      return failure("GITHUB_READ_FAILED");
    }
  };
  const list = async (path, field) => {
    const items = [];
    for (let page = 1; page <= 10; page++) {
      const result = await request(
        `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`,
      );
      if (!result?.ok) return result ?? failure("INVALID_RESPONSE");
      const current = field ? result.data?.[field] : result.data;
      if (!Array.isArray(current)) return failure("INVALID_RESPONSE");
      items.push(...current);
      if (current.length < 100) return success(items);
    }
    return failure("PAGINATION_LIMIT");
  };
  const snapshot = {
    repository: await request(""),
    actions: await request("/actions/permissions"),
    workflowPermissions: await request("/actions/permissions/workflow"),
    main: await request("/branches/main"),
    rulesets: await list("/rulesets?includes_parents=true"),
    secrets: await list("/actions/secrets", "secrets"),
    variables: await list("/actions/variables", "variables"),
    environmentIndex: await list("/environments", "environments"),
    environments: {},
  };
  for (const name of RELEASE_ENVIRONMENTS) {
    const path = `/environments/${name}`;
    const info = await request(path);
    const absent =
      info?.code === "NOT_FOUND" &&
      snapshot.environmentIndex.ok &&
      !snapshot.environmentIndex.data.some((item) => item?.name === name);
    snapshot.environments[name] = {
      info,
      absent,
      secrets:
        absent || name !== "production-telemetry"
          ? success([])
          : await list(`${path}/secrets`, "secrets"),
      variables:
        absent || name !== "production-telemetry"
          ? success([])
          : await list(`${path}/variables`, "variables"),
      policies:
        info?.ok &&
        info.data?.deployment_branch_policy?.custom_branch_policies === true
          ? await list(`${path}/deployment-branch-policies`, "branch_policies")
          : success([]),
    };
  }
  return snapshot;
}

export function evaluateReleaseReadiness(snapshot, manifest) {
  const checks = [];
  const check = (code, name, passed, known = true, blocking = true) =>
    checks.push({
      code,
      name,
      passed: passed === true,
      known: known === true,
      blocking,
    });
  const access = (name, result, blocking = true) => {
    const valid = result?.ok === true;
    const code = valid
      ? "READ_ACCESS"
      : [
            "ACCESS_DENIED",
            "NOT_FOUND",
            "GH_UNAVAILABLE",
            "PAGINATION_LIMIT",
          ].includes(result?.code)
        ? result.code
        : "READ_UNVERIFIED";
    check(code, name, valid, valid, blocking);
    return valid;
  };
  if (access("repository", snapshot.repository)) {
    check(
      "PUBLIC_REPOSITORY_FOR_DOWNLOADS",
      "repository",
      snapshot.repository.data?.private === false,
    );
    check(
      "REPOSITORY_NOT_ARCHIVED",
      "repository",
      snapshot.repository.data?.archived === false,
    );
  }
  if (access("actions", snapshot.actions))
    check(
      "ACTIONS_ENABLED",
      "repository",
      snapshot.actions.data?.enabled === true,
    );
  if (access("workflow-permissions", snapshot.workflowPermissions, false))
    check(
      "DEFAULT_TOKEN_READ_ONLY",
      "repository",
      snapshot.workflowPermissions.data?.default_workflow_permissions ===
        "read",
      true,
      false,
    );
  if (access("main", snapshot.main, false))
    check(
      "MAIN_BRANCH_PROTECTED",
      "main",
      snapshot.main.data?.protected === true,
      true,
      false,
    );
  if (access("rulesets", snapshot.rulesets, false))
    check(
      "ACTIVE_TAG_RULESET_PRESENT",
      "repository",
      Array.isArray(snapshot.rulesets.data) &&
        snapshot.rulesets.data.some(
          (item) => item?.target === "tag" && item.enforcement === "active",
        ),
      true,
      false,
    );

  for (const name of RELEASE_ENVIRONMENTS) {
    const environment = snapshot.environments?.[name];
    if (environment?.absent === true) {
      check("ENVIRONMENT_PRESENT", name, false);
      continue;
    }
    if (!access(name, environment?.info)) continue;
    const info = environment.info.data;
    check("ENVIRONMENT_PRESENT", name, info?.name === name);
    const rules = Array.isArray(info?.protection_rules)
      ? info.protection_rules
      : [];
    const reviewers = rules.find((rule) => rule?.type === "required_reviewers");
    check(
      "ENVIRONMENT_REQUIRED_REVIEWERS",
      name,
      Array.isArray(reviewers?.reviewers) &&
        reviewers.reviewers.some(
          (item) =>
            ["User", "Team"].includes(item?.type) &&
            Number.isSafeInteger(item?.reviewer?.id) &&
            item.reviewer.id > 0,
        ),
    );
    check(
      "ENVIRONMENT_SELF_REVIEW_PREVENTED",
      name,
      reviewers?.prevent_self_review === true,
      typeof reviewers?.prevent_self_review === "boolean",
      false,
    );
    check(
      "ENVIRONMENT_ADMIN_BYPASS_DISABLED",
      name,
      info?.can_admins_bypass === false,
      typeof info?.can_admins_bypass === "boolean",
    );
    if (access(`${name}/deployment-branch-policies`, environment.policies)) {
      const policies = environment.policies.data;
      check(
        "ENVIRONMENT_RELEASE_TAG_POLICY",
        name,
        info?.deployment_branch_policy?.custom_branch_policies === true &&
          info.deployment_branch_policy.protected_branches === false &&
          Array.isArray(policies) &&
          policies.length > 0 &&
          policies.every(
            (policy) => policy?.type === "tag" && policy.name === "v*",
          ),
      );
    }
  }

  const environment = snapshot.environments?.["production-telemetry"];
  const inventories = [
    ["repository/secrets", snapshot.secrets],
    ["repository/variables", snapshot.variables],
    ["production-telemetry/secrets", environment?.secrets],
    ["production-telemetry/variables", environment?.variables],
  ];
  const readable = inventories.map(([name, result]) => access(name, result));
  const variableKnown = readable[1] && readable[3];
  const secretKnown = readable[0] && readable[2];
  const entries = (result) =>
    result?.ok && Array.isArray(result.data) ? result.data : [];
  const variableMap = (result) =>
    new Map(
      entries(result)
        .filter((item) => object(item) && typeof item.name === "string")
        .map((item) => [item.name, item.value]),
    );
  // Job expressions may resolve before environment variables become available.
  const variables = variableMap(snapshot.variables);
  const environmentVariables = variableMap(environment?.variables);
  for (const name of [
    "TELEMETRY_DISABLED",
    "TELEMETRY_POLICY_PUBLISHED_VERSION",
    "POSTHOG_DESKTOP_TOKEN",
    "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN",
    "POSTHOG_PROJECT_TOKEN",
    "POSTHOG_HOST",
    "NEXT_PUBLIC_POSTHOG_HOST",
    "POSTHOG_PROJECT_ID",
    "REQUIRE_WINDOWS_CODE_SIGNING",
  ]) {
    if (environmentVariables.has(name))
      check(
        "ENVIRONMENT_VARIABLE_MATCHES_REPOSITORY",
        name,
        variables.has(name) &&
          variables.get(name) === environmentVariables.get(name),
        variableKnown,
      );
  }
  const secrets = new Set(
    [...entries(snapshot.secrets), ...entries(environment?.secrets)].map(
      (item) => item?.name,
    ),
  );
  const disabled = variables.get("TELEMETRY_DISABLED") ?? "0";
  check(
    "TELEMETRY_SWITCH_VALID",
    "TELEMETRY_DISABLED",
    typeof disabled === "string" && /^[01]$/.test(disabled || "0"),
    variableKnown,
  );
  check(
    "TELEMETRY_SWITCH_EXPLICIT",
    "TELEMETRY_DISABLED",
    variables.has("TELEMETRY_DISABLED"),
    variableKnown,
    false,
  );
  for (const name of [
    "TAURI_SIGNING_PRIVATE_KEY",
    "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
    ...(disabled !== "1" ? ["POSTHOG_API_KEY"] : []),
  ])
    check("REQUIRED_SECRET_PRESENT", name, secrets.has(name), secretKnown);
  if (disabled !== "1") {
    const tokenNames = [
      "POSTHOG_DESKTOP_TOKEN",
      "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN",
      "POSTHOG_PROJECT_TOKEN",
    ];
    const tokens = tokenNames.map((name) => variables.get(name));
    for (const name of tokenNames)
      check(
        "PUBLIC_PROJECT_TOKEN_VALID",
        name,
        typeof variables.get(name) === "string" &&
          TOKEN.test(variables.get(name)),
        variableKnown,
      );
    check(
      "PUBLIC_PROJECT_TOKENS_MATCH",
      "PostHog",
      tokens.every((token) => typeof token === "string" && TOKEN.test(token)) &&
        new Set(tokens).size === 1,
      variableKnown,
    );
    for (const name of ["POSTHOG_HOST", "NEXT_PUBLIC_POSTHOG_HOST"])
      check(
        "POSTHOG_US_HOST_VALID",
        name,
        typeof variables.get(name) === "string" &&
          variables.get(name).replace(/\/+$/, "") ===
            "https://us.i.posthog.com",
        variableKnown,
      );
    check(
      "POSTHOG_PROJECT_ID_VALID",
      "POSTHOG_PROJECT_ID",
      typeof variables.get("POSTHOG_PROJECT_ID") === "string" &&
        /^\d+$/.test(variables.get("POSTHOG_PROJECT_ID")),
      variableKnown,
    );
    check(
      "POSTHOG_API_ACCESS_UNVERIFIED",
      "POSTHOG_API_KEY",
      false,
      false,
      false,
    );
  }
  check(
    "NOTICE_VERSION_DECLARED",
    "TELEMETRY_POLICY_PUBLISHED_VERSION",
    variables.get("TELEMETRY_POLICY_PUBLISHED_VERSION") ===
      RELEASE_NOTICE_VERSION,
    variableKnown,
  );
  const signingPolicy = variables.get("REQUIRE_WINDOWS_CODE_SIGNING") ?? "0";
  check(
    "WINDOWS_SIGNING_POLICY_VALID",
    "REQUIRE_WINDOWS_CODE_SIGNING",
    typeof signingPolicy === "string" && /^[01]$/.test(signingPolicy || "0"),
    variableKnown,
  );
  check(
    "FFMPEG_SOURCE_REVIEW_APPROVED",
    "compliance/ffmpeg-sources.json",
    manifest?.schemaVersion === 1 && manifest.reviewed === true,
    object(manifest),
  );
  for (const [code, name] of [
    ["SECRET_CONTENTS_UNVERIFIED", "signing-credentials"],
    ["NOTICE_PUBLICATION_UNVERIFIED", "telemetry-policy"],
    ["DEPLOYMENT_RELEASE_SHA_UNVERIFIED", "production-deployment"],
    ["ARTIFACTS_AND_MANUAL_GATES_UNVERIFIED", "release"],
  ])
    check(code, name, false, false, false);
  return {
    configurationReady: checks.every(
      (item) => !item.blocking || (item.known && item.passed),
    ),
    publicationVerified: false,
    checks,
  };
}
