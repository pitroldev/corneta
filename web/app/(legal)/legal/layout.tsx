import type { Viewport } from "next";
import { fontVars } from "../../fonts";
import { LegalHeader } from "./_components/legal-chrome";
import "../../globals.css";

// Layout RAIZ das páginas jurídicas — o segundo do projeto, ao lado do de
// (site)/[locale].
//
// Elas ficam de fora do `[locale]` de propósito: são textos de CDC e LGPD, e uma
// tradução poderia ser lida como a versão vinculante do contrato. Por isso a
// URL não leva prefixo de idioma, o `lang` é fixo em pt-BR, e não existe
// `alternates.languages` aqui — declarar um par hreflang que não existe é o que
// gera erro de "no return tag" no Search Console.

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f3ead7",
  colorScheme: "light",
};

export default function LegalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={fontVars}>
      <body>
        {/* As páginas legais vivem no PAPEL, ao contrário do resto do site: são
            texto longo, e ler parágrafo comprido em tinta clara sobre breu cansa. */}
        <div className="min-h-screen bg-paper-raised bg-[image:var(--halftone-light)] bg-[length:20px_20px] text-ink">
          <a
            className="fixed top-3 left-3 z-100 -translate-y-[180%] rounded-md bg-brass px-[18px] py-[13px] font-display text-[0.88rem] font-extrabold text-brass-ink shadow-pop-brass transition-transform duration-140 focus:translate-y-0"
            href="#documento"
          >
            Pular para o documento
          </a>
          <LegalHeader />
          <main id="documento">{children}</main>
        </div>
      </body>
    </html>
  );
}
