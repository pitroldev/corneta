# Ideias v4 — sugestões de implementação

> Esta pasta detalha, **uma feature por doc**, como implementar as ideias levantadas em
> [`../IDEIAS-v4.md`](../IDEIAS-v4.md). O v4 vira a moeda dos v1–v3: em vez de *"o que a Corneta pode
> **gerar**?"*, pergunta **"o que está SAINDO está certo?"** — mais a dor operacional do multistream:
> **gerir título/categoria/anúncio em N plataformas de uma vez**.
>
> Cada doc segue o mesmo formato dos `FEATURE-*.md` (objetivo → arquitetura → decisões → bordas →
> grátis/pago → TODO) e aponta para o código real onde a feature se encaixa.

- **Status:** Sugestões de implementação / backlog · 2026-06-29
- **Origem:** [`../IDEIAS-v4.md`](../IDEIAS-v4.md)

---

## Por tema

### 🩺 Tema A — Vigia técnico do sinal ("o que está saindo está certo?")
| Doc | Feature | Valor | Esforço | Só nós |
|---|---|---|---|---|
| [`02-detector-tela-preta-congelada.md`](./02-detector-tela-preta-congelada.md) | Detector de tela preta / congelada | 🟢🟢🟢 | 🟢 | ✅✅ |
| [`06-confidence-monitor-local.md`](./06-confidence-monitor-local.md) | Confidence monitor local (monitor de retorno) | 🟢🟢 | 🟡 | ✅✅ |
| [`07-verificacao-independente-plataforma.md`](./07-verificacao-independente-plataforma.md) | Verificação independente por plataforma | 🟢🟢 | 🔴 | ✅✅ |

### 🎵 Tema B — Guardião de áudio
| Doc | Feature | Valor | Esforço | Só nós |
|---|---|---|---|---|
| [`03-guardiao-audio-loudness-lufs.md`](./03-guardiao-audio-loudness-lufs.md) | Loudness / normalização (LUFS) | 🟢🟢 | 🟢 | ✅ |
| [`04-guardiao-audio-balance-mic-game.md`](./04-guardiao-audio-balance-mic-game.md) | Balance mic × game | 🟢🟢 | 🟡 | ✅ |
| [`05-guardiao-audio-dmca-musica.md`](./05-guardiao-audio-dmca-musica.md) | DMCA: música protegida ao vivo | 🟢🟢🟢 | 🔴 | ✅✅ |

### 🏷️ Tema C — Metadados cross-platform
| Doc | Feature | Valor | Esforço | Só nós |
|---|---|---|---|---|
| [`01-titulo-categoria-unificados.md`](./01-titulo-categoria-unificados.md) | **Título & categoria unificados** (headliner) | 🟢🟢🟢 | 🟡 | ✅✅ |
| [`08-anuncio-no-ar-multicanal.md`](./08-anuncio-no-ar-multicanal.md) | Anúncio "estou ao vivo" multi-canal | 🟢🟢 | 🟢 | ➖ ok |

### 🔁 Tema D — Consistência & algoritmo
| Doc | Feature | Valor | Esforço | Só nós |
|---|---|---|---|---|
| [`09-sala-de-espera-starting-soon.md`](./09-sala-de-espera-starting-soon.md) | Sala de espera / Starting soon | 🟢🟢 | 🟢 | ✅ |
| [`10-rerun-premiere.md`](./10-rerun-premiere.md) | Rerun / Premiere (VOD como "live") | 🟢 | 🟡 | ➖ ok |

---

## Ordem sugerida (o "cinto de segurança + painel")

As recomendações do v4 (§7) formam três primeiros passos de alto ROI:

1. **🏷️ Título & categoria unificados** — a dor operacional mais pura do multistream; encaixe único
   (OAuth + perfis já existem). Headliner.
2. **🩺 Detector de tela preta/congelada** — barato e altíssimo alívio; reusa `capture_frame`,
   notificações e o slate/BRB. Primeiro tijolo do confidence monitor.
3. **🎵 Guardião de áudio (LUFS + balance primeiro, DMCA depois)** — ataca a dor técnica mais
   reportada; o DMCA ao vivo é a aposta ambiciosa que completa o guardião (visual do v3 + auditivo
   do v4).

---

## Onde tudo se encaixa no código (resumo)

- **Caminho do sinal:** OBS → MediaMTX (ingestão) → 1 FFmpeg por destino (decode-once → encode-N),
  em [`../../src-tauri/src/engine.rs`](../../src-tauri/src/engine.rs) e
  [`../../src-tauri/src/commands.rs`](../../src-tauri/src/commands.rs) (`start_engine`).
- **Frame do output:** `grab_frame_named` / `capture_frame` (`commands.rs`).
- **Slate/BRB:** `run_slate` + `ffmpeg_args_for_slate` + `save_brb_slate` + `load_slate_yuv`.
- **Processamento em tempo real do vídeo:** o pump decode→buffer→encode com worker lateral em
  [`../../src-tauri/src/guardian/pipeline.rs`](../../src-tauri/src/guardian/pipeline.rs) é o **molde**
  pra qualquer análise ao vivo (áudio, freeze).
- **OAuth de todas as plataformas:** [`../../src-tauri/src/auth.rs`](../../src-tauri/src/auth.rs)
  (Twitch já pede o escopo `channel:manage:broadcast`; YouTube já cria broadcast).
- **Perfis + settings:** [`../../src-tauri/src/config.rs`](../../src-tauri/src/config.rs).
- **Notificação/alertas:** `notify(...)` + eventos Tauri (`app.emit`) consumidos por
  [`../../src/components/Toaster.tsx`](../../src/components/Toaster.tsx) e `AlertsFeed.tsx`.
