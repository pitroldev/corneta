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

  it("falha em produção quando a URL canônica está ausente", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");

    await expect(loadSiteModule()).rejects.toThrow(
      /NEXT_PUBLIC_SITE_URL não definida/,
    );
  });

  it("falha em produção para host ou caminho diferentes do canônico", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
    await expect(loadSiteModule()).rejects.toThrow(
      /de produção deve ser https:\/\/www\.corneta\.live/,
    );

    vi.stubEnv(
      "NEXT_PUBLIC_SITE_URL",
      "https://www.corneta.live/preview?token=secret",
    );
    await expect(loadSiteModule()).rejects.toThrow(/somente protocolo e host/);
  });

  it("aceita exatamente a origem canônica em produção", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.corneta.live");

    const { siteUrl } = await loadSiteModule();
    expect(siteUrl.href).toBe("https://www.corneta.live/");
  });
});
