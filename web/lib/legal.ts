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

/** Data da última revisão dos dois documentos. */
export const LEGAL_UPDATED_ISO = "2026-07-30";
export const LEGAL_UPDATED_LABEL = "30 de julho de 2026";

export const LEGAL_ROUTES = {
  privacy: "/legal/privacy",
  terms: "/legal/terms-of-use",
} as const;
