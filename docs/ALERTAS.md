# Alertas centralizados (todas as plataformas)

> Planejamento da feature que junta os **alertas** (seguidor, inscrição, gift, bits/donate, raid,
> membro, super chat…) de **todas as plataformas** num lugar só — painel no app e **overlay pro OBS**.

- **Status:** ✅ **Fases 1–3 implementadas** (chat + Streamlabs/StreamElements + overlay pro OBS) · 2026-07-04
- **Relacionado:** [`CHAT.md`](./CHAT.md) (reaproveita as conexões), [`PLANEJAMENTO.md`](./PLANEJAMENTO.md)

---

## 1. Problema

Quem transmite pra várias plataformas tem alertas espalhados (Streamlabs numa, YouTube Studio noutra,
painel do Kick…). É fácil **perder um sub, um donate ou um raid**. A Corneta já une o **chat**; unir os
**alertas** é o passo natural — um feed só, e um **overlay** único pra mostrar na live.

**Objetivo:** capturar os eventos de engajamento de cada plataforma, normalizar num formato comum e
exibir (1) num **painel** dentro do app e (2) num **overlay** que o OBS adiciona como *browser source*.

---

## 2. Tipos de alerta

| Tipo | Twitch | YouTube | Kick |
|---|---|---|---|
| **Seguidor** (follow) | 🔑 EventSub | 🔑 Data API | 🔑 API |
| **Inscrição / resub** | ✅ chat (USERNOTICE) | ✅ chat (`newSponsorEvent`) | ✅ Pusher |
| **Gift sub** | ✅ chat (USERNOTICE) | — | ✅ Pusher |
| **Bits / cheer** | ✅ chat (tag `bits`) | — | — |
| **Donate / tip** | 🔑 Streamlabs/SE | ✅ Super Chat (chat) | 🔑 API |
| **Raid / host** | ✅ chat (USERNOTICE) | — | ✅ Pusher (host) |
| **Membro / milestone** | — | ✅ chat (`memberMilestone`) | — |

✅ = dá pra pegar **pela conexão de chat que já temos** · 🔑 = exige OAuth/API à parte.

---

## 3. Insight-chave: metade já vem pelo chat

A Corneta **já mantém** as conexões de chat (Twitch IRC, YouTube liveChat, Kick Pusher). Muitos alertas
trafegam por elas — **sem OAuth nenhum**:

- **Twitch:** as inscrições/resubs/gift subs/raids chegam como **`USERNOTICE`** no IRC (tags `msg-id` =
  `sub`/`resub`/`subgift`/`raid`, `msg-param-*`); **bits** vêm na tag `bits` de um `PRIVMSG`. Só **follow**
  precisa do **EventSub** (OAuth).
- **YouTube:** o `liveChatMessages` (que já pollamos) traz `snippet.type` = `newSponsorEvent`,
  `superChatEvent`, `superStickerEvent`, `memberMilestoneChatEvent`. Ou seja, **membros e super chats**
  já estão no que lemos.
- **Kick:** o Pusher do chatroom emite `App\\Events\\SubscriptionEvent`,
  `GiftedSubscriptionsEvent`, etc. — na **mesma conexão** do chat.

> Conclusão: a **Fase 1 não precisa de login** — estende as fontes de chat pra também emitir alertas.
> Follows e donates de terceiros (Streamlabs/StreamElements) ficam pra fases com OAuth.

---

## 4. Arquitetura

```mermaid
flowchart LR
  subgraph Fontes (já conectadas)
    TW[Twitch IRC] --> AL
    YT[YouTube liveChat] --> AL
    KI[Kick Pusher] --> AL
  end
  EV[EventSub / APIs (OAuth, fase 2)] --> AL
  AL[chat.rs → alerta normalizado] --emit--> EVT[alert://event]
  EVT --> PANEL[Painel de alertas (app)]
  EVT --> OVL[Overlay (janela/browser-source do OBS)]
```

- **`chat.rs`** ganha um parser de **alertas** ao lado do de mensagens; emite `alert://event` com um
  `Alert` normalizado.
- **Painel** no app (aba "Alertas" ou junto do Chat): feed dos últimos alertas, filtros, replay.
- **Overlay** pro OBS (ver §6): recebe os mesmos eventos e anima (texto + som).

---

## 5. Modelo de dados

```ts
type AlertKind = "follow" | "sub" | "resub" | "subgift" | "bits" | "tip" | "raid" | "member" | "superchat";
interface Alert {
  id: string;
  platform: "twitch" | "youtube" | "kick";
  source: string;        // rótulo do canal (multi-fonte)
  kind: AlertKind;
  user: string;          // quem disparou
  amount?: number;       // bits, meses de sub, valor do donate, nº de gifts, viewers do raid
  currency?: string;     // tip
  tier?: string;         // sub tier
  message?: string;      // mensagem opcional (resub/superchat)
  ts: number;
}
```

---

## 6. Overlay pro OBS — opções

O OBS mostra alertas via **Browser Source** (uma URL). Três caminhos:

| Opção | Como | Tradeoff |
|---|---|---|
| **A. Servidor HTTP local** (recomendado) | A Corneta sobe um http em `localhost:PORT` servindo o overlay + **SSE/WebSocket** com os alertas; o OBS adiciona `http://localhost:PORT/overlay` como browser source | É o jeito "padrão de mercado"; precisa de um mini-servidor embutido |
| **B. Janela transparente** | Uma janela Tauri transparente/always-on-top que o OBS captura por **Window Capture** | Sem servidor, mas captura de janela é mais frágil (foco/transparência) |
| **C. Arquivo HTML local** | Browser source aponta pra um arquivo; a Corneta atualiza via arquivo/porta | Simples, porém limitado |

> A **opção A** é a melhor experiência (igual Streamlabs). Reaproveita o padrão da **janela flutuante do
> chat** pra a parte visual, trocando a fonte de dados por um endpoint local.

---

## 7. Roadmap por fases

| Fase | Entrega | Precisa de quê? |
|---|---|---|
| **1 — Alertas via chat** ✅ | Parse de USERNOTICE/bits (Twitch), event types (YouTube), eventos Pusher (Kick) → `alert://event` + **painel** no app | nada (reusa o chat) |
| **2 — Follows & donates** ✅🟡 | **Streamlabs/StreamElements** (tips/follows/subs/bits/raids) via Socket.IO em `alerts.rs` ✅. Twitch **EventSub** (follow NATIVO por WebSocket+OAuth) **pendente** — redundante com Streamlabs/SE, baixo valor | 🧑 OAuth/app (só o EventSub nativo) |
| **3 — Overlay pro OBS** ✅ | Servidor local (`overlay.rs`, axum, loopback + porta fixa 7393) + `overlay.html` animado (texto + **som** via WebAudio), adicionável como browser source. Fonte = `chat::emit_alert` → `overlay::push` (broadcast) | — (feito) |
| **4 — Alert box completo** | Temas/sons customizáveis, **metas (goals)**, TTS, fila/replay, "agradecer" | — |

---

## 8. Decisões & tradeoffs

| Decisão | Recomendação | Alternativas |
|---|---|---|
| Fonte dos alertas (fase 1) | **reusar as conexões de chat** | conectar APIs do zero (mais OAuth) |
| Follows | EventSub (fase 2) — exige OAuth | ignorar follows na v1 |
| Overlay | **servidor http local + SSE** | janela transparente / arquivo |
| Som | tocar no overlay (browser) | tocar no app |
| Persistência | gravar alertas na sessão (junto do relatório) | efêmero |

---

## 9. Riscos & mitigações

| Risco | Mitigação |
|---|---|
| Formato de USERNOTICE/Pusher muda | parser tolerante (campos opcionais) + degradar pra "alerta genérico" |
| Cloudflare/limites do Kick | melhor-esforço (igual ao chat) |
| Cota da Data API (YouTube) | já compartilha o poll do chat (sem custo extra) |
| Overlay (porta ocupada) | porta configurável + fallback |
| Duplicação (alerta + mensagem no chat) | de-dup por `msg-id`/event id |

---

## 10. O que já existe a favor

- **Conexões de chat ativas** (Twitch/YouTube/Kick) — a maior parte dos alertas passa por elas.
- **Multi-fonte + `source`** — alertas já saem rotulados por canal.
- **Janela flutuante** (do chat) — base visual pronta pro overlay.
- **Gravação de sessão** — dá pra anexar os alertas ao relatório pós-live.

**Ou seja:** a Fase 1 é, em grande parte, **estender o `chat.rs`** — caminho curto pra um primeiro valor.

---

## 11. Decisões fechadas (v1)

1. **Painel junto do Chat** — os alertas aparecem como uma **coluna "Alertas"** na tela de Chat
   (toggleável), reusando as conexões e o ciclo de vida do chat. Sem item de navegação novo.
2. **Overlay na Fase 3** ✅ — feito: `overlay.rs` (servidor local, mesma família do `studio.rs`
   da Mesa) serve `overlay.html` e empurra cada alerta por WebSocket. Loopback + porta fixa (URL
   colável no OBS uma vez). Config em `overlayEnabled/overlaySound/overlayPosition/overlayPort`;
   UI na aba **Alertas** da tela de Chat (copiar URL, testar, "Adicionar no OBS").
3. **Follows só na Fase 2** — não compensa o OAuth na v1. A Fase 1 pega só o que vem **sem login**
   (subs/resubs/gift subs/bits/raids/membros/super chats).
4. **Sem som/TTS na Fase 1** — som e voz ficam pro overlay (Fase 3/4); o painel é silencioso (visual).

---

## 12. Fase 1 — escopo de implementação

**Backend (`chat.rs`)** — ao lado do parser de mensagens, emitir `alert://event` com um `Alert`:
- **Twitch (IRC):** tratar **`USERNOTICE`** (`msg-id` = `sub`/`resub`/`subgift`/`submysterygift`/`raid`)
  lendo as tags `msg-param-*`; e **bits** pela tag `bits` num `PRIVMSG`.
- **YouTube (liveChat):** `snippet.type` = `superChatEvent`/`newSponsorEvent`/`memberMilestoneChatEvent`/
  `membershipGiftingEvent` → alerta (já vem no poll que fazemos).
- **Kick (Pusher):** eventos `SubscriptionEvent`/`GiftedSubscriptionsEvent`/`StreamHostEvent`.

**Frontend** — store acumula `alerts[]` (cap), bind em `alert://event`; a tela de **Chat** ganha a
coluna **"Alertas"** (toggle) com um feed estilizado por tipo/plataforma. Mock simula alertas no demo.
