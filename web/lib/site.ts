// URL canônica do site. Tudo que é SEO depende dela: canonical, sitemap,
// Open Graph e os `@id` do JSON-LD.
//
// O fallback de localhost existe pro `pnpm web:dev` funcionar sem configurar
// nada. Em produção ele é um desastre silencioso — o sitemap inteiro sai
// apontando pra `http://localhost:3000` e ninguém descobre até o tráfego não
// chegar. Por isso todo build de produção QUEBRA sem a variável, em
// vez de publicar um site que se declara hospedado na sua máquina.

const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
const canonicalProductionOrigin = "https://www.corneta.live";
const requiresCanonicalUrl = process.env.NODE_ENV === "production";

if (!raw && requiresCanonicalUrl) {
  throw new Error(
    "NEXT_PUBLIC_SITE_URL não definida. Sem ela, sitemap, canonical e dados " +
      "estruturados sairiam apontando para http://localhost:3000. Defina a URL " +
      "canônica (https://www.corneta.live) nas variáveis de ambiente do deploy.",
  );
}

let configuredSiteUrl: URL;
try {
  configuredSiteUrl = new URL(raw || "http://localhost:3000");
} catch {
  throw new Error(
    "NEXT_PUBLIC_SITE_URL inválida. Informe somente a origem do site, por " +
      "exemplo https://www.corneta.live.",
  );
}

if (
  configuredSiteUrl.username ||
  configuredSiteUrl.password ||
  configuredSiteUrl.pathname !== "/" ||
  configuredSiteUrl.search ||
  configuredSiteUrl.hash
) {
  throw new Error(
    "NEXT_PUBLIC_SITE_URL deve conter somente protocolo e host, sem " +
      "credenciais, caminho, query ou fragmento.",
  );
}

if (
  requiresCanonicalUrl &&
  configuredSiteUrl.origin !== canonicalProductionOrigin
) {
  throw new Error(
    `NEXT_PUBLIC_SITE_URL de produção deve ser ${canonicalProductionOrigin}.`,
  );
}

export const siteUrl = configuredSiteUrl;
