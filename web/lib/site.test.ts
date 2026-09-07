import { afterEach, describe, expect, it, vi } from "vitest";

async function loadSiteModule() {
  vi.resetModules();
  return import("./site");
}

describe.sequential("canonical site URL", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("fails in production when the canonical URL is absent", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");

    await expect(loadSiteModule()).rejects.toThrow(
      /NEXT_PUBLIC_SITE_URL is missing/,
    );
  });

  it("fails in production for noncanonical hosts or paths", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
    await expect(loadSiteModule()).rejects.toThrow(
      /Production NEXT_PUBLIC_SITE_URL must be https:\/\/www\.corneta\.live/,
    );

    vi.stubEnv(
      "NEXT_PUBLIC_SITE_URL",
      "https://www.corneta.live/preview?token=secret",
    );
    await expect(loadSiteModule()).rejects.toThrow(/only protocol and host/);
  });

  it("accepts exactly the canonical production origin", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.corneta.live");

    const { siteUrl } = await loadSiteModule();
    expect(siteUrl.href).toBe("https://www.corneta.live/");
  });
});
