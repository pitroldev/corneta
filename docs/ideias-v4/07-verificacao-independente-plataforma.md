# Verificação independente por plataforma — sugestão de implementação

> O FFmpeg local só sabe que **enviou** os bytes — não que a Twitch/YouTube/Kick está **mostrando**.
> Ingest com soluço, transcode preso ou fila travada do lado da plataforma **não aparecem em nenhuma
> métrica de saída nossa**. A ideia aqui: a Corneta **puxa o stream público de volta** (ou consulta o
> status oficial de ingest) e confirma que vídeo realmente flui lá fora. Só a Corneta faz isso porque
> ela já **fala com todas as APIs** (OAuth Twitch/YouTube/Kick) e já **está no caminho** do sinal —
> tem os IDs, os tokens e o ffmpeg sidecar na mão.

- **Status:** Sugestão de implementação · 2026-06-29
- **Relacionado:** [`../IDEIAS-v4.md`](../IDEIAS-v4.md), [`./02-detector-tela-preta-congelada.md`](./02-detector-tela-preta-congelada.md), [`./06-confidence-monitor-local.md`](./06-confidence-monitor-local.md)

---

## 0. Objetivo

Confirmar, **do lado de fora**, que o vídeo está realmente no ar em cada destino — não só que
mandamos os bytes. Pega a classe de falha que nenhuma métrica local revela: **a plataforma recebeu mas
não está mostrando** (ingest engasgado, transcode preso, broadcast em `revoked`/`error`).

Dois caminhos, em ordem de preferência:
1. **API oficial de status do ingest** (melhor): Twitch `streams`, YouTube `liveStreams.healthStatus`.
   Barato, confiável, sem puxar vídeo.
2. **Puxar o stream público de volta** (fallback, experimental): com a URL pública de playback, o
   ffmpeg sidecar lê N segundos / 1 frame e prova que tem vídeo **não-preto** fluindo.

Casa com o [confidence monitor](./06-confidence-monitor-local.md) (que mostra **o nosso** feed comum)
e com o [detector de preto/congelado](./02-detector-tela-preta-congelada.md) (que olha **a entrada**).
Aqui é a borda oposta: o que **o público** está vendo.

---

## 1. Arquitetura

```
                    ┌─────────────── por destino (Twitch / YouTube / Kick) ───────────────┐
                    │                                                                      │
  destino ativo ──► │  1. resolve identidade (user_id / broadcast_id)   [auth.rs]          │
                    │              │                                                       │
                    │              ▼                                                       │
                    │  2a. API oficial de status ?  ──sim──► GET status (is_live /         │
                    │       (preferido)                       healthStatus)                │
                    │              │ não                              │                     │
                    │              ▼                                  │                     │
                    │  2b. resolve URL pública de playback (HLS)      │                     │
                    │              │                                  │                     │
                    │              ▼                                  │                     │
                    │  3. ffmpeg sidecar puxa 1 frame  ──────────────►│                     │
                    │     (estilo grab_frame_named) → JPEG            │                     │
                    │              │                                  │                     │
                    │              ▼                                  ▼                     │
                    │  4. flui lá?  (live + frame não-preto  /  healthStatus == good)       │
                    │              │                                                       │
                    └──────────────┼───────────────────────────────────────────────────────┘
                                   ▼
                         ok (🟢 silencioso)  |  aviso → notify(app, …) → Toaster.tsx
```

Cadência: uma checagem leve a cada ~30–60 s por destino (a API de status é barata). O fallback de
puxar vídeo roda **só quando** o status oficial falta ou está ambíguo, e com janela curta.

---

## 2. Detalhes & decisões

**Regra de ouro: API oficial de status > puxar vídeo.** Puxar HLS público é caro, frágil e
rate-limited; a API de status é uma chamada HTTP barata e confiável. Só caímos pro vídeo quando não há
status oficial utilizável.

- **Twitch.** Já temos token via `twitch_token(app)` em [`auth.rs`](../../src-tauri/src/auth.rs).
  Helix `GET /helix/streams?user_id=<id>`: se retorna um stream com `type == "live"`, estamos no ar.
  Simples, oficial, suficiente pro MVP. (HLS via usher/GQL existe mas é **não-oficial e frágil** —
  evitar.)
- **YouTube.** Já temos o `broadcast_id`/`video_id` de `youtube_provision_broadcast`. Duas opções
  oficiais: `liveBroadcasts.list` → `status.lifeCycleStatus` (`live`/`testing`/`complete`) e
  `liveStreams.list` → `status.healthStatus.status` (`good`/`ok`/`bad`/`noData`) — **o healthStatus é
  exatamente o sinal de ingest que queremos**. Com o `video_id` também dá pra montar a URL de watch /
  HLS pro fallback.
- **Kick.** Sem API oficial estável; HLS público / API não-oficial. **Só fallback de vídeo**, marcado
  experimental. Pode simplesmente ficar fora do MVP.
- **Provar que flui (fallback).** Com a URL pública, reusar o ffmpeg sidecar no estilo
  `grab_frame_named(app, name)` (já puxa 1 frame de uma URL e devolve JPEG) — só apontando pra URL
  **pública** em vez do MediaMTX. Confirma vídeo não-preto reusando o detector de
  [preto/congelado](./02-detector-tela-preta-congelada.md). Comparar luma com o frame que **enviamos**
  é tentador, mas o **delay** da plataforma (10–30 s) torna match exato impossível → só afirmamos
  "**tem vídeo fluindo lá**", não "é o mesmo frame".

**O que conta como "no ar lá":**
- Twitch: `streams` retorna `type=live`.
- YouTube: `lifeCycleStatus=live` **e** `healthStatus ∈ {good, ok}`.
- Fallback: HLS abre **e** frame não-preto dentro de ~N s.

Qualquer outra coisa (vazio, `bad`, `noData`, timeout) → **aviso**, não erro fatal: pode ser delay.

---

## 3. Casos de borda

- **Delay da plataforma (10–30 s).** A verificação é **defasada** por natureza. Nunca alarmar nos
  primeiros ~30 s após o "começar a transmitir", e exigir o problema **persistente** (2–3 checagens)
  antes do aviso, pra não gritar com o buffer normal.
- **Rate-limit.** APIs oficiais têm cota; puxar HLS repetido é pior. Cadência conservadora (30–60 s),
  backoff em 429, e **nunca** puxar vídeo em loop apertado.
- **Plataforma sem playback público / sem API de status.** Não dá pra verificar — assumir
  honestamente "não verificável" no UI em vez de fingir 🟢.
- **Stream privado / unlisted / com DRM.** Playback público pode não existir; cair pro status oficial
  ou marcar não-verificável. Respeitar a privacidade do stream do usuário.
- **Custo de puxar vídeo.** Banda + CPU do sidecar. Por isso é fallback, janela curta (1 frame / poucos
  segundos), e **opt-in**.
- **Falso negativo por rede local.** Se **nós** não conseguimos puxar o HLS por problema da nossa
  internet, não é culpa da plataforma — distinguir "não consegui checar" de "plataforma caiu".

---

## 4. Grátis vs pago

- **Grátis (local).** Toda a verificação roda na máquina do usuário: chamadas às APIs oficiais (com os
  logins que **já temos** em [`auth.rs`](../../src-tauri/src/auth.rs)) e o ffmpeg sidecar puxando frame.
  Sem servidor nosso no meio.
- **"Pago" = login, não dinheiro.** Twitch `/helix/streams` e a YouTube Data API pedem token OAuth —
  mas esses logins **já existem** no fluxo da Corneta (`twitch_token`, provisionamento do YouTube). Não
  há custo de nuvem nosso.

---

## 5. Próximo passo

**MVP = só status via API oficial onde existir, antes de puxar qualquer vídeo.** Twitch
(`GET /helix/streams?user_id=`) e YouTube (`liveBroadcasts`/`liveStreams.healthStatus`), reusando
`twitch_token` e o `broadcast_id` de `youtube_provision_broadcast`. Resultado vira um badge por
destino no confidence monitor + `notify` quando degrada. Puxar vídeo (Kick, fallback) fica pra Fase 2,
**opt-in e marcado experimental**.

---

## 6. TODO (implementação)

**MVP**
- [ ] Comando `verify_platform_status(app, destino)` em `commands.rs` (1 por destino ativo)
- [ ] Twitch: `GET /helix/streams?user_id=<id>` usando `twitch_token(app)` → `type==live`?
- [ ] YouTube: `liveBroadcasts.lifeCycleStatus` + `liveStreams.healthStatus` via `broadcast_id`
- [ ] Resolver `user_id` Twitch / `broadcast_id` YouTube a partir de [`auth.rs`](../../src-tauri/src/auth.rs)
- [ ] Loop de checagem (30–60 s), com janela de carência inicial (~30 s) e exigência de persistência
- [ ] Badge por destino no [confidence monitor](./06-confidence-monitor-local.md) + `notify(app, …)` no aviso → `Toaster.tsx`
- [ ] Settings em [`config.rs`](../../src-tauri/src/config.rs): on/off por plataforma, cadência, "verificação externa experimental"

**Fase 2**
- [ ] Fallback de vídeo: resolver URL pública de playback (HLS) por plataforma
- [ ] Reusar ffmpeg sidecar estilo `grab_frame_named` apontando pra URL pública → JPEG
- [ ] Confirmar frame não-preto reusando o [detector de preto/congelado](./02-detector-tela-preta-congelada.md)
- [ ] Kick via HLS/API não-oficial (opt-in, experimental, sem garantia)
- [ ] Backoff em 429 / rate-limit e tratamento de "não verificável" vs "plataforma caiu"
- [ ] (Opcional) comparação grosseira de luma com o frame enviado — só como "tem vídeo", ciente do delay
