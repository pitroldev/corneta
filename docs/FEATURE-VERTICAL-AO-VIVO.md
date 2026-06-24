# Vertical automático ao vivo — planejamento técnico

> Detectar um **momento quente** ao vivo (pico de chat + áudio) e **já gerar o clipe 9:16** pronto
> pra postar no Shorts/TikTok/Reels — **enquanto ainda tá quente**. Compõe a [`máquina do
> tempo`](./FEATURE-MAQUINA-DO-TEMPO.md) (buffer) + o `reframe_filter` que já temos. Ver
> [`IDEIAS-v3.md`](./IDEIAS-v3.md) §7.

- **Status:** Planejamento técnico · 2026-06-24
- **Relacionado:** [`FEATURE-MAQUINA-DO-TEMPO.md`](./FEATURE-MAQUINA-DO-TEMPO.md), [`MONETIZACAO.md`](./MONETIZACAO.md)

---

## 0. Objetivo

Sem o streamer pedir: a Corneta percebe que **algo bombou**, recorta o trecho, **enquadra em 9:16** e
avisa *"clipe vertical pronto: o chat explodiu (240/min)"*. Detecção + recorte + reframe são **locais
(FFmpeg) → grátis**. Auto-reframe por IA, legenda queimada e auto-post = nuvem/OAuth = **pago**.

---

## 1. Arquitetura (compõe peças que já existem)

```
[detector de momento quente] ──(spike em t)──> [extrai do buffer t-20s..t+10s] ──> [reframe 9:16] ──> clipe.mp4 + aviso
        ↑ chat rate + áudio                         (máquina do tempo)              (reframe_filter)
```

1. **Detector de momento quente (ao vivo).** Monitores em janela deslizante:
   - **Taxa de chat:** já contamos no backend (`MSG_COUNT`, lido a cada ~2s). Baseline móvel; pico =
     `taxa > k×baseline` (ex.: k=2.5), reusando a mesma heurística do `report.ts`.
   - **Áudio:** FFmpeg no áudio do MediaMTX (`ebur128`/`astats` ou pico de volume) → detecta
     gargalhada/grito. (Opcional no MVP; chat já pega bastante.)
   - **Debounce:** no máx. 1 momento quente por ~60s.
2. **Extração.** Reusa o **gravador em anel** da máquina do tempo → `[spike-20s, spike+10s]`.
3. **Reframe 9:16.** Reusa o **`reframe_filter`** (`crop=ih*z*ar:ih*z:…,scale=W:H`) que já existe pro
   reframe vertical. Usa o **enquadramento que o usuário já salvou** pro destino portrait dele (se
   houver), ou um **center-crop** padrão.
4. **Saída.** Salva em `clips/vertical/` + **notifica** com o motivo (do highlight). Não posta
   sozinho — o streamer revisa e posta.

---

## 2. Detalhes & decisões

- **Reaproveitamento total:** detector = heurística do relatório; buffer = máquina do tempo; reframe
  = `reframe_filter`. Pouco código novo, muita composição.
- **Janela do clipe:** ~30s (20 antes / 10 depois) — configurável.
- **Modo:** "sugerir" (padrão, gera e avisa) vs "só marcar" (só registra o timestamp pra clipar
  depois). Evita encher a pasta.
- **Reframe sem config:** se o usuário não tem destino portrait, usar center-crop com leve viés pro
  topo (onde costuma estar a face-cam) — ou abrir o `ReframeEditor` pra ele ajustar uma vez.

---

## 3. Casos de borda

- **Pico falso** (raid de bot, spam): exigir pico **sustentado** alguns segundos; opcional cruzar
  com áudio.
- **Sem buffer ativo:** a feature depende do gravador em anel ligado (mesmo da máquina do tempo).
- **Performance:** o re-encode do reframe é **curto** (30s) e **fora do caminho ao vivo** — não
  afeta a transmissão.
- **Muitos picos numa live agitada:** cap por hora + debounce.

---

## 4. Grátis vs pago

- **Grátis (local):** detector (chat+áudio), extração, reframe FFmpeg, aviso, pasta de clipes.
- **Pago (nuvem):** **auto-reframe por IA** (segue rosto/ação), **legenda queimada** (STT na nuvem),
  **auto-post** (APIs/OAuth do TikTok/Shorts), render/armazenamento. Server-sided.

---

## 5. Próximo passo

MVP: **detector por pico de chat** (reusa `MSG_COUNT` + heurística do relatório) → **extrai do anel**
→ **`reframe_filter`** (center-crop ou o reframe salvo) → salva + avisa. Áudio, auto-reframe IA e
auto-post vêm depois.

---

## 6. TODO (implementação)

**MVP**
- [ ] Detector de pico de chat ao vivo (baseline móvel sobre `MSG_COUNT`, k×baseline, debounce ~60s)
- [ ] Hook no gravador em anel da máquina do tempo pra extrair `[spike-20s, spike+10s]`
- [ ] Pipeline de reframe 9:16 reusando `reframe_filter` (reframe salvo do destino portrait ou center-crop)
- [ ] Salvar em `clips/vertical/` + notificação com o motivo (do highlight)
- [ ] Setting: on/off, janela, modo "sugerir" vs "só marcar", cap por hora
**Fase 2 (mix)**
- [ ] Detector de pico de **áudio** (FFmpeg `ebur128`/`astats`) cruzado com o chat
- [ ] Fallback: abrir `ReframeEditor` quando não há enquadramento salvo
**Pago (nuvem)**
- [ ] Auto-reframe por IA (tracking de rosto/ação)
- [ ] Legenda queimada (STT nuvem) + auto-post (OAuth TikTok/Shorts) + render/storage
