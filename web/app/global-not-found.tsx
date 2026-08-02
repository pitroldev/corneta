import type { Metadata } from "next";
import Link from "next/link";
import { siteUrl } from "../lib/site";
import { BrandMark } from "./_components/brand-mark";
import { SoundWaves } from "./_components/decor";
import { fontVars } from "./fonts";
import {
  downloadButton,
  heroWaves,
  Shell,
  Slab,
  Sticker,
} from "./_components/ui";
import "./globals.css";

// Com DOIS layouts raiz (o do site e o das legais), o 404 não herda nenhum —
// por isso ele monta o próprio documento. Fica em português: quem cai aqui veio
// de uma URL quebrada, e a raiz do site é a versão portuguesa.

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: "Página não encontrada | Corneta",
  robots: { index: false, follow: true },
};

export default function GlobalNotFound() {
  return (
    <html lang="pt-BR" className={fontVars}>
      <body>
        <main className="relative grid min-h-screen place-items-center overflow-hidden py-[60px]">
          <SoundWaves className={heroWaves} />
          <Shell className="flex max-w-[620px] flex-col items-start">
            <BrandMark />
            <Sticker tone="tomate" className="mt-[42px] mb-[18px]">
              Erro 404
            </Sticker>
            <h1 className="text-[clamp(2.6rem,8vw,4.4rem)] leading-[0.95] tracking-[-0.035em] [&>span]:block">
              <span>Essa página</span>
              <span>
                <Slab>saiu do ar.</Slab>
              </span>
            </h1>
            <p className="my-[26px] mb-8 max-w-[46ch] text-[1.02rem] leading-[1.62] font-medium text-muted">
              A transmissão principal continua firme. Volte para o início e
              tente outro caminho.
            </p>
            <Link className={downloadButton} href="/">
              Voltar ao início
            </Link>
          </Shell>
        </main>
      </body>
    </html>
  );
}
