import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ConfigEnv } from "vite";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("POSTHOG_API_KEY", `phx_${"a".repeat(32)}`);
  vi.stubEnv("POSTHOG_PROJECT_ID", "1234");
  vi.stubEnv("POSTHOG_HOST", "https://posthog.example.invalid");
  vi.stubEnv("POSTHOG_CLI_BINARY_PATH", undefined);
  vi.stubEnv("POSTHOG_CLI_DRY_RUN", undefined);
  vi.stubEnv("REQUIRE_POSTHOG_SOURCE_MAPS", "0");
  vi.stubEnv("VITE_TELEMETRY_DISABLED", "0");
  vi.stubEnv("TELEMETRY_DISABLED", "0");
  vi.stubEnv("TAURI_ENV_DEBUG", undefined);
});

afterEach(() => vi.unstubAllEnvs());

async function configFor(command: ConfigEnv["command"]) {
  const configure = (await import("../vite.config.ts")).default;
  if (typeof configure !== "function")
    throw new Error("Expected a Vite configuration factory.");
  return configure({
    command,
    mode: command === "build" ? "production" : "development",
  });
}

async function pluginNames(command: ConfigEnv["command"]) {
  const config = await configFor(command);
  return (config.plugins ?? []).flatMap((plugin) =>
    plugin && typeof plugin === "object" && "name" in plugin
      ? [plugin.name]
      : [],
  );
}

it("serves with source-map credentials without requiring or loading the upload CLI", async () => {
  expect(await pluginNames("serve")).not.toContain(
    "corneta-posthog-source-maps",
  );
});

it("requires an explicitly prepared CLI for authenticated builds", async () => {
  await expect(configFor("build")).rejects.toThrow("POSTHOG_CLI_BINARY_PATH");
});

it("enables uploads only in builds with an explicit CLI path", async () => {
  vi.stubEnv("POSTHOG_CLI_BINARY_PATH", "synthetic-cli-never-executed");
  expect(await pluginNames("build")).toContain("corneta-posthog-source-maps");
  expect((await configFor("build")).build?.sourcemap).toBe("hidden");
});

it.each([
  ["a missing Personal API Key", { POSTHOG_API_KEY: "" }],
  ["a project token as the API key", { POSTHOG_API_KEY: "phc_project_token" }],
  ["a non-numeric project ID", { POSTHOG_PROJECT_ID: "not-numeric" }],
])("refuses a release build with %s", async (_, changes) => {
  vi.stubEnv("REQUIRE_POSTHOG_SOURCE_MAPS", "1");
  for (const [name, value] of Object.entries(changes)) vi.stubEnv(name, value);
  await expect(configFor("build")).rejects.toThrow(
    "valid Personal API Key and project ID",
  );
});

it("refuses a release build that would only simulate the upload", async () => {
  vi.stubEnv("REQUIRE_POSTHOG_SOURCE_MAPS", "1");
  vi.stubEnv("POSTHOG_CLI_DRY_RUN", "1");
  await expect(configFor("build")).rejects.toThrow("POSTHOG_CLI_DRY_RUN");
});

it("does not require the upload CLI for telemetry-disabled builds", async () => {
  vi.stubEnv("VITE_TELEMETRY_DISABLED", "1");
  vi.stubEnv("TELEMETRY_DISABLED", "1");
  vi.stubEnv("REQUIRE_POSTHOG_SOURCE_MAPS", "1");
  expect(await pluginNames("build")).not.toContain(
    "corneta-posthog-source-maps",
  );
  expect((await configFor("build")).build?.sourcemap).toBe(false);
});
