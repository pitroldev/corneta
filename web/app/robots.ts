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

const publicRule = (userAgent: string) => ({
  userAgent,
  allow: "/",
  // Não é barreira de segurança: apenas evita gastar crawl em endpoints JSON
  // que não são resultados de busca. As rotas continuam protegidas no código.
  disallow: ["/api/"],
});

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      publicRule("*"),
      ...AI_AGENTS.map(publicRule),
    ],
    sitemap: new URL("/sitemap.xml", siteUrl).toString(),
    host: siteUrl.host,
  };
}
