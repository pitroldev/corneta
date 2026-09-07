# Web da Corneta

A parte da Corneta que roda fora do PC do streamer, em Next.js 16, React Server Components e
Tailwind CSS 4. São duas coisas no mesmo app:

- **Site público** — a página de apresentação e as páginas legais. O HTML é renderizado no
  servidor; um cliente pequeno cuida da troca de idioma, da preferência de telemetria e das
  métricas manuais descritas abaixo.
- **Setup API** (`/api/v1/*`) — entrega os Client IDs públicos no bootstrap e faz o
  exchange/refresh do OAuth da Kick, a única plataforma que exige Client Secret. O app desktop
  depende dela para o login oficial da Kick.

## Contribuir sem credenciais oficiais

Use as versões de Node/pnpm e a instalação descritas no [README principal](../README.md). Da raiz do repositório, sem criar `.env`:

```bash
pnpm contrib:web        # site + API em http://localhost:7390
pnpm contrib:web:check  # integridade, lint, tipos e build do site
pnpm test               # inclui os testes puros do workspace web
```

Execute o servidor e o build em momentos diferentes ou em cópias separadas. O perfil de contribuição fornece a origem canônica de build e desliga telemetria; não usa credenciais OAuth oficiais nem valida login real. Se houver arquivos reais `web/.env*`, ele recusa continuar: use outro clone limpo, sem apagar suas credenciais. Veja [desenvolvimento](../docs/DESENVOLVIMENTO.md).

## Operação configurada e variáveis

Para testar integrações próprias, o exemplo pertinente é [web/.env.example](.env.example), e o arquivo local é `web/.env.local` — ambos relativos à raiz do repositório. Não sobrescreva um arquivo existente. Os comandos `pnpm web:dev` e `pnpm web:check`, também na raiz, usam essa configuração e não têm o isolamento do perfil de contribuição.

O build de produção exige `NEXT_PUBLIC_SITE_URL=https://www.corneta.live`; isso não habilita hospedagem arbitrária de forks. No host de produção, forneça as variáveis pelo ambiente/cofre do host. Consulte a [matriz de configuração](../docs/CONFIGURACAO.md) para OAuth, limites locais, proxy, precedência e distinção entre segredos e valores públicos. O [guia de publicação](../docs/PUBLICACAO.md) reúne os procedimentos e as evidências adicionais exigidas para distribuir o produto, incluindo proteção WAF/edge no host.

Resumo das variáveis do site:

- `NEXT_PUBLIC_SITE_URL`: URL canônica usada em metadata, sitemap e robots;
- `NEXT_PUBLIC_PRIMARY_CTA_URL`: em release, URL HTTPS do instalador `.exe` oficial no
  GitHub Releases. Quando a variável não está definida, a navegação usa `#download`; o
  placeholder do exemplo não é um download publicado nem passa no gate oficial;
- `GOOGLE_SITE_VERIFICATION` e `BING_SITE_VERIFICATION`: tokens públicos fornecidos pelo
  Search Console e Bing Webmaster Tools. A metadata omite as tags quando eles estão vazios;
- `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` e `NEXT_PUBLIC_POSTHOG_HOST`: Project API Key de
  ingestão (`phc_*`) e host HTTPS usados no navegador;
- `POSTHOG_PROJECT_TOKEN` e `POSTHOG_HOST`: equivalentes server-only para a Setup API. Se
  ausentes, usam as variáveis públicas como fallback;
- `NEXT_PUBLIC_TELEMETRY_DISABLED=1` e `TELEMETRY_DISABLED=1`: kill switches independentes de
  cliente e servidor;
- `NEXT_PUBLIC_DEPLOYMENT_ENV`, `POSTHOG_ENVIRONMENT`, `NEXT_PUBLIC_BUILD_SHA` e `BUILD_SHA`:
  contexto de deploy. Na Vercel, `VERCEL_ENV` e `VERCEL_GIT_COMMIT_SHA` são os fallbacks do
  servidor.

Use apenas a **Project API Key de ingestão** nessas variáveis. Uma PostHog Personal API Key
nunca deve entrar no site, na API ou no repositório. Em produção, cliente e servidor usam o
mesmo project token, `https://us.i.posthog.com` e o SHA completo do mesmo commit; o gate
`pnpm telemetry:release:check` valida esse contrato junto com o desktop.

A proteção das rotas Kick usa memória local limitada a 10.000 entradas por instância,
sem serviço de armazenamento ou segredo adicional: 20 exchanges e 60 refreshes por
origem em janelas fixas de 60 segundos. Reiniciar/escalar cria contadores novos; isso
não é um limite global. Proteção compartilhada antes das instâncias depende de
WAF/edge configurado e testado no host, com resposta `429` sem desafio interativo.
O build não configura nem comprova essa proteção. Confira escopo, cobertura e
ensaios no [guia de publicação](../docs/PUBLICACAO.md).

## Telemetria e diagnóstico

Sem configuração válida ou com o kill switch pertinente, o envio fica desativado. Na distribuição configurada, as finalidades de uso e falhas do desktop são independentes, ativas por padrão e desativáveis: `unset` não é consentimento pendente. O site também oferece opt-out, DNT/GPC e kill switch. O contrato completo está na [política de telemetria](../docs/LGPD-LEGITIMO-INTERESSE-TELEMETRIA.md) e no [runbook](../docs/RUNBOOK-POSTHOG.md); esta descrição não substitui revisão jurídica.

Quando o envio aplicável está habilitado:

- o site usa PostHog em modo cookieless, sem persistência de identidade, perfil de pessoa,
  autocapture, replay, heatmap, texto da página, performance, surveys, feature flags ou
  configuração remota;
- o site envia somente `site_page_viewed`, `site_cta_clicked` e exceções redigidas. Rotas são
  enums; query strings e fragments nunca entram no evento;
- a preferência `corneta:site-telemetry:v1` guarda apenas um opt-out persistente no navegador.
  DNT e Global Privacy Control também desligam a captura. O controle fica na Política de
  privacidade;
- o site nunca identifica a pessoa e não liga uma visita ao UUID opcional da instalação do
  aplicativo;
- a Setup API envia somente falhas: erros operacionais conhecidos viram evento com rota,
  código, classe HTTP e duração em bucket; falhas inesperadas viram exceção redigida. Corpo,
  resposta de provedor, query, tokens e cabeçalhos de autenticação não são passados ao facade;
- cada resposta da API inclui `X-Request-Id`. O desktop envia a correlação de UUID, `operation_id` opcional e finalidades fechadas em `X-Corneta-Telemetry-Purposes` somente quando alguma finalidade está efetivamente habilitada. A API reutiliza essa correlação em eventos operacionais apenas com uso habilitado e em exceções apenas com falhas habilitadas. Sem correlação autorizada para aquela finalidade, usa uma identidade efêmera do pedido; isso não contorna o kill switch ou a configuração de envio da API;
- o envio server-side roda no `after()` do Next.js e falha silenciosamente: PostHog nunca muda
  status, corpo ou latência necessária da resposta.

O health check `/api/v1/health` publica somente SHA, kill switches, hosts públicos e SHA-256 do
project token público efetivamente implantados no site/API. O workflow de release compara essa
metadata com o desktop antes de criar o draft; nenhuma Personal API Key ou token bruto aparece na
resposta.

No projeto PostHog de produção, configure retenção de 90 dias, **Discard client IP data**,
Cloud US (Virginia), DPA, MFA e acesso por função. O [runbook completo](../docs/RUNBOOK-POSTHOG.md) separa esses requisitos das verificações locais.

### Páginas legais

`/legal/privacy` e `/legal/terms-of-use` são estáticas e descrevem o comportamento real do
produto: o que o app guarda no computador, o que a API de login (`/api/v1/*`) processa e o que
nenhum dos dois faz. Ao mudar fluxo de dados no app ou nas rotas de API, atualize os dois
documentos e a data em `lib/legal.ts`.

A identificação vive em **`lib/legal.ts`** — configuração fixa, sem variável de ambiente: tudo
ali é impresso na página pública. O arquivo separa duas figuras de propósito: a **pessoa
jurídica** que opera o site, a API e oferece os termos (controladora dos dados na LGPD) e o
**autor** titular dos direitos autorais do código no `LICENSE`. Trocar a titularidade do código
para a empresa exigiria uma cessão de direitos — não é edição de texto.

Uma mudança material de telemetria exige atualizar as versões PT/EN da política, a data de
revisão e `LEGAL_ACCEPT_VERSION`, espelhado no workspace desktop.

## Conteúdo editorial e buscadores

Os hubs públicos usam caminhos sempre em inglês: `/help`, `/guides`, `/en/help` e
`/en/guides`. O texto continua localizado. Artigos vivem em `content/`, passam pelo gate
`pnpm --dir web content:check` (executado da raiz) e só entram em sitemap, hreflang e llms.txt quando estão publicados. Consulte o [guia editorial](content/README.md).

Para concluir a verificação externa depois do deploy:

1. defina `GOOGLE_SITE_VERIFICATION` e `BING_SITE_VERIFICATION` no ambiente de produção;
2. implante o mesmo host de `NEXT_PUBLIC_SITE_URL`;
3. confirme as tags no HTML renderizado;
4. valide a propriedade de domínio nos dois consoles;
5. envie `https://www.corneta.live/sitemap.xml`.

As quatro primeiras etapas dependem das contas externas e não podem ser concluídas apenas pelo
repositório. Não use upload de arquivo de verificação: as tags geradas por metadata permanecem
válidas em todas as páginas públicas.
