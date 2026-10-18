import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { config, proxy } from "./proxy";

function request(path: string, acceptLanguage = "pt-BR") {
  return new NextRequest(`https://www.corneta.live${path}`, {
    headers: { "accept-language": acceptLanguage },
  });
}

describe("site proxy", () => {
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

  it("runs only at the root; collection routing is static configuration", () => {
    expect(config.matcher).toEqual(["/"]);
  });

  it("rewrites the root to Portuguese or redirects to the chosen locale, varying by preference", () => {
    const pt = proxy(request("/", "pt-BR,pt;q=0.9"));
    expect(pt.headers.get("x-middleware-rewrite")).toBe(
      "https://www.corneta.live/pt-BR",
    );
    expect(pt.headers.get("vary")).toBe("Accept-Language, Cookie");
    const en = proxy(request("/", "en-US,en;q=0.9"));
    expect(en.status).toBe(307);
    expect(en.headers.get("vary")).toBe("Accept-Language, Cookie");
  });
});
