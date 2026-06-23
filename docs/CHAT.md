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
| **Facebook / TikTok / X** | sem leitura pública simples | — | — | — |

---

## Emotes & badges

- **Twitch:** o tag IRC `emotes` (`id:start-end`) é convertido em fragmentos texto/emote; a imagem vem de
  `https://static-cdn.jtvnw.net/emoticons/v2/{id}/default/dark/1.0`. Badges vêm do tag `badges` e viram
  **chips** (mod/sub/vip/host/…) — sem precisar da Helix API (que exigiria credencial).
- **Kick:** o conteúdo traz emotes como `[emote:ID:nome]` → `https://files.kick.com/emotes/{ID}/fullsize`.
  Badges saem de `sender.identity.badges`.
- **YouTube:** emojis unicode renderizam nativamente; host/mod/membro viram chips.

---

## Múltiplas fontes

Dá pra ter **vários chats da mesma plataforma** (ex.: 2 Twitches + 1 Kick + 1 YouTube). Cada fonte é
`{ platform, value, name (apelido), enabled }`. A mensagem carrega `source` (o apelido/canal), então o
toggle **"Origem"** distingue de quem veio cada mensagem no feed unificado. A API key do YouTube é uma
só, compartilhada entre as fontes do YouTube.

## Deleções de moderação

Quando um mod apaga uma mensagem ou bane alguém, a mensagem **some do feed** automaticamente:
- **Twitch:** `CLEARMSG` (1 msg, via `target-msg-id`) e `CLEARCHAT` (usuário ou chat inteiro) — capability `twitch.tv/commands`.
- **Kick:** `MessageDeletedEvent` e `UserBannedEvent`.
- **YouTube:** itens `messageDeletedEvent` / `userBannedEvent`.

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
```

- **`src-tauri/src/chat.rs`** — cada fonte roda numa thread (`spawn_blocking`) e emite `ChatMessage`
  normalizada `{id, platform, author, color?, text, fragments[], badges[], ts}`. Controle via `AtomicBool`
  em `ChatRuntime` (no `AppState`). TLS (rustls) no tungstenite p/ o `wss://` do Kick.
- **Comandos:** `chat_start`, `chat_stop`.
- **Frontend:** store (`bindChat`/`connectChat`/`disconnectChat`) mantém o feed (cap 400) e o status,
  persistindo ao navegar; `ChatScreen` renderiza fragmentos (texto + `<img>` de emote), badges e plataforma
  conforme os toggles.

---

## Limitações & próximos passos

- **Somente leitura** (não envia). Enviar exigiria OAuth por plataforma.
- **Kick** depende de uma API não-oficial protegida por **Cloudflare** — pode falhar em algumas redes/regiões;
  a app key do Pusher é pública e **muda de tempos em tempos**.
- **YouTube** tem **cota** (Data API ~10k/dia); lives longas podem esbarrar.
- **Facebook/TikTok/X**: sem API de leitura pública.
- 🔬 *Validado pelos protocolos/docs oficiais e da comunidade; não rodei as três fontes ao vivo aqui.*
