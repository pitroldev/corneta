import type { MetadataRoute } from "next";
import { LEGAL_ROUTES, LEGAL_UPDATED_ISO } from "@/lib/legal";
import { siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const legalUpdated = new Date(`${LEGAL_UPDATED_ISO}T00:00:00Z`);
  return [
    {
      url: siteUrl.toString(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: new URL(LEGAL_ROUTES.privacy, siteUrl).toString(),
      lastModified: legalUpdated,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: new URL(LEGAL_ROUTES.terms, siteUrl).toString(),
      lastModified: legalUpdated,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
