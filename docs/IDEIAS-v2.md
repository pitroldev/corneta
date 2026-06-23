# Ideias de features — v2 (era da IA, alcance global)

> Segunda leva de ideias pra melhorar a vida do streamer, focada nos eixos que explodiram em 2026:
> **IA, acessibilidade e alcance global**. Cruzada com a arquitetura da Corneta e com o que já entregamos.

- **Status:** Exploração / backlog · 2026-06-23
- **Relacionado:** [`IDEIAS.md`](./IDEIAS.md) (1ª leva), [`ALERTAS.md`](./ALERTAS.md), [`ENVIO.md`](./ENVIO.md), [`RELATORIO-POS-LIVE.md`](./RELATORIO-POS-LIVE.md)

---

## 0. O que a pesquisa de 2026 mostrou

- **IA virou camada padrão** no streaming: **auto-moderação** que entende contexto (não só palavra-chave), **legendas/tradução em tempo real** (50–100+ idiomas), **detecção de clipe por IA**, e até **co-host/chatbot** que responde o chat.
- **Legendas + tradução ao vivo** são o recurso de maior alavancagem de **alcance**: streams com legenda/tradução por IA reportam **+18–35% de engajamento** e abrem a audiência pra outros idiomas e pra pessoas surdas/com deficiência auditiva. Hoje isso é serviço caro/à parte (SyncWords, Aberdeen, spf.io).
- **Descoberta/retenção** é a dor nº 1 de quem está crescendo: muito conteúdo competindo, pouca ferramenta boa de **insight de retenção** acessível.
- **Monetização** melhorou nas plataformas (Twitch/Kick), mas continua **fragmentada por plataforma**.

---

## 1. Reflexão: a vantagem injusta da Corneta na era da IA

Já estabelecemos (no [`IDEIAS.md`](./IDEIAS.md)) que a Corneta brilha onde **o sinal passa por ela** e onde **ela é dona do chat**. Na era da IA isso fica ainda mais forte:

1. **Temos o ÁUDIO** (passa pelo MediaMTX). Isso destrava **legendas ao vivo** (speech-to-text) e **tradução** — sem depender de um serviço externo caro, e **uma vez só pra todas as plataformas**.
2. **Somos donos do CHAT unificado** (Twitch/YouTube/Kick num feed só). Isso destrava **traduzir o chat de entrada**, **moderar com IA em todas as plataformas de uma vez** e medir o **clima/vibe** do chat — coisas que um bot por-plataforma não faz cruzado.

> **Tese v2:** o multistream serve pra **alcançar mais gente**. A próxima fronteira de alcance não é *mais uma plataforma* — é **mais idiomas e mais acessibilidade**. Legenda + tradução ao vivo, feita uma vez no ponto onde o sinal e o chat já passam, é o diferencial que ninguém no nicho "multistream local" tem.

---

## 2. Matriz (valor × esforço × encaixe)

| Ideia | Valor | Esforço | Encaixe | Obs |
|---|---|---|---|---|
| **Legendas ao vivo** (overlay) | 🟢🟢🟢 | 🔴 | ✅ ótimo | temos o áudio; STT local (whisper.cpp) |
| **Tradução das legendas** (multi-idioma) | 🟢🟢🟢 | 🔴 | ✅ ótimo | abre audiência global; + over the top das legendas |
| **Tradução do chat de entrada** | 🟢🟢 | 🟡 | ✅ único | entender o chat gringo no feed unificado |
| **Auto-moderação com IA no chat unificado** | 🟢🟢🟢 | 🟡 | ✅ único | uma regra pra todas as plataformas (estende ENVIO) |
| **Clima/vibe do chat ao vivo** | 🟢🟢 | 🟡 | ✅ bom | "termômetro" de hype/positividade |
| **Relatório turbinado: retenção & crescimento** | 🟢🟢🟢 | 🟡 | ✅ ótimo | usa os viewers que já pollamos + a sessão |
| **Controle remoto pelo celular** | 🟢🟢 | 🟡 | ✅ bom | start/stop, pausar destino, marcar momento sem alt-tab |
| **Resumo pós-live por IA** | 🟢🟢 | 🟡 | ✅ bom | "como foi a live" em 5 linhas + clipes sugeridos |
| **Co-host/chatbot de IA** | 🟢 | 🔴 | ➖ evitar | território do Streamer.bot |
| **Geração de título/tags por IA** | 🟢 | 🟡 | ➖ ok | ajuda descoberta, mas é por-plataforma |

---

## 3. As ideias, por tema

### 🌍 Acessibilidade & alcance global (o grande eixo novo)
- **Legendas ao vivo** — captura o áudio que já passa pela Corneta → **speech-to-text** (whisper.cpp local, offline, ou um STT na nuvem) → exibe como **overlay** pro OBS (mesma base do overlay de alertas). Acessibilidade + retenção (muita gente assiste sem som).
- **Tradução das legendas** — além da legenda no idioma original, gerar **versões traduzidas** (PT→EN/ES…). Como a Corneta manda **pra várias plataformas**, dá pra pensar em **legenda por destino/idioma** no futuro (ou um overlay com seletor). Isso é alcance que nenhum concorrente local tem.
- **Tradução do chat de entrada** — traduzir mensagens em outro idioma **inline** no chat unificado (com o original no hover). Entender e responder a galera gringa que o multistream atrai.

### 🛡️ Moderação & comunidade (donos do chat)
- **Auto-moderação com IA, cross-platform** — uma camada de moderação (toxicidade/spam, contexto, não só palavra-chave) aplicada a **todas as plataformas de uma vez**, já que o chat é unificado. Marca/oculta/avisa; integra com o "enviar/moderar" do [`ENVIO.md`](./ENVIO.md).
- **Clima/vibe do chat ao vivo** — um "termômetro" (hype 🔥 / positivo / morno / tóxico) a partir de emotes + palavras, mostrado ao vivo (na sidebar/overlay). Heurística barata, dado que já é nosso.
- **Boas-vindas / primeiro-na-live** — destacar quem mandou a primeira mensagem ou chegou agora (cross-platform).

### 📈 Insight & crescimento (donos da sessão + dos viewers)
- **Relatório turbinado** — o [relatório pós-live](./RELATORIO-POS-LIVE.md) já grava a sessão; agora que **pollamos os viewers**, dá pra incluir: **curva de retenção** (viewers ao longo do tempo), **pico/média**, **momentos que ganharam/perderam audiência**, e cruzar com **picos de chat** (os clipes sugeridos do v1). Insight de verdade, não vaidade.
- **Resumo pós-live por IA** — "sua live em 5 linhas": destaques, melhores momentos (timestamps), o que pode virar clipe. Usa chat + alertas + retenção que já temos.

### 🎛️ Controle & conveniência
- **Controle remoto pelo celular** — uma página local (mesmo servidor do overlay) que você abre no celular pra **começar/parar**, **pausar um destino**, **marcar momento** e ver **status/viewers** — sem alt-tab no meio do jogo.
- **Geração de título/tags por IA** (por plataforma) — sugerir título/categoria/tags antes de ir ao ar (ajuda descoberta). Menor encaixe (é por-plataforma), mas barato.

---

## 4. Minhas recomendações (top 4)

1. **Legendas ao vivo + tradução** 🔴 — é o **diferencial de maior alcance** e joga 100% com "temos o áudio". É o de maior esforço, mas é a feature que **muda o patamar** da Corneta (acessibilidade + audiência global). Headliner do v2.
2. **Auto-moderação com IA no chat unificado** 🟡 — valor altíssimo e **só a gente faz cruzado** (uma regra, todas as plataformas). Estende o [`ENVIO.md`](./ENVIO.md).
3. **Relatório turbinado (retenção + resumo)** 🟡 — usa **dados que já temos** (sessão + viewers + chat), fecha o ciclo de "como cresço". Baixo risco, alto valor.
4. **Tradução do chat de entrada** 🟡 — barato, único (donos do chat), e casa com as legendas pra formar o "pacote global".

> Os itens 1 e 4 formam um **"modo global"** coerente: o streamer fala PT, e tanto a **legenda** quanto o **chat** ficam bilíngues — alcançando (e entendendo) gente do mundo todo, em todas as plataformas ao mesmo tempo.

---

## 5. O que **não** fazer (e por quê)

- **Co-host/chatbot de IA conversacional** — é o core do **Streamer.bot/StreamChat AI**. Podemos **moderar/enviar** (ENVIO), não virar persona de IA.
- **Editor de clipe por IA pesado no cliente** (cortes, legendas queimadas, reframe automático) — caro/frágil. Nosso atalho continua sendo **pico de chat + retenção** (heurística barata) pra *sugerir* o clipe; a edição fina é de ferramenta dedicada (Eklipse/StreamLadder).
- **Dublagem por IA (voz traduzida)** — latência e custo altos pra ao vivo; legenda traduzida entrega 90% do valor com 10% do custo.
- **STT/IA só na nuvem como dependência obrigatória** — preferir **local (whisper.cpp)** como padrão, com nuvem opcional. Mantém o espírito "sem login/sem servidor nosso".

---

## 6. Próximo passo sugerido

Se topar, o caminho de maior impacto é um **doc de planejamento das "legendas ao vivo"** (captura de áudio do MediaMTX → whisper.cpp → overlay, com tradução opcional) — é a feature-âncora do v2. Alternativa de menor esforço e ótimo ROI: **relatório turbinado** (retenção + resumo), que só costura dados que já coletamos.

---

## Fontes
- [Two Average Gamers — Complete AI Tool Stack for Twitch Streamers (2026)](https://www.twoaveragegamers.com/the-complete-ai-tool-stack-for-twitch-streamers-2026/)
- [Forasoft — Essential Features of AI-Powered Video Streaming Platforms in 2026](https://www.forasoft.com/blog/article/ai-powered-video-streaming-platforms-features)
- [SyncWords — Live AI Captions & Translations for Live Streams](https://www.syncwords.com/solutions/captions-translations-for-live-streams) · [spf.io — Automatic Captions & Translation](https://www.spf.io/products/automatic-captions-and-translation/) · [Aberdeen — Multilingual Live Streaming](https://aberdeen.io/multilingual-live-streaming/)
- [Eklipse — Best AI Twitch Clip Editor 2026](https://blog.eklipse.gg/tools/ai-twitch-clip-editor.html)
- [StreamLadder — Best Tools for Upcoming Streamers in 2026](https://streamladder.com/blog/the-best-tools-for-upcoming-streamers-in-2026)
- [Throne — How small streamers make money in 2026](https://blog.throne.com/how-small-streamers-make-money-in-2026-real-ways-that-work/)
