# Detector de tela preta / congelada — sugestão de implementação

> A dor: ir ao ar **quebrado** — tela preta, fonte de captura congelada — e **só descobrir 40 min
> depois**, quando alguém avisa no chat (ou nunca). A prévia do OBS mostra tudo certo; o que **sai**
> está errado. Só a Corneta pega isso porque ela está no **caminho do output real** (MediaMTX →
> FFmpeg → destinos), não na *prévia* do OBS — ela vê os frames que de fato vão pro ar.

- **Status:** Sugestão de implementação · 2026-06-29
- **Relacionado:** [`../IDEIAS-v4.md`](../IDEIAS-v4.md) (§2 — vigia técnico), [`../FEATURE-DEAD-AIR.md`](../FEATURE-DEAD-AIR.md) (feature irmã), [`./06-confidence-monitor-local.md`](./06-confidence-monitor-local.md) (o monitor de retorno)

---

## 0. Objetivo

Detectar **corretude técnica do que sai** sobre os frames de saída e reagir:
- **luma média ~0** por X s → **tela preta** (cena errada, captura morta, janela fechada);
- **frames idênticos** por X s → **congelado** (fonte travou, driver de GPU soluçou).

E então:
- **avisar** (notificação nativa + Discord opcional) após um limiar **T1**, ou
- **acionar o slate/BRB** após um limiar maior **T2** (opcional, default desligado).

Tudo **local** (filtros nativos do FFmpeg) → **grátis**.

> **Distinto do [`dead-air`](../FEATURE-DEAD-AIR.md)** (que é *"o streamer sumiu"* = silêncio **+**
> freeze): aqui é a **imagem que sai**, mesmo com o streamer **presente e falando**. Você pode estar
> narrando empolgado por cima de uma tela preta — o dead-air nunca dispara, este detector sim.

---

## 1. Arquitetura

```
MediaMTX ──> FFmpeg [blackdetect + freezedetect] ──> parse stderr ──> máquina de estado ──> aviso / slate
   (sinal)         (mesmo processo do dead-air)        (eventos)        (T1 avisa / T2 slate)
```

1. **Preto.** `blackdetect=d=2:pic_th=0.98` no vídeo do MediaMTX → emite `black_start`/`black_end` no
   stderr (mesmo padrão de parse de stderr que o dead-air já faz com o `freezedetect`).
2. **Congelado.** `freezedetect=n=-60dB:d=2` → emite `freeze_start`/`freeze_end`. **Este filtro já é
   o do dead-air** — aqui só **estendemos** o processo existente adicionando o `blackdetect`, não
   abrimos um FFmpeg paralelo.
3. **Estado.** Máquina de estado por destino: `preto OU congelado` por `> T1` → **aviso**; persiste
   `> T2` → **slate**; qualquer frame válido/movimento → reseta.
4. **Ação.** Aviso = `notify(app, ...)` + evento Tauri (`app.emit`) pro [`Toaster.tsx`/`AlertsFeed.tsx`].
   Slate = `run_slate(...)` (o mesmo "JÁ VOLTO" da proteção contra quedas).

> Roda **um FFmpeg só** com os três filtros do guardião técnico+áudio:
> `-vf blackdetect=...,freezedetect=... -af silencedetect=...`. O `blackdetect` é o **único filtro
> novo** desta feature; `freezedetect`/`silencedetect` já vêm do dead-air.

---

## 2. Detalhes & decisões

- **Compartilhar o processo do dead-air.** A `FEATURE-DEAD-AIR.md` já abre um FFmpeg com
  `silencedetect`+`freezedetect` no feed do MediaMTX e faz parse do stderr → máquina de estado. Esta
  feature **acrescenta `blackdetect`** ao mesmo `-vf` e adiciona dois eventos (`black_start`/`black_end`)
  ao mesmo parser. **Um processo, um parser, duas máquinas de estado** (a do dead-air precisa de
  silêncio+freeze; a daqui dispara em preto OU freeze sozinhos).
- **Por que não o pump do guardião.** O molde de `../../src-tauri/src/guardian/pipeline.rs`
  (`spawn_blocking` + FFmpeg cru decodificando `yuv420p` em `COMP_W/COMP_H/COMP_FPS`, com diff que
  pula quadros estáticos) é ótimo **se** quisermos a luma nós mesmos. Mas o `blackdetect` já dá a
  decisão de "preto" de graça no stderr — então o caminho barato é **estender o FFmpeg de análise do
  dead-air**, não rodar mais um pump decodificando 1080p30.
- **Limiares.** `blackdetect d=2` (2 s de preto contínuo), `pic_th` generoso (≈0.98) pra não confundir
  cena escura com preto total; `freezedetect d=2`. T1 (aviso) curto (ex.: 8–10 s); T2 (slate) folgado
  (ex.: 45–60 s). Tudo configurável em `../../src-tauri/src/config.rs` (mesmo lugar de `brb_enabled`).
- **Só-avisar vs. auto-slate.** **Default = só avisa.** O slate automático é opcional e gateado por um
  toggle próprio (à parte do `brb_enabled`), porque acionar um BRB sobre um falso positivo é pior do
  que o problema. Quando ligado, reusa `run_slate(app, target_id, slate_args, ...)` por destino.
- **Reuso puro.** Nada novo de aviso (`notify` + eventos Tauri já existem) nem de slate (`run_slate`,
  `save_brb_slate`, `load_slate_yuv` já existem). O custo de implementação é o parser do `blackdetect`
  + a máquina de estado + as settings.
- **Amostragem leve (alternativa).** Se não quiser nem o FFmpeg de análise ligado, dá pra amostrar
  `grab_frame_named(app, name)` a cada N s e medir luma média / diferença entre dois JPEGs — mais
  barato, porém mais grosseiro (sem janela contínua, pega o freeze tarde). Bom como fallback quando o
  dead-air estiver desligado.

---

## 3. Casos de borda (honestidade sobre falsos positivos)

Preto/congelado **pode ser intencional** — este é o calcanhar de Aquiles da feature:

- **Cena estática proposital** ("volto já", tela de pausa, cartão de patrocínio parado) → o
  `freezedetect` **vai** disparar. Mitigação: **limiar T1 generoso** + um **"modo pausa"** (toggle
  manual que suspende o detector) + whitelist de momentos.
- **BRB já no ar.** Se o próprio slate da Corneta (`run_slate`) está empurrando o "JÁ VOLTO", ele é um
  frame estático → **não pode** auto-disparar outro slate. Mitigação: enquanto `pause_flag`/`run_flag`
  do slate estiver ativo, o detector **ignora** aquele destino.
- **Menu de jogo parado / tela de loading** → congelado real, mas **intencional**. Por isso o aviso
  (T1) é só um toast dispensável e o slate (T2) tem limiar bem folgado; quem joga RPG de menu fica no
  "modo pausa".
- **Stream de música / AFK / lo-fi com visual estático** → tela quase parada por design. Mitigação:
  mesmo "modo pausa", ou desligar o detector de freeze (manter só o de preto, que é sempre suspeito).
- **Cena legitimamente escura** (jogo de terror, fade) → o `pic_th` generoso evita marcar como preto;
  preto **total** por 2 s+ é raro em conteúdo real.

> Regra da casa: **default só avisa**, ação automática (slate) é opt-in. Falso positivo que vira um
> toast é barulho; falso positivo que joga um BRB por cima de uma cena de propósito é um vexame.

---

## 4. Grátis vs. pago

- **Grátis (local):** tudo. `blackdetect`/`freezedetect` são filtros **nativos do FFmpeg** rodando no
  mesmo processo do dead-air — custo de CPU desprezível (sem decode extra, sem OCR/IA, sem nuvem).
  Aviso (`notify` + toast) e slate (`run_slate`) já são locais.
- **Pago (nuvem):** nada específico aqui — é local por natureza. O único "upgrade" plausível é o aviso
  via Discord (webhook), que também é grátis. A verificação **independente por plataforma** (puxar o
  stream público de volta pra confirmar que a plataforma está *mostrando*) é uma feature separada e
  mais cara — fica fora deste MVP.

---

## 5. Próximo passo (MVP)

Estender o FFmpeg de análise do dead-air com `blackdetect`, parsear os dois eventos novos, máquina de
estado **preto OU congelado** com T1 (aviso via `notify`) e **auto-slate opcional** em T2 via
`run_slate`. Settings com limiares, "modo pausa" e o toggle de auto-slate. Sem decode próprio, sem
janela de preview — o [`confidence monitor`](./06-confidence-monitor-local.md) vem depois e reusa o
mesmo sinal.

---

## 6. TODO (implementação)

**MVP**
- [ ] Adicionar `blackdetect=d=2:pic_th=0.98` ao `-vf` do FFmpeg de análise (o mesmo do dead-air)
- [ ] Parser dos eventos no stderr: `black_start`/`black_end` (junto do `freeze_*` já existente)
- [ ] Máquina de estado por destino: **preto OU congelado** > T1 → aviso; > T2 → slate; frame válido → reseta
- [ ] Aviso: `notify(app, ...)` + evento Tauri (`app.emit`) consumido por `Toaster.tsx`/`AlertsFeed.tsx`
- [ ] Auto-slate **opcional** via `run_slate(...)` (toggle próprio, à parte de `brb_enabled`, default OFF)
- [ ] Ignorar destino enquanto seu slate/BRB já estiver no ar (checar `run_flag`/`pause_flag`)
- [ ] Settings em `config.rs`: T1, T2, `pic_th`, auto-slate on/off, "modo pausa"
- [ ] Fallback leve: amostrar `grab_frame_named` + luma/diff quando o dead-air estiver desligado

**Fase 2**
- [ ] Aviso opcional via webhook do Discord
- [ ] Abrir caminho pro [`confidence monitor local`](./06-confidence-monitor-local.md) (preview do que sai)
- [ ] Verificação independente por plataforma (puxar stream público de volta) — feature separada
