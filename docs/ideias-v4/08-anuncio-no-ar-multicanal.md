# Anúncio "estou ao vivo" multi-canal — sugestão de implementação

> No **instante exato** em que você entra no ar, avisar a galera em **vários canais** ao mesmo tempo
> (Discord, Telegram, X) com **título + thumb + links das plataformas** — em vez de pingar cada
> servidor/grupo na mão toda live, ou depender de um bot de nuvem que **fica perguntando** "já
> começou?" a cada minuto. Só a Corneta acerta o tempo certo porque é **ela** que liga o relay
> (OBS → MediaMTX → 1 FFmpeg por destino): ela **sabe o momento do "no ar"**, **local, sem polling**.
> Streamcord/StreamElements são **por-plataforma e de nuvem**; aqui é um gatilho local, na fonte.

- **Status:** Sugestão de implementação · 2026-06-29
- **Relacionado:** [`../IDEIAS-v4.md`](../IDEIAS-v4.md) §4 (conveniência, não headliner) · [`./01-titulo-categoria-unificados.md`](./01-titulo-categoria-unificados.md) (reusa o mesmo título/links) · [`../ALERTAS.md`](../ALERTAS.md) (mesma infra de aviso/token) · [`./README.md`](./README.md)

---

## 0. Objetivo

Disparar **uma** mensagem "estou ao vivo" para uma lista de **destinos de anúncio** (webhooks) no
**exato instante** em que a Corneta entra no ar, montando o conteúdo do que já temos em casa:
**título** (`Settings.stream_title`), **links** das plataformas ativas (`liveUrl` de cada destino) e
uma **thumb real** do que está no ar (`capture_frame`). Tudo **local** e **best-effort**: um webhook
que falha **não derruba a live**.

> **Marcar como conveniência, não headliner.** Não é um Streamcord: **sem** dashboard, **sem**
> agendamento, **sem** gestão de servidores. Só o **gatilho no instante certo** + um POST. O valor é
> acertar o tempo (a Corneta sabe) e tirar o trabalho manual de avisar N canais.

---

## 1. Arquitetura

```
  start_engine (commands.rs)  ──>  poller do sinal já existente
        EngineSnapshot: starting ─────────────┐
                                              │ has_signal: false→true
                                              │ (1ª vez na sessão = signal_seen)
                                              ▼
                              ┌─ dispara UMA vez (anti-duplicação) ─┐
                              │  monta a mensagem:                   │
                              │   • título  ← Settings.stream_title  │
                              │   • links   ← liveUrl (platforms.ts) │
                              │             dos destinos ATIVOS      │
                              │   • thumb   ← capture_frame(app)     │
                              └───────────────────┬──────────────────┘
                                                  │  spawn_blocking, best-effort
                          ┌───────────────────────┼───────────────────────┐
                          ▼                       ▼                        ▼
                  Discord webhook          Telegram bot API           (X — Fase 2)
                  ureq::post(url)          ureq::post(sendPhoto)       API OAuth
                  + embed/thumb            + caption/links
                          └───────────────────────┼───────────────────────┘
                                                  ▼
                                 notify(app, "Anúncio em N canais 📣")
```

A engine já tem o gancho: `has_signal` (`AtomicBool`) vira `true` quando o OBS começa a publicar, e
o poller já marca `signal_seen` na **primeira** vez. O anúncio pendura aí — sem novo polling.

---

## 2. Detalhes & decisões

- **Gatilho no instante exato.** No `start_engine` ([`commands.rs`](../../src-tauri/src/commands.rs)),
  o poller do sinal (passo "2b") já faz `seen_sig.store(true, …)` na **primeira vez** que o OBS
  publica. Esse é o ponto: na transição `has_signal` false→true **e** `signal_seen` ainda false,
  spawna o anúncio **uma vez**. Equivale ao `EngineSnapshot` virar `live`. Nada de polling externo,
  nada de bot — o evento nasce em casa.
- **Webhook em vez de OAuth (caminho fácil).** **Discord** (webhook URL) e **Telegram** (bot token +
  `chat_id`) são só um **POST** com `ureq` — o backend já usa `ureq::post(...)` em
  [`auth.rs`](../../src-tauri/src/auth.rs). Discord aceita `embeds` (título + thumb por `attachment://`
  no multipart) ou JSON simples; Telegram usa `sendPhoto`/`sendMessage`. **X** precisa de API OAuth
  (mais chato) → **Fase 2**.
- **Template editável.** Mensagem montada de um template em `Settings` com placeholders, ex.:
  `"🔴 {titulo} no ar! Assista: {links}"`. `{titulo}` ← `stream_title` (fallback "Ao vivo");
  `{links}` ← lista de `liveUrl` (de [`platforms.ts`](../../src/lib/platforms.ts), via catálogo) só
  dos destinos **ativos** (`config.targets` com `enabled`).
- **Thumb via `capture_frame`.** Reusa `grab_frame_named(app, "announce.jpg")` /
  [`capture_frame`](../../src-tauri/src/commands.rs) pra anexar uma prévia **real** do que está no ar
  (não um placeholder). Discord/Telegram aceitam imagem no multipart.
- **Config + segredos.** Lista de "destinos de anúncio" (`announce_sources`) no `Settings`
  ([`config.rs`](../../src-tauri/src/config.rs)): `{ id, kind: "discord"|"telegram", enabled }`. O
  **segredo** (webhook URL / bot token) **nunca** vai no config — fica no keyring sob `announce_<id>`,
  **mesmo padrão** do `alert_<id>` de [`alerts.rs`](../../src-tauri/src/alerts.rs) (via
  `keys::set_key`/`get_key` de [`keys.rs`](../../src-tauri/src/keys.rs)).
- **Anti-duplicação na reconexão.** Crítico: o `has_signal` **oscila** quando o OBS reconecta. Por
  isso o disparo é amarrado ao `signal_seen` (1ª vez na sessão), **não** a cada subida do sinal. Uma
  flag dedicada (`announced: AtomicBool`) na sessão fecha qualquer brecha: anuncia, marca, e ignora as
  próximas transições até o motor parar.

---

## 3. Casos de borda

- **Reconexão não re-anuncia.** OBS caiu e voltou → `has_signal` faz false→true de novo, mas
  `signal_seen`/`announced` já estão setados na sessão → **não dispara de novo**. (Mesma lógica que o
  slate "JÁ VOLTO" usa pra distinguir quedas de início.)
- **Falha de webhook não derruba a live.** Cada POST é **best-effort** em `spawn_blocking`: erro de
  `ureq` (4xx/5xx/timeout) só vira log + `notify` ("Discord não respondeu"), **nunca** aborta o
  `start_engine`. Mesma postura best-effort do `youtube_provision_broadcast`.
- **Canal offline / token errado.** Webhook revogado (Discord 404) ou bot token inválido (Telegram
  401) → marca aquele destino como falho no `notify`, segue os outros. Sem retry agressivo no MVP.
- **Thumb indisponível.** `grab_frame_named` retorna `Err` se o sinal ainda está instável → manda o
  anúncio **só com texto + links** (a thumb é um plus, não um bloqueador).
- **Nenhum destino configurado.** Lista vazia ou tudo `enabled: false` → não faz nada (silencioso).

---

## 4. Grátis vs pago

- **Grátis (local):** é a natureza da feature. O gatilho roda na máquina (a engine já sabe o
  instante), e **webhooks de Discord/Telegram são gratuitos** — só um POST com `ureq`. Sem servidor,
  sem bot de nuvem, sem custo recorrente.
- **Pago (nuvem):** nada aqui. (X via API tem limites próprios na conta do usuário, mas isso é Fase 2
  e continua sem custo **nosso**.)

---

## 5. Próximo passo

MVP curto: **(1)** lista de `announce_sources` no `Settings` + segredo no keyring (`announce_<id>`);
**(2)** no `start_engine`, na 1ª vez que `has_signal` vira `true` (`signal_seen`), montar a mensagem
(título + `liveUrl` dos ativos + thumb do `capture_frame`) e **postar nos webhooks Discord/Telegram**
com `ureq`; **(3)** `notify` agregando o resultado por canal. Best-effort, dispara **uma vez**.

---

## 6. TODO (implementação)

**MVP**
- [ ] `Settings.announce_sources: Vec<{ id, kind, enabled }>` (`#[serde(default)]`) em [`config.rs`](../../src-tauri/src/config.rs); segredo no keyring sob `announce_<id>` (padrão `alert_<id>` de [`alerts.rs`](../../src-tauri/src/alerts.rs))
- [ ] Gatilho no [`commands.rs`](../../src-tauri/src/commands.rs): na transição `has_signal` false→true com `signal_seen` ainda false, spawna o anúncio **uma vez** (flag `announced: AtomicBool`)
- [ ] Montar mensagem: `stream_title` (fallback "Ao vivo") + `liveUrl` ([`platforms.ts`](../../src/lib/platforms.ts)) dos destinos ativos + thumb via `grab_frame_named(app, "announce.jpg")`
- [ ] POST Discord (webhook URL, embed/multipart) e Telegram (`sendPhoto`/`sendMessage`) com `ureq::post` (mesmo uso de [`auth.rs`](../../src-tauri/src/auth.rs)), best-effort em `spawn_blocking`
- [ ] Template editável em `Settings` (`{titulo}`/`{links}`) + `notify(app, …)` agregando o resultado por canal
- [ ] Anti-duplicação: reconexão do OBS **não** re-anuncia (amarrado a `signal_seen`/`announced`, não a cada subida)
- [ ] UI mínima (aba Alertas/Conta): adicionar destino, colar webhook/token, testar 1 envio

**Fase 2**
- [ ] **X (Twitter)** via API OAuth — disparo de post no "no ar" (mais chato; conta do usuário)
- [ ] Retry único com backoff em webhook 5xx/timeout
- [ ] Override de template por canal (Discord verboso, Telegram enxuto)
- [ ] Botão "anunciar de novo" manual (caso o usuário queira reforçar no meio da live)
