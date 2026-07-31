import { NextResponse, type NextRequest } from "next/server";
import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_COOKIE,
  negotiateLocale,
} from "@/lib/i18n";

// Idioma automático — e por que ele é tão contido.
//
// O `/` é a URL canônica do site e já está indexada em português. Redirecionar
// automático é justamente o que o Google desaconselha, porque o robô rastreia
// mandando `Accept-Language: en` boa parte do tempo: um redirecionamento
// permanente ensinaria o buscador que a home "de verdade" é a inglesa, e o
// público brasileiro — que é o do produto — perderia a página que procura.
//
// Por isso, três travas:
//  • redireciona SÓ a raiz, e SÓ enquanto não existe escolha salva no cookie;
//  • usa 307 (temporário), nunca 301 — não transfere autoridade de URL;
//  • responde com `Vary: Accept-Language`, que é o que avisa cache e crawler de
//    que aquela URL muda conforme o cabeçalho.
//
// Deliberadamente NÃO farejamos user-agent pra tratar robô diferente de gente:
// servir conteúdo diferente pro buscador é cloaking, e o remédio seria pior que
// a doença. A dupla hreflang + canonical por idioma é o que mantém as duas
// versões indexadas certo.

/** A home negocia idioma; `/legal` só é reescrito pro segmento interno. `/api`
 *  nunca é mexido. */
export const config = {
  matcher: ["/", "/pt-BR", "/legal/:path*", "/pt-BR/legal/:path*"],
};

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // `/pt-BR` é rota interna: ela existe porque o `[locale]` precisa de um
  // segmento, mas expor as duas (`/` e `/pt-BR`) com o mesmo conteúdo seria
  // conteúdo duplicado. Aqui a permanente é correta — a URL boa é `/`.
  if (pathname === "/pt-BR" || pathname.startsWith("/pt-BR/legal")) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.slice("/pt-BR".length) || "/";
    return NextResponse.redirect(url, 308);
  }

  // Os documentos jurídicos NÃO negociam idioma: `/legal/...` é a versão em
  // português e ponto. É a URL já publicada, linkada de dentro do app instalado
  // e a que vincula juridicamente — mandar quem tem o navegador em inglês pra
  // tradução seria trocar o texto que vale pelo que não vale, sem ele pedir.
  // Quem quer a tradução clica no link que existe no topo de cada documento.
  if (pathname.startsWith("/legal")) {
    return NextResponse.rewrite(
      new URL(`/${DEFAULT_LOCALE}${pathname}`, req.url),
    );
  }

  const saved = req.cookies.get(LOCALE_COOKIE)?.value;
  const chosen =
    saved && isLocale(saved)
      ? saved
      : negotiateLocale(req.headers.get("accept-language"));

  // Quem já escolheu, ou quem fala português, fica onde está: `/` renderiza a
  // versão padrão sem nenhum desvio.
  if (chosen === DEFAULT_LOCALE) {
    const res = NextResponse.rewrite(new URL(`/${DEFAULT_LOCALE}`, req.url));
    res.headers.set("Vary", "Accept-Language, Cookie");
    return res;
  }

  const url = req.nextUrl.clone();
  url.pathname = `/${chosen}`;
  const res = NextResponse.redirect(url, 307);
  res.headers.set("Vary", "Accept-Language, Cookie");
  return res;
}
