import type { ReactNode } from "react";
import { useStore } from "../store";
import { I18nProvider } from "./index";

// Cola entre a config e a tradução.
//
// Vive separado do `I18nProvider` puro pra ele continuar testável sem store —
// e porque as DUAS janelas (principal e o chat flutuante) precisam do mesmo
// idioma. Como o valor sai do store, trocar o idioma nas Configurações
// re-renderiza tudo na hora, sem reiniciar.
//
// Enquanto a config não carregou, `language` é undefined e o idioma cai no do
// sistema — que é exatamente o que "auto" faria de qualquer forma.
export function I18nFromConfig({ children }: { children: ReactNode }) {
  const language = useStore((s) => s.config?.settings.language);
  return <I18nProvider language={language}>{children}</I18nProvider>;
}
