import type { Metadata, Viewport } from "next";
import { Baloo_2, IBM_Plex_Sans } from "next/font/google";
import { siteUrl } from "@/lib/site";
import "./globals.css";

const display = Baloo_2({
  subsets: ["latin"],
  variable: "--font-baloo",
  display: "swap",
});

const body = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: "Corneta — uma live, todo mundo ouvindo",
    template: "%s | Corneta",
  },
  description:
    "Multistream local, grátis e open source. Leve seu OBS para Twitch, YouTube, Kick e outras plataformas com chat, alertas e proteção numa central só.",
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
    title: "Corneta — uma live, todo mundo ouvindo",
    description:
      "Multistream local, grátis e open source, com chat, alertas e proteção numa central só.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Corneta — uma live, todo mundo ouvindo",
    description:
      "Multistream local, grátis e open source, com chat, alertas e proteção numa central só.",
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
