import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Porta padrão do Tauri para o dev server.
const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  // Tauri espera um esquema de erros consistente; não limpamos a tela.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: {
      // Não observar a pasta do Rust.
      ignored: ["**/src-tauri/**"],
    },
  },

  // Variáveis de ambiente do Tauri ficam disponíveis no front com este prefixo.
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    // Alvo do WebView2 (Windows) / WKWebView; ES2021 é seguro.
    target: "es2021",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    rollupOptions: {
      // Duas páginas: o app principal e a janela flutuante do chat (entry próprio).
      input: {
        main: "index.html",
        chat: "chat.html",
      },
    },
  },
}));
