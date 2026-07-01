# Sala de espera / Starting soon — sugestão de implementação

> Hoje, quando você dá o BORA mas ainda está mexendo no OBS, o público que chegou cedo cai numa
> **tela de setup** (ou "Aguardando OBS") — e os **primeiros 30 s decidem a retenção** (a pesquisa do
> v4: mais de 1/3 sai em 30 s). Só a Corneta faz isso bem porque ela **já é dona do slate** (o mesmo
> do "JÁ VOLTO") e **do momento do "no ar"**: ela sobe o relay antes do OBS publicar, então é ela quem
> decide o que vai no ar nesse vão. É o mecanismo da proteção contra quedas, só que **no começo**.

- **Status:** Sugestão de implementação · 2026-06-29
- **Relacionado:** [`../IDEIAS-v4.md`](../IDEIAS-v4.md) §5, [`./10-rerun-premiere.md`](./10-rerun-premiere.md), proteção contra quedas / `run_slate` (slate "JÁ VOLTO")

---

## 0. Objetivo

Subir um **slate de contagem regressiva** ("ao vivo às 20h", "já começamos") nos destinos **antes** de
você publicar no OBS, com o **chat já rolando**, e trocar pro sinal real assim que o OBS começar a
publicar. Deixar a live **de pé** e a galera chegando, em vez de despejar todo mundo numa tela de
configuração. Tudo **local**, reusando o slate do BRB → **grátis**.

---

## 1. Arquitetura

```
BORA (modo "sala de espera" ON)
  │
  ├─> relay sobe (MediaMTX) ............ has_signal = false (OBS ainda não publicou)
  │
  ├─> por destino: run_slate(slate starting-soon) ── empurra o slate MESMO SEM PUBLISHER
  │        (ffmpeg_args_for_slate: imagem em loop → RTMP, com contador)
  │
  ▼
OBS começa a publicar ──> has_signal = true ──> troca slate → sinal real
                                                (mesma transição da volta de queda)
```

Diferença pro fluxo de hoje: hoje, sem publisher, o relay fica parado em "Aguardando OBS". Aqui, sem
publisher, ele já **empurra o slate de starting-soon** — exatamente o caminho que o `run_slate` já faz
numa queda, só que disparado no **início** da sessão (antes do primeiro sinal) em vez de só após o
`signal_seen`.

---

## 2. Detalhes & decisões

- **Reuso direto da maquinaria de slate.** Nada novo no transporte: `run_slate(app, target_id,
  slate_args, run_flag, pause_flag, signal)` empurra o PNG pra UM destino; `ffmpeg_args_for_slate(target,
  key, slate_png)` monta os args (imagem em loop → RTMP). A única mudança de orquestração é **quando**
  disparar: no `start_engine`/`GoLiveScreen.tsx`, com o modo "sala de espera" ligado, subir o slate
  para cada destino logo após o relay subir, sem esperar publisher.
- **Troca slate → sinal.** Quando `has_signal` vira `true`, encerrar o slate e passar o sinal real —
  é a **mesma transição** que a proteção contra quedas já faz na volta. Reaproveitar esse caminho;
  não inventar outro.
- **Contagem regressiva — duas opções (escolher a mais barata no MVP):**
  - **PNG desenhado pela UI** (como `src/lib/brbSlate.ts` desenha o "JÁ VOLTO"): a UI rasteriza o
    quadro com horário/contador e salva via `save_brb_slate(app, base64png)`; o `load_slate_yuv(app)`
    rasteriza pro FFmpeg. Simples, mas o contador "anda" só se a UI redesenhar de tempos em tempos.
  - **`drawtext` do FFmpeg** sobre uma imagem base: o timer é desenhado pelo próprio FFmpeg (ex.:
    contar até um horário-alvo), sem a UI ter que reemitir PNG. Mais "vivo", custo um filtro a mais.
  - Recomendação: MVP com **PNG estático** ("ao vivo às 20h") reusando o BRB; o **contador animado**
    (`drawtext`) fica pra Fase 2.
- **Chat independente.** O chat já roda fora do vídeo (`chat_start`/`chat_sources`), então a galera
  pode estar **conversando** enquanto o slate de contagem está no ar — exatamente o que segura a
  atenção nesse vão.
- **Config:** horário-alvo, texto e imagem de fundo. Reaproveitar o toggle/campos do BRB
  (`settings.brb_enabled` e a imagem do slate) com um modo "início" à parte.

---

## 3. Casos de borda

- **OBS publica antes da hora marcada** → `has_signal` vira `true` e a Corneta **troca já** pro sinal
  real (não trava esperando o horário). O horário-alvo é só pro contador; quem manda na troca é o
  sinal.
- **OBS nunca publica** → o slate fica no ar (live de pé, sem dead air); fim da sessão encerra o
  `run_slate` normalmente. É o comportamento desejado, não um erro.
- **Já estava no ar** (sinal presente quando deu BORA) → não há sala de espera: vai direto pro sinal,
  o slate de início nem sobe.
- **Stream de música / sem chat** → ainda vale como cartela de "já começamos"; só não há a parte de
  "galera conversando". Manter como toggle, não obrigatório.

---

## 4. Grátis vs pago

- **Grátis (local):** tudo. Slate, contador (PNG da UI ou `drawtext`), troca pro sinal real — roda na
  máquina, reusando o que o BRB já faz. Sem nuvem, sem custo novo.

---

## 5. Próximo passo

MVP: **reusar o slate do BRB no início**. Com o modo "sala de espera" ligado, ao dar BORA, subir o
relay e empurrar o slate de starting-soon (PNG do `brbSlate.ts`, contagem simples / horário fixo) pra
cada destino via `run_slate`, sem esperar publisher; quando `has_signal` virar `true`, trocar pro
sinal real pelo mesmo caminho da volta de queda.

> **Fronteira honesta (§8):** isto é um **slate simples**, não um editor de tela inicial. **Não**
> recriar overlays/cenas de "starting soon" ricos (animação, mídia, layout) — isso é trabalho do OBS.
> Manter mínimo: cartela + contador.

---

## 6. TODO (implementação)

**MVP**
- [ ] Settings: modo "sala de espera" (on/off) + horário-alvo + texto + imagem de fundo (reusa campos do BRB)
- [ ] `GoLiveScreen.tsx`: ao dar BORA com o modo ligado, sinalizar pro `start_engine` subir o slate de início
- [ ] `start_engine`/orquestração: após o relay subir e **sem publisher**, disparar `run_slate` por destino com o slate de starting-soon
- [ ] PNG de início via `brbSlate.ts` → `save_brb_slate` → `load_slate_yuv` (cartela "ao vivo às 20h")
- [ ] Transição slate → sinal quando `has_signal` vira `true` (reusa o caminho da volta de queda)
- [ ] Borda: "já no ar" pula a sala de espera; fim de sessão encerra o `run_slate`

**Fase 2**
- [ ] Contador animado via `drawtext` do FFmpeg sobre imagem base (timer até o horário-alvo)
- [ ] Predefinições de cartela e integração com o chat ("a live começa em…")
