# Ideias de features — v3 (fora da caixinha)

> Terceira leva — agora **criativa**, sem medo de ser ousada. O filtro: ideias que **só a Corneta
> consegue fazer** porque ela está num lugar único — entre o OBS e todas as plataformas, vendo **o
> sinal de vídeo E todos os chats ao mesmo tempo**, local e em tempo real. Ninguém mais (OBS,
> StreamElements, as próprias plataformas) tem esse ponto de vista completo.

- **Status:** Exploração / sonho · 2026-06-24
- **Relacionado:** [`IDEIAS.md`](./IDEIAS.md) (QoL), [`IDEIAS-v2.md`](./IDEIAS-v2.md) (IA/alcance), [`ALERTAS.md`](./ALERTAS.md), [`ENVIO.md`](./ENVIO.md)

---

## 0. A vantagem injusta, levada ao extremo

A Corneta é **a única coisa** que, ao mesmo tempo:
1. **vê os frames que estão saindo** (passa pelo MediaMTX → FFmpeg), e
2. **vê todos os chats** (Twitch/YouTube/Kick num feed só), e
3. roda **local** (sem servidor, baixa latência, acesso à máquina), e
4. é **cross-platform por natureza**.

Tudo abaixo nasce de cruzar esses quatro. Não é "mais um overlay" — é coisa que **precisa** desse
ponto de observação pra existir.

---

## 1. 🛡️ A Corneta como GUARDIÃ (porque o sinal passa por nós)

> A pesquisa confirmou: streamers vazam segredo **"a cada ~6h de tela"** (email, senha, **API key**,
> endereço, notificação de mensagem) — e **não existe** detecção automática em tempo real disso. É
> um buraco gritante. E só dá pra fazer **no caminho do sinal** — que é exatamente onde a Corneta está.

- **Anti-vazamento (o headliner).** Visão/OCR nos frames de saída → detecta **segredo na tela**
  (email, senha, chave de API, CPF, endereço, um pop-up de mensagem) e **borra na hora / avisa /
  corta pro BRB** antes de ir pro ar. Pode começar simples: OCR de texto (Tesseract local) +
  padrões (regex de email/chave/CPF) + detecção de janelas de notificação. É *a* feature que
  ninguém tem.
- **Botão de pânico.** Um atalho → **mute + congela/BRB + esconde a cena** instantâneo. Alguém entrou
  no quarto, popup gritante, precisa sair AGORA. Segurança de um toque.
- **Delay de proteção ("oops, volta").** Um buffer de alguns segundos na saída que o streamer pode
  **desfazer** se algo vazou/saiu errado — o delay da TV ao vivo, só que local e seu.
- **Detector de "você sumiu" / dead air.** Sem áudio + sem movimento por X → cutuca o streamer (ou
  ativa o BRB). Cruza sinal + tempo.

---

## 2. 🤝 UMA COMUNIDADE SÓ (porque vemos todos os chats)

> A dor secreta do multistream: a comunidade fica **fragmentada** — o pessoal da Twitch não vê o do
> YouTube, e vice-versa. **Só a Corneta vê todos.** Transformar a fragmentação em feature:

- **Placar entre plataformas.** "Twitch vs YouTube vs Kick" — barra de **hype por plataforma**,
  rivalidade saudável, "qual chat tá mais animado agora". A fragmentação vira **gincana**.
- **Shoutout cross-platform.** Alguém do YouTube faz algo (sub, raid, mensagem épica) → aparece num
  overlay **pra todos**, inclusive a Twitch. Todo mundo sente que é **uma comunidade só**.
- **Leaderboard unificado.** Ranking de quem mais interage **somando todas as plataformas**
  (mensagens + bits + subs + donates) → um "fã do mês" cross-platform. Pertencimento.
- **Primeiro de cada plataforma.** Destaca quem chegou primeiro / quebrou o gelo em cada chat.

---

## 3. 🎮 O CHAT DIRIGE O SHOW (donos do chat + do overlay)

> Interatividade que só fecha porque a Corneta é dona **do chat unificado** e pode **disparar o
> overlay**. E o melhor: **um voto = uma pessoa**, agregando todas as plataformas de forma justa.

- **Votação/comando que mexe na cena.** O chat vota e a Corneta dispara um **evento** (efeito, som,
  troca de overlay, mini-desafio). "Chat plays", cross-platform.
- **Hype meter que destrava coisas.** O medidor enche com a atividade do chat → ao encher, dispara
  uma **recompensa** (confete, um som, libera um clipe, um sorteio). Gamifica participar.
- **Mini-games da live.** Enquete-relâmpago, bingo, "digite 🔥 pra…", sorteio — orquestrado pela
  Corneta agregando **todas** as plataformas num placar só.

---

## 4. 🎬 A LIVE SE CONTA SOZINHA (sinal + chat + tempo, costurados)

- **Máquina do tempo com chat embutido.** O buffer de *backtrack* + o chat **sincronizado no tempo**
  → clipe instantâneo que **já mostra o que o chat falou naquele momento**. Um clipe que vem com a
  **plateia embutida** — ninguém faz isso porque ninguém tem as duas coisas alinhadas.
- **Capítulos automáticos.** Detecta viradas (picos de chat, silêncio, troca de jogo/cena) → gera
  **capítulos/timestamps** pro VOD sozinho.
- **"Previously on…" pra quem chega atrasado.** Viewer novo → um **recap de 20s** (do chat/áudio)
  num canto/overlay, pra ele se situar **sem encher o chat de "o que tá rolando?"**.
- **Página de recap pós-live** auto-gerada (melhores momentos + números + clipes sugeridos) — pronta
  pra postar e divulgar a próxima.

---

## 5. 🧠 O PRODUTOR — copiloto DO STREAMER (não do público)

> Não é um chatbot-persona (isso é Streamer.bot). É um **diretor no seu ouvido**. O multistream joga
> **informação demais** na sua cara (3 chats!); o Produtor **filtra o que importa** e te cutuca.

- Painel (ou *whisper*) privado cruzando chat + sinal:
  - *"pergunta repetida 3×, quer responder?"*
  - *"ânimo do chat caindo"* · *"chat bombando — tá rolando um momento"*
  - *"você não fala com o YouTube há 20min"*
  - *"dead air há 30s"* · *"bateu 4h ao vivo — respira"*
- **Ponto eletrônico (TTS só no seu fone).** O Produtor **fala no seu ouvido**, o público não ouve.
- É o **segundo cérebro** que o multistream pede.

---

## 6. 💚 ANTI-BURNOUT & CONSISTÊNCIA (cuidar de quem tá do outro lado)

- **Lembretes de saúde** na live longa: água, postura, pausa — cruzando com o sinal (parado há X).
- **Streak/consistência + warm-up pré-live** (checklist + aquecimento de voz + blocos de conteúdo).
- **Modo foco:** esconde o que dá ansiedade (contador de viewers) ao vivo; mostra só no relatório.

---

## 7. 🌌 MOONSHOTS (as bem fora da caixinha)

- **Overlay generativo reativo ao vibe.** O clima do chat dirige o **visual** (tema, partículas,
  intensidade da música). A live "sente" o público.
- **Vertical automático AO VIVO.** Detecta um momento quente (pico de chat + áudio) e **já gera o
  9:16** na hora — pra postar no Shorts/TikTok **enquanto ainda tá quente**.
- **Raid inteligente cross-platform.** No fim, acha streamers pequenos **ao vivo agora** na sua
  categoria pra mandar raid — espalha audiência e cria rede.
- **Ponte de co-stream.** Une dois streamers (chats fundidos, "modo dueto") **sem depender da
  plataforma** — porque a ponte é local, na Corneta.

---

## 8. Matriz (ousadia × valor × só-a-Corneta-faz × esforço)

| Ideia | Ousadia | Valor | Só nós | Esforço |
|---|---|---|---|---|
| **Anti-vazamento (guardião)** | 🟣🟣🟣 | 🟢🟢🟢 | ✅✅ | 🔴 |
| **Botão de pânico** | 🟣 | 🟢🟢 | ✅ | 🟢 |
| **Placar entre plataformas** | 🟣🟣 | 🟢🟢 | ✅✅ | 🟡 |
| **Shoutout / leaderboard cross-platform** | 🟣🟣 | 🟢🟢 | ✅✅ | 🟡 |
| **Hype meter / chat dirige a cena** | 🟣🟣 | 🟢🟢 | ✅ | 🟡 |
| **Máquina do tempo com chat embutido** | 🟣🟣🟣 | 🟢🟢 | ✅✅ | 🔴 |
| **O Produtor (copiloto)** | 🟣🟣 | 🟢🟢🟢 | ✅ | 🟡 |
| **Capítulos / recap automáticos** | 🟣 | 🟢🟢 | ✅ | 🟡 |
| **Vertical automático ao vivo** | 🟣🟣🟣 | 🟢🟢 | ✅ | 🔴 |
| **Overlay generativo / vibe** | 🟣🟣🟣 | 🟢 | ✅ | 🔴 |

---

## 9. Minhas apostas criativas (top 4)

1. **🛡️ Anti-vazamento (guardião).** O **headliner do v3**. Resolve uma dor real, cara e **sem solução
   pronta**, e **só dá pra fazer no caminho do sinal** — ou seja, é praticamente exclusivo da
   Corneta. Mesmo a versão simples (OCR + regex de email/chave/CPF + detector de pop-up) já é ouro.
2. **🤝 Uma comunidade só (placar + shoutout + leaderboard).** Pega a **maior fraqueza** do multistream
   (comunidade fragmentada) e vira **o maior diferencial**. Barato-ish, altíssimo encaixe, e
   emocional (pertencimento).
3. **🧠 O Produtor (copiloto do streamer).** O antídoto pra "informação demais" do multistream. Começa
   com heurísticas baratas (repetição, silêncio, "sumiu do YouTube") e cresce.
4. **🎬 Máquina do tempo com chat embutido.** A ideia mais "uau" de clipe que existe — e a gente tem as
   **duas peças alinhadas** (buffer de vídeo + chat no tempo). Ninguém faz.

---

## 10. O que **não** fazer (mesmo sendo criativo)

- **Chatbot-persona de IA** que conversa como "a Corneta" — o Produtor fala **com você**, não
  *finge ser* um membro do chat. (Território do Streamer.bot.)
- **Visão/IA pesada obrigatória na nuvem** — o guardião e os detectores devem rodar **local**
  (OCR/heurística), com nuvem opcional. Mantém "sem login/sem servidor nosso".
- **Prometer detecção perfeita** (o anti-vazamento pega muito, não tudo) — vender como **rede de
  segurança**, com a honestidade de sempre.
- **Virar editor de vídeo completo** — o vertical-ao-vivo *sugere/gera o corte quente*; edição fina
  é de ferramenta dedicada.

---

## 11. Próximo passo sugerido

Se uma dessas te animar, a de **maior impacto-por-ousadia** é o **anti-vazamento** — dá pra fazer um
doc de planejamento (captura de frame do MediaMTX → OCR local → regras → borrar/avisar/BRB) e um MVP
focado só em **texto sensível** (email/chave/CPF/pop-up de mensagem). Alternativa de ROI rápido e
muito emocional: **"uma comunidade só"** (placar + shoutout cross-platform), que só costura o chat
unificado que já temos.

---

## Fontes
- [Mozilla — How Twitch streamers protect privacy](https://blog.mozilla.org/en/internet-culture/how-twitch-streamers-protect-privacy/) · [Kaspersky — Privacy & security for Twitch streamers](https://www.kaspersky.com/blog/twitch-streamers-privacy-and-security-howto/48791/) · [Bitdefender — Prevent doxxing as a creator](https://www.bitdefender.com/consumer/support/answer/106603/)
- [Futurism/Vocal — The Rise of Interactive Live Streaming (2026)](https://vocal.media/futurism/the-rise-of-interactive-live-streaming-how-real-time-content-is-reshaping-digital-entertainment-in-2026) · [Boomset — The Future of Interactive Streaming Content](https://boomset.com/the-future-of-interactive-streaming-content/)
- [nanocosmos — Real-Time Streaming Trends 2026](https://www.nanocosmos.net/blog/real-time-streaming-trends/)
