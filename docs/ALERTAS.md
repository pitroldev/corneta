# Alertas centralizados (todas as plataformas)

> Planejamento da feature que junta os **alertas** (seguidor, inscrição, gift, bits/donate, raid,
> membro, super chat…) de **todas as plataformas** num lugar só — painel no app e **overlay pro OBS**.

- **Status:** Rascunho para discussão (v0.1) · 2026-06-23
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
| **1 — Alertas via chat** | Parse de USERNOTICE/bits (Twitch), event types (YouTube), eventos Pusher (Kick) → `alert://event` + **painel** no app | nada (reusa o chat) |
| **2 — Follows & donates** | Twitch **EventSub** (follow/cheer/sub) por WebSocket + OAuth; Streamlabs/StreamElements (tips) | 🧑 OAuth/app |
| **3 — Overlay pro OBS** | Servidor local + overlay animado (texto + **som**), adicionável como browser source | mini-servidor http |
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

## 11. Decisões em aberto

1. **Painel separado** ("Alertas") ou **junto do Chat** (uma aba/coluna)?
2. **Overlay** já na primeira leva (servidor local) ou depois (começar só com painel)?
3. **Follows na v1** (vale o OAuth) ou só o que vem sem login?
4. **Som/voz (TTS)** no overlay desde cedo?
