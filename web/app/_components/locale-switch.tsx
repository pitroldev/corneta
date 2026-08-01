"use client";

import {
  LOCALES,
  LOCALE_COOKIE,
  LOCALE_LABEL,
  localePath,
  type Locale,
} from "@/lib/i18n";
import { GlobeIcon } from "./icons";

// Troca de idioma.
//
// A ARMADILHA que este componente existe pra evitar: quem está em `/en` e clica
// "Português" vai pra `/`, onde o middleware lê `Accept-Language: en` e devolve
// pra `/en`. Sem cookie, a pessoa fica presa no inglês pra sempre, achando que
// o botão está quebrado.
//
// Por isso o cookie é gravado ANTES da navegação. É também por isso que ele é
// um `<a>` de verdade e não um `<button>`: link entre as duas versões é sinal de
// descoberta que o buscador segue, e o `hrefLang` diz pra onde cada um leva.

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

export function LocaleSwitch({ current }: { current: Locale }) {
  return (
    <nav
      className="flex items-center gap-1 rounded-sm bg-surface-2 py-0.5 pr-0.5 pl-2"
      aria-label={current === "en" ? "Language" : "Idioma"}
    >
      {/* O globo é o rótulo do grupo em desenho: sem ele, "PT EN" soltos no
          header são duas siglas sem assunto. Decorativo pro leitor de tela — o
          assunto, pra ele, é o `aria-label` do <nav>. */}
      <span className="grid shrink-0 place-items-center text-faint-raised [&>svg]:h-[15px] [&>svg]:w-[15px] [&>svg]:fill-none [&>svg]:stroke-current [&>svg]:[stroke-linecap:round] [&>svg]:[stroke-linejoin:round] [&>svg]:[stroke-width:1.9]">
        <GlobeIcon />
      </span>
      {LOCALES.map((locale) => {
        const active = locale === current;
        return (
          <a
            key={locale}
            href={localePath(locale)}
            hrefLang={locale}
            lang={locale}
            aria-current={active ? "true" : undefined}
            onClick={() => remember(locale)}
            className={
              // Sempre o código curto, em toda largura. O par "Português |
              // English" ocupava ~150px e, junto com o botão de baixar,
              // empurrava o header pra 429px no celular — cortado pelo
              // `overflow-x: clip` do body, sem barra de rolagem pra denunciar.
              // Com o globo ao lado, a sigla não precisa do nome por extenso.
              "grid min-h-9 min-w-9 place-items-center rounded-[3px] px-1.5 text-[0.72rem] font-extrabold tracking-[0.04em] transition-colors " +
              "[@media(pointer:coarse)]:min-h-10 [@media(pointer:coarse)]:min-w-10 " +
              (active
                ? "bg-brass text-brass-ink"
                : "text-muted hover:bg-surface-3 hover:text-cream")
            }
          >
            {LOCALE_SHORT[locale]}
            {/* O nome por extenso continua no nome acessível, DEPOIS da sigla:
                assim a etiqueta visível ("PT") é começo do que o leitor de tela
                anuncia, que é o que a regra de "rótulo no nome" pede. */}
            <span className="sr-only"> — {LOCALE_LABEL[locale]}</span>
          </a>
        );
      })}
    </nav>
  );
}
