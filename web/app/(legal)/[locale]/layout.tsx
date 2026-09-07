import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { isLocale, LOCALES } from "@/lib/i18n";
import { legalUi } from "@/lib/legal-ui";
import { siteUrl } from "@/lib/site";
import { fontVars } from "../../fonts";
import { LegalHeader } from "./legal/_components/legal-chrome";
import "../../globals.css";

export const dynamicParams = false;

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  metadataBase: siteUrl,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f3ead7",
  colorScheme: "light",
};

export default async function LegalLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const ui = legalUi(locale);

  return (
    <html lang={locale} className={fontVars}>
      <body>
        <div className="min-h-screen bg-paper-raised bg-[image:var(--halftone-light)] bg-[length:20px_20px] text-ink">
          <a
            className="fixed top-3 left-3 z-100 -translate-y-[180%] rounded-md bg-brass px-[18px] py-[13px] font-display text-[0.88rem] font-extrabold text-brass-ink shadow-pop-brass transition-transform duration-140 focus:translate-y-0"
            href="#documento"
          >
            {ui.skipToDocument}
          </a>
          <LegalHeader locale={locale} />
          <main id="documento">{children}</main>
        </div>
      </body>
    </html>
  );
}
