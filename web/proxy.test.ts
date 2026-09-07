import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { config, proxy } from "./proxy";

function request(path: string, acceptLanguage = "pt-BR") {
  return new NextRequest(`https://www.corneta.live${path}`, {
    headers: { "accept-language": acceptLanguage },
  });
}

describe("site proxy", () => {
  it("rewrites Portuguese Help and Guides routes to the internal locale", () => {
    for (const path of [
      "/help",
      "/help/obs",
      "/help/obs/first-live?from=search",
      "/guides",
      "/guides/multistream/obs-multistream",
      "/search?q=obs",
    ]) {
      const response = proxy(request(path, "en-US"));
      const expected = new URL(path, "https://www.corneta.live");
      expected.pathname = `/pt-BR${expected.pathname}`;

      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-rewrite")).toBe(
        expected.toString(),
      );
      expect(response.headers.get("location")).toBeNull();
    }
  });

  it("redirects internal pt-BR routes to public URLs with 308", () => {
    for (const [internal, publicPath] of [
      ["/pt-BR/help", "/help"],
      ["/pt-BR/help/obs/first-live?from=old", "/help/obs/first-live?from=old"],
      ["/pt-BR/guides", "/guides"],
      ["/pt-BR/guides/quality/bitrate", "/guides/quality/bitrate"],
      ["/pt-BR/search?q=upload", "/search?q=upload"],
    ]) {
      const response = proxy(request(internal));

      expect(response.status).toBe(308);
      expect(response.headers.get("location")).toBe(
        `https://www.corneta.live${publicPath}`,
      );
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    }
  });

  it("keeps English routes direct and negotiates language only at the root", () => {
    for (const path of [
      "/en/help",
      "/en/help/obs/first-live",
      "/en/guides",
      "/en/guides/multistream/obs-multistream",
      "/en/search?q=obs",
      "/api/health",
    ]) {
      const response = proxy(request(path, "en-US"));
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
      expect(response.headers.get("location")).toBeNull();
    }

    const root = proxy(request("/", "en-US"));
    expect(root.status).toBe(307);
    expect(root.headers.get("location")).toBe("https://www.corneta.live/en");
  });

  it("limits the matcher to the root and Portuguese aliases", () => {
    expect(config.matcher).toEqual([
      "/",
      "/pt-BR",
      "/legal/:path*",
      "/help/:path*",
      "/guides/:path*",
      "/search/:path*",
      "/pt-BR/legal/:path*",
      "/pt-BR/help/:path*",
      "/pt-BR/guides/:path*",
      "/pt-BR/search/:path*",
    ]);
    expect(config.matcher).not.toContain("/en/:path*");
  });
});
