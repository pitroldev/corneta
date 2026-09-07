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
});
