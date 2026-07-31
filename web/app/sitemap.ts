import type { MetadataRoute } from "next";
import { CONTENT_UPDATED_ISO } from "@/lib/content";
import { LEGAL_UPDATED_ISO, legalHref } from "@/lib/legal";
import { LOCALES, localePath } from "@/lib/i18n";
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
    // Os quatro documentos: dois idiomas × dois textos. Cada um declara o par
    // hreflang recíproco, igual à home — sem isso o Google trata a tradução
    // como página órfã.
    ...(["privacy", "terms"] as const).flatMap((doc) => {
      const alternates = {
        languages: {
          "pt-BR": abs(legalHref("pt-BR", doc)),
          en: abs(legalHref("en", doc)),
          "x-default": abs(legalHref("pt-BR", doc)),
        },
      };
      return LOCALES.map((locale) => ({
        url: abs(legalHref(locale, doc)),
        lastModified: legal,
        changeFrequency: "yearly" as const,
        priority: 0.3,
        alternates,
      }));
    }),
  ];
}
