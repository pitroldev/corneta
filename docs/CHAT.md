# Chat unificado

> Junta os chats das plataformas num feed só, pra você não perder ninguém durante a live.

- **Status:** ✅ Implementado · 2026-06-23 · tela **Chat** na sidebar

---

## Suporte por plataforma

| Plataforma | Como funciona | Precisa de quê? |
|---|---|---|
| **Twitch** | IRC anônimo sobre WebSocket (`ws://irc-ws.chat.twitch.tv`) | só o **nome do canal** — zero login ✅ |
| **YouTube** | Data API v3 (`liveChat/messages`) | **API key** sua + **URL/ID do vídeo ao vivo** 🧑 |
| **Kick / Facebook / TikTok** | sem leitura pública simples | — (não suportado ainda) |

> Twitch funciona de imediato. YouTube exige uma API key sua porque não há leitura pública sem credencial.

---

## Como usar

1. Tela **Chat** → botão **Configurar**.
2. **Twitch:** digite o **nome do canal** (ex.: `pitrol`). Pronto.
3. **YouTube (opcional):**
   - Crie uma **API key** no [Google Cloud Console](https://console.cloud.google.com/) (ative a *YouTube Data API v3*).
   - Cole a key + a **URL ou ID do vídeo ao vivo**.
4. Clique em **Conectar**. As mensagens aparecem no feed unificado, com **badge/cor por plataforma**, autor e texto.
5. **Filtros** (Twitch/YouTube) e **Limpar** no topo do feed; auto-scroll que pausa se você rolar pra cima.

---

## Arquitetura

```
Twitch IRC ─┐
            ├─► chat.rs (fontes) ──emit──► chat://message ──► store ──► ChatScreen
YouTube API ┘                     chat://status
```

- **`src-tauri/src/chat.rs`** — fontes plugáveis. Cada uma roda numa thread (`spawn_blocking`) e emite `ChatMessage` normalizada (`{id, platform, author, text, color?, ts}`). Controle via `AtomicBool` em `ChatRuntime` (no `AppState`).
  - **Twitch:** conecta anônimo (`PASS SCHMOOPIIE` + `NICK justinfan…`), pede tags (cor/nome), parseia `PRIVMSG`, responde `PING`. Read com timeout pra checar o flag de parada.
  - **YouTube:** resolve `activeLiveChatId` (videos.list) e faz polling de `liveChat/messages` respeitando o `pollingIntervalMillis` da API (ignora o backlog inicial).
- **Comandos:** `chat_start`, `chat_stop`.
- **Frontend:** o store (`bindChat`/`connectChat`/`disconnectChat`) mantém as mensagens (cap 400) e o status, persistindo ao navegar; a `ChatScreen` renderiza o feed.

---

## Limitações & próximos passos

- **Somente leitura** (não envia mensagens). Enviar exigiria OAuth por plataforma.
- **YouTube tem cota** (Data API ~10k unidades/dia); lives muito longas podem esbarrar nela.
- **Kick/Facebook/TikTok**: pendentes — Kick é viável via API não-oficial (Pusher); os demais exigem OAuth/sem API de leitura.
- 🔬 *Twitch validado pelo protocolo; YouTube depende da sua key + vídeo ao vivo (não testado de ponta a ponta aqui).*
