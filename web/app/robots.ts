import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

const AI_AGENTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "meta-externalagent",
  "CCBot",
];

const publicRule = (userAgent: string) => ({
  userAgent,
  allow: "/",
  // Robots directives are not an access-control boundary.
  disallow: ["/api/"],
});

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [publicRule("*"), ...AI_AGENTS.map(publicRule)],
    sitemap: new URL("/sitemap.xml", siteUrl).toString(),
    host: siteUrl.host,
  };
}
