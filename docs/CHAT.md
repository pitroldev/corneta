# Chat unificado

> Junta os chats das plataformas num feed só — com **emotes**, **badges** e de **qual plataforma** vem cada um.

- **Status:** ✅ Implementado · 2026-06-23 · tela **Chat** na sidebar

---

## Suporte por plataforma

| Plataforma | Como funciona | Precisa de quê? | Emotes | Badges |
|---|---|---|---|---|
| **Twitch** | IRC anônimo sobre WebSocket (`ws://irc-ws.chat.twitch.tv`) | só o **nome do canal** — zero login ✅ | ✅ nativos (CDN) | ✅ chips (mod/sub/vip/…) |
| **Kick** | Pusher (`wss://ws-us2.pusher.com`) + API p/ resolver o chatroom | **slug do canal** — pode falhar por Cloudflare ⚠️ | ✅ nativos (CDN) | ✅ do sender |
| **YouTube** | Data API v3 (`liveChat/messages`) | **API key** + **vídeo ao vivo** 🧑 | emojis unicode | ✅ (host/mod/membro) |
| **Cinefy (experimental)** | REST (`/v1/user`, `/v1/threads`) + canal Pusher público `chatroom.{id}` | **slug público**; somente leitura e sem login | texto/emojis unicode | ✅ (criador e selos públicos) |
| **Facebook / TikTok / X** | sem leitura pública simples | — | — | — |

---

## Emotes & badges

- **Twitch:** o tag IRC `emotes` (`id:start-end`) é convertido em fragmentos texto/emote; a imagem vem de
  `https://static-cdn.jtvnw.net/emoticons/v2/{id}/default/dark/1.0`. Badges vêm do tag `badges` e viram
  **chips** (mod/sub/vip/host/…) — sem precisar da Helix API (que exigiria credencial).
- **Kick:** o conteúdo traz emotes como `[emote:ID:nome]` → `https://files.kick.com/emotes/{ID}/fullsize`.
  Badges saem de `sender.identity.badges`.
- **YouTube:** emojis unicode renderizam nativamente; host/mod/membro viram chips.
- **Cinefy:** preserva texto e emojis unicode; os selos públicos do autor viram chips (incluindo criador verificado).
- **Emotes de terceiros (BetterTTV / FrankerFaceZ / 7TV):** nos canais da Twitch, a Corneta busca os
  emotes **globais + do canal** (via `room-id` do IRC) e troca a palavra correspondente pela imagem
  (BTTV `cdn.betterttv.net`, FFZ `cdn.frankerfacez.com`, 7TV `cdn.7tv.app`). Os hosts estão liberados na
  CSP. *(Kick/YouTube/Cinefy usam só o conteúdo fornecido pela própria plataforma por enquanto.)*

---

## Múltiplas fontes

Dá pra ter **vários chats da mesma plataforma** (ex.: 2 Twitches + 1 Kick + 1 YouTube + 1 Cinefy). Cada fonte é
`{ platform, value, name (apelido), enabled }`. A mensagem carrega `source` (o apelido/canal), então o
toggle **"Origem"** distingue de quem veio cada mensagem no feed unificado. A API key do YouTube é uma
só, compartilhada entre as fontes do YouTube.

## Deleções de moderação

Quando um mod apaga uma mensagem ou bane alguém, a mensagem **some do feed** automaticamente:
- **Twitch:** `CLEARMSG` (1 msg, via `target-msg-id`) e `CLEARCHAT` (usuário ou chat inteiro) — capability `twitch.tv/commands`.
- **Kick:** `MessageDeletedEvent` e `UserBannedEvent`.
- **YouTube:** itens `messageDeletedEvent` / `userBannedEvent`.
- **Cinefy:** `ThreadDeleted` e `ThreadFailure` pelo canal Pusher.

O backend emite `chat://delete` com escopo `message` (por `nativeId`), `user` ou `all`; o store filtra o feed.

## Janela flutuante

Botão **"Janela"** abre uma janela **só do chat**, **always-on-top** e redimensionável (`open_chat_window`
→ webview `#chat-popout`), pro streamer deixar num canto/segundo monitor sem o app inteiro. Compartilha o
mesmo feed (eventos broadcast pra todas as janelas).

## Configurável

Na tela **Chat → Configurar**:
- **Fontes:** adiciona/remove/ativa cada canal (várias por plataforma) + API key do YouTube.
- **Exibição (toggles):** **emotes**, **badges**, **plataforma**, **origem (canal)**, **horário**. Salvos nas settings.
- **Filtros** por plataforma + **Limpar**; auto-scroll que pausa ao rolar pra cima.

---

## Arquitetura

```
Twitch IRC ─┐
Kick Pusher ─┼─► chat.rs (fontes) ──emit──► chat://message ──► store ──► ChatScreen
YouTube API ─┘                     chat://status

Cinefy REST/Pusher ─► adapter ─► OutputPort (porta) ─► CinefySink ─► ChatMessage
```

- **`src-tauri/src/chat.rs`** — cada fonte roda numa thread (`spawn_blocking`) e emite `ChatMessage`
  normalizada `{id, platform, author, color?, text, fragments[], badges[], ts}`. Controle via `AtomicBool`
  em `ChatRuntime` (no `AppState`). TLS (rustls) no tungstenite p/ o `wss://` do Kick.
- **`src-tauri/src/chat/cinefy/`** — integração hexagonal isolada em `domain`, `ports` e `adapter`.
  O adaptador contém os contratos REST/Pusher não documentados e não conhece Tauri nem UI; o composition
  root em `chat.rs` implementa a porta e converte eventos de domínio na mensagem normalizada da Corneta.
- **Comandos:** `chat_start`, `chat_stop`.
- **Frontend:** store (`bindChat`/`connectChat`/`disconnectChat`) mantém o feed (cap 400) e o status,
  persistindo ao navegar; `ChatScreen` renderiza fragmentos (texto + `<img>` de emote), badges e plataforma
  conforme os toggles.

---

## Limitações & próximos passos

- **Cinefy é somente leitura:** envio e moderação exigiriam sessão/autorização da plataforma e não fazem
  parte do adaptador experimental. Twitch, YouTube e Kick mantêm seus fluxos autenticados existentes.
- **Cinefy é experimental:** os endpoints e eventos observados não são documentados; nomes, chave pública
  do Pusher ou payloads podem mudar sem aviso. As constantes são lidas do frontend da Cinefy com fallback.
- **Kick** depende de uma API não-oficial protegida por **Cloudflare** — pode falhar em algumas redes/regiões;
  a app key do Pusher é pública e **muda de tempos em tempos**.
- **YouTube** tem **cota** (Data API ~10k/dia); lives longas podem esbarrar.
- **Facebook/TikTok/X**: sem API de leitura pública.
- 🔬 *Cinefy validada contra o popout público, histórico REST e assinatura Pusher pública; sem envio autenticado.*
