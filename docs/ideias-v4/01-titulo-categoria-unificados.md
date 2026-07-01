# Título & categoria unificados — sugestão de implementação

> Setar **título e categoria UMA vez** na Corneta e empurrar pra **Twitch, YouTube e Kick** de uma
> tacada — em vez de abrir três sites e digitar a mesma coisa toda live. Só a Corneta faz porque já
> está **no caminho do sinal** (OBS → MediaMTX → 1 FFmpeg por destino) **e** já **fala com as APIs**
> de todas as plataformas (OAuth em [`../../src-tauri/src/auth.rs`](../../src-tauri/src/auth.rs)).
> Plugin de saída RTMP não faz isso; bot de nuvem não está no fluxo do "BORA".

- **Status:** Sugestão de implementação · 2026-06-29
- **Relacionado:** [`../IDEIAS-v4.md`](../IDEIAS-v4.md) §4 · [`../YOUTUBE-AUTO.md`](../YOUTUBE-AUTO.md) (já cria o broadcast + seta título) · [`./08-anuncio-no-ar-multicanal.md`](./08-anuncio-no-ar-multicanal.md) (reusa o mesmo título/links) · [`./README.md`](./README.md)

---

## 0. Objetivo

Um campo de **título** + um de **categoria** na Corneta → aplicados em **todas as plataformas logadas**,
com **override por plataforma** opcional (YT quer SEO, TikTok quer gancho), mas o **default é um só**.
Casa com os **perfis** que já existem: "Live de sexta" carrega destinos hoje → passa a carregar
título/categoria também. Tudo **local** e **best-effort**: falhar numa plataforma **não derruba a live**.

> **Estado atual (importante):** o miolo do backend **já existe**. O comando `set_stream_info`
> ([`auth.rs`](../../src-tauri/src/auth.rs)) já faz Twitch + YouTube + Kick, exposto como
> `api.setStreamInfo` e usado pelo card "Título da live" em
> [`../../src/screens/GoLiveScreen.tsx`](../../src/screens/GoLiveScreen.tsx). O que falta pra virar o
> **headliner**: **persistir a categoria**, **override por plataforma**, **guardar no perfil** e
> **disparar sozinho no BORA** (hoje é um botão manual, sequencial).

---

## 1. Arquitetura

```
  ┌─ UI (GoLiveScreen): título + categoria (1x)  ─────────────┐
  │  + overrides opcionais por plataforma (accordion)         │
  └───────────────────────────────┬───────────────────────────┘
                                   │  no BORA, ANTES do relay
                                   ▼
                         set_stream_info(app, title, category, overrides)
                                   │  spawn_blocking, em PARALELO
                 ┌─────────────────┼─────────────────┐
                 ▼                 ▼                 ▼
        twitch_set_info     youtube_set_title     kick_set_info     (best-effort)
        PATCH /channels     videos.update         PATCH /channels
        + game_id           snippet.title         + category_id
                 └─────────────────┼─────────────────┘
                                   ▼
                 result_json por plataforma → {ok | ok+warn | error}
                                   ▼
                   notify/toast "Título em N plataformas 📣"  →  segue pro relay
```

A UI define **uma vez**; o backend resolve IDs (game/category) e chama cada API **em paralelo**,
agregando o resultado por plataforma sem nunca abortar o "BORA".

---

## 2. Detalhes & decisões

- **Default único + override por plataforma.** Um `title`/`category` global; um mapa opcional
  `overrides: { youtube?: {title, description}, ... }`. Vazio = usa o default. UI: um accordion
  "Personalizar por plataforma" fechado por padrão (não polui o caso comum).
- **Onde guardar.** Hoje só `Settings.stream_title` ([`config.rs`](../../src-tauri/src/config.rs))
  persiste. Adicionar `stream_category: String` no `Settings` e, pra carregar com o perfil, estender
  `Profile { id, name, mode, targets }` com `title`/`category`/`overrides` (`#[serde(default)]` pra
  não quebrar configs salvas). Trocar de perfil já troca destinos → passa a trocar metadados junto.
- **Quando disparar.** No **BORA**, **antes** de subir o relay (em `start_engine`,
  [`commands.rs`](../../src-tauri/src/commands.rs)), no mesmo ponto onde o `youtube_auto_live` já cria
  o broadcast via `youtube_provision_broadcast`. Manter o botão manual "Título da live" pra ajustar
  no meio da live. Toggle novo em `Settings` (ex.: `push_metadata_on_live: bool`, default `true`).
- **Resolução de IDs.** Cada API quer um ID, não o nome:
  - **Twitch:** `twitch_game_id` → `GET /helix/search/categories?query=<nome>` devolve o `game_id`;
    `PATCH /helix/channels?broadcaster_id=<id>` com `title` + `game_id`. `broadcaster_id` sai do
    `twitch_validate` (`/oauth2/validate`). Escopo `channel:manage:broadcast` **já é pedido**.
  - **YouTube:** `videos.update` (`part=snippet`) no vídeo da live ativa (`youtube_active_video_id`).
    Re-envia o **snippet inteiro** (omitir apaga description/tags); `categoryId` é obrigatório —
    preserva o atual ou cai pra `"24"`. Título cortado em 100. Categoria do YT ≠ "jogo": é taxonomia
    fixa (Gaming/Entertainment/…), não o nome do game.
  - **Kick:** `PATCH /public/v1/channels` com `stream_title` + `category_id` (de
    `/public/v2/categories?name=`). **Best-effort** (API oficial limitada/instável).
- **Mapa de categorias entre plataformas.** Não há padrão único (Twitch "game" × YouTube categoryId
  fixo × Kick category). MVP: manda o **nome** pra Twitch/Kick (cada uma resolve seu ID por busca) e
  deixa o YouTube no categoryId preservado. Um mapa "nome canônico → id por plataforma" curado é
  **Fase 2** (e só pros casos comuns).
- **Best-effort honesto.** `result_json` já distingue `Ok(None)` (limpo), `Ok(Some(warn))` (ex.:
  "categoria não encontrada", "título cortado") e `Err`. Sem "check verde mentiroso".

---

## 3. Casos de borda

- **Plataforma sem login.** Pula (o `set_stream_info` só chama onde há `keys::has_key` do token). Se
  nenhuma logada → erro claro "entre em alguma plataforma (aba Conta)".
- **Categoria não encontrada.** Não falha: aplica o título e devolve `warn` ("categoria X não
  encontrada") — a live sobe com a categoria antiga.
- **Rate-limit / 5xx.** Best-effort: registra `Err`, avisa e **segue pro relay**. Sem retry agressivo
  (no MVP); um retry único com backoff é Fase 2.
- **Token expirado.** `twitch_token`/`youtube_token` já refazem o refresh sozinhos; só vira `Err`
  ("re-entre na plataforma") se o refresh também falhar.
- **TikTok / X / Instagram.** **Sem API confiável de metadados na ingestão** → fora de escopo, fica
  manual. A UI deixa explícito ("essas você ajusta no app delas").
- **YouTube sem live ativa.** `youtube_active_video_id` volta vazio → `warn`. No fluxo do BORA com
  `youtube_auto_live`, o título já entra na criação do broadcast (`youtube_provision_broadcast`), então
  o `set_title` vira reforço/no-op.

---

## 4. Grátis vs pago

- **Grátis (local):** é a natureza da feature. Chamadas diretas às APIs oficiais a partir da máquina
  do streamer, com o OAuth que já temos. Sem servidor, sem custo recorrente.
- **Pago (nuvem):** nada aqui. (Um otimizador de SEO com IA — sugerir título/tags — seria um extra de
  Fase 2 e aí sim poderia ter custo; **não** é o escopo deste doc.)

---

## 5. Próximo passo

MVP curto, quase tudo aproveitando o que já existe: **(1)** adicionar `stream_category` no `Settings`
e persistir junto do título; **(2)** chamar `set_stream_info` **automaticamente no BORA**, antes do
relay, em paralelo, best-effort; **(3)** mostrar o resultado por plataforma no toast/notify.

---

## 6. TODO (implementação)

**MVP**
- [ ] `Settings.stream_category: String` (`#[serde(default)]`) em [`config.rs`](../../src-tauri/src/config.rs); persistir junto do título
- [ ] Disparar `set_stream_info` no BORA (`start_engine`, [`commands.rs`](../../src-tauri/src/commands.rs)) **antes** do relay, atrás de toggle `push_metadata_on_live` (default `true`)
- [ ] Paralelizar as três chamadas dentro de `set_stream_info` ([`auth.rs`](../../src-tauri/src/auth.rs)) — hoje são sequenciais
- [ ] Garantir best-effort: nenhuma falha de metadado aborta o `start_engine` (mesmo padrão do `youtube_provision_broadcast`)
- [ ] Agregar resultado por plataforma num `notify`/toast ("Título em N plataformas 📣", erros visíveis)
- [ ] UI em [`GoLiveScreen.tsx`](../../src/screens/GoLiveScreen.tsx): campo de **categoria** ao lado do título; manter o botão manual

**Fase 2**
- [ ] Override por plataforma (`overrides` em `Settings`/`Profile`) com accordion na UI
- [ ] Carregar título/categoria do `Profile` (estender struct + migração no frontend)
- [ ] Facebook via Graph API (se logado) — opcional, best-effort
- [ ] Mapa curado "categoria canônica → id por plataforma" (Twitch/Kick/YouTube)
- [ ] Retry único com backoff em rate-limit/5xx
- [ ] (Opcional) sugestão de título/tags por IA — vira o "otimizador de SEO", fora do MVP
