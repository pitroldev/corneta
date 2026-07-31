"use client";

import {
  LOCALES,
  LOCALE_COOKIE,
  LOCALE_LABEL,
  localePath,
  type Locale,
} from "@/lib/i18n";

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

/** Código curto pro celular. Não é tradução: é o mesmo rótulo abreviado, e por
 *  isso mora aqui e não no dicionário. */
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
      className="flex items-center gap-1 rounded-sm bg-surface-2 p-0.5"
      aria-label={current === "en" ? "Language" : "Idioma"}
    >
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
              // No celular o par "Português | English" ocupava ~150px e, junto
              // com o botão de baixar, empurrava o header pra 429px — cortado
              // pelo `overflow-x: clip` do body, sem barra de rolagem pra
              // denunciar. Abaixo de 640px sobra o código do idioma, que é o
              // padrão que todo mundo já lê.
              "grid min-h-9 place-items-center rounded-[3px] px-2 text-[0.72rem] font-bold transition-colors " +
              "[@media(pointer:coarse)]:min-h-10 [@media(pointer:coarse)]:min-w-10 " +
              "max-[420px]:min-w-9 " +
              (active
                ? "bg-brass text-brass-ink"
                : "text-muted hover:bg-surface-3 hover:text-cream")
            }
          >
            <span className="max-[640px]:hidden">{LOCALE_LABEL[locale]}</span>
            <span className="hidden max-[640px]:inline">
              {LOCALE_SHORT[locale]}
            </span>
          </a>
        );
      })}
    </nav>
  );
}
