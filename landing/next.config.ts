import type { NextConfig } from "next";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// No desenvolvimento local, reaproveita as credenciais que já existem no `.env`
// da aplicação desktop. `process.loadEnvFile` não sobrescreve variáveis fornecidas
// pelo ambiente de deploy e nenhuma delas é enviada ao browser pelo Next.js.
try {
  process.loadEnvFile(
    resolve(dirname(fileURLToPath(import.meta.url)), "../.env"),
  );
} catch {
  // CI e produção devem fornecer os segredos pelo ambiente do servidor.
}

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR?.trim() || ".next",
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
