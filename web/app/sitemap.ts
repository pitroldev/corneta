import type { MetadataRoute } from "next";
import { CONTENT_UPDATED_ISO } from "@/lib/content";
import { LEGAL_ROUTES, LEGAL_UPDATED_ISO } from "@/lib/legal";
import { siteUrl } from "@/lib/site";

// Só páginas HTML indexáveis entram aqui. Ficam de fora, de propósito:
// `/llms.txt` (é insumo pra modelo, não página de busca), `/robots.txt`,
// `/manifest.webmanifest`, `/opengraph-image` e as rotas de `/api/v1/*`.
//
// `priority` e `changeFrequency` seguem preenchidos por compatibilidade com
// outros buscadores, mas o Google declaradamente ignora os dois — quem faz
// trabalho aqui é o `lastModified`, e por isso ele existe em toda entrada.

const at = (iso: string) => new Date(`${iso}T00:00:00Z`);

export default function sitemap(): MetadataRoute.Sitemap {
  const legal = at(LEGAL_UPDATED_ISO);

  return [
    {
      url: siteUrl.toString(),
      lastModified: at(CONTENT_UPDATED_ISO),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: new URL(LEGAL_ROUTES.privacy, siteUrl).toString(),
      lastModified: legal,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: new URL(LEGAL_ROUTES.terms, siteUrl).toString(),
      lastModified: legal,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
