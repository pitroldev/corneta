import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { posthogSourceMaps } from "./scripts/posthog-source-maps.ts";
import pkg from "./package.json" with { type: "json" };

const host = process.env.TAURI_DEV_HOST;
const posthogPersonalApiKey =
  process.env.POSTHOG_API_KEY ?? process.env.POSTHOG_CLI_API_KEY;
const posthogProjectId = process.env.POSTHOG_PROJECT_ID;
const telemetryBuildDisabled =
  process.env.VITE_TELEMETRY_DISABLED === "1" ||
  process.env.TELEMETRY_DISABLED === "1";
const sourceMapsRequired =
  process.env.REQUIRE_POSTHOG_SOURCE_MAPS === "1" && !telemetryBuildDisabled;
const sourceMapDryRun = /^(?:1|true|yes|on)$/i.test(
  process.env.POSTHOG_CLI_DRY_RUN ?? "",
);
const sourceMapCredentialsValid =
  /^phx_[A-Za-z0-9_-]{20,}$/.test(posthogPersonalApiKey ?? "") &&
  /^\d+$/.test(posthogProjectId ?? "");
if (sourceMapsRequired && !sourceMapCredentialsValid) {
  throw new Error(
    "Telemetry-enabled releases require a valid Personal API Key and project ID for source maps.",
  );
}
if (sourceMapsRequired && sourceMapDryRun) {
  throw new Error("Telemetry-enabled releases cannot use POSTHOG_CLI_DRY_RUN.");
}
const shouldUploadSourceMaps = Boolean(
  !telemetryBuildDisabled && sourceMapCredentialsValid,
);

export default defineConfig(({ command }) => ({
  // The explicit contributor profile must never compile the maintainer's .env.
  envDir: process.env.CORNETA_CONTRIBUTOR === "1" ? false : undefined,
  plugins: [
    react(),
    tailwindcss(),
    ...(command === "build" && shouldUploadSourceMaps
      ? [
          posthogSourceMaps({
            personalApiKey: posthogPersonalApiKey!,
            projectId: posthogProjectId!,
            host: process.env.POSTHOG_HOST,
            ...(process.env.POSTHOG_CLI_BINARY_PATH
              ? { cliBinaryPath: process.env.POSTHOG_CLI_BINARY_PATH }
              : {}),
            sourcemaps: {
              enabled: true,
              releaseName: "corneta-desktop",
              releaseVersion: pkg.version,
              build: process.env.VITE_BUILD_SHA,
              deleteAfterUpload: true,
            },
          }),
        ]
      : []),
  ],

  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },

  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },

  envPrefix: ["VITE_", "TAURI_ENV_"],

  test: {
    alias: {
      "@/lib/server": fileURLToPath(
        new URL("./web/lib/server", import.meta.url),
      ),
    },
    // Nested worktrees and generated snapshots contain independent, potentially stale suites.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.claude/**",
      "**/.artifacts/**",
    ],
  },
  worker: { format: "es" },
  build: {
    manifest: true,
    target: "es2021",
    minify: !process.env.TAURI_ENV_DEBUG ? "oxc" : false,
    // Delete authenticated-upload maps before Tauri packages dist; never ship them.
    sourcemap: shouldUploadSourceMaps
      ? "hidden"
      : !!process.env.TAURI_ENV_DEBUG,
    rolldownOptions: {
      input: {
        main: "index.html",
        chat: "chat.html",
      },
    },
  },
}));
