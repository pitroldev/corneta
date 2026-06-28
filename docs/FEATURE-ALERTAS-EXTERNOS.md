# Alertas externos (LivePix, Streamlabs, StreamElements) na aba Alertas

> Planejamento. Objetivo: deixar o streamer **cadastrar fontes de alerta de terceiros** — doação via
> **LivePix**, e os agregadores **Streamlabs**/**StreamElements** que muita gente já usa pra
> centralizar — pra esses eventos caírem na **aba Alertas** do chat, junto dos alertas nativos
> (sub, bits, raid, super chat) que a Corneta já capta.
>
> Complementa o [`ALERTAS.md`](./ALERTAS.md) (Fase 1 = alertas nativos via chat; Fase 2 = doações de
> terceiros, antes prevista "via OAuth"). Este doc detalha justamente essa Fase 2+.

---

## 1. A boa notícia: o "tubo" de alertas já existe

O caminho `produção de Alert → UI` já está pronto e **já renderiza doação**. Só falta **produzir**
os Alerts a partir das fontes externas e dar uma tela pra cadastrar.

- **Modelo** (`src/lib/types.ts`): `Alert { id, platform, source, kind, user, amount?, currency?, tier?, message?, ts }`,
  com `AlertKind = follow | sub | resub | subgift | bits | tip | raid | member | superchat`.
  → **Já tem `tip` + `amount`/`currency`**, então doação encaixa **sem mudar o modelo**.
- **Backend** (`src-tauri/src/chat.rs`): capta eventos nativos e chama `emit_alert(app, alert)` →
  canal Tauri **`alert://event`** (e grava no NDJSON da sessão).
- **Frontend**: `api.subscribeAlerts` escuta `alert://event` → store `bindAlerts` acumula (cap 100) →
  `src/components/AlertsFeed.tsx` renderiza por kind (`tip` = 💰 "doou", já formata moeda/valor).
- **Fontes de chat** são registradas como `ChatSource { id, platform, value, name, enabled }`; o
  backend `start_chat` abre **uma thread por fonte** (tungstenite), reconecta com backoff e emite
  `chat://status`. **É exatamente o padrão que vamos espelhar** pra fontes de alerta.
- **Segredos** ficam no **keyring nativo** (`src-tauri/src/keys.rs`: `set_key`/`get_key`/`has_key`),
  nunca no `config.json`.
- **Libs Rust já disponíveis**: `tungstenite` (WS + TLS), `ureq` (HTTP), `serde_json`.

---

## 2. O nó da questão: desktop não tem endereço público

As plataformas diferem em **como** entregam o evento — e é isso que decide o que é grátis/local:

| Modo | Como é | Dá num desktop? |
|---|---|---|
| **Socket de saída (outbound)** | o app **conecta** num servidor da plataforma com um token e recebe eventos | ✅ funciona, igual o chat hoje — local, grátis |
| **Webhook** | a plataforma faz **POST** pra uma URL pública **sua** | ❌ app desktop não tem URL pública → precisa relay/túnel/servidor |
| **Polling** | o app **pergunta** "tem evento novo?" via API HTTP, de tempos em tempos | ✅ local, mas com **atraso** (intervalo) e **rate limit** |

Isso casa direto com a monetização da Corneta (**local sempre grátis; pago = sempre server-sided**):
socket e polling são locais/grátis; **relay de webhook é server-sided → pago**.

---

## 3. O que cada plataforma oferece (confirmado nas docs)

### Streamlabs — Socket API (outbound) ✅
- Conecta via **Socket.IO** em `https://sockets.streamlabs.com?token=SOCKET_TOKEN`.
- Token: Dashboard → Account Settings → **API Settings → "Your Socket API Token"**. Um token = a
  caixa de alertas inteira do streamer.
- Eventos `event` com `type: donation | follow | subscription | bits | host | raid | merch | …`;
  `donation` traz nome/valor/mensagem/moeda.
- **Centraliza**: o Streamlabs já agrega Twitch/YT/etc., e muita gente roteia **LivePix → Streamlabs**.
  Logo **um cadastro cobre várias fontes** — é o caso que motivou esta feature.
- **Custo técnico**: Socket.IO **não é WS cru** — tem handshake engine.io (polling → upgrade) e framing
  `42["event",{…}]`. Dá pra fazer (a) **na unha** (~100 linhas sobre `tungstenite`, no estilo
  "protocolo na mão" que o repo já usa pra IRC/Pusher/InnerTube) ou (b) via crate `rust_socketio`.

### StreamElements — WebSocket (outbound) ✅
- Realtime via **WS puro** (Astro, `wss://astro.streamelements.com`) — JSON, **mais simples que
  socket.io**. Inscreve com `{type:"subscribe", data:{topic:"channel.activities", room, token, token_type:"jwt"}}`.
- Eventos: `tip`, `cheer`, `follow`, `subscriber`, `host`, `raid`.
- Token: **JWT** do dashboard ("Show secrets"). ⚠️ **Rotaciona a cada 2 semanas** → temos que
  detectar expiração e pedir pra colar de novo.

### LivePix — webhook-first, mas **com API pollável** ✅/❌
- **OAuth2** (client credentials pra própria conta; ou authorization code, scopes `account:read`,
  `wallet:read`, `webhooks`). Token expira em **3600s**; a doc avisa contra reemissão excessiva
  ("misuse detection may result in account termination").
- **Webhook**: eventos `message`/`payment`/`subscription` "new" — mas só **info básica**
  (`id`/`reference`); detalhe completo exige outra chamada à API. (Precisa endpoint público.)
- **Polling** (o caminho local/grátis): `GET /v2/messages` devolve
  `id, username, message, amount, currency, createdAt` (+ `page`, `limit`). Poll a cada ~10–15s,
  **dedup por `id`**. Também `GET /v2/payments` e `/v2/subscriptions`. Rate limit por minuto
  (429 + header `X-RateLimit-Limit`).

### Outros (Ko-fi, Tipa, Apoia.se…) — webhook
- Mesmo padrão webhook → só viável com **relay** (ou polling, se tiverem API de listagem).

---

## 4. Alternativas

| # | Abordagem | Prós | Contras |
|---|---|---|---|
| **A** | **Socket Streamlabs + StreamElements** (token outbound) | tempo real; sem servidor; grátis/local; **1 cadastro cobre N fontes** (centralização); é o que o streamer **já faz** | handshake socket.io (Streamlabs); SE JWT rotaciona; só vê o que foi roteado pra lá |
| **B** | **Polling direto LivePix** (e similares com API) | local/grátis; **direto** (sem depender de Streamlabs); atende quem usa só LivePix | atraso do intervalo; rate limit; OAuth2 por plataforma; só doação daquela plataforma |
| **C** | **Relay de webhook hospedado pela Corneta** | **instantâneo**; cobre **todo** webhook (LivePix/Ko-fi/Tipa) de forma uniforme; 1 endpoint | server-sided (custo/infra) → **pago**; doação passa pelos servidores da Corneta (privacidade); streamer cola uma URL gerada pela Corneta em cada plataforma |
| **D** | Túnel local do usuário (ngrok/cloudflared) | webhook instantâneo sem servidor da Corneta | técnico demais pro público; URL muda; frágil ❌ |
| **E** | Ler o overlay/browser-source do alerta (scraping) | "funciona sem token" | frágil, quebra a cada mudança de UI, zona cinza de ToS ❌ |
| **F** | OAuth no realtime nativo de cada plataforma (Twitch EventSub etc.) | eventos de 1ª mão | já coberto em parte pelo chat; **não** resolve tip/LivePix |

---

## 5. Recomendação — em 3 fases

1. **Fase 1 — grátis/local — Streamlabs + StreamElements (Alt. A).**
   Maior alavanca: é o **"centralizar via Streamlabs"** que o streamer já usa, sem servidor.
   Começar pelo **StreamElements (WS puro, fácil)** como prova do tubo, depois **Streamlabs (socket.io)**.
   Token no keyring; eventos mapeados pro `Alert` e emitidos no `alert://event` **que já existe**.

2. **Fase 2 — grátis/local — LivePix direto via polling (Alt. B).**
   Pra quem usa **LivePix sem Streamlabs**: `GET /v2/messages`, dedup por `id`, intervalo ~10s.
   Adiciona a doação LivePix nativa, com pequeno atraso (honesto na UI).

3. **Fase 3 — pago/server-sided — Relay de webhook (Alt. C).**
   Pra LivePix/Ko-fi/etc. **instantâneo**, sem polling e sem depender de Streamlabs. Encaixa no
   modelo pago (server-sided).

> **Honestidade:** a Fase 1 já cobre a maioria, porque muita gente **já** centraliza no Streamlabs/SE.
> A Fase 2 cobre o LivePix-puro com um pequeno atraso. A Fase 3 é o "premium instantâneo".

---

## 6. Como encaixa na arquitetura

### 6.1 Modelo de dados
- Novo `AlertSource` (espelha `ChatSource`): `{ id, kind: "streamlabs" | "streamelements" | "livepix", name, enabled }`.
  **Token NÃO vai no config** → keyring com chave `alert_<id>` (reusa `set_key`/`get_key`/`has_key`).
  Persistir a lista em `settings.alertSources` (`config.rs` + `types.ts`).
- `AlertKind` **não muda** (`tip` = doação; follow/sub/bits/raid já existem).
- ⚠️ `Alert.platform` hoje é `ChatPlatform` (twitch/youtube/kick). Pra mostrar a **origem**
  (Streamlabs/LivePix), ou alargamos esse tipo, ou adicionamos um campo `origin`/`via`. → **decisão em aberto (§9)**.

### 6.2 Backend — novo módulo `src-tauri/src/alerts.rs` (espelhando `chat.rs`)
- `start_alerts(app)` / `stop_alerts(app)` (comandos Tauri, registrados no `lib.rs`), com flag
  atômica `running` e reconexão com backoff — igual `start_chat`.
- **Uma thread por `AlertSource` habilitada**:
  - `streamelements`: `tungstenite` → Astro WS → `subscribe` com JWT → parse `tip/cheer/follow/subscriber/raid`.
  - `streamlabs`: handshake engine.io (`ureq` GET pro `sid` + upgrade `tungstenite`) → parse `42["event",{type,message}]`.
  - `livepix`: loop `ureq::get("/v2/messages")` com bearer OAuth2; **dedup por `id`**; `sleep` do intervalo.
  - Cada conector monta `Alert` e chama **`emit_alert(app, alert)`** (reusa o canal). Status num canal
    novo **`alert://status`** (espelha `chat://status`: no ar / caiu / token expirou).

### 6.3 Frontend
- Seção **"Fontes de alerta"** no **modal de configuração do chat** (ao lado de "Canais"), mesmo
  padrão recolhível: adicionar fonte (escolhe Streamlabs/SE/LivePix), **colar token** (vai pro keyring
  via `setKey`), liga/desliga, e status (no ar / caiu / **token expirou**).
- A **aba Alertas não muda** — `tip` já renderiza. Opcional: selinho de origem (Streamlabs/LivePix) no item.
- Lifecycle: ou o `Conectar` do chat sobe os alertas junto, ou um par `connectAlerts`/`disconnectAlerts`.
  → **decisão em aberto (§9)**.

### 6.4 Dedup & eventos de teste
- Sockets reenviam/mandam teste. **Dedup por id nativo** (Streamlabs `_id`, SE `_id`, LivePix `id`):
  Set dos últimos N ids no backend antes de emitir.
- Eventos de teste (`event:test` / flag) → marcar como teste ou ignorar; **não** podem entrar no
  relatório da sessão como reais.

---

## 7. Mapa de eventos → `AlertKind`

| Origem | Evento externo | `AlertKind` | amount / currency / extra |
|---|---|---|---|
| Streamlabs | `donation` | `tip` | amount + currency, message |
| Streamlabs | `follow` | `follow` | — |
| Streamlabs | `subscription` | `sub`/`resub` | tier, months→amount |
| Streamlabs | `bits` | `bits` | amount (bits) |
| Streamlabs | `host`/`raid` | `raid` | viewers→amount |
| StreamElements | `tip` | `tip` | amount + currency |
| StreamElements | `cheer` | `bits` | amount |
| StreamElements | `follow`/`subscriber`/`raid` | `follow`/`sub`/`raid` | — |
| LivePix | `message` (`GET /v2/messages`) | `tip` | amount + currency, message, user = username |
| LivePix | `subscription` | `sub` | months→amount |

---

## 8. Segurança & privacidade

- **Tokens** (Streamlabs socket, SE JWT, LivePix OAuth) = acesso de leitura à caixa de
  alertas/doações → **só keyring**, nunca em log nem no config.
- **SE JWT expira a cada 2 semanas**: detectar falha de auth → status **"token expirou, cole de novo"**.
- **LivePix OAuth**: respeitar o aviso de não reemitir token à toa → **cachear** o `access_token` até
  expirar (3600s), só renovar quando necessário; respeitar **429** (backoff + ler `X-RateLimit-Limit`).
- **Relay (Fase 3, pago)**: doações passam pelos servidores da Corneta → **deixar explícito na UI**;
  HTTPS; path de webhook **secreto por usuário**; **não persistir PII** do doador (idealmente só
  repassar e descartar).
- Eventos de **teste** não disparam gravação/relatório como reais.

---

## 9. Decisões em aberto (pra você)

1. `Alert.platform` vira string ampla **ou** adiciono um campo `origin`/`via` pra mostrar a fonte
   (Streamlabs/LivePix) no item?
2. Conectar alertas **junto** do chat (um único "Conectar") ou **separado**?
3. Fase 1 sai com **os dois** (Streamlabs + SE) ou **só Streamlabs** (o que o pessoal mais usa)?
4. LivePix na Fase 2 vale o OAuth2 agora, **ou** pulamos LivePix-puro direto pro **relay pago** (Fase 3)?
5. Mostrar **selo de origem** (Streamlabs/LivePix) no alerta?

---

## 10. Riscos & limites honestos

- **Socket.IO do Streamlabs** muda de versão (`EIO=3/4`); handshake na unha pode quebrar — encapsular
  bem e ter teste. (Mitigação: começar pelo **SE WS puro**.)
- **SE JWT rotaciona** → fricção recorrente (re-colar a cada ~2 semanas).
- **Polling LivePix** = atraso (intervalo) e teto de rate limit; **não é instantâneo** (ser honesto na UI).
- **Webhook puro (LivePix/Ko-fi) NÃO funciona local** — só com **relay pago**. Mensagem honesta:
  *"instantâneo no plano pago; no grátis, via Streamlabs ou a cada ~10s"*.
- **Depender de Streamlabs/SE** = só ver o que o streamer roteou pra lá; quem não usa precisa da Fase 2/3.
- Moeda/locale: reusar o `parse_amount` que o `chat.rs` já tem.

---

## 11. Referências

- Streamlabs Socket API — <https://dev.streamlabs.com/docs/socket-api>
- StreamElements WebSockets — <https://docs.streamelements.com/websockets>
- LivePix API (docs) — <https://docs.livepix.gg/api>
- LivePix CC API — <https://livepix.cc/api/docs>
- (interno) [`ALERTAS.md`](./ALERTAS.md) — modelo de alertas e Fase 1 nativa.
