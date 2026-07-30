import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// Os agentes de IA já estariam liberados pelo `*`, mas listar por nome é uma
// declaração de intenção: a gente QUER ser lido e citado por motor de resposta.
// Nomear também evita que um bloqueio genérico entre por engano depois e derrube
// a visibilidade em ChatGPT, Claude, Perplexity e AI Overviews sem ninguém notar.
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

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/" },
      ...AI_AGENTS.map((userAgent) => ({ userAgent, allow: "/" })),
    ],
    sitemap: new URL("/sitemap.xml", siteUrl).toString(),
    host: siteUrl.host,
  };
}
