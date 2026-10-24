import { Baloo_2, Inter } from "next/font/google";

// Share font declarations across both root layouts to avoid duplicate preload identities.

const display = Baloo_2({
  subsets: ["latin"],
  variable: "--font-baloo",
  display: "swap",
});

// The body text paints first in the metric-matched fallback, so its font does not need to compete
// with the stylesheet for bandwidth before the first paint.
const body = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  preload: false,
});

export const fontVars = `${display.variable} ${body.variable}`;
