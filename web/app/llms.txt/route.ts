import { faqsFor, featuresFor, oneLinerFor, stepsFor } from "@/lib/content";
import {
  LOCALE_LABEL,
  localePath,
  translator,
  type Locale,
  type MessageKey,
} from "@/lib/i18n";
import { LEGAL_CONTACT, LEGAL_OPERATOR, legalHref } from "@/lib/legal";
import { siteUrl } from "@/lib/site";
import { listPublishedEditorial } from "@/lib/editorial/server";
import { editorialCollectionHref } from "@/lib/editorial/urls";

// Reuse public localized content; never introduce crawler-only claims.

export const dynamic = "force-static";

const abs = (path: string) => new URL(path, siteUrl).toString();

const OTHER: Record<Locale, Locale> = { "pt-BR": "en", en: "pt-BR" };

async function section(locale: Locale) {
  const t = translator(locale);
  const editorial = await listPublishedEditorial({ locale });
  const publishedCollections = new Set(
    editorial.map((document) => document.frontmatter.collection),
  );
  const editorialPages = [
    ...(publishedCollections.has("help")
      ? [
          `- [${t("knowledge.help.action")}](${abs(editorialCollectionHref(locale, "help"))})`,
        ]
      : []),
    ...(publishedCollections.has("guides")
      ? [
          `- [${t("hero.nav.guides")}](${abs(editorialCollectionHref(locale, "guides"))})`,
        ]
      : []),
    ...editorial.map(
      (document) =>
        `- [${document.frontmatter.title}](${abs(document.href)}) — ${document.frontmatter.summary}`,
    ),
  ];
  const other = OTHER[locale];
  return `# Corneta

> ${oneLinerFor(t)}

${t("chrome.llms.intro")}

${t("chrome.llms.heading.features")}

${featuresFor(t)
  .map((f) => `- ${f}`)
  .join("\n")}

${t("chrome.llms.heading.notis")}

${[1, 2, 3, 4].map((n) => t(`chrome.llms.notis.${n}` as MessageKey)).join("\n")}

${t("chrome.llms.heading.steps")}

${stepsFor(t)
  .map((s, i) => `${i + 1}. **${s.title}** — ${s.text}`)
  .join("\n")}

${t("chrome.llms.heading.platforms")}

${t("chrome.llms.platforms.body")}

${t("steps.platforms.note.validation")}

${t("chrome.llms.heading.faq")}

${faqsFor(t)
  .map((f) => `### ${f.question}\n\n${f.answer}`)
  .join("\n\n")}

${t("chrome.llms.heading.pages")}

- [${t("chrome.llms.link.home")}](${abs(localePath(locale))}) · [${LOCALE_LABEL[other]}](${abs(localePath(other))})
- [${t("chrome.llms.link.privacy")}](${abs(legalHref(locale, "privacy"))})
- [${t("chrome.llms.link.terms")}](${abs(legalHref(locale, "terms"))})
${editorialPages.length > 0 ? `${editorialPages.join("\n")}\n` : ""}- [${t("chrome.llms.link.source")}](https://github.com/pitroldev/corneta)

${t("chrome.llms.heading.who")}

${LEGAL_OPERATOR} — ${t("chrome.llms.contact.label")} ${LEGAL_CONTACT}
`;
}

// The site is bilingual, so the file carries the Portuguese and the English version in full.
async function body() {
  return `${await section("pt-BR")}\n---\n\n${await section("en")}`;
}

export async function GET() {
  return new Response(await body(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
