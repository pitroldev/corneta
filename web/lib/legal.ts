// Identificação legal da Corneta — configuração fixa, editada aqui mesmo.
//
// Não são variáveis de ambiente de propósito: tudo neste arquivo é impresso na
// página pública, então não há segredo a proteger, e `NEXT_PUBLIC_*` seria
// inlinado no bundle do mesmo jeito. Um dado legal muda de ano em ano; um
// arquivo versionado conta essa história melhor que uma env var invisível.
//
// Duas figuras diferentes, de propósito:
//  - o OPERADOR (pessoa jurídica) responde pelo site, pela API de login e pelos
//    termos — é o controlador dos dados na linguagem da LGPD;
//  - o AUTOR (pessoa física) segue titular dos direitos autorais do código, como
//    está no LICENSE do repositório. Separar autoria de operação é prática comum
//    em open source e evita depender de uma cessão de direitos formal.
//
// Campo vazio vira pendência VERMELHA na página (`<Todo>`), igual ao placeholder
// da URL de download: é impossível publicar sem ver o que falta.

/** Pessoa jurídica que opera o site, a API e oferece os termos.
 *  Natureza jurídica: empresário individual, sediado no Rio de Janeiro/RJ. */
export const LEGAL_OPERATOR = "PCL DE SOUZA TECNOLOGIA";
export const LEGAL_CNPJ = "44.638.580/0001-12";

/** Titular dos direitos autorais do software (LICENSE do repositório). */
export const LEGAL_AUTHOR = "Petro Cardoso";

/** Canal oficial de atendimento ao titular de dados e de suporte. */
export const LEGAL_CONTACT = "corneta@pitrol.dev";

/** Comarca do foro eleito nos termos — a do domicílio da empresa. */
export const LEGAL_VENUE = "Rio de Janeiro, RJ";

/** Provedor de hospedagem do site e da API (operador dos logs de acesso). */
export const LEGAL_HOST = "Vercel Inc.";

/** Data da última revisão dos dois documentos. Sobe a cada correção, inclusive
 *  de vírgula — é informativa, e não vale como versão de aceite.
 *
 *  A data por extenso tem uma forma por idioma: escrita à mão em vez de sair de
 *  `Intl`, porque o valor tem que ser IDÊNTICO no HTML servido e no que o
 *  navegador renderiza (o `<time dateTime>` ao lado é a versão de máquina). */
export const LEGAL_UPDATED_ISO = "2026-09-06";
export const LEGAL_UPDATED_LABEL_PT = "6 de setembro de 2026";
export const LEGAL_UPDATED_LABEL_EN = "September 6, 2026";

/** Versão que exige aceite, espelhada em `src/lib/legal.ts` (o app é outro
 *  workspace e não importa daqui). Só sobe em mudança MATERIAL — passar a cobrar,
 *  pedir escopo novo de OAuth, limitar o login oficial. Subir invalida o aceite
 *  guardado em cada instalação e faz o app avisar de novo quem já usava.
 *
 *  Mudou aqui, mude lá: são dois arquivos porque não há build compartilhado. */
export const LEGAL_ACCEPT_VERSION = "2026-08-01";

/** Caminhos SEM idioma. O português mora na raiz porque `/legal/privacy` é a
 *  URL já publicada e linkada de dentro do app instalado — mudá-la quebraria o
 *  botão de quem já baixou. O inglês ganha o prefixo, como o resto do site. */
export const LEGAL_ROUTES = {
  privacy: "/legal/privacy",
  terms: "/legal/terms-of-use",
} as const;

/** Caminho do documento no idioma pedido (`localePath` aplicado às rotas
 *  legais). Use SEMPRE isto pra linkar, nunca `LEGAL_ROUTES` cru: um link em
 *  inglês apontando pro documento em português é a versão silenciosa do bug
 *  que esta tradução veio resolver. */
export function legalHref(
  locale: string,
  doc: keyof typeof LEGAL_ROUTES,
): string {
  const path = LEGAL_ROUTES[doc];
  return locale === "en" ? `/en${path}` : path;
}
