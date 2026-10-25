import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import nextConfig from "./next.config";

describe("legacy editorial redirects", () => {
  it("pins the build root to the workspace rather than home-directory lockfiles", () => {
    expect(nextConfig.turbopack?.root).toBe(
      resolve(dirname(fileURLToPath(import.meta.url)), ".."),
    );
  });
  it("preserves existing OBS category URLs through permanent redirects", async () => {
    const redirects = await nextConfig.redirects?.();

    expect(redirects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "/help/obs/:path*",
          destination: "/help/streaming-software/:path*",
          permanent: true,
        }),
        expect.objectContaining({
          source: "/guides/obs/why-stream-lags",
          destination: "/guides/quality/why-stream-lags",
          permanent: true,
        }),
        expect.objectContaining({
          source: "/guides/obs/dropped-frames",
          destination: "/guides/quality/dropped-frames",
          permanent: true,
        }),
      ]),
    );
  });
  it("redirects internal pt-BR collection URLs to their public paths", async () => {
    const redirects = await nextConfig.redirects?.();
    expect(redirects).toEqual(
      expect.arrayContaining([
        {
          source: "/pt-BR/:collection(legal|help|guides|search)/:path*",
          destination: "/:collection/:path*",
          permanent: true,
        },
      ]),
    );
  });
  it("serves Portuguese collections from the internal locale before the filesystem", async () => {
    const rewrites = await nextConfig.rewrites?.();
    expect(rewrites).toEqual({
      beforeFiles: [
        {
          source: "/:collection(legal|help|guides|search)/:path*",
          destination: "/pt-BR/:collection/:path*",
        },
      ],
      afterFiles: [],
      fallback: [],
    });
  });
});
