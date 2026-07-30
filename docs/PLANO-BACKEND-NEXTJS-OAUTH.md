# Next.js como backend de configuração e OAuth da Corneta

**Status:** MVP implementado; credenciais e deploy de produção pendentes

**Atualizado em:** 20/07/2026

**Escopo:** usar a aplicação Next.js em [`web/`](../web/) como um control plane mínimo, removendo do usuário final o setup técnico de OAuth.

## Resultado para o usuário

O fluxo principal passa a ser:

1. clicar em **Conectar Twitch**, **Conectar YouTube** ou **Conectar Kick**;
2. autorizar a Corneta na página oficial do provedor;
3. voltar ao app já conectado.

O usuário não precisa criar aplicação, cadastrar redirect URI ou copiar Client ID/Client Secret. O modo **usar credenciais próprias** continua disponível nas opções avançadas para contingência e para separar a cota do YouTube.

Alternar entre oficial e credenciais próprias é **só preferência**: as credenciais do usuário ficam no cofre, dá pra voltar sem redigitar, e a Corneta **recusa** a troca quando o outro modo não está disponível. Apagar as credenciais é uma ação separada, oferecida apenas quando o login oficial pode assumir o lugar — nenhum clique deixa a plataforma sem nenhum caminho de login.

## Decisão final por provedor

| Provedor | Fluxo oficial | Papel do Next.js | Onde ficam os tokens |
| --- | --- | --- | --- |
| Twitch | Device Authorization Grant direto | Entrega o Client ID público no bootstrap | Keyring do sistema |
| YouTube | Authorization Code + PKCE, callback em `127.0.0.1` com porta aleatória | Entrega o Client ID público no bootstrap | Keyring do sistema |
| Kick | Authorization Code + PKCE, callback em `localhost:7395` | Faz exchange e refresh porque a Kick exige Client Secret | Keyring do sistema |

Twitch e YouTube não enviam tokens ao backend da Corneta. A Kick envia code/verifier e refresh token apenas aos Route Handlers mínimos necessários. Vídeo, áudio, chat e chamadas normais às APIs continuam diretos entre o desktop e os provedores.

## Estado implementado

| Item | Estado |
| --- | --- |
| Bootstrap público | Implementado em `GET /api/v1/bootstrap` |
| Health check | Implementado em `GET /api/v1/health` |
| Twitch oficial | Device flow direto no Rust |
| YouTube oficial | PKCE S256, `state`, navegador do sistema e callback loopback direto no Rust |
| Refresh do YouTube | Direto entre o Rust e o Google, sem Client Secret |
| Kick oficial | PKCE/callback no desktop; exchange e refresh no Next.js |
| BYOK | Disponível para YouTube e Kick; segredos ficam no keyring, e alternar de modo nunca apaga credencial |
| Proteções do broker | `server-only`, Node runtime, `no-store`, limites de corpo, timeouts, rate limit e allowlist exata de redirect |
| Segredo fora do bundle | Verificado por `scripts/check-bundle.mjs` no `pnpm check:app` — deixou de ser disciplina |
| Refresh proativo da Kick | `warm_kick_session` no go-live: o único refresh que depende da nossa API vence antes do BORA, não no meio da live |
| Produção | Pendente: domínio HTTPS, credenciais oficiais, aprovação/verificação, cota e observabilidade |

As credenciais atuais do repositório habilitam Twitch e Kick. Para ativar o YouTube oficial, ainda é necessário configurar um Client ID OAuth do Google do tipo **Aplicativo para computador**.

A escolha entre manter esse PKCE direto e brokear o YouTube como a Kick está fechada em
[DECISAO-OAUTH-VIA-API.md](DECISAO-OAUTH-VIA-API.md): control plane pela nossa API, data plane só
onde a plataforma obriga.

## Arquitetura

```text
                           configuração pública
┌────────────────────┐  <────────────────────────  ┌──────────────────────┐
│  Corneta Desktop   │                              │ Next.js / web        │
│  Tauri + Rust      │  ── Kick exchange/refresh ─>│ Setup API / broker   │
└─────────┬──────────┘                              └──────────┬───────────┘
          │                                                    │
          │ Twitch OAuth direto                               │ Kick OAuth
          │ YouTube OAuth direto                              │ com secret
          │ APIs/chat/stream                                  │
          ▼                                                    ▼
┌────────────────────┐                              ┌──────────────────────┐
│ Twitch / YouTube / │                              │ Token endpoint       │
│ Kick               │                              │ da Kick              │
└────────────────────┘                              └──────────────────────┘
```

O backend é apenas o control plane. Ele não retransmite mídia, não lê chat, não mantém conta Corneta e não armazena sessões de usuário.

## Fluxos implementados

### Twitch

1. O bootstrap entrega o Client ID público oficial.
2. O Rust inicia o device flow diretamente na Twitch.
3. A UI abre a URL e acompanha a autorização.
4. O Rust recebe e salva access/refresh tokens no keyring.
5. O refresh continua direto na Twitch.

Esse fluxo é público e não ganha segurança ao passar pelo Next.js.

### YouTube

1. O bootstrap entrega o Client ID público de um cliente OAuth **Desktop**.
2. O Rust gera `state`, `code_verifier` e `code_challenge` S256 com o CSPRNG do sistema.
3. O Rust abre um listener de uso único em `127.0.0.1` numa porta livre aleatória.
4. A UI abre `accounts.google.com` no navegador padrão com `access_type=offline` e `prompt=consent`.
5. O callback local valida o `state` e ignora conexões espúrias.
6. O Rust troca `code` + `code_verifier` diretamente no Google, sem Client Secret.
7. Access e refresh tokens são gravados no keyring; refreshes futuros também são diretos.

O fluxo oficial não usa mais endpoints `youtube/device/start`, `youtube/device/poll` ou `youtube/refresh`, não faz polling e não expõe tokens ao serviço da Corneta. O device flow permanece somente no modo avançado BYOK, para compatibilidade com as credenciais do tipo TVs/entrada limitada já usadas por usuários atuais.

**Por que o device flow não pode ser o fluxo oficial.** Só o primeiro passo dele é público: o pedido
a `oauth2.googleapis.com/device/code` leva apenas `client_id` + `scope`. Mas o Google, ao contrário
da RFC 8628, marca `client_secret` como **obrigatório** no polling do token
(`grant_type=urn:ietf:params:oauth:grant-type:device_code`) — só no refresh é que ele fica opcional.
Ou seja: adotar device flow como oficial exigiria embutir o secret no binário (extraível) ou passar
cada poll pelo broker, como a Kick. O PKCE com cliente **Desktop** resolve sem nada disso, porque lá
`client_secret` é **opcional** e o `code_verifier` faz o papel de prova de posse. Fontes:
[device flow](https://developers.google.com/identity/protocols/oauth2/limited-input-device) e
[installed apps](https://developers.google.com/identity/protocols/oauth2/native-app).

### Kick

1. O desktop gera verifier/challenge PKCE e `state`.
2. Abre a autorização da Kick com o Client ID público.
3. O callback local `http://localhost:7395/callback` valida o `state`.
4. O Rust envia code, verifier e redirect URI para o Next.js.
5. O Next.js valida tamanho, formato, rate limit e allowlist do redirect.
6. O servidor acrescenta Client ID/Secret e chama o token endpoint da Kick.
7. Os tokens retornam uma vez ao Rust e são gravados no keyring.
8. Refreshes passam pelo endpoint mínimo do broker, sem persistência no servidor.

A Kick documenta `client_secret` como obrigatório tanto no exchange quanto no refresh. Por isso ela não pode seguir integralmente o modelo público da Twitch/YouTube sem uma mudança do provedor.

## Contrato HTTP atual

| Método e rota | Finalidade |
| --- | --- |
| `GET /api/v1/health` | Liveness simples |
| `GET /api/v1/bootstrap` | Client IDs públicos, disponibilidade e tipo de fluxo |
| `POST /api/v1/oauth/kick/exchange` | Trocar code + verifier usando o secret oficial |
| `POST /api/v1/oauth/kick/refresh` | Renovar e devolver o par rotacionado |

Exemplo do bloco de provedores no bootstrap:

```json
{
  "providers": {
    "twitch": { "enabled": true, "clientId": "public-id", "flow": "direct-device" },
    "youtube": { "enabled": true, "clientId": "public-id", "flow": "direct-pkce" },
    "kick": { "enabled": true, "clientId": "public-id", "flow": "brokered-pkce" }
  }
}
```

## Configuração

### Desktop/build

```dotenv
VITE_TWITCH_CLIENT_ID=
VITE_GOOGLE_CLIENT_ID=
VITE_KICK_CLIENT_ID=
VITE_SETUP_API_URL=https://api.exemplo.com
```

Esses valores são públicos. O bootstrap pode atualizá-los em runtime; os valores do build servem como fallback.

### Next.js

```dotenv
TWITCH_CLIENT_ID=
GOOGLE_CLIENT_ID=
KICK_CLIENT_ID=
KICK_CLIENT_SECRET=
KICK_REDIRECT_URIS=http://localhost:7395/callback
```

Somente o secret da Kick é necessário no servidor. Nunca usar prefixo `NEXT_PUBLIC_` ou `VITE_` para ele em produção.

### Rodando local

O login oficial só existe enquanto a setup API responde, então em desenvolvimento são dois
processos: `pnpm web:dev` e `pnpm app:dev`.

O app web sobe em **`http://localhost:7390`** — porta fixa, que é também o fallback do desktop
quando `VITE_SETUP_API_URL` está vazio em dev. A porta 3000 foi abandonada de propósito: ela é
disputada com qualquer outro projeto Node da máquina e o app acabava conversando com a API errada.

Se o bootstrap não responder (ou responder sem `providers`), o desktop diz o motivo na tela de
login em vez de só "indisponível" — o que aparecia como bug do app quando era setup API errada.

## Segurança e privacidade

- Navegador do sistema, nunca WebView embutido, para autorização.
- PKCE S256 e `state` aleatórios para YouTube e Kick.
- Listener loopback de uso único com timeout de cinco minutos.
- Porta aleatória e IP literal no YouTube; porta/URI fixa exigida pela aplicação atual da Kick.
- Tokens persistidos somente no keyring do sistema operacional.
- Nenhum token, code ou verifier em logs.
- HTTPS obrigatório para a setup API em builds release.
- Redirect da Kick validado por igualdade contra allowlist server-side.
- Respostas OAuth com `Cache-Control: no-store`.
- BYOK isolado no processo nativo; Client Secrets próprios nunca entram no bundle web.

O rate limit atual é em memória e por instância. Antes de escalar horizontalmente, migrar para um armazenamento distribuído confiável e definir a origem real do IP somente atrás de proxy controlado.

## Pendências para produção

1. Criar o cliente Google OAuth do tipo **Aplicativo para computador** e configurar `GOOGLE_CLIENT_ID`.
2. Configurar a tela de consentimento, política de privacidade, termos e domínios autorizados.
3. Concluir a verificação OAuth do Google e a auditoria/extensão de cota da YouTube Data API, se exigidas.
4. Publicar o site/API em HTTPS e preencher `VITE_SETUP_API_URL` no build desktop.
5. Manter `KICK_CLIENT_SECRET` em secret manager e cadastrar exatamente o redirect permitido.
6. Adicionar métricas sem dados sensíveis: sucesso/erro/latência por provedor e motivo categorizado.
7. Migrar rate limit para Redis/KV antes de múltiplas instâncias.
8. Implementar fallback versionado/assinado do bootstrap antes de um rollout amplo.
9. Testar em Windows, macOS e Linux, incluindo firewall, browser padrão, IPv4 e expiração do callback.
10. Definir alertas de cota do YouTube e manter BYOK como contingência operacional.

## Critérios de aceite

- Um usuário novo conecta as três plataformas sem criar aplicações próprias.
- YouTube oficial não envia tokens ou Client Secret ao Next.js.
- Kick nunca inclui Client Secret no binário, bundle Vite ou respostas da API.
- Fechar ou indisponibilizar o site não interrompe uma live já autenticada.
- Logout limpa access/refresh tokens locais.
- Callback com `state` errado não conclui nem aborta a tentativa legítima.
- Refresh concorrente da Kick não perde o token rotacionado.
- Builds release rejeitam setup API HTTP fora de loopback.

## Referências oficiais

- [Google OAuth para aplicativos instalados](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Boas práticas OAuth do Google](https://developers.google.com/identity/protocols/oauth2/resources/best-practices)
- [Migração e suporte a loopback IP](https://developers.google.com/identity/protocols/oauth2/resources/loopback-migration)
- [OAuth da Twitch](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth)
- [OAuth da Kick](https://github.com/KickEngineering/KickDevDocs/blob/main/getting-started/generating-tokens-oauth2-flow.md)
