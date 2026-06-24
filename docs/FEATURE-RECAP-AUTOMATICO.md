# Recap automático — planejamento técnico

> Resumir a live sozinho: um **"previously on…"** pra quem chega atrasado (sem encher o chat de "o
> que tá rolando?") e um **recap pós-live** pra divulgar. A Corneta já tem os dados (sessão + chat +
> highlights do relatório). Ver [`IDEIAS-v3.md`](./IDEIAS-v3.md) §4.

- **Status:** Planejamento técnico · 2026-06-24
- **Relacionado:** [`RELATORIO-POS-LIVE.md`](./RELATORIO-POS-LIVE.md) (reusa highlights), [`MONETIZACAO.md`](./MONETIZACAO.md)

---

## 0. Objetivo

Dois modos:
1. **Recap ao vivo** ("previously on…") — pra newcomers se situarem.
2. **Recap pós-live** — resumo + melhores momentos pra postar.

A versão **heurística** (sem IA) roda **local → grátis**. A **polida por IA** e a **página
hospedada** = nuvem = **pago**.

---

## 1. Fontes de dados (já existem)

- **Sessão NDJSON** (`session.rs`): samples, viewers, **chat (taxa)**, **alertas**, **markers**.
- **`report.ts` → `analyze()`**: já calcula **highlights** (picos de chat + alertas fortes + saltos
  de audiência) com timestamps, `viewers`, `chat`, `alerts`.
- **Markers** ("marcar momento") = capítulos manuais.
- **Mensagens de chat** (store) — o conteúdo, pra um resumo melhor.
- **(Opcional) Transcrição** — STT do áudio (whisper local = grátis / nuvem = pago) melhora muito,
  mas o recap funciona sem.

---

## 2. Recap ao vivo ("previously on…")

- **Gatilho:** comando no chat (`!recap`) e/ou auto quando entra gente (salto de viewers).
- **Geração (heurística, local):** monta de
  - título/jogo atual,
  - **markers** recentes,
  - top **picos de chat** dos últimos ~10 min (já temos a curva),
  - **alertas** recentes (raid/sub/superchat).
  → um texto curto templated. Ex.: *"Nos últimos 15 min: raid do Fulano (+120), o chat explodiu no
  boss, e o Petro começou a fase 3."*
- **Geração (IA, nuvem, paga):** LLM sobre o chat/transcrição recente → 1–2 frases naturais.
- **Saída:** overlay discreto (browser source) e/ou **enviar no chat** (precisa de envio — ver
  [`ENVIO.md`](./ENVIO.md)/OAuth do YouTube).

---

## 3. Recap pós-live

- **Local (grátis):** estende o relatório → **export em markdown/texto**: melhores momentos
  (timestamps), números (pico/média viewers, msgs, subs, bits, raids), clipes sugeridos. Reusa
  `analyze()` direto.
- **Nuvem (paga):** **página hospedada** (`pitrol.dev/recap/...`) bonita e compartilhável + resumo
  por IA + thumbnails dos momentos.

---

## 4. Casos de borda

- **Pouco dado** (live curta / chat parado): recap mínimo honesto ("live tranquila").
- **Sem envio configurado:** o `!recap` cai pro overlay (não precisa enviar no chat).
- **Spam de `!recap`:** cooldown por usuário/global.
- **Idioma:** segue o idioma do streamer; tradução é feature à parte (v2).

---

## 5. Grátis vs pago

- **Grátis (local):** recap heurístico ao vivo, export markdown pós-live, overlay do "previously".
- **Pago (nuvem):** resumo por IA (LLM), **página hospedada**, STT na nuvem pro recap com transcrição.

---

## 6. Próximo passo

MVP **pós-live local**: um botão "Exportar recap" na tela de Relatórios que gera um **markdown** a
partir do `analyze()` (highlights + números). Depois o **recap ao vivo heurístico** com `!recap` →
overlay. IA + página hospedada são a camada paga.

---

## 7. TODO (implementação)

**MVP — pós-live local**
- [ ] `buildRecapMarkdown(data)` em cima do `analyze()` (highlights + números + clipes sugeridos)
- [ ] Botão "Exportar recap (.md)" na tela de Relatórios + copiar pro clipboard
**Recap ao vivo (heurístico, local)**
- [ ] Detector de gatilho: comando `!recap` no chat + (opcional) salto de viewers
- [ ] Gerador templated (título/jogo + markers + picos de chat + alertas recentes)
- [ ] Saída em **overlay** (browser source) com cooldown
- [ ] (depende de envio) postar o recap no chat — ver ENVIO.md
**Pago (nuvem)**
- [ ] Resumo por IA (LLM sobre chat/transcrição) — server-sided
- [ ] Página de recap hospedada + thumbnails
- [ ] STT na nuvem pra recap com transcrição
