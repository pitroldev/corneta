# Web da Corneta

A parte da Corneta que roda fora do PC do streamer, em Next.js 16, React Server Components e
Tailwind CSS 4. São duas coisas no mesmo app:

- **Site público** — a página de apresentação e as páginas legais. O HTML é renderizado no
  servidor; um cliente pequeno cuida da troca de idioma, da preferência de telemetria e das
  métricas manuais descritas abaixo.
- **Setup API** (`/api/v1/*`) — entrega os Client IDs públicos no bootstrap e faz o
  exchange/refresh do OAuth da Kick, a única plataforma que exige Client Secret. O app desktop
  depende dela para o login oficial da Kick.

## Desenvolvimento

Da raiz do repositório:

```bash
pnpm web:dev      # site + API em http://localhost:7390
pnpm web:check    # lint + tipos + build de produção
pnpm test         # inclui os testes puros de schema/redator/facades do web
```

## Variáveis

Copie `.env.example` para `.env.local` quando necessário:

- `NEXT_PUBLIC_SITE_URL`: URL canônica usada em metadata, sitemap e robots;
- `NEXT_PUBLIC_PRIMARY_CTA_URL`: URL pública do instalador/release. Enquanto a URL real não
  estiver disponível, a página usa `https://example.com/corneta-download` como placeholder
  explícito;
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

## Telemetria e diagnóstico

Sem configuração válida, todos os facades são no-op. Quando habilitada:

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
- cada resposta da API inclui `X-Request-Id`. O desktop envia UUID, `operation_id` e a finalidade
  fechada em `X-Corneta-Telemetry-Purposes` somente com consentimento. A API reutiliza o UUID em
  evento operacional apenas com consentimento de uso e em exceção apenas com consentimento de
  erros; nos demais casos usa uma identidade efêmera do pedido;
- o envio server-side roda no `after()` do Next.js e falha silenciosamente: PostHog nunca muda
  status, corpo ou latência necessária da resposta.

O health check `/api/v1/health` publica somente SHA, kill switches, hosts públicos e SHA-256 do
project token público efetivamente implantados no site/API. O workflow de release compara essa
metadata com o desktop antes de criar o draft; nenhuma Personal API Key ou token bruto aparece na
resposta.

No projeto PostHog de produção, configure retenção de 90 dias, **Discard client IP data**,
Cloud US (Virginia), DPA, MFA e acesso por função. O runbook completo está em
`../docs/RUNBOOK-POSTHOG.md`.

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
