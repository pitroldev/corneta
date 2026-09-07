import { afterEach, describe, expect, it } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertNoWebEnv,
  contributorEnvironment,
  contributorPlan,
  contributorToolScript,
} from "./contributor.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryWorkspaces = [];
afterEach(() => {
  for (const workspace of temporaryWorkspaces.splice(0))
    rmSync(workspace, { recursive: true, force: true });
});

describe("credential-free contributor profile", () => {
  it("keeps the machine toolchain but discards inherited application secrets and hooks", () => {
    const original = {
      Path: "test-bin",
      USERPROFILE: "test-profile",
      CARGO_HOME: "test-cargo",
      TAURI_SIGNING_PRIVATE_KEY: "must-not-survive",
      POSTHOG_API_KEY: "must-not-survive",
      VITE_POSTHOG_TOKEN: "must-not-survive",
      NEXT_PUBLIC_POSTHOG_TOKEN: "must-not-survive",
      KICK_CLIENT_SECRET: "must-not-survive",
      REDIS_REST_TOKEN: "must-not-survive",
      NODE_OPTIONS: "must-not-survive",
      RANDOM_FUTURE_SECRET: "must-not-survive",
      NEXT_PUBLIC_FUTURE_TOKEN: "must-not-survive",
      CARGO_TARGET_DIR: "official-artifacts",
    };
    const env = contributorEnvironment(original, root);
    expect(env.Path).toContain("test-bin");
    expect(env.USERPROFILE).toBe("test-profile");
    expect(env.CARGO_HOME).toBe("test-cargo");
    expect(Object.values(env)).not.toContain("must-not-survive");
    expect(original.KICK_CLIENT_SECRET).toBe("must-not-survive");
    expect(env.TELEMETRY_DISABLED).toBe("1");
    expect(env.VITE_TELEMETRY_DISABLED).toBe("1");
    expect(env.NEXT_PUBLIC_TELEMETRY_DISABLED).toBe("1");
    expect(env.CARGO_TARGET_DIR).toBe(
      resolve(root, ".artifacts/contributor/target"),
    );
  });

  it("cannot silently downgrade an official production deployment or release gate", () => {
    expect(() => contributorEnvironment({ VERCEL_ENV: "production" })).toThrow(
      "official",
    );
    expect(() =>
      contributorEnvironment({ CORNETA_RELEASE_CHECK: "1" }),
    ).toThrow("official");
  });

  it("accepts a clean clone and examples without requiring any environment file", () => {
    const workspace = mkdtempSync(join(tmpdir(), "corneta-contributor-"));
    temporaryWorkspaces.push(workspace);
    mkdirSync(join(workspace, "web"));
    writeFileSync(join(workspace, "web", ".env.example"), "EXAMPLE=\n");
    expect(() => assertNoWebEnv(workspace)).not.toThrow();
  });

  it.each([".env", ".env.local", ".env.production.local", ".env.development"])(
    "fails before Next can read %s, without touching its contents",
    (file) => {
      const workspace = mkdtempSync(join(tmpdir(), "corneta-contributor-"));
      temporaryWorkspaces.push(workspace);
      mkdirSync(join(workspace, "web"));
      const path = join(workspace, "web", file);
      writeFileSync(path, "DO_NOT_LOAD=sentinel\n");
      expect(() => assertNoWebEnv(workspace)).toThrow("clean clone/worktree");
      expect(readFileSync(path, "utf8")).toBe("DO_NOT_LOAD=sentinel\n");
    },
  );

  it("offers a local native build without installer or signing", () => {
    const [command] = contributorPlan("app:build");
    expect(command.tool).toBe("tauri");
    expect(command.args).toContain("--no-bundle");
    expect(command.args).toContain("src-tauri/tauri.contributor.conf.json");
    expect(() => contributorPlan("release")).toThrow("Usage:");
  });

  it("preserves official updater settings while giving the contributor its own identity", () => {
    const official = JSON.parse(
      readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8"),
    );
    const contributor = JSON.parse(
      readFileSync(join(root, "src-tauri/tauri.contributor.conf.json"), "utf8"),
    );
    expect(contributor.identifier).not.toBe(official.identifier);
    expect(contributor.productName).not.toBe(official.productName);
    expect(contributor.bundle).toMatchObject({
      active: false,
      createUpdaterArtifacts: false,
    });
    expect(contributor.plugins.updater.endpoints).toEqual([]);
    expect(contributor.plugins.updater.pubkey).toBe("");
    expect(official.bundle.createUpdaterArtifacts).toBe(true);
    expect(official.plugins.updater.endpoints).not.toEqual([]);
    expect(official.plugins.updater.pubkey).not.toBe("");
    const rust = readFileSync(join(root, "src-tauri/src/keys.rs"), "utf8");
    expect(rust).toContain(
      `const SERVICE: &str = "${contributor.identifier}";`,
    );
  });

  it("includes source checks but not calendar-dependent editorial publication gates", () => {
    const plan = contributorPlan("check");
    expect(plan.map(({ tool }) => tool)).toEqual([
      "format-check",
      "doc-links",
      "scripts-syntax",
      "eslint",
      "vitest",
      "tsc",
      "vite",
      "bundle-check",
      "tsx",
      "eslint",
      "tsc",
      "next",
    ]);
    expect(plan.find(({ tool }) => tool === "tsx").args).toContain(
      "scripts/check-editorial-content.ts",
    );
    expect(JSON.stringify(plan)).not.toContain("maintenance");
    const web = JSON.parse(
      readFileSync(join(root, "web/package.json"), "utf8"),
    );
    expect(web.scripts["check:contributor"]).toContain(
      "contributor.mjs web:check",
    );
    expect(web.scripts["check:contributor"]).not.toContain(
      "content:maintenance",
    );
    expect(web.scripts.check).not.toContain("content:maintenance:check");
    expect(web.scripts["build:release"]).toContain("content:maintenance:check");
  });

  it("resolves every CLI to installed JS without an arbitrary global pnpm shim", () => {
    for (const { tool, cwd } of contributorPlan("check")) {
      expect(
        readFileSync(contributorToolScript(tool, cwd), "utf8").length,
      ).toBeGreaterThan(0);
    }
    expect(() => contributorToolScript("unknown")).toThrow("Unknown");
  });
});
