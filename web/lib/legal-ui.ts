// Moldura das páginas jurídicas: cabeçalho, sumário, rodapé e rótulos soltos.
//
// Vive fora do dicionário da LP de propósito. As páginas legais têm layout raiz
// próprio e não carregam o bundle do site — puxar as ~1100 chaves da LP pra
// mostrar "Neste documento" seria pagar caro por dez palavras. E o texto dos
// documentos em si não mora aqui: cada um é um JSX inteiro por idioma
// (`_content/*.pt.tsx` e `*.en.tsx`), porque documento jurídico se lê e se
// revisa inteiro, não como duzentas linhas de chave-valor.
import { DEFAULT_LOCALE, type Locale } from "./i18n";
import { LEGAL_UPDATED_LABEL_EN, LEGAL_UPDATED_LABEL_PT } from "./legal";

export interface LegalUi {
  skipToDocument: string;
  brandHome: string;
  documentsNav: string;
  privacy: string;
  terms: string;
  tocLabel: string;
  tocTitle: string;
  tldrLabel: string;
  updatedAt: string;
  updatedLabel: string;
  version: string;
  languageChip: string;
  otherLanguage: string;
  otherLanguageHref: (path: string) => string;
  back: string;
  sourceCode: string;
  todo: (what: string) => string;
  contactPlaceholder: string;
  /** Só o inglês tem: avisa qual versão vale juridicamente. */
  binding?: { title: string; body: string; cta: string };
}

const PT: LegalUi = {
  skipToDocument: "Pular para o documento",
  brandHome: "Corneta — início",
  documentsNav: "Documentos",
  privacy: "Privacidade",
  terms: "Termos de uso",
  tocLabel: "Sumário do documento",
  tocTitle: "Neste documento",
  tldrLabel: "Em uma corneta",
  updatedAt: "Última atualização:",
  updatedLabel: LEGAL_UPDATED_LABEL_PT,
  version: "Versão",
  languageChip: "Português do Brasil",
  otherLanguage: "Read in English",
  otherLanguageHref: (path) => `/en${path}`,
  back: "Voltar para a Corneta",
  sourceCode: "Código-fonte",
  todo: (what) => `[definir: ${what}]`,
  contactPlaceholder: "e-mail de contato",
};

const EN: LegalUi = {
  skipToDocument: "Skip to the document",
  brandHome: "Corneta — home",
  documentsNav: "Documents",
  privacy: "Privacy",
  terms: "Terms of use",
  tocLabel: "Table of contents",
  tocTitle: "In this document",
  tldrLabel: "The short version",
  updatedAt: "Last updated:",
  updatedLabel: LEGAL_UPDATED_LABEL_EN,
  version: "Version",
  languageChip: "English (translation)",
  otherLanguage: "Ler em português",
  otherLanguageHref: (path) => path,
  back: "Back to Corneta",
  sourceCode: "Source code",
  todo: (what) => `[to define: ${what}]`,
  contactPlaceholder: "contact email",
  // O aviso que sustenta a tradução: sem ele, publicar um contrato em dois
  // idiomas cria a dúvida sobre qual vale quando os dois discordam.
  binding: {
    title: "This is a courtesy translation",
    body: "Corneta is operated from Brazil and these documents are written under Brazilian law — the Consumer Protection Code (CDC) and the General Data Protection Law (LGPD). The Portuguese version is the one that legally binds. This English text is here so you can understand what you agreed to; if the two ever disagree, the Portuguese one prevails.",
    cta: "Read the binding version",
  },
};

export function legalUi(locale: Locale): LegalUi {
  return locale === DEFAULT_LOCALE ? PT : EN;
}
