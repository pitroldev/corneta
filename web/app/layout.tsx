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
    default: "Corneta — multistream: uma live, várias comunidades",
    template: "%s | Corneta",
  },
  description:
    "Transmita para Twitch, YouTube, Kick e mais ao mesmo tempo, direto do seu PC: cada plataforma independente, chat reunido e nada de mensalidade. Grátis para Windows.",
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
      "Multistream que roda no seu PC: cada plataforma independente, chat reunido e download grátis para Windows.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Corneta — uma live, várias comunidades",
    description:
      "Uma live sua em várias plataformas ao mesmo tempo, com tudo no seu controle.",
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
