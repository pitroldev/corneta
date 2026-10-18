import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Portuguese URLs are public without a prefix; the proxy rewrites them to the internal locale route.
export function internalRoute(pathname) {
  if (pathname === "/") return "/pt-BR";
  if (pathname === "/en" || pathname.startsWith("/en/")) return pathname;
  return `/pt-BR${pathname}`;
}

export function sitemapPathsWithoutPage(sitemapXml, prerenderManifest) {
  const routes = new Set(Object.keys(prerenderManifest.routes ?? {}));
  const missing = [];
  for (const [, location] of sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const { pathname } = new URL(location);
    if (!routes.has(internalRoute(pathname))) missing.push(pathname);
  }
  return missing;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const sitemap = readFileSync(
    resolve(webRoot, ".next/server/app/sitemap.xml.body"),
    "utf8",
  );
  const manifest = JSON.parse(
    readFileSync(resolve(webRoot, ".next/prerender-manifest.json"), "utf8"),
  );
  const missing = sitemapPathsWithoutPage(sitemap, manifest);
  if (missing.length > 0) {
    console.error(
      `Sitemap URLs without a prerendered page (they answer 404):\n${missing.join("\n")}`,
    );
    process.exitCode = 1;
  } else {
    console.log("Build routes: every sitemap URL has a prerendered page.");
  }
}
