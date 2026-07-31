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

/** Só a home negocia idioma. `/legal` fica de fora porque existe apenas em
 *  português (é texto de CDC/LGPD), e `/api` nunca deve ser mexido. */
export const config = {
  matcher: ["/", "/pt-BR"],
};

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // `/pt-BR` é rota interna: ela existe porque o `[locale]` precisa de um
  // segmento, mas expor as duas (`/` e `/pt-BR`) com o mesmo conteúdo seria
  // conteúdo duplicado. Aqui a permanente é correta — a URL boa é `/`.
  if (pathname === "/pt-BR") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url, 308);
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
