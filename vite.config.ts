import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import posthog from "@posthog/rollup-plugin";
import pkg from "./package.json" with { type: "json" };

// Porta padrão do Tauri para o dev server.
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
    "Release com telemetria ativa exige Personal API Key e project ID válidos para os source maps.",
  );
}
if (sourceMapsRequired && sourceMapDryRun) {
  throw new Error(
    "Release com telemetria ativa não permite POSTHOG_CLI_DRY_RUN.",
  );
}
const shouldUploadSourceMaps = Boolean(
  !telemetryBuildDisabled && sourceMapCredentialsValid,
);

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [
    react(),
    tailwindcss(),
    ...(shouldUploadSourceMaps
      ? [
          posthog({
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

  // Tauri espera um esquema de erros consistente; não limpamos a tela.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: {
      // Não observar a pasta do Rust.
      ignored: ["**/src-tauri/**"],
    },
  },

  // Variáveis de ambiente do Tauri ficam disponíveis no front com este prefixo.
  envPrefix: ["VITE_", "TAURI_ENV_"],

  test: {
    // `.claude/worktrees` guarda CÓPIAS inteiras do repositório (worktrees de
    // sessão). Sem excluir, o Vitest roda a suíte duas vezes — e a segunda é uma
    // versão ANTIGA do código, que pode passar ou quebrar por conta própria.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.claude/**"],
  },
  build: {
    // Alvo do WebView2 (Windows) / WKWebView; ES2021 é seguro.
    target: "es2021",
    minify: !process.env.TAURI_ENV_DEBUG ? "oxc" : false,
    // Em release, mapas só existem durante o upload autenticado do PostHog. O plugin os apaga
    // antes de o Tauri empacotar o `dist`; builds locais/PRs continuam sem credenciais.
    sourcemap: shouldUploadSourceMaps
      ? "hidden"
      : !!process.env.TAURI_ENV_DEBUG,
    rolldownOptions: {
      // Duas páginas: o app principal e a janela flutuante do chat (entry próprio).
      input: {
        main: "index.html",
        chat: "chat.html",
      },
    },
  },
}));
