import type { NextConfig } from "next";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  releaseConfigErrors,
  resolveBuildSha,
} from "./lib/server/release-config";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Portuguese collections keep unprefixed public URLs over the internal pt-BR routes.
const PT_COLLECTIONS = "legal|help|guides|search";

// Local development may reuse app configuration; contributor checks must never load it.
try {
  if (
    process.env.NODE_ENV === "development" &&
    process.env.CORNETA_CONTRIBUTOR !== "1"
  ) {
    process.loadEnvFile(resolve(workspaceRoot, ".env"));
  }
} catch {
  // CI can supply configuration directly through the environment.
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
    throw new Error(`Publication blocked:\n${errors.join("\n")}`);
}

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR?.trim() || ".next",
  // An unrelated lockfile in a parent/home directory must not expand the build
  // workspace or make a clean clone depend on the maintainer's machine layout.
  turbopack: { root: workspaceRoot },
  poweredByHeader: false,
  reactStrictMode: true,
  // Only public metadata belongs in the browser bundle; never expose server credentials.
  env: { NEXT_PUBLIC_BUILD_SHA: buildSha, BUILD_SHA: buildSha },
  outputFileTracingIncludes: {
    "/*": ["./.generated/editorial.json", "./content/people.json"],
  },
  async redirects() {
    return [
      // The internal Portuguese prefix must redirect to the established public URL.
      { source: "/pt-BR", destination: "/", permanent: true },
      {
        source: `/pt-BR/:collection(${PT_COLLECTIONS})/:path*`,
        destination: "/:collection/:path*",
        permanent: true,
      },
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
  async rewrites() {
    return {
      // Before the filesystem: [locale] pages are pre-generated only under their locale prefix.
      beforeFiles: [
        {
          source: `/:collection(${PT_COLLECTIONS})/:path*`,
          destination: "/pt-BR/:collection/:path*",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
