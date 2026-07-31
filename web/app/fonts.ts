import { Baloo_2, Inter } from "next/font/google";

// As MESMAS fontes do app: Baloo 2 para as falas e Inter para o que se lê e opera.
//
// Vivem fora dos layouts porque agora existem DOIS layouts raiz — o do site (que
// muda de idioma) e o das páginas legais (que é sempre pt-BR). Declarar
// `next/font` duas vezes geraria dois pré-carregamentos da mesma fonte.

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
