# Guardião de áudio — Balance mic × game — sugestão de implementação

> Tua **voz some** debaixo do jogo. A regra de ouro ("game 6–12 dB **abaixo** da voz")
> todo mundo conhece e quase ninguém segue — e você só percebe quando o chat reclama
> que "tá baixo". A Corneta está **no caminho do mix em tempo real**, então pode flagrar
> isso na hora. **Ressalva honesta:** no caso comum (RTMP do OBS = **uma** faixa estéreo
> já mixada, voz + jogo juntos) a gente **não separa** mic de game com precisão — o MVP é
> uma **heurística de banda de voz**, boa pra **alerta**, não pra controle fino. A separação
> exata só com **multitrack** (Fase 2).

- **Status:** Sugestão de implementação · 2026-06-29
- **Relacionado:** [`../IDEIAS-v4.md`](../IDEIAS-v4.md), [`./03-guardiao-audio-loudness-lufs.md`](./03-guardiao-audio-loudness-lufs.md), [`../FEATURE-DEAD-AIR.md`](../FEATURE-DEAD-AIR.md)

---

## 0. Objetivo

Detectar quando o **áudio do jogo abafa a voz** (mic abaixo do alvo enquanto o desktop
domina) e **avisar** o streamer — e, quando der (multitrack), **duckar** o game
automaticamente quando você fala. Tudo **local** (filtros FFmpeg + parse de stderr) →
**grátis**.

Fronteira honesta (§8 do v4): a Corneta **não vira mixer**. Ela **mede/avisa** e, no
máximo, **ducka**. Mexer no balanço fino do mix continua sendo trabalho do OBS.

---

## 1. Arquitetura

Dois mundos, escolhidos conforme o que o OBS manda:

```
                         ┌──────────────────────────────────────────────┐
 OBS (RTMP) ─> MediaMTX ─┤                                              │
                         │  RAMO A — FAIXA ÚNICA MIXADA (caso comum)    │
                         │  FFmpeg split do áudio:                       │
                         │    a) bandpass=300..3000  -> ebur128/astats   │  energia "voz"
                         │    b) faixa cheia (full)  -> ebur128/astats   │  energia "total"
                         │  parse stderr -> razão voz/total na janela    │
                         │    voz consistentemente baixa c/ total alto   │
                         │      -> AVISO "tua voz parece baixa vs jogo"  │
                         └──────────────────────────────────────────────┘
                         ┌──────────────────────────────────────────────┐
 OBS (multitrack) ──────>│  RAMO B — DUAS FAIXAS (Fase 2, modo bom)     │
                         │  track 1 = mic    -> ebur128 (nível real)     │
                         │  track 2 = game   -> ebur128 (nível real)     │
                         │  mic - game < 6 dB  ->  AVISO                  │
                         │  + DUCK opcional: sidechaincompress           │
                         │      (mic = sidechain) abaixa o game ao falar │
                         └──────────────────────────────────────────────┘
                                          │
                                          v
                        lógica (limiar + janela) -> notify() / emit -> Toaster
```

- **Onde encaixa o pump em tempo real:** mesmo molde do `../../src-tauri/src/guardian/pipeline.rs`
  (igual o dead-air e o doc de LUFS): um FFmpeg de análise lendo o path do MediaMTX, parse
  contínuo do stderr.
- **Onde encaixa o duck (Ramo B):** o filtro de áudio entra no encoder por destino, em
  `engine::ffmpeg_args_for_encoder(...)` — é lá que um `sidechaincompress` (ou EQ/ganho)
  já entraria no fluxo decode-once → encode-N do `../../src-tauri/src/engine.rs`.

---

## 2. Detalhes & decisões

- **Banda de voz.** Inteligibilidade humana mora grosso modo em **~300 Hz–3 kHz**. Isolar com
  `bandpass=f=1700:width_type=h:w=2700` (ou `highpass=f=300` + `lowpass=f=3000` em série) e
  medir a energia ali com `ebur128` (loudness) ou `astats` (RMS/peak por janela). Comparar com
  a energia da faixa **cheia** medida em paralelo (FFmpeg `asplit` → dois ramos de medição).
- **Limiar (relativo, não absoluto).** O que importa é a **razão** voz/total, não o nível
  cru — porque na faixa única não existe "nível do mic". Heurística MVP: se `energia_banda_voz`
  fica **X dB** (ex.: ~12–15 dB) abaixo de `energia_total` **enquanto o total está alto**
  (há áudio cheio, não é silêncio), a voz provavelmente está soterrada → candidato a aviso.
- **Janela temporal.** Nada de reagir a um pico. Janela deslizante de **~5–10 s** com
  histerese: só dispara o aviso se a condição se mantém por N segundos seguidos, e só limpa
  depois de M segundos abaixo do limiar. Evita toast piscando.
- **Aviso vs duck.**
  - **Faixa única (Ramo A):** **só aviso**. Não dá pra duckar com segurança porque duckar a
    "faixa cheia" abaixaria a própria voz junto — sem separação, não há o que duckar.
  - **Multitrack (Ramo B):** aí sim cabe **duck** via `sidechaincompress` (mic como
    sidechain comprime o game quando você fala), porque mic e game são faixas distintas.
- **Pré-requisito do modo bom.** Ramo B exige o usuário configurar o OBS pra mandar **2
  faixas** (Advanced Audio Properties / múltiplas tracks no output). É config do usuário —
  a Corneta detecta se há 2 faixas e, se sim, libera medição separada e duck.
- **Settings** (`../../src-tauri/src/config.rs`): liga/desliga o guardião, escolhe modo
  (heurístico / multitrack), limiar em dB, tamanho da janela, e duck on/off (só Ramo B).

---

## 3. Casos de borda

- **Música / sem fala (DJ set, lo-fi, gameplay sem comentário).** A banda 300–3 kHz tem
  energia mesmo sem voz humana → **falso positivo**. Mitiga com toggle "modo música/sem fala"
  (igual o dead-air) que desliga o guardião, e com limiar generoso.
- **Momentos sem jogo** (menu, tela parada, lobby silencioso). Total baixo → a regra "total
  alto" não se satisfaz → não dispara. Bom: o aviso só faz sentido quando **tem** áudio cheio
  competindo com a voz.
- **Você está calado de propósito** (concentrado, lendo chat, clutch). Voz baixa é **esperada**
  — não é problema. Por isso o limiar exige **persistência na janela**: silêncio breve não
  conta, e o objetivo é flagrar o padrão "falando porém abafado", não "não falando".
- **Faixa única limita, ponto.** Banda de voz ≠ voz. Efeitos do jogo, vozes de NPC e música
  caem na mesma faixa. É **detecção aproximada** — serve pra cutucar ("ó, parece baixo"),
  **não** pra afirmar com certeza nem pra controle fino. Deixar isso explícito na UI do aviso.

---

## 4. Grátis vs pago

- **Grátis (local):** tudo. Medição (`bandpass`/`highpass`/`lowpass` + `ebur128`/`astats`),
  heurística de razão, aviso via `notify()`, e o duck por `sidechaincompress` no Ramo B. São
  filtros nativos do FFmpeg na própria máquina — sem nuvem, sem IA, sem custo.
- **Pago (nuvem):** nada específico aqui. A feature é local por natureza. (Se um dia rolar
  separação de fontes por IA — mic vs game na faixa única via modelo — aí seria pago; mas isso
  está **fora** do escopo e fura a fronteira "não virar mixer".)

---

## 5. Próximo passo

**MVP heurístico de aviso (Ramo A):** um FFmpeg de análise no path do MediaMTX com `asplit` →
ramo `bandpass` (300–3 kHz) + ramo cheio, ambos em `ebur128`/`astats`; parse do stderr no molde
do `guardian/pipeline.rs`; janela deslizante + histerese; se voz << total com total alto por N
segundos → `notify()` + `emit` pro `Toaster.tsx` com texto honesto ("parece baixo, confere o
balanço"). Sem duck, sem promessa de precisão.

---

## 6. TODO (implementação)

**MVP**
- [ ] FFmpeg de análise no path do MediaMTX com `asplit`: ramo `bandpass=300..3000` + ramo cheio
- [ ] Medir os dois ramos com `ebur128` (ou `astats`) em paralelo
- [ ] Parser do stderr (reusar molde de `../../src-tauri/src/guardian/pipeline.rs`)
- [ ] Lógica: razão voz/total + limiar dB relativo + janela deslizante com histerese (N/M s)
- [ ] Aviso: `notify(app, ...)` + `app.emit` → `src/components/Toaster.tsx`, com texto "detecção aproximada"
- [ ] Settings (`config.rs`): on/off, limiar dB, janela, "modo música/sem fala"
- [ ] Deixar claro na UI que faixa única = heurística, não medida exata

**Fase 2**
- [ ] Detectar se o OBS manda 2 faixas (multitrack) e habilitar o Ramo B
- [ ] Medir mic e game separados (`ebur128` por faixa) → limiar real "game ≥ 6 dB abaixo da voz"
- [ ] Duck opcional: `sidechaincompress` (mic = sidechain) em `engine::ffmpeg_args_for_encoder(...)`
- [ ] Guia in-app de como ligar 2 faixas no OBS (Advanced Audio Properties)
- [ ] Settings extra: duck on/off, agressividade (threshold/ratio/attack/release do sidechain)
