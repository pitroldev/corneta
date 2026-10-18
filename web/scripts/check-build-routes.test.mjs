import { describe, expect, it } from "vitest";
import {
  internalRoute,
  sitemapPathsWithoutPage,
} from "./check-build-routes.mjs";

const sitemap = (...paths) =>
  `<urlset>${paths
    .map((path) => `<url><loc>https://www.corneta.live${path}</loc></url>`)
    .join("")}</urlset>`;

describe("build route check", () => {
  it("maps public Portuguese and English URLs to internal locale routes", () => {
    expect(internalRoute("/")).toBe("/pt-BR");
    expect(internalRoute("/help/getting-started/first-stream")).toBe(
      "/pt-BR/help/getting-started/first-stream",
    );
    expect(internalRoute("/en")).toBe("/en");
    expect(internalRoute("/en/legal/privacy")).toBe("/en/legal/privacy");
  });

  it("accepts a sitemap whose URLs all have prerendered pages", () => {
    const manifest = {
      routes: { "/pt-BR": {}, "/pt-BR/help": {}, "/en": {} },
    };
    expect(
      sitemapPathsWithoutPage(sitemap("/", "/help", "/en"), manifest),
    ).toEqual([]);
  });

  it("reports sitemap URLs that would answer 404", () => {
    const manifest = { routes: { "/pt-BR/help/getting-started": {} } };
    expect(
      sitemapPathsWithoutPage(
        sitemap("/help/getting-started", "/help/getting-started/first-stream"),
        manifest,
      ),
    ).toEqual(["/help/getting-started/first-stream"]);
  });
});
