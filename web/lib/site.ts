// Production requires an explicit canonical origin; localhost is development-only.

const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
const canonicalProductionOrigin = "https://www.corneta.live";
const requiresCanonicalUrl = process.env.NODE_ENV === "production";

if (!raw && requiresCanonicalUrl) {
  throw new Error(
    "NEXT_PUBLIC_SITE_URL is missing. Sitemap, canonical URLs, and structured data " +
      "would point to http://localhost:3000. Set the canonical URL " +
      "(https://www.corneta.live) in the deployment environment.",
  );
}

let configuredSiteUrl: URL;
try {
  configuredSiteUrl = new URL(raw || "http://localhost:3000");
} catch {
  throw new Error(
    "NEXT_PUBLIC_SITE_URL is invalid. Provide only the site origin, for " +
      "example https://www.corneta.live.",
  );
}

if (
  configuredSiteUrl.username ||
  configuredSiteUrl.password ||
  configuredSiteUrl.pathname !== "/" ||
  configuredSiteUrl.search ||
  configuredSiteUrl.hash
) {
  throw new Error(
    "NEXT_PUBLIC_SITE_URL must contain only protocol and host, without " +
      "credentials, path, query, or fragment.",
  );
}

if (
  requiresCanonicalUrl &&
  configuredSiteUrl.origin !== canonicalProductionOrigin
) {
  throw new Error(
    `Production NEXT_PUBLIC_SITE_URL must be ${canonicalProductionOrigin}.`,
  );
}

export const siteUrl = configuredSiteUrl;
