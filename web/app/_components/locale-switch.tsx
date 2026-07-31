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
              "rounded-[3px] px-2 py-1 text-[0.72rem] font-bold transition-colors " +
              (active
                ? "bg-brass text-brass-ink"
                : "text-muted hover:bg-surface-3 hover:text-cream")
            }
          >
            {LOCALE_LABEL[locale]}
          </a>
        );
      })}
    </nav>
  );
}
