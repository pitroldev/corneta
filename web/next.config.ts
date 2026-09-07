import type { NextConfig } from "next";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  releaseConfigErrors,
  resolveBuildSha,
} from "./lib/server/release-config";

// No desenvolvimento local, reaproveita as credenciais que já existem no `.env`
// da aplicação desktop. `process.loadEnvFile` não sobrescreve variáveis fornecidas
// pelo ambiente de deploy e nenhuma delas é enviada ao browser pelo Next.js.
try {
  if (process.env.NODE_ENV === "development") {
    process.loadEnvFile(
      resolve(dirname(fileURLToPath(import.meta.url)), "../.env"),
    );
  }
} catch {
  // CI e produção devem fornecer os segredos pelo ambiente do servidor.
}

const buildSha = resolveBuildSha(process.env);
if (
  process.env.VERCEL_ENV === "production" ||
  process.env.CORNETA_RELEASE_CHECK === "1"
) {
  const errors = releaseConfigErrors({
    ...process.env,
    BUILD_SHA: buildSha,
    NEXT_PUBLIC_BUILD_SHA: buildSha,
  });
  if (errors.length)
    throw new Error(`Publicação bloqueada:\n${errors.join("\n")}`);
}

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR?.trim() || ".next",
  poweredByHeader: false,
  reactStrictMode: true,
  // Only public identity is compiled in; never put OAuth/Redis secrets here.
  env: { NEXT_PUBLIC_BUILD_SHA: buildSha, BUILD_SHA: buildSha },
  outputFileTracingIncludes: {
    "/*": ["./.generated/editorial.json", "./content/people.json"],
  },
  async redirects() {
    return [
      {
        source: "/help/obs/:path*",
        destination: "/help/streaming-software/:path*",
        permanent: true,
      },
      {
        source: "/guides/obs/why-stream-lags",
        destination: "/guides/quality/why-stream-lags",
        permanent: true,
      },
      {
        source: "/guides/obs/dropped-frames",
        destination: "/guides/quality/dropped-frames",
        permanent: true,
      },
      {
        source: "/guides/obs",
        destination: "/guides/quality",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
