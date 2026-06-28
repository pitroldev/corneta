# Envio de mensagens pelo multi-chat

> Planejamento pra **enviar** mensagens (e moderar) pelas plataformas a partir do chat unificado —
> uma caixa só que manda pra todas as fontes autenticadas, ou pra uma escolhida.

- **Status:** Rascunho para discussão (v0.1) · 2026-06-23
- **Relacionado:** [`CHAT.md`](./CHAT.md) (leitura já existe), [`ALERTAS.md`](./ALERTAS.md)

> ✅ **Fases 1–3 implementadas** (falta só o Kick, Fase 4):
> - **Fase 1** — Twitch via token colado: IRC autenticado, fila de saída por fonte, `PRIVMSG`,
>   eco local, rate-limit (~18/30s), `chat://auth`, token no cofre (`chat_send_<id>`).
> - **Fase 2** — **login no navegador (device flow)** na Twitch e **envio no YouTube** (OAuth):
>   `src-tauri/src/auth.rs` faz os dois device flows, guarda tokens no cofre com refresh, eventos
>   `auth://twitch`/`auth://youtube`. YouTube resolve a live ativa e usa `liveChatMessages.insert`.
>   Logado, todas as fontes Twitch enviam pela conta; a caixa de envio inclui YouTube.
> - **Escala (local) das credenciais** — pensado pra distribuir o app:
>   - **Twitch:** o `client_id` (público) é shippado pelo dev via `.env` (`VITE_TWITCH_CLIENT_ID`).
>     Um app serve todos os usuários (cada um loga na própria conta; rate limit é por token). Escala.
>   - **YouTube (BYOK):** a cota do YouTube é **por projeto do Google**, então shippar um `client_id`
>     do dev NÃO escala (cota e verificação compartilhadas). Por isso **cada usuário cola as próprias
>     credenciais do Google no app** (`set_youtube_oauth` → cofre `youtube_client_id`/`_secret`), com
>     guia embutido. Assim cada um tem a própria cota (10k/dia) e não precisa de verificação do dev.
>     O `.env` Google vira só um padrão de dev; o que o usuário cola sempre vence.
> - **Fase 3** — **moderação**: hover numa mensagem → apagar/timeout/ban. Twitch via Helix
>   (`moderation/chat`, `moderation/bans`); YouTube via `liveChat/messages.delete` (ban/timeout do YT
>   ficou de fora — precisa do channelId do autor, que o feed não carrega ainda).
> - **Fase 4 (Kick)** — não feita de propósito (API não-oficial, frágil, risco de ToS).

---

## 1. Problema

O chat unificado hoje é **só leitura** (conexões anônimas/baratas). **Enviar** é outra história: exige
**autenticação** (login) em cada plataforma. O objetivo é digitar uma vez e mandar pra Twitch/YouTube/…
— sem alternar entre abas — incluindo, no futuro, **moderar** (apagar mensagem, timeout, ban) de um lugar só.

---

## 2. Leitura ≠ envio (por que precisa de login)

| | Leitura (hoje) | Envio (esta feature) |
|---|---|---|
| **Twitch** | IRC anônimo (`justinfan`) | IRC **autenticado**: `PASS oauth:<token>` + `NICK <login>` → `PRIVMSG` |
| **YouTube** | Data API com **API key** (read) | Data API `liveChatMessages.insert` + **OAuth do Google** (escopo `youtube.force-ssl`) |
| **Kick** | Pusher anônimo | POST não-oficial com **bearer/sessão** (sem API pública) |

---

## 3. Autenticação — opções por plataforma

### Twitch (a mais viável)
- **Escopos:** `chat:read` + `chat:edit` (enviar). Pra moderar: `channel:moderate`, `moderator:manage:*`.
- **Como obter o token:**
  - **A) Colar token** — o usuário gera num gerador (ex.: twitchtokengenerator) e cola. *Funciona já, sem
    registrar app.* Manual, e o token expira.
  - **B) Login no navegador** — fluxo OAuth (Authorization Code + PKCE, ou device code) com um **app
    "Corneta" registrado na Twitch** (client id público embutido). Melhor UX; exige 🧑 registrar o app.
- **Token guardado no cofre** (keyring), como as stream keys.

### YouTube
- **OAuth 2.0 do Google** (Authorization Code + PKCE pra desktop, ou device flow). Escopo
  `https://www.googleapis.com/auth/youtube.force-ssl`. Precisa de um **OAuth Client** no Google Cloud (🧑).
- **Cota:** `insert` é **caro** (~50 unidades vs ~1–5 de leitura) — enviar muito esbarra na cota diária.

### Kick
- Sem API pública de envio. Caminho não-oficial: `POST kick.com/api/v2/messages/send/{chatroom}` com
  **bearer/sessão + XSRF**, atrás de Cloudflare. **Frágil** — fica por último, melhor-esforço.

---

## 4. Arquitetura

```
caixa de envio (UI) ──chat_send(text, sources?)──► chat.rs
                                                    │  (fila de saída por fonte)
                          Twitch IRC (autenticado) ◄┘──► PRIVMSG
                          YouTube insert (OAuth)   ◄────► liveChatMessages.insert
   eco local no feed ◄───────────────────────────────────┘
```

- Cada **fonte** vira "send-capable" se tiver credencial. A leitura continua; o envio reusa a **mesma
  conexão** (Twitch IRC) ou uma chamada HTTP (YouTube).
- **Fila de saída por fonte:** o `ChatRuntime` guarda um `mpsc::Sender<Outgoing>` por fonte. `chat_send`
  empurra o texto; o **loop de leitura** (que já tem read-timeout) **drena a fila** a cada iteração e
  faz `socket.send()` / a chamada HTTP. Sem precisar dividir o socket (encaixa no loop atual).
- **Eco local:** ao enviar, a Corneta injeta a própria mensagem no feed (`chat://message`) — a Twitch não
  devolve o próprio `PRIVMSG` por padrão.
- **Rate limit:** token-bucket por fonte (Twitch: ~20 msg/30 s normal, ~100 mod). Estourar = ban temporário.

---

## 5. UX

```
┌ Chat ───────────────────────────────────────────────┐
│ … feed unificado …                                   │
├──────────────────────────────────────────────────────┤
│ [Twitch ▾ todas]  [ digite a mensagem…        ] [↵]  │
│ logado como @pitrol · Twitch ✓   YouTube (entrar)    │
└──────────────────────────────────────────────────────┘
```

- Caixa única: **enviar pra todas** as fontes autenticadas ou escolher **uma** (dropdown).
- Indicador "**logado como X**" por plataforma; botão "entrar/conectar" onde falta credencial.
- Estados: enviando…, ✓ enviado, ✕ erro (token expirado → pedir re-login), rate-limited (espera).
- Atalho: Enter envia, Shift+Enter quebra linha.

---

## 6. Moderação (extensão natural)

Como **já recebemos** deleções (CLEARMSG/CLEARCHAT etc.), o passo seguinte é **agir** do app:
- **Twitch:** Helix `Delete Chat Messages`, `Ban User` (timeout/ban) — escopos `moderator:manage:*`.
- **YouTube:** `liveChatMessages.delete`, `liveChatBans.insert`.
- **Kick:** não-oficial.
- UI: passar o mouse numa mensagem → **apagar / timeout / ban** (onde houver permissão).

---

## 7. Roadmap por fases

| Fase | Entrega | Precisa de quê? |
|---|---|---|
| **1 — Twitch (token)** | Caixa de envio + IRC autenticado por token colado + eco + rate-limit | nada (token colado) |
| **2 — Login + YouTube** | OAuth no navegador (app Corneta) na Twitch; envio no YouTube (OAuth Google) | 🧑 registrar apps (Twitch + Google) |
| **3 — Moderação** | Apagar/timeout/ban pela UI (Twitch/YouTube) | escopos extras |
| **4 — Kick + extras** | Envio no Kick (não-oficial), conta de bot separada, comandos/atalhos | — |

---

## 8. Decisões & tradeoffs

| Decisão | Recomendação | Alternativas |
|---|---|---|
| Auth Twitch (v1) | **token colado** (rápido) | login no navegador (precisa app) |
| Guardar tokens | **keyring** (cofre do SO) | arquivo (pior) |
| Conta de envio | a **sua** conta | conta de **bot** dedicada (evita poluir como streamer) |
| Eco no feed | **injetar local** | esperar a plataforma devolver (Twitch não devolve) |
| Rate limit | token-bucket por fonte | confiar na plataforma (risco de ban) |

---

## 9. Riscos & mitigações

| Risco | Mitigação |
|---|---|
| Token expira | detectar 401/`NOTICE` de auth → marcar "deslogado" e pedir re-login |
| Rate limit / ban por spam | bucket client-side + fila com espera; avisar na UI |
| Cota do YouTube (insert caro) | avisar custo; deixar o envio YT opcional |
| Kick muda/Cloudflare | isolado na Fase 4, degrada sem quebrar o resto |
| Segurança do token | só no keyring; nunca logar; escopo mínimo |
| Enviar pra fonte errada | confirmação visual de "pra onde vai" + eco rotulado por origem |

---

## 10. O que já existe a favor

- **Conexões de chat ativas** (Twitch IRC etc.) — o envio reusa a mesma conexão/loop.
- **Cofre (keyring)** — pronto pra guardar tokens.
- **Multi-fonte + `source`** — o eco já sai rotulado por canal; envio "pra uma" é só escolher a fonte.
- **Deleções recebidas** — meio caminho pra moderação (agir, não só refletir).

---

## 11. Decisões em aberto

1. **v1 com token colado** (rápido) ou já **login no navegador** (precisa registrar o app Corneta)?
2. **Conta do streamer** ou **conta de bot** dedicada pra enviar?
3. **Moderação** entra cedo (apagar/timeout do app) ou só depois do envio puro?
4. Caixa **única "pra todas"** por padrão, ou **uma fonte por vez** (menos risco de mandar no canal errado)?
