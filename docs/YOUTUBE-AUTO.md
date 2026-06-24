# YouTube: achar a live sozinho (sem colar o link toda vez)

> Planejamento pra resolver uma dor real: no YouTube o **ID do vídeo muda a cada transmissão**,
> então hoje o streamer tem que **colar o link/ID da live toda vez**. Na Twitch é o nome do canal
> (fixo); no YouTube, não. A meta: ele configura o **canal uma vez** e a Corneta **acha a live atual
> sozinha** — "fazemos isso por ele".

- **Status:** ✅ **Fase 1 + 1.5 implementadas** (scrape do `/live` + **chat via InnerTube, sem API key**; API key vira fallback/opcional) · 🔬 não validadas com canal real · 2026-06-23
- **Relacionado:** [`ENVIO.md`](./ENVIO.md) (enviar/moderar — casa com OAuth), [`IDEIAS-v2.md`](./IDEIAS-v2.md)

---

## 0. O problema

Hoje a fonte do YouTube na Corneta pede **"Vídeo ao vivo (URL ou ID)"**. Como o YouTube cria um
**vídeo novo a cada live**, o ID muda sempre — então o streamer precisa, **toda transmissão**:
1. Abrir o YouTube Studio / a live.
2. Copiar o link/ID do vídeo.
3. Colar na Corneta.
4. Conectar.

É chato, dá erro fácil (cola o link errado, esquece de atualizar) e quebra o ritmo do "liga e
transmite". Queremos: **configura o canal uma vez → nunca mais toca no link**.

---

## 1. O que precisamos

- **Entrada:** o **canal** do streamer — handle (`@fulano`), URL do canal, ou channel ID (`UC...`).
  Idealmente aceitar também um ID/URL de vídeo direto (compatibilidade), detectando o formato.
- **Saída:** o **vídeo ao vivo atual** daquele canal (quando houver) → daí o **chat** (fluxo que já
  temos: `activeLiveChatId` → polling do liveChat).
- **Comportamento:** se o canal **ainda não está ao vivo**, ficar em **"aguardando"** e conectar
  **automaticamente** assim que a live começar (a Corneta pode ficar aberta antes do "BORA").

---

## 2. As alternativas

### A) Scrape do `/live` → ID do vídeo → API key pro chat  ⭐ (mais leve)
O YouTube tem uma URL "mágica" que sempre aponta pra live atual do canal:
- `https://www.youtube.com/channel/{UC...}/live`
- `https://www.youtube.com/@{handle}/live`

Buscando essa página (com User-Agent de navegador) dá pra extrair o **ID do vídeo ao vivo** do HTML:
- do `ytInitialPlayerResponse` (campo `videoDetails.videoId` + `isLive`/`liveBroadcastDetails`),
- ou do `<link rel="canonical" href=".../watch?v=VIDEOID">`,
- ou da meta `og:video:url`.

Com o ID em mãos, segue o **fluxo atual** (videos.list → `activeLiveChatId` → polling do liveChat,
tudo com a **API key** que o usuário já configura).

- **Prós:** **zero quota** pra descobrir a live; **sem login novo** (mantém a filosofia "sem login/
  sem servidor nosso"); usa a API key que já existe; é o que o **streamlink** faz na prática.
- **Contras:** é **scraping** — depende do HTML do YouTube (pode mudar); pode falhar em live
  **só-pra-membros/restrita** (a página `/live` pede login); precisa de bom tratamento de "não tá ao vivo".

### B) `search.list` com `eventType=live` (API oficial, mas cara)
Chamar a API: `search.list?channelId={id}&eventType=live&type=video` → devolve a live do canal.

- **Prós:** API **oficial**, sem scraping, sem OAuth.
- **Contras:** `search.list` custa **100 unidades** por chamada (de 10.000/dia = **100 chamadas/dia**).
  Ficar **pollando** pra detectar "entrou ao vivo" estoura a quota rápido. Mitigável: só chamar **ao
  conectar** + recheck de baixa frequência + **cachear** o ID na sessão. Bom como **fallback** do (A).

### C) OAuth `liveBroadcasts.list` (mine + active)  — mais robusto, mas com login
O dono do canal faz **login com o Google** uma vez. Aí:
`liveBroadcasts.list?part=snippet&mine=true&broadcastStatus=active` → devolve a transmissão ativa e
o **`liveChatId` direto** (sem ID de vídeo, sem scraping).

- **Prós:** **set-and-forget** de verdade; oficial e **robusto** (não quebra com mudança de HTML);
  funciona em lives restritas; e **destrava enviar/moderar mensagens** — exatamente o que o
  [`ENVIO.md`](./ENVIO.md) precisa (com API key só dá pra **ler**; pra **escrever** precisa de OAuth).
- **Contras:** exige **fluxo OAuth** (projeto no Google Cloud com OAuth client + tela de consentimento +
  guardar/renovar tokens); **foge** do "sem login"; app não-verificado mostra **aviso do Google** e
  tem limite de 100 usuários até passar pela verificação. Mais peso pra implementar e pro usuário.

### D) Híbrido: scrape-first + fallback + OAuth opcional
Tentar **(A) scrape** (grátis); se falhar/mudar o HTML, cair pra **(B) search.list** (cacheado);
e oferecer **(C) OAuth** como caminho premium "liga e esquece" + envio de mensagens.

---

## 2.5 — Ler o chat SEM API key nem login (InnerTube) ⭐ A DESCOBERTA

Dá pra **ler o live chat do YouTube sem API key e sem OAuth** — do mesmo jeito que já pegamos o
videoId. O cliente web do YouTube usa uma API interna (**InnerTube**), e ferramentas consolidadas
leem o chat por ela: **pytchat**, **chat-downloader** ("No authentication needed!"),
**youtube-live-chat-downloader** (Go), **YTLiveChat** (.NET — *"no API keys, no OAuth dance, no quota
headaches"*) e o **yt-dlp**.

**Como funciona:**
1. Buscar `https://www.youtube.com/live_chat?v={VIDEO_ID}` (ou a watch page) e extrair do HTML:
   - `INNERTUBE_API_KEY` (regex — é a chave **pública do web client**, não a do usuário),
   - a **versão do client** (`INNERTUBE_CONTEXT_CLIENT_VERSION` / `ytcfg`),
   - o **continuation token** inicial (do `ytInitialData`).
2. POST em `https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?key={INNERTUBE_API_KEY}` com
   `{ context: { client… }, continuation }`.
3. A resposta traz as **ações de chat** (mensagens, super chats, membros…) + um **novo continuation**
   + o intervalo de poll. Repete com o novo token. Loop — igual ao que o navegador faz.

- **Prós:** **zero config** pro usuário — só o **canal**, **igual à Twitch** (sem API key, sem login,
  sem quota). Casa 100% com "sem login/sem servidor nosso" e com o scrape do `/live` que já fazemos.
- **Contras:** API **interna/não-documentada** (zona cinza de ToS; pode mudar — mas é estável há anos
  em várias libs); precisa ler key/versão/continuation **fresco** a cada conexão; o parsing dos
  *renderers* é diferente do Data API (mais trabalho). **Não dá pra enviar** mensagem por aqui (só
  ler) — envio continua sendo OAuth (Fase 2).

> **Muda o jogo:** YouTube vira **zero-config** (igual Twitch). A API key deixa de ser **obrigatória**
> pro chat — no máximo vira **fallback** (ou um extra pra quem já tem).

---

## 3. Comparação

| Critério | A) Scrape `/live` | B) search.list | C) OAuth liveBroadcasts |
|---|---|---|---|
| Login novo | ❌ não | ❌ não | ✅ sim (Google) |
| Quota | 🟢 zero (descoberta) | 🔴 100/chamada | 🟢 baixa |
| Robustez | 🟡 HTML pode mudar | 🟢 oficial | 🟢🟢 oficial + estável |
| Lives restritas/membros | ❌ falha | 🟡 depende | ✅ funciona |
| Destrava **enviar** msg | ❌ | ❌ | ✅ (ver [`ENVIO.md`](./ENVIO.md)) |
| Esforço | 🟢 baixo | 🟢 baixo | 🔴 alto |
| Encaixe na filosofia | ✅ "sem login" | ✅ | ➖ login |

---

## 4. Recomendação

**Fase 1 — Scrape-first com fallback (A + B).** Resolve a dor **inteira** com o **menor atrito**: o
usuário troca o "ID do vídeo" pelo **canal** (uma vez) e usa a **mesma API key** de hoje. Sem login
novo, sem custo de quota na descoberta. O `search.list` entra só como **rede de segurança** se o
scrape quebrar.

**Fase 1.5 — Chat por InnerTube (2.5), sem API key.** ⭐ O salto: lê o chat pela API interna, então o
YouTube fica **zero-config (só o canal, igual Twitch)**. A API key vira **fallback** (se o InnerTube
quebrar) ou extra. Reaproveita o videoId que o scrape do `/live` já resolve. **Recomendado** logo
após a Fase 1 — é o que entrega a experiência "liga e transmite" no YouTube.

**Fase 2 — OAuth opcional (C).** Pra quem quiser o caminho **mais robusto** (lives de membros, imune
a mudança de HTML) **e** o **envio/moderação** de mensagens — aí já amarra com o [`ENVIO.md`](./ENVIO.md).
Oferecido como "Conectar com o Google" opt-in, não obrigatório.

> Resumo: **Fase 1** mata o "nunca mais cole o link". **Fase 1.5 (InnerTube)** mata o "nem precisa de
> API key" → YouTube tão simples quanto a Twitch. **Fase 2 (OAuth)** é o upgrade pra enviar mensagens.

---

## 5. Plano de implementação — Fase 1

### 5.1 Config / UX
- Campo da fonte YouTube passa de **"Vídeo ao vivo (URL ou ID)"** → **"Canal do YouTube"**.
  - Aceita: `@handle`, `youtube.com/@handle`, `youtube.com/channel/UC...`, `UC...` cru, e (compat)
    um ID/URL de vídeo direto.
  - Dica: *"Seu canal — a Corneta acha a live sozinha. Não precisa colar o link toda vez."*
- Guardar o **canal** (não o vídeo). O vídeo é resolvido em runtime.

### 5.2 Resolução (backend `chat.rs`)
1. **Normalizar** a entrada → classificar: `videoId` | `handle` | `channelId` | `channelUrl`.
2. Montar a URL `/live`:
   - channelId: `https://www.youtube.com/channel/{UC...}/live`
   - handle: `https://www.youtube.com/@{handle}/live`
3. **Fetch** com User-Agent de navegador → extrair o **videoId** e confirmar **isLive**:
   - estratégia 1: regex/parse de `ytInitialPlayerResponse` → `videoDetails.videoId` +
     `videoDetails.isLiveContent` / `microformat...liveBroadcastDetails.isLiveNow`.
   - estratégia 2: `<link rel="canonical" href=".../watch?v=VIDEOID">`.
   - estratégia 3: meta `og:video:url`.
4. Achou live → segue o **fluxo atual** (`videos.list?part=liveStreamingDetails` →
   `activeLiveChatId` → polling do liveChat com a API key).
5. **Não tá ao vivo** → status **`waiting`** (já existe esse estado) e deixa o **supervisor de
   reconexão** (que já implementamos) tentar de novo a cada ~20–30s. Quando a live começa, conecta
   **sozinho**.

### 5.3 Viewers
O poller de viewers (`run_viewers`) usa a **mesma resolução** → pega `concurrentViewers` do vídeo
resolvido. Reaproveitar o resolvedor (cachear o videoId por ~alguns segundos pra não refazer fetch).

### 5.4 Fallback (B)
Se o scrape não achar o videoId (HTML mudou / bloqueio), tentar **uma** chamada
`search.list?channelId&eventType=live&type=video` (se tiver channelId; senão resolver handle→ID com
`channels.list?forHandle` = 1 unidade). Cachear o resultado por bastante tempo pra não queimar quota.

### 5.5 Cache & estados
- Cachear `canal → videoId` enquanto a sessão de chat vive; **re-resolver no reconnect** (broadcast
  novo = ID novo).
- Estados visíveis: `waiting` (aguardando a live), `connected`, `error` (canal inválido / sem API key).

---

## 6. Fase 2 — OAuth (esboço)

- Botão **"Conectar com o Google"** nas settings do YouTube.
- Fluxo OAuth (PKCE) → guardar refresh token (no store cifrado / keyring).
- Ao conectar o chat: `liveBroadcasts.list?mine=true&broadcastStatus=active` → `liveChatId` direto.
- Reaproveita pro **envio** (`liveChatMessages.insert`) e **moderação** — ver [`ENVIO.md`](./ENVIO.md).
- Precisa: projeto Google Cloud (OAuth client "Desktop"), tela de consentimento, e (pra remover o
  aviso de app não-verificado) passar pela **verificação** do Google. Documentar isso pro usuário —
  ou shippar com um client da Corneta já verificado.

---

## 7. Riscos & mitigações

- **HTML do YouTube muda** (scrape quebra) → 3 estratégias de parse + **fallback search.list** + logs
  claros. Centralizar o parser num lugar só (fácil de corrigir).
- **Bloqueio/anti-bot** se pollar demais → User-Agent real, intervalo sensato (~20–30s), cache.
- **Live de membros/restrita** → scrape falha; cair pro fallback ou orientar o OAuth (Fase 2).
- **Canal com 2 lives ao mesmo tempo** (raro) → pegar a principal (1ª do player) e logar.
- **Premiere vs live** → conferir `isLiveNow` pra não conectar num premiere/VOD.
- **ToS**: ler página pública de canal é zona cinza, mas é prática comum (streamlink et al.). OAuth
  (Fase 2) é 100% oficial pra quem quiser.

---

## 8. O que **não** fazer

- **Obrigar OAuth** na Fase 1 — mataria a simplicidade. OAuth é **opt-in** (Fase 2).
- **Pollar `search.list` em loop** pra detectar a live — estoura quota (100/chamada). Só como
  fallback pontual e cacheado.
- **Servidor nosso** intermediando o YouTube — mantém local. (Só reconsiderar se a verificação
  OAuth exigir.)
- **Pedir o link do vídeo** como hoje — é exatamente o que estamos eliminando (no máximo aceitar
  como compatibilidade).

---

## 9. Próximo passo sugerido

Implementar a **Fase 1 (A)**: trocar a entrada pra **canal**, escrever o **resolvedor `/live`** em
`chat.rs` (3 estratégias de parse), plugar no `run_youtube`/`run_viewers` e usar o estado `waiting` +
o supervisor de reconexão que já temos. É contido, não precisa de login, e entrega o "nunca mais cole
o link".

---

## Fontes
- **InnerTube (chat sem API key):** [chat-downloader (xenova)](https://github.com/xenova/chat-downloader) · [pytchat](https://github.com/taizan-hokuto/pytchat) · [YTLiveChat (.NET)](https://github.com/Agash/YTLiveChat) · [youtube-live-chat-downloader (Go)](https://github.com/abhinavxd/youtube-live-chat-downloader) · [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- [YouTube Data API — search.list](https://developers.google.com/youtube/v3/docs/search/list) · [Quota Calculator](https://developers.google.com/youtube/v3/determine_quota_cost)
- [YouTube Live Streaming API — liveBroadcasts.list](https://developers.google.com/youtube/v3/live/docs/liveBroadcasts/list) · [Streaming Live Chat](https://developers.google.com/youtube/v3/live/streaming-live-chat)
- [channels.list (`forHandle` → channelId)](https://developers.google.com/youtube/v3/docs/channels/list)
- [streamlink — plugin de YouTube (scrape do `/live` → videoId)](https://github.com/oe-mirrors/streamlink-plugins/blob/master/youtube.py)
- [Adam Learns — notas da YouTube API (liveBroadcasts, video id)](https://notes.adamlearns.com/notes/adam-learns---notes/coding/apis/youtube-api/)
