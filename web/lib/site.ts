// URL canônica do site. Tudo que é SEO depende dela: canonical, sitemap,
// Open Graph e os `@id` do JSON-LD.
//
// O fallback de localhost existe pro `pnpm web:dev` funcionar sem configurar
// nada. Em produção ele é um desastre silencioso — o sitemap inteiro sai
// apontando pra `http://localhost:3000` e ninguém descobre até o tráfego não
// chegar. Por isso o build QUEBRA quando roda em CI/Vercel sem a variável, em
// vez de publicar um site que se declara hospedado na sua máquina.

const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
const isBuildServer = Boolean(process.env.VERCEL || process.env.CI);

if (!raw && isBuildServer) {
  throw new Error(
    "NEXT_PUBLIC_SITE_URL não definida. Sem ela, sitemap, canonical e dados " +
      "estruturados sairiam apontando para http://localhost:3000. Defina a URL " +
      "canônica (ex.: https://corneta.live) nas variáveis de ambiente do deploy.",
  );
}

if (!raw && process.env.NODE_ENV === "production") {
  console.warn(
    "[corneta] NEXT_PUBLIC_SITE_URL ausente: build de produção usando " +
      "http://localhost:3000 como URL canônica. Não publique assim.",
  );
}

export const siteUrl = new URL(raw || "http://localhost:3000");
