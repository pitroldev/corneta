# Detector de "você sumiu" / dead air — planejamento técnico

> Perceber quando o streamer **sumiu** ou a transmissão **congelou** (sem áudio + sem movimento) e
> **cutucar** ele (ou ativar o BRB). Cruza sinal + tempo — território da Corneta. Ver
> [`IDEIAS-v3.md`](./IDEIAS-v3.md) §1.

- **Status:** Planejamento técnico · 2026-06-24
- **Relacionado:** [`FEATURE-ANTI-VAZAMENTO.md`](./FEATURE-ANTI-VAZAMENTO.md) (amostrador), proteção contra quedas / `run_slate` (BRB), [`MONETIZACAO.md`](./MONETIZACAO.md)

---

## 0. Objetivo

Detectar **dead air** (silêncio prolongado) e/ou **tela congelada** e reagir:
- **nudge** (avisa o streamer — toast/som; casa com "O Produtor"), ou
- **auto-BRB** após um limiar maior (reusa o `run_slate` da proteção contra quedas).

Tudo **local** (filtros de FFmpeg) → **grátis**.

---

## 1. Arquitetura

```
MediaMTX ──> FFmpeg [silencedetect + freezedetect] ──> parse eventos ──> lógica (limiar) ──> nudge / BRB
```

1. **Áudio (silêncio).** FFmpeg `silencedetect=noise=-50dB:d=2` no áudio do MediaMTX → emite
   `silence_start`/`silence_end` no stderr. Parse simples (igual já fazemos com o `speed=` do FFmpeg).
2. **Vídeo (congelado).** FFmpeg `freezedetect=n=-60dB:d=2` → emite `freeze_start`/`freeze_end`.
   (Alternativa leve: diff de quadros do amostrador do anti-vazamento — mas o `freezedetect` já
   resolve.)
3. **Lógica.** Combina os dois numa máquina de estado:
   - **silêncio E congelado** por `> T1` (ex.: 20s) → **dead air provável** → *nudge*.
   - persiste `> T2` (ex.: 60s) → **auto-BRB** (opcional, configurável).
   - qualquer áudio/movimento → reseta.
4. **Ação.** Nudge = toast in-app + som (e, no futuro, *whisper* do Produtor). BRB = `run_slate`.

> Pode rodar **um FFmpeg só** com os dois filtros (`-af silencedetect -vf freezedetect`) ou
> reaproveitar o amostrador/áudio que outras features já abrem.

---

## 2. Detalhes & decisões

- **Modos** (config): "só áudio", "só vídeo", "ambos (recomendado)". Streams de música = "só vídeo"
  ou desligado (silêncio é intencional).
- **Limiares configuráveis** (T1 nudge, T2 BRB) + auto-BRB on/off.
- **Whitelist "modo música/AFK":** um toggle pra quando o silêncio é proposital.
- **Custo:** filtros nativos do FFmpeg, baratíssimo (sem OCR/IA).

---

## 3. Casos de borda

- **Música sem fala** → não é dead air. Por isso "ambos" (precisa de silêncio **e** tela parada), e o
  modo música.
- **Cena estática proposital** (tela "volto já", pausa) + você falando → áudio reseta, sem falso
  positivo.
- **Falso positivo de freeze** em cena muito estática (menu) → exigir silêncio junto + limiar
  generoso.
- **Sinal caiu de verdade** (sem publisher) → isso já é tratado pela proteção contra quedas; o dead
  air é pra quando o sinal **está** lá mas **nada acontece**.

---

## 4. Grátis vs pago

- **Grátis (local):** detecção (silencedetect + freezedetect), nudge, auto-BRB. Tudo na máquina.
- **Pago (nuvem):** nada específico aqui — é local por natureza. (O *whisper* do Produtor, se for por
  IA na nuvem, seria pago; o nudge simples é grátis.)

---

## 5. Próximo passo

MVP: um FFmpeg com `silencedetect` + `freezedetect` → parse → estado → **nudge** após T1 e **auto-BRB
opcional** após T2. Settings com modos e limiares.

---

## 6. TODO (implementação)

**MVP**
- [ ] FFmpeg com `-af silencedetect=noise=-50dB:d=2 -vf freezedetect=n=-60dB:d=2` no path do MediaMTX
- [ ] Parser dos eventos no stderr (silence_start/end, freeze_start/end)
- [ ] Máquina de estado: dead air = silêncio **E** congelado; limiares T1 (nudge) / T2 (BRB)
- [ ] Nudge: toast in-app + som
- [ ] Auto-BRB opcional via `run_slate` (reusa proteção contra quedas)
- [ ] Settings: modo (áudio/vídeo/ambos), T1/T2, auto-BRB on/off, "modo música"
**Fase 2**
- [ ] Integrar o nudge ao "O Produtor" (painel/whisper)
