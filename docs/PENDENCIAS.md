# Pendências — o que falta para a Corneta ficar "pronta"

> Estado real do projeto e o caminho até um v1 publicável. Atualizado em 2026-06-22.
> Veja também [`PLANEJAMENTO.md`](./PLANEJAMENTO.md) (visão/arquitetura), [`ATUALIZACAO-AUTOMATICA.md`](./ATUALIZACAO-AUTOMATICA.md) e [`ASSINATURA.md`](./ASSINATURA.md).

**Legenda:** ✅ feito · 🟡 parcial · ⛔ não feito · 🔬 não validado
**Quem:** 🤖 dá pra eu fazer · 🧑 precisa de você (chave real, OBS, compra de cert, conta cloud)

---

## Onde estamos

✅ App Tauri 2 + React **compila, abre e fecha limpo** (sem processo órfão, verificado).
✅ UI completa com personalidade: Plataformas, Qualidade, Ao vivo, Sobre + **barra de título custom**.
✅ Config em disco · **chaves no cofre do Windows** (keyring).
✅ Motor: **MediaMTX** (ingestão do OBS) + **um FFmpeg por destino** (métricas reais + **reconexão independente** por plataforma), com *tree-kill*.
✅ **Configurações** (endpoint de ingestão editável), **bandeja** (minimizar ao fechar) + **autostart**, **teste de upload** (multi-conexão) e **erro por plataforma** no painel.
✅ **Pipeline ingest→relay validado de ponta a ponta** (sem OBS): publisher → MediaMTX → reader leu **vídeo+áudio H.264/AAC reais**.
✅ **Transmissão real confirmada:** OBS → Corneta → **Twitch** no ar! 🎉 (2026-06-23)

---

## P0 — Bloqueadores do "funciona de verdade"

| # | Item | Status | Quem | Critério de pronto |
|---|---|---|---|---|
| 1 | **Teste ao vivo end-to-end** (OBS → Corneta → plataforma) | ✅ | 🧑 | **Twitch confirmado** (2026-06-23)! Falta validar **multi-plataforma simultâneo** |
| 2 | **Caminho de ingestão** (OBS→MediaMTX→fan-out) | ✅ | 🤖 | Validado de ponta a ponta com vídeo+áudio reais |
| 3 | **Reconexão / resiliência** | ✅ | 🤖 | MediaMTX como ingestão + **respawn do FFmpeg**: OBS pode cair e voltar |
| 4 | **Saída RTMPS** (Facebook/Kick) confirmada | 🔬 | 🧑 | Twitch (RTMP) ✅; falta confirmar uma plataforma **RTMPS** |

> O item 1 destrava tudo. Os 2–4 dependem do que ele revelar.

---

## P1 — Para virar "produto" distribuível

| # | Item | Status | Quem | Critério de pronto |
|---|---|---|---|---|
| 5 | **Gerar instalador** (`pnpm tauri build` → NSIS) | 🟡 | 🤖+🧑 | **Gerado:** `Corneta_0.1.0_x64-setup.exe` (não assinado). Falta você validar instalar+abrir |
| 6 | **Auto-update via GitHub** | ⛔ | 🤖+🧑 | Conforme [`ATUALIZACAO-AUTOMATICA.md`](./ATUALIZACAO-AUTOMATICA.md); update de v→v validado |
| 7 | **Assinatura de código (Windows)** | ⛔ | 🧑 | Conforme [`ASSINATURA.md`](./ASSINATURA.md); instala sem alerta (ou OV com reputação) |
| 8 | **Licença** (MIT/Apache-2.0) + `LICENSE` no repo | ⛔ | 🧑 | Arquivo de licença escolhido e commitado |
| 9 | **Metadados do app** | ✅ | 🤖 | publisher/copyright/category/homepage/descrições no `tauri.conf` |
| 10 | **Log em arquivo** (`tauri-plugin-log`) | ✅ | 🤖 | Grava no app log dir + stdout; logs do motor (start/stop/respawn/erros) |

---

## P1/P2 — Funcionalidades pendentes / stubs

| # | Item | Status | Quem | Observação |
|---|---|---|---|---|
| 11 | **Auto-config do OBS** (obs-websocket) | ✅ | 🤖 | Cliente v5 em Rust → `SetStreamServiceSettings` (servidor+chave); senha opcional nas Configurações |
| 12 | **Teste de upload** real | ✅ | 🤖 | Multi-conexão (6× paralelas), ~3 s de regime estável **descartando o warm-up** — preciso em gigabit |
| 13 | **Métricas por plataforma** | ✅ | 🤖 | **1 FFmpeg por destino** → bitrate/fps/quedas **reais por plataforma** + reconexão independente (trade-off: N decodes no modo transcode) |
| 14 | **Tela de Configurações** | ✅ | 🤖 | Edita endpoint de ingestão (host/porta/app/chave) + toggles de bandeja e autostart |
| 15 | **Bandeja do sistema + autostart** | ✅ | 🤖 | Tray (clique abre, menu Abrir/Sair), fechar→bandeja (transmissão segue), autostart via `tauri-plugin-autostart` |

---

## P2 — Robustez & qualidade

- ✅ **Validação de entrada**: URL custom (rtmp/rtmps/srt), chave faltando e nome — inline em Plataformas + **bloqueia o Iniciar** com a lista de problemas.
- ✅ **Áudio**: sempre **AAC 48 kHz estéreo** em todos os destinos (vídeo copy ou transcode; `-map 0:a?` se não houver áudio).
- ✅ **Tratamento de erro do FFmpeg**: mensagens amigáveis por destino (chave recusada/403, sem conexão, queda) com estado `error`/`reconnecting`.
- ✅ **Múltiplos destinos da mesma plataforma**: auto-sufixo de nome (Twitch 2…) + **nome editável** em todos os destinos.
- 🟡 **TikTok/Instagram/X**: URLs de ingestão são placeholders (`rtmp://`) marcadas como experimentais — precisam de fluxo manual claro.
- ⛔ **Testes** (Vitest no front; testes do builder de comando FFmpeg no Rust).

---

## P2/P3 — UX & escopo planejado (v1.x)

- ✅ **Perfis** ("Live de sexta", "Podcast"): conjuntos de destinos + modo, troca/cria/renomeia/exclui na tela Plataformas (chaves compartilhadas por id entre perfis).
- ⛔ **i18n** (PT-BR + EN) e **tema claro**.
- ✅ **Onboarding guiado** (carrossel de 5 passos com progresso), **estados vazios** (Qualidade/Ao vivo), **estados de erro** (banner do motor + sidebar) e **didática** (tooltips de bitrate/encoder, dica keyframe 2s/CBR).
- ✅ **Menos fricção:** um clique liga o OBS junto (`StartStream`), "pegar minha chave" por plataforma, testar conexão por destino, **atalho global** começar/parar, **notificações nativas** (no ar / destino caiu), colar+mostrar a chave, **arrastar pra reordenar** destinos, lembrar janela/última tela, abrir logs.
- ✅ **Pausar/retomar por plataforma ao vivo** — botão por destino no Ao vivo mata/reativa só aquele FFmpeg, sem derrubar os outros (estado `paused`).
- ✅ **Auto-bitrate** — destino em transcode que engasga (velocidade do FFmpeg < 0.9 sustentada) tem o bitrate baixado (e respawn) e sobe de volta quando estabiliza, em vez de derrubar. Toggle nas Configurações (default on; só transcode).
- ✅ **Viewers unificados** — soma a audiência ao vivo de todas as plataformas (Twitch via GQL público, YouTube via Data API, Kick via API) reusando as fontes do chat, **sem login**; aparece na sidebar e no Chat. Poll a cada ~30 s.
- ✅ **Proteção contra quedas (tela "JÁ VOLTO")** — se o sinal do OBS cai **no meio da live** (só após o 1º sinal), a Corneta empurra um **slate** (PNG da marca, em loop) pras plataformas e **mantém a transmissão de pé** até voltar, em vez de derrubar (estado `brb`). Toggle nas Configurações.
- ✅ **QoL (lote 2):** confirmar Sair no ar · desfazer remoção / confirmar exclusão de perfil · **cronômetro** ao vivo · **marcar momento** (→ relatório) · **abrir canal** por destino · **duplicar destino** · **importar/exportar config** · **check-up pré-live** (com checagem do OBS) · **tema claro** · tamanho de fonte do chat · auto-reconnect do obs-websocket.
- ✅ Editor de **enquadramento vertical** — saídas portrait (TikTok/Shorts/IG) recortam um **9:16** do sinal landscape (sem distorcer) via `crop`+`scale` no FFmpeg; UI com palco 16:9, recorte arrastável + zoom e **preview com frame real do OBS** (`capture_frame`).

---

## Futuro — v2

- ✅ **MediaMTX** como ingestão (feito — reconexão via respawn). Próximos ganhos: **SRT** de entrada e **API de métricas por destino**.
- **Cloud relay "traga seu VPS"** (não estourar o upload doméstico — §7 do plano).
- **macOS / Linux** (keyring `apple-native`/`sync-secret-service`, assinatura/notarização Apple).
- ✅ **Chat unificado** — **múltiplas fontes** (ex.: 2 Twitches), **emotes + badges**, **deleções de moderação**, **Kick**, e **janela flutuante** always-on-top. Configurável; Twitch sem login, Kick via slug, YouTube via API key — [`CHAT.md`](./CHAT.md). FB/TikTok pendentes.
- **Gravação local simultânea** e **métricas unificadas** por plataforma.
- ✅ **Relatório pós-live** (Fases 1–4: grava a sessão em NDJSON com métricas/CPU/GPU/**OBS** + tela com gráficos, janelas problemáticas e veredito de causa) — [`RELATORIO-POS-LIVE.md`](./RELATORIO-POS-LIVE.md). Pendente: export formatado (Fase 5).
- ✅ **Relatório turbinado** — grava também **viewers, taxa de chat e alertas** na sessão e cruza tudo: painel de engajamento (pico/média de viewers, inscrições, bits, raids, mensagens), **curva de retenção** (com marca de raids), **atividade do chat** (msgs/min), **resumo de alertas** e **momentos de destaque/clipes sugeridos** (pico de chat + alerta forte + salto de audiência, com timestamp relativo pro VOD).
- 🟡 **Alertas centralizados** — [`ALERTAS.md`](./ALERTAS.md). **Fase 1 ✅:** subs/resubs/gift subs/bits/raids (Twitch), membros/super chats (YouTube), subs/gifts/host (Kick) — **sem login**, reusando as conexões de chat → `alert://event` + **coluna "Alertas"** na tela de Chat. Pendente: follows/donates via OAuth (Fase 2) + **overlay pro OBS** (Fase 3).
- 📄 **Enviar mensagens pelo multi-chat** (+ moderar) — exige login por plataforma; planejado em [`ENVIO.md`](./ENVIO.md).
- 💡 **Backlog de ideias** (clipes/backtrack, "JÁ VOLTO", aviso no Discord, reframe vertical, viewers somados…) — pesquisa + reflexão em [`IDEIAS.md`](./IDEIAS.md).
- 💡 **Backlog v2 — era da IA** (legendas ao vivo + tradução, auto-moderação cross-platform, relatório com retenção, controle pelo celular) — [`IDEIAS-v2.md`](./IDEIAS-v2.md).

---

## Definition of Done — v1 (MVP publicável)

Para chamar de "pronto pra soltar pro mundo", o mínimo é:

- [ ] **P0** (1–4): 1–3 ✅ (transmite e reconecta) — falta só confirmar uma plataforma **RTMPS** (4).
- [ ] **5, 8**: instalador gerado + licença escolhida (9 metadados ✅).
- [ ] **7**: assinado (ou beta com aviso documentado).
- [ ] **6**: auto-update funcionando (pra conseguir corrigir bugs pós-lançamento).
- [x] **10**: log em arquivo ✅.
- [x] **11**: auto-config do OBS ✅.

Tudo o mais (12–) pode vir em updates — *graças ao item 6*. 😉

---

## Próximo passo recomendado

1. **Você:** rodar o **teste ao vivo** (item 1) — abrir a Corneta, colar uma chave real, BORA AO VIVO + OBS.
2. **Eu, em paralelo:** gerar o **instalador** (item 5), adiantar **reconnect** (3) e **log** (10),
   ligar o stub do **OBS auto-config** (11) e **melhorar a precisão do teste de upload** (12, multi-conexão).
3. Conforme o teste, corrigir os flags do FFmpeg (2) e seguir a lista.
