# Rerun / Premiere (VOD como "live") — sugestão de implementação

> Manter **presença e consistência** quando você **não está ao vivo**: o algoritmo (YouTube,
> Twitch, etc.) premia **constância**, e um canal que some por dias perde alcance. A ideia é
> transmitir um **arquivo/VOD como "live"** — rerun de melhores momentos, loop temático, "best of"
> — pra ocupar o slot enquanto você está fora. Encaixa fácil na Corneta porque **já temos o relay e
> o fan-out**: hoje o OBS publica no MediaMTX e a gente faz 1 FFmpeg por destino. Trocar o OBS por
> **um FFmpeg que lê um arquivo** e publica no mesmo lugar não muda **nada** no resto — é só **outra
> fonte entrando no relay**.

- **Status:** Sugestão de implementação · 2026-06-29
- **Relacionado:** [`../IDEIAS-v4.md`](../IDEIAS-v4.md), [`./09-sala-de-espera-starting-soon.md`](./09-sala-de-espera-starting-soon.md), [`./05-guardiao-audio-dmca-musica.md`](./05-guardiao-audio-dmca-musica.md)

---

## 0. Objetivo

Transmitir um **arquivo de vídeo (ou playlist) como se fosse uma live**, em loop opcional, pra
**manter o canal ativo** quando ninguém está produzindo ao vivo. Reusa **100% do pipeline atual**:
a única novidade é o **publicador** — em vez do OBS, um sidecar FFmpeg empurra o arquivo pro
MediaMTX. Tudo **local** → **grátis**.

A Corneta **não se importa de onde vem o publisher**. Ela detecta um publisher no MediaMTX
(`mediamtx_has_publisher()`), sobe o relay e faz o fan-out por destino. Quem publica — OBS humano ou
FFmpeg lendo `melhores-momentos.mp4` — é irrelevante pro resto da máquina.

---

## 1. Arquitetura

```
  arquivo.mp4 / playlist
        │
        ▼
  FFmpeg (sidecar)                          ┌─> FFmpeg encode → destino 1 (YouTube)
  -re -stream_loop -1                        │
  -i arquivo -c copy ──► rtmp://127.0.0.1:1935/live/obs ──► MediaMTX ──┼─> FFmpeg encode → destino 2 (Twitch)
  -f flv <ingest_url>                        │
        ▲                                    └─> FFmpeg encode → destino N (...)
        │
  (em vez do OBS)                            (fan-out IDÊNTICO ao de hoje)
```

- O `<ingest_url>` é exatamente o que `engine::ingest_url(config)` monta a partir do
  `IngestConfig { protocol:"rtmp", host:"127.0.0.1", port:1935, app:"live", key:"obs" }` (default em
  `config.rs`). O publicador de arquivo aponta pro **mesmo** endereço que o OBS usaria.
- A partir do MediaMTX pra frente **nada muda**: `start_engine` (em `commands.rs`) sobe o MediaMTX +
  os FFmpegs de destino; o fan-out (decode-once → encode-N) é o mesmo.

---

## 2. Detalhes & decisões

- **Publicador de arquivo = mais um sidecar FFmpeg.** Igual a gente já faz com `grab_frame_named` e
  `run_slate` via `app.shell().sidecar("ffmpeg")`, só com outros args:
  ```
  ffmpeg -re -stream_loop -1 -i <arquivo> -c:v copy -c:a copy -f flv <ingest_url>
  ```
  - `-re` lê em **tempo real** (sem isso o FFmpeg despeja o arquivo o mais rápido possível e quebra a
    "live").
  - `-stream_loop -1` faz **loop infinito**; `-stream_loop 0` (ou omitir) toca uma vez.
- **Copy vs recode.** Se o arquivo já for H.264 + AAC compatível com os destinos, `-c copy` é o ideal
  (CPU quase zero, sem perda). Se não for (codec/perfil/keyframe estranho), **recodifica**:
  `-c:v libx264 -preset veryfast -c:a aac -ar 44100`. Decisão pode ser automática (probe rápido) ou
  um toggle "recodificar" na UI.
- **Loop sem corte feio.** `-stream_loop -1` reinicia o arquivo; o ideal é o arquivo já ter
  começo/fim que casam (fade ou corte limpo). Pra playlist, **concatenar** (concat demuxer / arquivo
  de lista) ou **encadear** arquivos é o caminho — começar simples com **um arquivo só**.
- **Reuso total do fan-out.** O ponto da feature: **não escrevemos nada de novo** no relay. A opção
  de UI só decide **qual publisher** sobe (OBS esperado vs arquivo) e chama o mesmo
  `start_engine`/fan-out.
- **Agendar (Fase 2).** "Toca esse arquivo em loop das 02h às 08h" ou "quando o OBS cair, entra o
  rerun". Útil, mas **fora do MVP** — ver fronteira na §0/§5.

---

## 3. Casos de borda

- **Arquivo incompatível** (codec/container que o destino recusa, ou áudio fora de 44.1/48kHz) → cair
  pra **recode** (`-c:v libx264 -c:a aac`) em vez de `-c copy`. Um probe (`ffprobe`/`grab_frame`) ou
  simplesmente o toggle "recodificar" resolve.
- **Loop com emenda feia** (salto/glitch na volta) → preferir arquivos com corte limpo; se incomodar,
  recodificar pra normalizar timestamps. Não tentar "loop perfeito frame-accurate" no MVP.
- **OBS e arquivo ao mesmo tempo** → o MediaMTX tem **um** publisher por path. Se o arquivo já está
  publicando e o OBS conecta (ou vice-versa), há conflito. Regra simples: **só um publisher por vez**
  — a UI deve impedir subir o rerun se já há publisher (`mediamtx_has_publisher()` == true), e vice-
  versa. (Handoff automático arquivo→OBS é Fase 2.)
- **Áudio com DMCA** → rerun de VOD **com música** pode levar **strike/mute**, e pré-gravado roda
  **desassistido** (ninguém pra reagir). Avisar o usuário e linkar o guardião:
  [`./05-guardiao-audio-dmca-musica.md`](./05-guardiao-audio-dmca-musica.md). Idealmente, rodar a
  detecção do guardião também no rerun.

> **TOS — leia antes de prometer.** As plataformas **variam** sobre "pré-gravado como live".
> O **YouTube** tem o **Premiere** (caminho **oficial** pra estrear um VOD como evento ao vivo) — é o
> jeito certo lá. A **Twitch** permite **reruns/premieres**, mas eles **devem ser rotulados** como
> tal (categoria/flag de rerun), não passados como live genuína. A Corneta deve **deixar isso
> explícito na UI** e não empurrar o usuário pra violar regra de plataforma.

---

## 4. Grátis vs pago

- **Grátis (local):** todo o MVP. É um sidecar FFmpeg lendo arquivo + o relay/fan-out que já existe.
  Roda 100% na máquina, sem nuvem.
- **Pago (nuvem):** nada específico aqui. (Se um dia houver agendamento/playout 24/7 hospedado, aí
  sim seria serviço — mas **não é o escopo**.)

---

## 5. Próximo passo

**MVP:** botão/opção "transmitir arquivo" → usuário escolhe o arquivo e marca **loop on/off** → a
Corneta sobe o sidecar FFmpeg (`-re -stream_loop -1 -i arquivo -c copy -f flv <ingest_url>`)
publicando no MediaMTX → o `start_engine`/fan-out faz o resto, **igual ao OBS**.

**Fronteira honesta (§8):** manter **simples** — arquivo → relay. **Não** virar sistema de
playout/agendamento completo, gerenciador de mídia, nem editor. Um arquivo (ou playlist concatenada),
em loop, publicando no relay. O resto é Fase 2 (e só se valer a pena).

---

## 6. TODO (implementação)

**MVP**
- [ ] Opção na UI ([`GoLiveScreen.tsx`](../../src/screens/GoLiveScreen.tsx)): "transmitir arquivo"
      (file picker + toggle loop on/off)
- [ ] Comando que sobe o sidecar FFmpeg publicador via `app.shell().sidecar("ffmpeg")` com
      `-re -stream_loop -1 -i <arquivo> -c:v copy -c:a copy -f flv <ingest_url>`
- [ ] Usar `engine::ingest_url(config)` / `IngestConfig` pra montar o destino (mesmo do OBS)
- [ ] Guard: só permitir subir o rerun se **não** houver publisher (`mediamtx_has_publisher()`)
- [ ] Reusar `start_engine` + fan-out **sem alterações**
- [ ] Toggle "recodificar" (fallback `-c:v libx264 -c:a aac`) pra arquivo incompatível
- [ ] Aviso de TOS (Premiere/rerun rotulado) + aviso DMCA com link pro guardião (`./05-...`)
**Fase 2**
- [ ] Playlist (concat demuxer / encadear arquivos)
- [ ] Probe automático (decidir copy vs recode sem o usuário marcar)
- [ ] Agendamento ("toca das 02h às 08h") e handoff arquivo↔OBS quando o publisher entra/cai
- [ ] Rodar a detecção do guardião de DMCA também durante o rerun
