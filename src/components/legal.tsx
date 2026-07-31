import { Fragment, type ReactNode } from "react";
import { legalUrl } from "../lib/legal";
import { useI18n } from "../lib/i18n";
import { cn, openExternal } from "../lib/utils";

/** Link pra um documento legal. Abre no navegador — o app não embute o texto pra
 *  não ficar com uma cópia velha do que o site publica. */
export function LegalLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => void openExternal(href)}
      className="font-semibold text-ink underline decoration-brass decoration-2 underline-offset-2 transition-colors hover:text-brass"
    >
      {children}
    </button>
  );
}

/**
 * Aviso de aceite das boas-vindas.
 *
 * Fica visível em TODOS os passos do tour e em todos os caminhos de saída do
 * modal (Bora começar, Pular, Esc, X) — é ele que dá a "oportunidade de tomar
 * conhecimento prévio" do art. 46 do CDC, sem a qual as cláusulas de limitação
 * dos termos simplesmente não vinculam o usuário. Por isso é aviso adjacente ao
 * botão, e não checkbox: o ato afirmativo já existe, e travar o Avançar num
 * checkbox só adicionaria atrito sem ganho jurídico.
 */
export function LegalAcceptNote({ className }: { className?: string }) {
  const { t, locale } = useI18n();
  // A frase inteira vem do dicionário com os dois buracos ainda no lugar (sem
  // `vars`, `interpolate` devolve o template cru) e é partida neles. Montar a
  // frase por pedaços de JSX prenderia a ordem das palavras ao português.
  const parts = t("components.legal.accept").split(/(\{terms\}|\{privacy\})/);
  return (
    <p
      className={cn(
        "text-center text-[11px] leading-relaxed text-ink-faint",
        className,
      )}
    >
      {parts.map((part, i) =>
        part === "{terms}" ? (
          <LegalLink key={i} href={legalUrl(locale, "terms")}>
            {t("components.legal.link.terms")}
          </LegalLink>
        ) : part === "{privacy}" ? (
          <LegalLink key={i} href={legalUrl(locale, "privacy")}>
            {t("components.legal.link.privacy")}
          </LegalLink>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </p>
  );
}
