import { faqsFor, featuresFor, oneLinerFor, stepsFor } from "@/lib/content";
import { translator } from "@/lib/i18n";
import {
  LEGAL_CONTACT,
  LEGAL_OPERATOR,
  LEGAL_ROUTES,
  legalHref,
} from "@/lib/legal";
import { siteUrl } from "@/lib/site";
import { listPublishedEditorial } from "@/lib/editorial/server";
import { editorialCollectionHref } from "@/lib/editorial/urls";

// Reuse public localized content; never introduce crawler-only claims.

export const dynamic = "force-static";

const abs = (path: string) => new URL(path, siteUrl).toString();

async function body() {
  const t = translator("pt-BR");
  const ONE_LINER = oneLinerFor(t);
  const FEATURES = featuresFor(t);
  const FAQS = faqsFor(t);
  const STEPS = stepsFor(t);
  const editorial = await listPublishedEditorial({ locale: "pt-BR" });
  const publishedCollections = new Set(
    editorial.map((document) => document.frontmatter.collection),
  );
  const editorialPages = [
    ...(publishedCollections.has("help")
      ? [
          `- [Central de ajuda](${abs(editorialCollectionHref("pt-BR", "help"))})`,
        ]
      : []),
    ...(publishedCollections.has("guides")
      ? [`- [Guias](${abs(editorialCollectionHref("pt-BR", "guides"))})`]
      : []),
    ...editorial.map(
      (document) =>
        `- [${document.frontmatter.title}](${abs(document.href)}) — ${document.frontmatter.summary}`,
    ),
  ];
  return `# Corneta

> ${ONE_LINER}

Multistream local, gratuito e open source (licença MIT), para Windows 10 e 11.
Feito para streamers brasileiros. Não é serviço de nuvem, não tem assinatura e
não exige cadastro: o vídeo sai do computador do streamer direto para cada
plataforma.

## O que a Corneta faz

${FEATURES.map((f) => `- ${f}`).join("\n")}

## O que a Corneta NÃO é

- Não substitui o OBS: cenas, câmera e áudio continuam no programa de captura.
- Não é relay em nuvem: nenhum servidor nosso recebe, armazena ou repassa vídeo.
- Não exige conta na Corneta — não existe cadastro nem login no site.
- Não tem versão para macOS ou Linux até agora, e não há data pública.

## Como usar em três passos

${STEPS.map((s, i) => `${i + 1}. **${s.title}** — ${s.text}`).join("\n")}

## Plataformas

${t("chrome.llms.platforms.body")}

${t("steps.platforms.note.validation")}

## Perguntas frequentes

${FAQS.map((f) => `### ${f.question}\n\n${f.answer}`).join("\n\n")}

## Páginas

- [Site e download](${abs("/")})
- [Site em inglês](${abs("/en")})
- [Política de privacidade](${abs(LEGAL_ROUTES.privacy)}) · [English](${abs(legalHref("en", "privacy"))})
- [Termos de uso](${abs(LEGAL_ROUTES.terms)}) · [English](${abs(legalHref("en", "terms"))})
${editorialPages.length > 0 ? `${editorialPages.join("\n")}\n` : ""}- [Código-fonte](https://github.com/pitroldev)

## Quem responde

${LEGAL_OPERATOR} — contato: ${LEGAL_CONTACT}
`;
}

export async function GET() {
  return new Response(await body(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
