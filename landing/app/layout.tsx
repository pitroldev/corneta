import type { Metadata, Viewport } from "next";
import { Baloo_2, Inter } from "next/font/google";
import { siteUrl } from "@/lib/site";
import "./globals.css";

// As MESMAS fontes do app: Baloo 2 para as falas e Inter para o que se lê e opera.
const display = Baloo_2({
  subsets: ["latin"],
  variable: "--font-baloo",
  display: "swap",
});

const body = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: "Corneta — multistream local para streamers",
    template: "%s | Corneta",
  },
  description:
    "Leve um sinal do OBS para várias plataformas com saídas independentes, chat reunido e controle no seu PC. Baixe grátis para Windows.",
  applicationName: "Corneta",
  keywords: [
    "multistream",
    "streaming",
    "OBS",
    "Twitch",
    "YouTube",
    "Kick",
    "live",
    "open source",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: "/",
    siteName: "Corneta",
    title: "Corneta — uma live, várias comunidades",
    description:
      "Multistream local para streamers, com saídas independentes, chat reunido e download grátis para Windows.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Corneta — uma live, várias comunidades",
    description:
      "Leve seu OBS para várias plataformas e mantenha tudo no seu controle.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#100b07",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
