import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { isLocale, LOCALES } from "@/lib/i18n";
import { legalUi } from "@/lib/legal-ui";
import { siteUrl } from "@/lib/site";
import { fontVars } from "../../fonts";
import { LegalHeader } from "./legal/_components/legal-chrome";
import "../../globals.css";

// Layout RAIZ das páginas jurídicas — o segundo do projeto, ao lado do de
// (site)/[locale]. Ter dois é o que deixa o `<html lang>` e o tema mudarem aqui
// sem arrastar o site junto: o resto do site vive no breu, e documento jurídico
// é texto longo que se lê no papel.
//
// A VERSÃO EM PORTUGUÊS É A QUE VINCULA. Estes documentos são escritos sobre o
// CDC e a LGPD, em português, e é esse texto que vale juridicamente. A tradução
// existe pra quem não lê português entender o que aceitou — e cada página em
// inglês diz isso, em destaque, antes do documento (`LegalBindingNotice`).

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
        {/* As páginas legais vivem no PAPEL, ao contrário do resto do site: são
            texto longo, e ler parágrafo comprido em tinta clara sobre breu cansa. */}
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
