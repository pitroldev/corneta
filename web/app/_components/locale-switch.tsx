"use client";

import {
  LOCALES,
  LOCALE_COOKIE,
  LOCALE_LABEL,
  localePath,
  type Locale,
} from "@/lib/i18n";
import { GlobeIcon } from "./icons";
import { cn } from "./ui";

// ============================================================
// Troca de idioma: UM controle, não dois.
// ============================================================
// Era um par `PT | EN` com o ativo aceso, plantado entre a navegação e o botão
// de baixar. Três problemas, e o terceiro é o que pesa:
//
//  1. Ocupava 105px de barra permanente — mais que qualquer link de seção — pra
//     uma decisão que se toma no máximo uma vez por visita;
//  2. Sendo dois blocos clicáveis lado a lado, lia como mais um grupo de
//     navegação, e a barra passava a ter TRÊS grupos disputando o mesmo peso;
//  3. Encostava no "Baixar grátis", que é a única ação de conversão da página.
//     Chrome de preferência não divide vizinhança com a ação principal.
//
// Com dois idiomas, o controle mínimo correto é um botão que leva ao OUTRO. O
// código visível é o destino, e o nome acessível diz a frase inteira ("Ver em
// inglês") — que é o que resolve o "estou em qual?" sem gastar largura.
//
// A ARMADILHA que este componente continua existindo pra evitar: quem está em
// `/en` e clica "Português" vai pra `/`, onde o middleware lê
// `Accept-Language: en` e devolve pra `/en`. Sem cookie, a pessoa fica presa no
// inglês pra sempre, achando que o botão está quebrado. Por isso o cookie é
// gravado ANTES da navegação, e por isso continua sendo um `<a>` de verdade.
//
// O SEO não depende mais destes links: o `<head>` já emite
// `alternates.languages` (app/(site)/[locale]/layout.tsx), que é o sinal que o
// buscador segue. O `hrefLang` aqui fica porque é barato e correto.

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Código curto do idioma. Não é tradução: é o rótulo abreviado, o mesmo nos
 *  dois idiomas, e por isso mora aqui e não no dicionário. */
const LOCALE_SHORT: Record<Locale, string> = { "pt-BR": "PT", en: "EN" };

/** Fora do componente de propósito: escrever em `document.cookie` é efeito no
 *  mundo, e o React Compiler recusa mutação de valor externo dentro do corpo do
 *  componente — com razão, porque ali ela rodaria em cada render. */
function remember(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
}

export function LocaleSwitch({
  current,
  label,
  /** No menu do celular ele deita e ganha o nome por extenso — lá sobra largura
   *  e falta contexto, o oposto da barra. */
  full = false,
}: {
  current: Locale;
  /** "Ver em {idioma}" já resolvido pro idioma de DESTINO. */
  label: string;
  full?: boolean;
}) {
  const other = LOCALES.find((l) => l !== current) ?? current;

  return (
    <a
      href={localePath(other)}
      hrefLang={other}
      lang={other}
      onClick={() => remember(other)}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-md text-[0.76rem] font-extrabold tracking-[0.04em] text-muted",
        "outline-offset-2 transition-colors duration-150 hover:bg-surface-2 hover:text-cream focus-visible:outline-[3px] focus-visible:outline-brass",
        "[&>svg]:h-[15px] [&>svg]:w-[15px] [&>svg]:shrink-0 [&>svg]:fill-none [&>svg]:stroke-current [&>svg]:[stroke-linecap:round] [&>svg]:[stroke-linejoin:round] [&>svg]:[stroke-width:1.9]",
        full ? "min-h-11 px-3 text-[0.88rem]" : "min-h-9 px-2.5",
        "[@media(pointer:coarse)]:min-h-11",
      )}
    >
      <GlobeIcon />
      {full ? LOCALE_LABEL[other] : LOCALE_SHORT[other]}
    </a>
  );
}
