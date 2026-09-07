import { Baloo_2, Inter } from "next/font/google";

// Share font declarations across both root layouts to avoid duplicate preload identities.

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

export const fontVars = `${display.variable} ${body.variable}`;
