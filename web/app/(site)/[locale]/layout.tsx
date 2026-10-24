import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { LEGAL_AUTHOR, LEGAL_OPERATOR } from "@/lib/legal";
import { siteUrl } from "@/lib/site";
import { TITLE_TEMPLATE } from "@/lib/page-title";
import { socialImage } from "@/lib/social-image";
import {
  isLocale,
  LOCALES,
  OG_LOCALE,
  localePath,
  translator,
  type Locale,
} from "@/lib/i18n";
import { fontVars } from "../../fonts";
import "../../globals.css";

export const dynamicParams = false;

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

const KEYWORD_KEYS = [
  "chrome.meta.keywords.1",
  "chrome.meta.keywords.2",
  "chrome.meta.keywords.3",
  "chrome.meta.keywords.4",
  "chrome.meta.keywords.5",
  "chrome.meta.keywords.6",
  "chrome.meta.keywords.7",
  "chrome.meta.keywords.8",
  "chrome.meta.keywords.9",
  "chrome.meta.keywords.10",
  "chrome.meta.keywords.11",
] as const;

function searchVerification(): Metadata["verification"] | undefined {
  const google = process.env.GOOGLE_SITE_VERIFICATION?.trim();
  const bing = process.env.BING_SITE_VERIFICATION?.trim();
  if (!google && !bing) return undefined;

  return {
    ...(google ? { google } : {}),
    ...(bing ? { other: { "msvalidate.01": bing } } : {}),
  };
}

function alternatesFor(locale: Locale) {
  return {
    canonical: localePath(locale),
    languages: {
      "pt-BR": localePath("pt-BR"),
      en: localePath("en"),
      "x-default": localePath("pt-BR"),
    },
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = translator(locale);
  const image = socialImage(locale);

  return {
    metadataBase: siteUrl,
    title: {
      default: t("chrome.meta.title.default"),
      template: TITLE_TEMPLATE,
    },
    description: t("chrome.meta.description"),
    applicationName: "Corneta",
    category: "technology",
    creator: LEGAL_OPERATOR,
    publisher: LEGAL_OPERATOR,
    authors: [{ name: LEGAL_AUTHOR, url: "https://github.com/pitroldev" }],
    keywords: KEYWORD_KEYS.map(t),
    verification: searchVerification(),
    alternates: alternatesFor(locale),
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-snippet": -1,
        "max-image-preview": "large",
        "max-video-preview": -1,
      },
    },
    openGraph: {
      type: "website",
      locale: OG_LOCALE[locale],
      alternateLocale: LOCALES.filter((l) => l !== locale).map(
        (l) => OG_LOCALE[l],
      ),
      url: localePath(locale),
      siteName: "Corneta",
      title: t("chrome.og.title"),
      description: t("chrome.og.description"),
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: t("chrome.og.title"),
      description: t("chrome.twitter.description"),
      images: [image],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#100b07",
  colorScheme: "dark",
};

export default async function SiteLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={locale} className={fontVars}>
      <body>{children}</body>
    </html>
  );
}
