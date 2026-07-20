# Plano: Next.js como backend de configuração e OAuth da Corneta

**Status:** MVP implementado; ativação/deploy de produção pendentes  
**Data:** 20/07/2026  
**Escopo:** usar a aplicação Next.js em [`landing/`](../landing/) como um backend fino para remover a configuração técnica de OAuth e outras pequenas fricções do aplicativo desktop.

## Resumo executivo

A landing page deve evoluir para um **serviço de setup da Corneta**, não para o backend da transmissão. Sua responsabilidade será registrar e operar as aplicações oficiais da Corneta nos provedores, entregar configuração pública confiável ao desktop e intermediar somente os passos de OAuth que exigem um segredo de servidor.

O resultado esperado para o usuário é:

1. clicar em **Conectar Twitch**, **Conectar YouTube** ou **Conectar Kick**;
2. autorizar a Corneta na página oficial do provedor;
3. voltar ao app já conectado.

O usuário não deverá criar projeto no Google Cloud, configurar tela de consentimento, habilitar API, cadastrar redirect URI nem copiar Client ID/Client Secret. O modo atual de credenciais próprias continuará disponível como fallback avançado.

As decisões centrais são:

- vídeo, áudio, chat e dados da live continuam trafegando diretamente entre o desktop e os provedores;
- access tokens e refresh tokens continuam armazenados apenas no cofre do sistema operacional pelo código Rust;
- o servidor guarda apenas os Client Secrets oficiais e dados efêmeros de tentativas de login;
- não haverá conta Corneta nem banco permanente de usuários na primeira versão;
- uma indisponibilidade do site não pode interromper uma live em andamento;
- Route Handlers do Next.js serão usados como API HTTP no runtime Node.js;
- Twitch, YouTube e Kick terão fluxos diferentes, de acordo com as garantias de cada provedor.

## Estado implementado em 20/07/2026

| Item             | Estado                                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| Twitch oficial   | Implementado: device flow público continua direto no Rust                                                        |
| Bootstrap        | Implementado: detecta provedores habilitados e entrega apenas Client IDs públicos                                |
| YouTube          | Implementado: start/poll/refresh pelo broker, com tentativa stateless cifrada                                    |
| Kick             | Implementado: PKCE e callback loopback no desktop; exchange/refresh no broker                                    |
| Tokens locais    | Implementado: access/refresh tokens continuam no keyring                                                         |
| BYOK             | Implementado como opção avançada, com preferência por provedor no keyring                                        |
| Segurança básica | Implementada: runtime Node, módulos server-only, no-store, limites, timeouts, rate limit e allowlist de redirect |
| Google oficial   | Código pronto, mas desabilitado enquanto não houver `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` no servidor      |
| Produção         | Pendente: domínio/API HTTPS, verificação Google, cota, políticas, observabilidade e hardening descritos abaixo   |

As credenciais atuais habilitam Twitch e Kick. A ausência de credenciais Google não bloqueia usuários que já utilizam YouTube por BYOK no keyring.

## Objetivos

- Tornar a primeira conexão com as plataformas um fluxo de poucos cliques.
- Remover credenciais de provedor da interface principal.
- Preservar a arquitetura local-first e a privacidade atual.
- Centralizar configuração, feature flags e disponibilidade dos provedores.
- Manter um caminho de contingência com credenciais próprias.
- Permitir evolução operacional sem publicar uma nova versão do desktop para toda pequena mudança de configuração.

## Fora de escopo

Este projeto não deve:

- retransmitir ou processar vídeo/áudio;
- armazenar gravações, mensagens de chat ou dados da transmissão;
- virar proxy geral para as APIs dos provedores;
- manter access tokens ou refresh tokens de forma persistente;
- exigir login ou uma conta Corneta;
- substituir o atual sistema de atualização do Tauri;
- esconder do usuário quais permissões cada plataforma solicita.

## Estado atual e fricções

Hoje a configuração está dividida entre o frontend e o backend Rust:

- [`src/lib/oauth.ts`](../src/lib/oauth.ts) injeta Client IDs públicos no desktop via variáveis `VITE_*`;
- [`src-tauri/src/auth.rs`](../src-tauri/src/auth.rs) executa os fluxos OAuth e grava credenciais no keyring do sistema;
- [`src/screens/ChatScreen.tsx`](../src/screens/ChatScreen.tsx) orienta o usuário a criar projetos/aplicações nos provedores;
- [`src/lib/api.ts`](../src/lib/api.ts) expõe comandos para salvar e apagar credenciais próprias;
- [`.env.example`](../.env.example) documenta a configuração manual.

As maiores fricções são:

| Provedor | Situação atual                                                                             | Custo para o usuário                                             |
| -------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Twitch   | Device Authorization Grant com Client ID configurado no build                              | Baixo, mas ainda depende de uma aplicação previamente registrada |
| YouTube  | Usuário cria projeto Google, ativa API, configura consentimento e informa Client ID/Secret | Muito alto e sujeito a erros                                     |
| Kick     | Usuário registra uma aplicação e informa Client ID/Secret                                  | Alto; exige conhecimento de OAuth e redirect URI                 |

## Arquitetura proposta

```text
                  configuração pública assinada
┌────────────────────┐  <────────────────────────  ┌──────────────────────┐
│  Corneta Desktop   │                              │ Next.js / landing    │
│  Tauri + Rust      │  ─── início/conclusão ───>  │ Setup API / OAuth    │
│                    │  <── tokens uma única vez ─  │ Broker               │
└─────────┬──────────┘                              └──────────┬───────────┘
          │                                                    │
          │ chat/APIs/stream                                  │ OAuth somente
          │ usando tokens no keyring                          │ quando necessário
          ▼                                                    ▼
┌────────────────────┐                              ┌──────────────────────┐
│ Twitch / YouTube / │                              │ Endpoints OAuth dos  │
│ Kick               │                              │ provedores           │
└────────────────────┘                              └──────────────────────┘

Vídeo e áudio: Desktop ───────────────────────────────> provedores/RTMP
```

O backend será um **control plane mínimo**. O data plane — a transmissão propriamente dita — permanece local.

### Responsabilidades do Next.js

- expor a configuração pública compatível com a versão do desktop;
- iniciar tentativas OAuth e validar estado, PKCE, expiração e replay;
- manter Client Secrets em um secret manager do ambiente de produção;
- concluir trocas de código e refresh que exijam segredo confidencial;
- entregar tokens ao desktop uma única vez, sem persistência posterior;
- aplicar rate limit, limites de corpo, allowlist de hosts e observabilidade redigida;
- hospedar páginas de callback, privacidade, termos e ajuda.

### Responsabilidades do desktop

- abrir o navegador padrão do sistema, nunca um WebView embutido, para autorização;
- gerar entropia local para PKCE e para o segredo da tentativa;
- enviar chamadas sensíveis pelo backend Rust, não pelo JavaScript da WebView;
- persistir os tokens somente no keyring existente;
- renovar tokens diretamente com o provedor quando o fluxo público permitir;
- manter a live funcionando com os tokens já obtidos mesmo se a API Corneta estiver fora;
- oferecer o modo avançado **Usar credenciais próprias**.

### Dados persistidos

| Dado                        | Local                                    | Retenção                      |
| --------------------------- | ---------------------------------------- | ----------------------------- |
| Client Secrets oficiais     | Secret manager do servidor               | Enquanto a integração existir |
| Access/refresh tokens       | Keyring do sistema do usuário            | Até logout/revogação          |
| Tentativa YouTube           | Token opaco cifrado mantido pelo desktop | Até uso ou expiração          |
| Device code do Google       | Dentro do token opaco AES-GCM            | Até uso ou expiração          |
| PKCE verifier/state da Kick | Memória do desktop                       | Até callback ou expiração     |
| Telemetria operacional      | Logs/métricas sem tokens e sem códigos   | Conforme política publicada   |
| Conta/perfil Corneta        | Não existe na fase inicial               | —                             |

O MVP não precisa de banco ou KV: a tentativa do YouTube é cifrada e autenticada com AES-GCM, devolvida ao desktop e validada pelo servidor em cada poll. A Kick mantém `state`, verifier e authorization code no callback loopback local. Um KV só será necessário se futuramente o callback da Kick migrar para o domínio web ou se forem exigidos limites distribuídos entre várias instâncias.

## Estratégia por provedor

### Twitch: fluxo público direto

A Twitch recomenda tratar aplicativos distribuídos em plataformas abertas, como Windows, como clientes públicos. O Device Authorization Grant não precisa expor um Client Secret, portanto o caminho mais simples e privado é:

1. registrar uma aplicação Twitch oficial da Corneta;
2. publicar apenas o Client ID oficial pelo endpoint de bootstrap e como fallback no build;
3. manter no Rust o device flow que já existe;
4. armazenar e renovar os tokens localmente;
5. usar o backend somente para disponibilidade, versão de configuração e suporte operacional.

Não há ganho em fazer tokens da Twitch passarem pelo Next.js. Isso ampliaria a superfície de risco sem eliminar trabalho adicional do usuário.

Referências: [OAuth da Twitch](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth) e [registro de aplicações](https://dev.twitch.tv/docs/authentication/register-app).

### YouTube: aplicação oficial e device flow administrado

Esta é a integração de maior valor para o novo backend, pois hoje cada usuário precisa administrar um projeto Google.

Fluxo recomendado:

1. a Corneta registra um projeto Google/YouTube oficial para produção;
2. o desktop chama `POST /api/v1/oauth/youtube/device/start`;
3. o servidor inicia o device flow com a aplicação oficial e devolve somente `verification_uri`, `user_code`, `expires_in`, intervalo de polling e uma credencial opaca da tentativa;
4. o desktop abre a URL oficial no navegador e mostra o código;
5. o desktop consulta `device/poll` respeitando o intervalo do Google;
6. quando autorizado, o servidor devolve o par de tokens uma única vez;
7. o Rust grava os tokens no keyring e apaga todo estado transitório;
8. o refresh passa a ser direto se o cliente público aceito pela configuração do Google não exigir segredo; se a configuração de produção exigir segredo, usa o endpoint mínimo de refresh, sem persistência.

A implementação deve confirmar o comportamento real da aplicação aprovada antes de escolher o refresh definitivo. O protocolo do Google admite `client_secret` como campo opcional no device flow e alerta que aplicativos instalados/distribuídos não conseguem manter segredos. Por isso, o objetivo é evitar um refresh proxy quando ele não for necessário.

Riscos externos obrigatórios antes do lançamento:

- publicar Política de Privacidade, Termos e justificativa clara de escopos;
- concluir a verificação OAuth do Google para sair do modo de teste;
- validar a classificação e necessidade de todos os escopos atuais;
- solicitar extensão de cota quando o uso projetado exceder a cota compartilhada;
- acompanhar consumo e negar tempestades de polling/refresh.

O projeto recebe, por padrão, uma cota diária compartilhada para YouTube Data API. Centralizar a aplicação transfere a responsabilidade dessa cota para a Corneta, sendo este o maior risco de produto do plano. O modo BYOK deve permanecer disponível também por essa razão.

Referências: [OAuth para dispositivos de entrada limitada](https://developers.google.com/identity/protocols/oauth2/limited-input-device), [políticas OAuth do Google](https://developers.google.com/identity/protocols/oauth2/policies), [verificação de aplicativos](https://support.google.com/cloud/answer/13463073?hl=en), [publicação e usuários de teste](https://support.google.com/cloud/answer/15549945?hl=en) e [cota/auditoria da YouTube Data API](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits?hl=en).

### Kick: callback loopback e troca confidencial

A Kick exige Client Secret na troca do authorization code e no refresh. Esse segredo não pode ser distribuído dentro do aplicativo desktop. O Next.js atuará como broker confidencial:

1. o desktop gera `code_verifier`, `code_challenge` S256 e `state` aleatórios;
2. abre a autorização no navegador usando o Client ID público oficial;
3. a Kick redireciona para o callback já cadastrado, `http://localhost:7395/callback`;
4. o servidor local de uso único valida o `state` e recebe o authorization code;
5. o desktop envia code, verifier e redirect URI para `POST /api/v1/oauth/kick/exchange`;
6. o Next.js valida o formato do verifier e a redirect URI contra uma allowlist exata;
7. o servidor acrescenta Client ID/Secret, troca o código na Kick e devolve os tokens uma única vez;
8. o Rust grava o par no keyring;
9. refreshes passam pelo broker, que devolve o par rotacionado sem persistência.

Essa implementação preserva a redirect URI das credenciais atuais, evita estado compartilhado no servidor e mantém a validação PKCE no próprio token endpoint da Kick.

Referências: [fluxo OAuth oficial da Kick](https://github.com/KickEngineering/KickDevDocs/blob/main/getting-started/generating-tokens-oauth2-flow.md) e [API pública oficial](https://api.kick.com/swagger/index.html).

## Contrato HTTP inicial

Todos os endpoints usam HTTPS, JSON com tamanho limitado e respostas `Cache-Control: no-store`, salvo o bootstrap público, que pode ter cache curto e revalidação.

### Operação e configuração

| Método e rota           | Finalidade                                                     |
| ----------------------- | -------------------------------------------------------------- |
| `GET /api/v1/health`    | Liveness simples, sem verificar dependências lentas            |
| `GET /api/v1/bootstrap` | Configuração pública, provedores habilitados e compatibilidade |

Exemplo conceitual de bootstrap:

```json
{
  "schemaVersion": 1,
  "issuedAt": "2026-07-20T12:00:00Z",
  "expiresAt": "2026-07-20T12:15:00Z",
  "minimumDesktopVersion": "0.0.0",
  "providers": {
    "twitch": { "enabled": true, "clientId": "public-id" },
    "youtube": { "enabled": true, "flow": "brokered-device" },
    "kick": { "enabled": true, "flow": "brokered-pkce" }
  },
  "links": {
    "help": "https://...",
    "status": "https://...",
    "privacy": "https://..."
  },
  "signature": "base64-ed25519-signature"
}
```

O MVP entrega um bootstrap mínimo e sempre usa HTTPS em release. A assinatura Ed25519, validade e fallback versionado permanecem como hardening antes de um rollout amplo.

### YouTube

| Método e rota                             | Finalidade                                            |
| ----------------------------------------- | ----------------------------------------------------- |
| `POST /api/v1/oauth/youtube/device/start` | Criar tentativa e iniciar o device flow               |
| `POST /api/v1/oauth/youtube/device/poll`  | Consultar autorização e consumir tokens uma única vez |
| `POST /api/v1/oauth/youtube/refresh`      | Somente se a configuração aprovada exigir segredo     |

O servidor deve impor o `interval` do provedor. Polls antecipados recebem erro estável e não provocam uma chamada adicional ao Google.

### Kick

| Método e rota                      | Finalidade                                    |
| ---------------------------------- | --------------------------------------------- |
| `POST /api/v1/oauth/kick/exchange` | Trocar code + verifier usando o Client Secret |
| `POST /api/v1/oauth/kick/refresh`  | Renovar e devolver o par rotacionado          |

### Revogação e logout

Logout sempre deve remover o token do keyring local. Revogação remota será adicionada por provedor somente após confirmar um endpoint oficial e seu comportamento. Não deve existir um endpoint genérico que aceite URLs ou hosts escolhidos pelo cliente.

### Envelope de erro

```json
{
  "error": {
    "code": "OAUTH_ATTEMPT_EXPIRED",
    "message": "Esta tentativa expirou. Inicie a conexão novamente.",
    "retryable": true,
    "requestId": "opaque-id"
  }
}
```

Os códigos do contrato devem ser estáveis. Respostas cruas dos provedores nunca chegam ao desktop; ficam apenas em logs estruturados, redigidos e correlacionados por `requestId`.

## Estrutura sugerida no Next.js

```text
landing/
├── app/
│   ├── api/v1/
│   │   ├── health/route.ts
│   │   ├── bootstrap/route.ts
│   │   └── oauth/
│   │       ├── youtube/device/start/route.ts
│   │       ├── youtube/device/poll/route.ts
│   │       ├── youtube/refresh/route.ts
│   │       └── kick/
│   │           ├── exchange/route.ts
│   │           └── refresh/route.ts
│   ├── privacidade/page.tsx
│   └── termos/page.tsx
└── lib/
    ├── contracts/
    └── server/
        ├── config.ts
        ├── env.ts
        ├── http/
        │   ├── errors.ts
        │   ├── rate-limit.ts
        │   └── response.ts
        └── oauth/
            ├── attempts.ts
            ├── crypto.ts
            └── providers/
                ├── kick.ts
                └── youtube.ts
```

Regras de implementação:

- declarar `export const runtime = 'nodejs'` nas rotas que usam criptografia, SDK de KV ou integrações server-only;
- importar módulos sensíveis apenas a partir de `lib/server` e protegê-los com `server-only`;
- validar variáveis de ambiente no boot/build e falhar cedo quando faltar um segredo obrigatório;
- não usar Server Actions: o consumidor é um aplicativo externo e o contrato precisa ser HTTP explícito;
- não introduzir Auth.js na fase inicial: não há sessão de usuário no site;
- evitar middleware global para lógica de OAuth; cada Route Handler deve validar o próprio contrato;
- usar `AbortSignal.timeout` ou controlador equivalente em toda chamada a provedor;
- não fazer retries automáticos de operações não idempotentes;
- manter dependências pequenas para reduzir cold start e superfície de supply chain.

Adicionar rotas dinâmicas transforma a landing de um site puramente estático em uma aplicação com runtime de servidor. Em self-hosting, usar a saída `standalone`, um proxy reverso, timeouts explícitos e encerramento gracioso. Em qualquer ambiente, staging e produção devem possuir aplicações OAuth, segredos e callbacks separados.

## Segurança e privacidade

### Modelo de cliente nativo

Um aplicativo desktop distribuído publicamente não consegue guardar um segredo confiável. Portanto:

- nenhum Client Secret entra no bundle do Next.js cliente, em `NEXT_PUBLIC_*`, no Vite ou no binário Tauri;
- PKCE usa S256, nunca `plain`;
- redirect URIs são exatas e previamente cadastradas;
- toda autorização abre o navegador externo;
- `state`, tentativa e verifier são vinculados a um único provedor e uso;
- a troca é atômica para impedir replay;
- códigos e tokens nunca entram em URLs da Corneta, logs, analytics, cookies ou ferramentas de erro.

As recomendações seguem [OAuth 2.0 for Native Apps — RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252) e [OAuth 2.0 Security Best Current Practice — RFC 9700](https://datatracker.ietf.org/doc/html/rfc9700).

### Autenticação do desktop perante o broker

Não existe prova perfeita de “binário oficial” sem uma plataforma de atestação: qualquer segredo embutido pode ser extraído. A proteção prática será:

- um par Ed25519 por instalação, gerado no primeiro uso e guardado no keyring;
- assinatura de `method + path + timestamp + nonce + hash(body)`;
- janela curta de timestamp e nonce consumido uma vez;
- rate limit por IP, instalação, tentativa e provedor;
- penalidade progressiva e circuit breaker para abuso;
- limites rígidos de corpo e concorrência.

Isso reduz replay e abuso casual, mas não deve ser descrito como DRM ou garantia de autenticidade. Cota e observabilidade continuam obrigatórias.

### Regras para o callback

A resposta do callback deve incluir, no mínimo:

```text
Cache-Control: no-store
Referrer-Policy: no-referrer
Content-Security-Policy: default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
```

Não carregar analytics, fontes, pixels, scripts, CDNs ou previews sociais nessa página.

### Saídas de rede

Cada adapter possui URLs fixas compiladas no servidor. O cliente nunca fornece hostname ou URL de token. Isso previne SSRF. DNS, redirects HTTP e respostas maiores que o limite devem ser tratados defensivamente.

### Escopos e consentimento

- solicitar somente permissões usadas por uma funcionalidade entregue;
- mostrar no desktop, antes de abrir o navegador, o motivo de cada grupo de permissões;
- não ampliar escopos silenciosamente via bootstrap;
- versionar conjuntos de escopos no contrato;
- exigir nova confirmação no desktop quando o conjunto mudar;
- revisar com cuidado o YouTube, pois o device flow não oferece autorização incremental como os demais fluxos.

## Outras pequenas fricções que o backend pode remover

Depois do OAuth, o endpoint de bootstrap pode centralizar, sem comprometer o local-first:

- disponibilidade temporária de cada integração;
- versão dos presets/configurações das plataformas;
- links curtos e atualizados de ajuda, privacidade e status;
- versão mínima suportada e URL da release, apenas como aviso complementar ao updater;
- feature flags de migração para ativar o novo OAuth gradualmente;
- mensagens operacionais curtas, com validade e severidade;
- limites conhecidos ou manutenção de provedor.

Não incluir no primeiro MVP:

- upload automático de diagnósticos sem consentimento;
- criação automática de stream keys sem API oficial e escopo revisado;
- integrações Streamlabs/StreamElements adicionais;
- sincronização de preferências ou conta na nuvem.

## Migração do aplicativo desktop

### Camada Rust

1. criar um cliente HTTP específico para `setup-api`, com timeout, limites e allowlist;
2. mover toda comunicação OAuth sensível para Rust;
3. implementar validação da assinatura do bootstrap;
4. implementar assinatura por instalação e proteção contra replay;
5. manter os mesmos nomes de entradas no keyring para não desconectar usuários atuais;
6. serializar refreshes que rotacionam tokens, como já ocorre hoje;
7. apagar buffers com tokens o mais cedo possível e nunca logá-los;
8. mapear erros do contrato para mensagens locais claras.

### Interface

Fluxo padrão:

- botão **Conectar**;
- texto curto explicando permissões;
- estado **Aguardando autorização no navegador**;
- sucesso ou erro recuperável;
- ação **Tentar novamente**.

Fluxo avançado, recolhido por padrão:

- **Usar credenciais próprias**;
- campos e tutorial atual;
- indicação de que esse modo evita cota compartilhada e serve como contingência.

A UI BYOK só deve deixar de ser o padrão após os clientes oficiais estarem aprovados, o backend passar pelo período de observação e a cota real do YouTube estar dimensionada.

### Compatibilidade e rollout

- uma feature flag local/build inicia o fluxo novo somente em versões compatíveis;
- o bootstrap pode desabilitar um provedor, mas não pode invalidar tokens já locais;
- versões antigas continuam com o fluxo BYOK;
- começar com uma porcentagem pequena ou canal beta;
- manter rollback para BYOK sem precisar publicar uma nova build;
- nunca condicionar abertura ou funções não relacionadas do app à disponibilidade do backend.

## Fases de implementação

### Fase 0 — pré-requisitos externos

- confirmar o domínio definitivo e controle DNS;
- publicar Privacidade, Termos, exclusão de dados e contato de suporte;
- registrar aplicações separadas para staging e produção;
- iniciar verificação Google e avaliação de cota do YouTube;
- cadastrar callbacks HTTPS exatos da Kick;
- preparar rotação e ownership dos segredos.

**Gate:** nenhum segredo de produção no repositório e nenhuma aplicação em modo de teste para lançamento público.

### Fase 1 — fundação do backend

- criar contratos e validação compartilhada;
- adicionar `/health`, `/ready` e `/bootstrap` assinado;
- configurar KV efêmero, criptografia e rate limiting;
- criar adapters de provedor com timeouts e respostas redigidas;
- configurar headers, logs, métricas e alertas;
- criar ambientes separados e pipeline de deploy.

**Gate:** teste de carga, falhas de dependência e varredura confirmam que nenhum token aparece em logs/traces.

### Fase 2 — Twitch como quick win

- registrar Client ID público oficial;
- distribuir via build/bootstrap;
- simplificar a tela do desktop;
- manter troca e refresh diretos.

**Gate:** usuário novo conecta sem criar aplicação Twitch; indisponibilidade do site não afeta login quando o Client ID de fallback está no build.

### Fase 3 — YouTube

- implementar start/poll e refresh apenas se necessário;
- preservar backoff e erros do device flow;
- migrar interface para um clique;
- manter BYOK;
- concluir verificação, política e capacidade de cota.

**Gate:** contas reais de staging passam por autorização, expiração, negação e refresh; cota e alertas suportam a projeção de lançamento.

### Fase 4 — Kick

- implementar callback loopback no Rust e exchange/refresh no Next.js;
- validar PKCE S256 e consumo atômico;
- testar rotação de refresh e concorrência;
- ativar gradualmente no desktop.

**Gate:** tentativas roubadas, repetidas, expiradas, com verifier errado ou entre provedores são rejeitadas.

### Fase 5 — conveniências adicionais

- presets versionados;
- mensagens de status;
- ajuda contextual;
- diagnóstico voluntário e explicitamente consentido, se ainda necessário.

### Fase 6 — hardening contínuo

- threat modeling e revisão independente;
- rotação ensaiada de segredos e chaves de assinatura;
- testes de recuperação e indisponibilidade de KV/provedores;
- auditoria de dependências;
- revisão trimestral de escopos, retenção, cotas e documentação.

## Plano de testes

### Unitários

- geração e validação de `state`, nonce, PKCE S256 e assinaturas;
- expiração, consumo atômico e vínculo entre tentativa/provedor;
- serialização e envelopes de erro;
- redação de campos sensíveis;
- verificação canônica da assinatura do bootstrap.

### Integração

- Route Handlers contra servidores simulados de provedor;
- `authorization_pending`, `slow_down`, acesso negado e código expirado;
- timeout, DNS/HTTP inválido, resposta grande e JSON malformado;
- refresh rotacionado com duas chamadas concorrentes;
- KV indisponível e recuperação sem duplicar trocas;
- callback repetido e conclusão repetida.

### Segurança

- tentativa expirada, roubada ou usada por outro provedor;
- verifier incorreto;
- replay de nonce e assinatura;
- SSRF e open redirect;
- vazamento em URL, resposta, log, trace, analytics e página de callback;
- rate limits por IP/instalação/tentativa;
- rotação de chaves sem aceitar bootstrap antigo além da validade.

### Ponta a ponta

- contas reais de staging nos três provedores;
- primeira conexão, cancelamento, logout e reconexão;
- refresh após reinício do desktop;
- backend offline com token válido já salvo;
- fallback para credenciais próprias;
- atualização de uma versão antiga sem perder tokens existentes.

## Observabilidade e SLO inicial

Métricas úteis, sempre sem identificadores de conta ou credenciais:

- tentativas iniciadas, autorizadas, expiradas e negadas por provedor;
- duração por etapa e taxa de sucesso;
- erro normalizado de cada provedor;
- consumo e rejeição de rate limit;
- latência e disponibilidade do KV;
- cota da YouTube Data API e alertas de aproximação do limite;
- refreshes bem-sucedidos e conflitos de rotação.

Objetivos iniciais sugeridos:

- `bootstrap`: 99,9% mensal;
- endpoints OAuth: 99,5% mensal, excluindo falhas confirmadas do provedor;
- p95 interno inferior a 300 ms, sem contar a latência externa do provedor;
- zero tokens/códigos em logs e traces;
- tentativas efêmeras sempre removidas por consumo ou TTL.

Não é necessário perseguir latência extrema no OAuth: a percepção de velocidade vem de resposta imediata da UI, navegador abrindo sem atraso, polling correto e estados claros. O caminho crítico da transmissão continua inteiramente local.

## Riscos e decisões

| Risco/decisão                              | Impacto                                  | Mitigação                                                                 |
| ------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------- |
| Cota compartilhada do YouTube              | Pode bloquear todos os usuários          | Alertas, auditoria/extensão de cota, eficiência de chamadas e BYOK        |
| Verificação Google atrasada/reprovada      | Impede lançamento amplo                  | Tratar como gate externo da fase 3                                        |
| Vazamento de Client Secret                 | Compromete a aplicação oficial           | Secret manager, acesso mínimo, rotação e logs redigidos                   |
| Indisponibilidade do backend               | Bloqueia novo login/refresh intermediado | Tokens locais, fallback BYOK e nenhum impacto na live atual               |
| Abuso por binários não oficiais            | Consome cota/recursos                    | Assinatura por instalação, rate limits, anomalias e limites de orçamento  |
| Backend vê tokens durante exchange/refresh | Aumenta superfície transitória           | TLS, memória apenas, sem logs/persistência e fluxo direto quando possível |
| Mudança de API do provedor                 | Quebra integração                        | Adapters isolados, contract tests, feature flag e status por provedor     |
| Configuração remota comprometida           | Pode redirecionar comportamento          | Bootstrap assinado, allowlists compiladas e fallback embutido             |

## Critérios de aceite do projeto

O backend estará pronto para substituir o setup manual quando:

- um usuário novo conectar cada provedor sem criar uma aplicação própria;
- os tokens estiverem apenas no keyring após a conclusão;
- segredos de servidor nunca aparecerem no bundle, binário, logs ou respostas;
- replay, verifier errado e tentativas expiradas forem rejeitados;
- a live e demais funções locais continuarem operando durante uma queda completa do site;
- BYOK continuar funcional e documentado;
- privacidade, termos, verificação e cota estiverem aprovados;
- dashboards e alertas cobrirem disponibilidade, erro, abuso e cota;
- houver procedimento testado de rotação, rollback e revogação.

## Recomendação final

Implementar o plano na ordem **Twitch oficial → fundação do broker → YouTube → Kick**. Twitch entrega uma melhoria rápida sem custodiar tokens; a fundação cria o contrato e os controles; YouTube remove a maior dor do usuário, mas depende de aprovação e cota; Kick vem em seguida por exigir o broker confidencial completo.

O princípio que deve orientar todas as decisões é simples: **o Next.js remove burocracia de setup, enquanto a Corneta continua sendo um aplicativo local-first**. Se uma nova função exigir que mídia, histórico ou credenciais permanentes passem a morar no servidor, ela deve ser tratada como outro projeto e passar por uma decisão explícita de produto, privacidade e custo.
