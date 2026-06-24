# Máquina do tempo (clipe com chat embutido) — planejamento técnico

> Clipe instantâneo dos últimos X segundos, **com o chat sincronizado embutido** (mostra o que a
> galera falou naquele momento). A Corneta tem as duas peças alinhadas — vídeo + chat no tempo —
> que ninguém mais tem juntas. Ver [`IDEIAS-v3.md`](./IDEIAS-v3.md) §4.

- **Status:** Planejamento técnico · 2026-06-24
- **Relacionado:** [`FEATURE-VERTICAL-AO-VIVO.md`](./FEATURE-VERTICAL-AO-VIVO.md) (reusa o buffer), [`MONETIZACAO.md`](./MONETIZACAO.md)

---

## 0. Objetivo

Apertar um atalho e gerar um **clipe (MP4)** dos últimos ~30s **já com a reação do chat** — burn-in
ou sidecar. Tudo **local** (gravação + chat que já temos) → **grátis**. Render/armazenamento na
nuvem = pago.

---

## 1. Arquitetura

```
MediaMTX ──> [gravador em anel] ──> segmentos .ts no disco (últimos N min)   (vídeo)
store/chat ──> [buffer de chat] ──> mensagens com ts (últimos N min)         (chat)
                       │
        "clipar!" (atalho/botão) → extrai [t0,t1] de vídeo + chat → MP4 (+ chat burn-in/sidecar)
```

1. **Gravador em anel (vídeo).** Um FFmpeg dedicado lê o path do MediaMTX e grava **segmentos
   curtos** num temp dir: `-f segment -segment_time 4 -segment_wrap <N> -reset_timestamps 1` (mantém
   só os últimos N×4s; o `segment_wrap` recicla). Cada segmento sabe seu intervalo de tempo.
   *Custo:* copiar o stream pra disco (`-c copy`, sem re-encode) — barato.
2. **Buffer de chat.** As mensagens já chegam com `ts` (epoch ms) via `chat://message`. O front já
   tem `chatMessages` (limitado). Pra clipar, basta filtrar as mensagens em `[t0,t1]`. (Opcional:
   um buffer no backend espelhando o de vídeo, pra clipar mesmo sem o front.)
3. **Extração.** Atalho/botão "clipar últimos X s" → `t1=agora`, `t0=t1-X`. **Concatena** os
   segmentos que cobrem a janela (`ffmpeg -f concat`) e apara nas bordas exatas. Pega as mensagens
   de chat em `[t0,t1]` com timestamps **relativos ao início do clipe**.
4. **Saída (chat embutido):**
   - **MVP — sidecar:** `clipe.mp4` + `clipe.chat.json` (mensagens + offsets) → um player interno
     mostra os dois lado a lado.
   - **MVP+ — strip simples:** burn-in de uma faixa de chat com `drawtext` (últimas ~5 msgs,
     `enable='between(t,a,b)'`).
   - **Fase 2 — overlay bonito:** renderiza um overlay de chat (canvas/headless) e **compõe** sobre
     o clipe no FFmpeg (estilo do nosso `ChatFeed`).

---

## 2. Detalhes & decisões

- **Tamanho do anel:** N configurável (padrão ~5 min). Disco: ~1 min de 1080p6Mbps ≈ 45 MB → 5 min
  ≈ 225 MB. Aceitável; pruning automático pelo `segment_wrap`.
- **Cópia sem re-encode** (`-c copy`) pro anel; o re-encode (burn-in) só acontece **no momento do
  clipe**, não o tempo todo.
- **Corte preciso** depende de keyframe; com `-c copy` o corte é no keyframe mais próximo. Pra borda
  exata, re-encode só o clipe (curto, barato).
- **Reaproveita** o gravador em anel pro [`vertical ao vivo`](./FEATURE-VERTICAL-AO-VIVO.md) (mesma fonte).
- **Galeria de clipes:** tela/listagem com preview + "abrir pasta" + (futuro) exportar/postar.

---

## 3. Casos de borda

- **Sem chat conectado:** clipa só o vídeo (sidecar de chat vazio).
- **Sinal não está publicando** (`mediamtx_has_publisher` = false): botão desabilitado / aviso.
- **Clipe maior que o anel:** limita X ao tamanho do buffer (avisa).
- **A/V sync** na concatenação: `-reset_timestamps` + apara com re-encode quando preciso.

---

## 4. Grátis vs pago

- **Grátis (local):** gravador em anel, extração, sidecar/strip/overlay burn-in, galeria — tudo na
  máquina.
- **Pago (nuvem):** render do overlay caprichado em servidor, **storage/hospedagem** dos clipes,
  página pública do clipe. Server-sided.

---

## 5. Próximo passo

MVP: **gravador em anel** (FFmpeg segment) + **extração [t0,t1]** + **sidecar de chat** + player
interno. O burn-in (strip `drawtext`) entra logo depois; o overlay bonito é Fase 2.

---

## 6. TODO (implementação)

**MVP**
- [ ] Gravador em anel: FFmpeg `-f segment -segment_time 4 -segment_wrap N -c copy` lendo o MediaMTX
- [ ] Gerência do anel (temp dir, mapa segmento→intervalo, pruning)
- [ ] Comando `clip_now(seconds)` (atalho + botão "clipar últimos X s")
- [ ] Concat dos segmentos da janela + apara nas bordas → `clipe.mp4`
- [ ] Extrair mensagens de chat em [t0,t1] com offsets relativos → `clipe.chat.json`
- [ ] Player interno (vídeo + chat sincronizado lado a lado)
- [ ] Galeria de clipes (lista + preview + abrir pasta) + setting de tamanho do anel
**MVP+**
- [ ] Burn-in de strip de chat (`drawtext` com `enable='between(t,a,b)'`)
**Fase 2**
- [ ] Overlay de chat renderizado (canvas/headless) composto no FFmpeg (estilo do ChatFeed)
**Pago (nuvem)**
- [ ] Render/armazenamento/página pública do clipe (server-sided)
