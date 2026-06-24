# Anti-vazamento (Guardião de privacidade) — planejamento técnico

> Quando um **termo que o usuário definiu** aparece na tela, corta pro slate **"JÁ VOLTO"** ANTES
> de ir ao ar (preventivo, via buffer). Só dá pra fazer **no caminho do sinal** — onde a Corneta está.

- **Status:** ✅ **Guardião de privacidade (slate por watchlist, delay fixo)** — ver REDESIGN abaixo · 2026-06-24
- **Relacionado:** [`MONETIZACAO.md`](./MONETIZACAO.md), [`FEATURE-PROTETOR-BUFFER.md`](./FEATURE-PROTETOR-BUFFER.md) (o buffer), [`FEATURE-OCR-GPU.md`](./FEATURE-OCR-GPU.md) (por que OCR na CPU)

---

## ⚠️ REDESIGN (2026-06-24) — a abordagem "OCR tudo + tarja na região" NÃO era viável

O OCR de tela cheia ao vivo lê TODAS as linhas de texto → ~3s (até 10s) numa tela cheia tipo
Google Search → mais que o buffer → a tarja não aparecia. Pior: ler "qualquer segredo" gera falso
positivo (todo e-mail público vira alarme). A feature foi **repensada** pra ser viável e honesta:

1. **Slate, não tarja por região.** Ao detectar, troca a tela INTEIRA pelo "JÁ VOLTO" (binário) →
   não precisa de OCR preciso de POSIÇÃO, só saber SE o termo está na tela.
2. **Delay fixo (`GUARD_DELAY_SEC` = 6s), não configurável.** É o mínimo que viabiliza o preventivo
   (cobre o pior caso de OCR ~3s com folga).
3. **Só termos EXPLÍCITOS do usuário** (watchlist). Sem padrões genéricos (email/CPF/cartão) →
   zero falso positivo; só age no que o usuário listou.
4. **Diff pra pular OCR** (tela igual → reusa) + **OCR cheio forçado a cada ~3s** (rede de segurança
   < delay → pega até o que o diff perdeu) + **OCR na CPU** (a GPU é do codec; ver FEATURE-OCR-GPU).

O texto abaixo é o planejamento ORIGINAL (histórico) — partes (regiões/tarja/padrões genéricos)
foram descartadas no redesign.

---

## 0. Objetivo e princípio

Streamers vazam segredo **"a cada ~6h de tela"** e **não existe** detecção automática em tempo real.
A Corneta já tem os frames de saída (passam pelo MediaMTX). Objetivo do MVP: **detectar + avisar**
texto sensível; auto-borrar/cortar vem depois (precisa do buffer de atraso).

**Tudo local** (OCR + regras na máquina) → grátis. Nada de frame sai do PC.

---

## 1. Arquitetura (data flow)

```
OBS ──RTMP──> MediaMTX ──┬──> FFmpeg por destino ──> plataformas   (já existe)
                         └──> [amostrador de frames] ──> OCR local ──> regras ──> AÇÃO
```

1. **Amostrador de frames.** Um FFmpeg dedicado lê o path do MediaMTX e cospe ~2 quadros/s,
   reduzidos: `ffmpeg -i rtmp://127.0.0.1:<porta>/<path> -vf fps=2,scale=1280:-1 -f image2pipe -c:v mjpeg -`.
   Lê o pipe quadro a quadro (reaproveita a lógica do `capture_frame`, mas contínuo). 2 fps já pega
   texto que fica >0,5s na tela.
2. **OCR local.** Cada quadro → texto + *bounding boxes*. Opções: **Tesseract** (binário empacotado
   como sidecar, ou a crate `leptess`). Rodar em escala reduzida pra velocidade; idiomas pt+en.
3. **Regras.** Casa o texto contra padrões (abaixo) + a **watchlist do usuário** (o nome real, o
   endereço, o e-mail dele). Confiança alta vs baixa.
4. **Ação** (configurável): **avisar** (toast in-app + som + miniatura do quadro + qual padrão);
   Fase 2: **borrar a região** ou **cortar pro BRB** (`run_slate`, que já existe).

---

## 2. Detecção (regras)

Padrões de alto valor (regex + validação), rodando sobre o texto do OCR:
- **E-mail**, **telefone**, **CPF** (com dígito verificador), **cartão** (Luhn).
- **Chaves de API / segredos:** `sk-…`, `ghp_…`, `AIza…`, `xox[baprs]-…`, `AKIA…` (AWS), JWT
  (`eyJ…\.…\.…`), strings tipo `password=`/`senha:` seguidas de valor.
- **Pop-up de notificação:** heurística — bloco retangular pequeno com texto surgindo num **canto**
  da tela (toast do Windows/Discord). MVP pode focar no texto ("nova mensagem de…") e deixar a
  detecção geométrica pra Fase 2.
- **Watchlist do usuário:** termos que ele cadastra (endereço, nome real, placa, @ pessoal).

**Confiança:** chave de API / CPF / cartão = alta (aviso forte). E-mail/telefone = média (o dele
pode ser intencional → whitelist). Watchlist = alta.

---

## 3. Fases

- **Fase 1 (MVP) — Detectar + Avisar.** Amostrador + OCR + regras + **alerta visual/sonoro** no app
  (e um log "vazamentos pegos"). O streamer reage: esconde a janela / aperta o **botão de pânico**
  (mute + BRB num atalho — feature irmã, barata).
- **Fase 2 — Buffer de atraso ("oops, volta") + auto-ação.** A Corneta republica o sinal com **N
  segundos de atraso** (re-encode com latência), criando a **janela** pra detectar **antes** de
  airar. Na detecção: **borra a região** (overlay dinâmico no FFmpeg) ou **corta pro BRB**. É a parte
  pesada (re-encode + filtro dinâmico) — daí ser fase separada.
- **Fase 3 (paga, nuvem) — Visão melhor.** Modelo de visão na nuvem: rostos, documentos, objetos,
  OCR mais robusto em fonte de jogo. Server-sided → pago.

---

## 4. Casos de borda & decisões

- **Falso positivo:** nunca cortar sozinho em confiança baixa — só avisar. Auto-cortar só padrões de
  altíssima confiança (chave/CPF/cartão) **e** só na Fase 2 (com o buffer).
- **Info que é OK mostrar:** whitelist (o e-mail/loja do próprio streamer).
- **Performance:** 2 fps + escala reduzida + OCR só na thread do amostrador; *throttle* se a CPU
  apertar (a Corneta já monitora CPU). Pular quadros idênticos (hash rápido) pra não OCR-ar repetido.
- **Fonte de jogo / texto estilizado:** OCR erra — vender como **rede de segurança**, não garantia.
- **Privacidade:** Fase 1/2 **100% local**, frame nenhum sai do PC. Só a Fase 3 (opt-in, paga) manda
  pra nuvem, com aviso explícito.

---

## 5. Riscos

- **Re-encode da Fase 2** adiciona latência e custo de CPU — opcional e configurável (o streamer
  escolhe "atraso de proteção: 0/3/6s").
- **OCR pesado** em 1080p — mitigar com escala/throttle; medir antes de subir o fps.
- **Detecção geométrica de pop-up** é frágil — começar só com texto.

---

## 6. Grátis vs pago

- **Grátis (local):** amostrador, OCR (Tesseract), regras/regex, watchlist, aviso, botão de pânico,
  buffer de atraso + auto-borrar/cortar (roda na máquina).
- **Pago (nuvem):** visão avançada (rostos/documentos/objetos), OCR premium. Server-sided.

---

## 7. Próximo passo

MVP focado em **texto sensível**: amostrador (FFmpeg fps=2) → OCR (Tesseract sidecar) → regras
(email/chave/CPF/cartão/watchlist) → **aviso in-app**. Sem buffer, sem auto-ação. Valida a detecção
com baixo risco; o buffer de atraso entra na Fase 2.

---

## 8. TODO (implementação)

**Fase 1 — Detectar + Avisar**
- [ ] Amostrador de frames (FFmpeg `fps=2,scale=1280:-1 -f image2pipe mjpeg`) lendo o path do MediaMTX
- [ ] OCR local (Tesseract sidecar ou crate `leptess`), pt+en, em escala reduzida
- [ ] Hash rápido por quadro pra pular quadros idênticos (não OCR-ar repetido)
- [ ] Engine de regras: regex email/telefone/CPF(validação)/cartão(Luhn)/chaves(`sk-`/`ghp_`/`AIza`/`xox`/`AKIA`/JWT)/`senha=`
- [ ] Watchlist do usuário (endereço/nome/@) nas settings
- [ ] Níveis de confiança + ação configurável por nível
- [ ] Alerta in-app (toast + som + miniatura + padrão) + log "vazamentos pegos"
- [ ] Botão de pânico (atalho → mute + `run_slate`/BRB)
- [ ] Setting on/off + sensibilidade + throttle por CPU
**Fase 2 — Auto-ação** (depende do buffer → ver [`FEATURE-DELAY-PROTECAO.md`](./FEATURE-DELAY-PROTECAO.md))
- [ ] Auto-borrar a região (overlay dinâmico no FFmpeg) em confiança altíssima
- [ ] Auto-cortar pro BRB dentro da janela de atraso
**Fase 3 — Visão na nuvem (paga)**
- [ ] Rostos/documentos/objetos + OCR premium (server-sided)
