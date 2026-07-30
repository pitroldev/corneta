import type { ReactNode } from "react";
import { LEGAL_URLS } from "../lib/legal";
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
  return (
    <p
      className={cn(
        "text-center text-[11px] leading-relaxed text-ink-faint",
        className,
      )}
    >
      Ao continuar, você aceita os{" "}
      <LegalLink href={LEGAL_URLS.terms}>Termos de Uso</LegalLink> e a{" "}
      <LegalLink href={LEGAL_URLS.privacy}>Política de Privacidade</LegalLink>.
    </p>
  );
}
