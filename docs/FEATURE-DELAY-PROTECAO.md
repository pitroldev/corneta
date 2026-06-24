# Delay de proteção ("oops, volta") — planejamento técnico

> Segurar **alguns segundos** do sinal antes de ir pras plataformas, criando uma janela pra **desfazer
> / substituir** o que estava prestes a airar — o "delay de transmissão" da TV, só que **local e
> seu**. É também o **habilitador** do auto-corte do [`anti-vazamento`](./FEATURE-ANTI-VAZAMENTO.md).
> Ver [`IDEIAS-v3.md`](./IDEIAS-v3.md) §1.

- **Status:** Planejamento técnico · 2026-06-24
- **Relacionado:** [`FEATURE-ANTI-VAZAMENTO.md`](./FEATURE-ANTI-VAZAMENTO.md), proteção contra quedas / `run_slate`, [`MONETIZACAO.md`](./MONETIZACAO.md)

---

## 0. Objetivo

Um **atraso configurável** (ex.: 0/3/6/10s) entre o OBS e as plataformas. Com a janela de atraso:
- **botão "oops, volta"** → substitui os últimos segundos por um **slate/freeze** antes de airarem;
- **gatilho automático** do anti-vazamento / pânico → corta sem o segredo ir pro ar.

**Local** (a máquina do usuário bufferiza) → **grátis**. O custo é latência + um pouco de CPU/RAM —
opcional e **off por padrão**.

---

## 1. O problema (honestidade técnica)

Transmissão é tempo real. "Atrasar e poder apagar os últimos N segundos" exige **bufferizar** o sinal
e ter o poder de **trocar** um trecho antes de enviá-lo. O FFmpeg não faz "rebobina e descarta o
último trecho" sozinho. Então a Corneta precisa virar um **delay line** entre o MediaMTX e os
destinos.

Hoje: `OBS → MediaMTX → 1 FFmpeg por destino → plataformas`. A ideia muda o meio do caminho.

---

## 2. Arquitetura (abordagem por segmentos)

```
OBS → MediaMTX → [gravador em anel] → segmentos .ts        (já temos isso na máquina do tempo!)
                                          │
                  [republicador] lê os segmentos com ATRASO de N s e envia pras plataformas
                                          │  └─ na hora de "oops"/auto-corte: troca o segmento atual
                                          │     (e os próximos poucos) por SLATE antes de enviar
```

1. **Gravador em anel** (reusa a [`máquina do tempo`](./FEATURE-MAQUINA-DO-TEMPO.md)): segmentos
   curtos (ex.: 1–2s, alinhados em keyframe) no disco/RAM.
2. **Republicador atrasado:** em vez de o FFmpeg por destino ler o MediaMTX **ao vivo**, ele lê a
   **fila de segmentos com N segundos de atraso** e empurra pras plataformas (`-re`, concat/append).
3. **Substituição ("oops" / auto-corte):** o trecho ainda está **na fila** (não saiu). A Corneta
   **troca** o(s) segmento(s) alvo por um **slate** (o mesmo `run_slate` do BRB) ou um **freeze** do
   último quadro bom, antes de enviá-lo.

> Variante mais simples (MVP-): não "rebobinar" precisão de frame, e sim **"cortar pra slate os
> próximos N segundos"** — já cobre 90% do uso (pânico/vazamento), sem re-timing fino.

---

## 3. Desafios (o que torna isso difícil)

- **Alinhamento de keyframe:** só dá pra cortar/trocar em keyframe. Forçar GOP curto no OBS (ou
  re-encode) pra ter pontos de corte frequentes.
- **Sincronia A/V:** trocar vídeo e áudio juntos, manter o relógio. O segmento deve carregar os dois.
- **Continuidade pras plataformas:** o stream de saída **não pode ter buraco** (a plataforma derruba
  se faltar dado). A troca tem que ser **slate contínuo**, não um corte seco.
- **Latência:** N segundos de atraso = você fica N atrás do chat. Por isso configurável e off por
  padrão (e um aviso claro).

---

## 4. Fases

- **Fase 1 — Delay fixo + "cortar pra slate".** Buffer de N s (segmentos) + republicador atrasado +
  botão/atalho que **manda os próximos N s como slate**. Não é rebobina frame-perfect, mas resolve
  pânico/vazamento. (Pode começar como "delay só pra ter a janela" + "cut to slate".)
- **Fase 2 — Substituição precisa.** Trocar exatamente o trecho ofensor (rebobina real) com
  alinhamento de keyframe + freeze do último quadro bom.
- **Integra:** o gatilho automático do anti-vazamento (confiança altíssima) e do botão de pânico
  chamam a substituição.

---

## 5. Casos de borda

- **Atraso = 0** (padrão): feature desligada, pipeline atual intacto.
- **CPU/RAM:** buffer em RAM x disco; N grande = mais memória. Limitar N (ex.: máx 30s).
- **Reconexão:** o republicador precisa conviver com o respawn de FFmpeg que já temos (supervisor).
- **Multi-plataforma:** o atraso vale pra todos os destinos igualmente (um buffer, vários
  republicadores) pra não dessincronizar plataformas.

---

## 6. Grátis vs pago

- **Grátis (local):** todo o delay line roda na máquina do usuário. Sem servidor → **grátis**.
- **Pago (nuvem):** só se um dia o **relay na nuvem** ([`MONETIZACAO.md`](./MONETIZACAO.md)) oferecer
  o delay no servidor (pra quem usa o relay) — aí é server-sided.

---

## 7. Próximo passo

Provar a abordagem por segmentos com um **delay fixo pequeno** (ex.: 4s) + **"cut to slate"** num
destino só. Se o A/V sync e a continuidade aguentarem, generalizar pra todos os destinos e plugar no
anti-vazamento/pânico. É a feature mais arriscada do conjunto — vale um **spike/protótipo** antes de
comprometer.

---

## 8. TODO (implementação)

**Spike / protótipo**
- [ ] Validar segmentação alinhada em keyframe (GOP curto no OBS) + concat contínuo sem buraco
- [ ] Republicador que lê segmentos com atraso N e envia pra 1 destino (`-re`), medindo A/V sync
**Fase 1 — Delay fixo + cut to slate**
- [ ] Buffer em anel (reusa máquina do tempo) com N configurável (0 = off; máx ~30s)
- [ ] Republicador atrasado por destino (conviver com o supervisor/respawn atual)
- [ ] Botão/atalho "oops, volta" → enviar os próximos N s como **slate** (`run_slate`)
- [ ] Setting: atraso (0/3/6/10s) + aviso de latência vs chat
**Fase 2 — Substituição precisa**
- [ ] Trocar exatamente o trecho ofensor (keyframe-aligned) + freeze do último quadro bom
- [ ] Gatilho automático do anti-vazamento (confiança altíssima) e do botão de pânico
