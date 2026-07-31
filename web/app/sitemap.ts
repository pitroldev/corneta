import type { MetadataRoute } from "next";
import { CONTENT_UPDATED_ISO } from "@/lib/content";
import { LEGAL_ROUTES, LEGAL_UPDATED_ISO } from "@/lib/legal";
import { localePath } from "@/lib/i18n";
import { siteUrl } from "@/lib/site";

// Só páginas HTML indexáveis entram aqui. Ficam de fora, de propósito:
// `/llms.txt` (é insumo pra modelo, não página de busca), `/robots.txt`,
// `/manifest.webmanifest`, `/opengraph-image` e as rotas de `/api/v1/*`.
//
// `priority` e `changeFrequency` seguem preenchidos por compatibilidade com
// outros buscadores, mas o Google declaradamente ignora os dois — quem faz
// trabalho aqui é o `lastModified`, e por isso ele existe em toda entrada.

const at = (iso: string) => new Date(`${iso}T00:00:00Z`);
const abs = (path: string) => new URL(path, siteUrl).toString();

export default function sitemap(): MetadataRoute.Sitemap {
  const legal = at(LEGAL_UPDATED_ISO);

  // As duas versões da home entram com `alternates.languages` recíproco. As
  // legais NÃO ganham alternates: existem só em pt-BR, e declarar um par que a
  // outra ponta não devolve é o que vira "no return tag" no Search Console.
  const home = at(CONTENT_UPDATED_ISO);
  const languages = {
    "pt-BR": abs(localePath("pt-BR")),
    en: abs(localePath("en")),
    "x-default": abs(localePath("pt-BR")),
  };

  return [
    {
      url: abs(localePath("pt-BR")),
      lastModified: home,
      changeFrequency: "weekly",
      priority: 1,
      alternates: { languages },
    },
    {
      url: abs(localePath("en")),
      lastModified: home,
      changeFrequency: "weekly",
      priority: 0.9,
      alternates: { languages },
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
