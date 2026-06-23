# Ideias de features — melhorar a vida do streamer

> Levantamento + reflexão sobre o que a Corneta poderia fazer pra valer mais no dia a dia de quem
> transmite. Baseado em pesquisa de concorrentes e dores reais, cruzado com a arquitetura que já temos.

- **Status:** Exploração / backlog de ideias · 2026-06-23
- **Relacionado:** [`PENDENCIAS.md`](./PENDENCIAS.md), [`ALERTAS.md`](./ALERTAS.md), [`ENVIO.md`](./ENVIO.md), [`RELATORIO-POS-LIVE.md`](./RELATORIO-POS-LIVE.md)

---

## 0. O que a pesquisa mostrou

**Concorrentes e o que fazem bem:**
- **Aitum Multistream** (plugin OBS, grátis): saída RTMP múltipla *local*, **resolução diferente por plataforma**, **trilhas de áudio separadas** por destino, vertical + horizontal lado a lado. Custo: pesa no hardware/banda.
- **Restream** (relay na nuvem): você sobe **um** stream e eles **rebroadcastam pra 30+** plataformas dos servidores deles → **não pesa na sua banda**. Tem multichat e analytics. Pago pra tirar marca d'água.
- **Streamlabs**: multistream é recurso **pago** (Ultra).
- **Aitum Vertical**: segundo canvas **9:16** pra TikTok/Shorts/IG, **scene linking** (troca de cena no horizontal troca no vertical junto) e **backtrack** (replay dos últimos 20–60 s).
- **Streamer.bot / Advanced Scene Switcher**: automação por eventos (chat, áudio, timers), **soundboard**, **TTS**, moderação.
- **Source Record / Eklipse**: gravação limpa por fonte e **detecção de highlights por IA** pra clipe.

**Dores recorrentes de streamer:** gestão de **áudio** (trocar device, DMCA), **engajamento**, **banda/hardware** no multistream local, **fazer clipe** (catar na mão), e **setup complexo**.

---

## 1. Reflexão: onde a Corneta tem vantagem injusta

Duas coisas definem nossa melhor jogada:

1. **Arquitetura de relay local (MediaMTX + 1 FFmpeg por destino).** Diferente de um plugin que só abre saídas RTMP, a Corneta **tem o sinal passando por ela**. Isso destrava **gravar**, **clipar**, **trocar a fonte por um slate** e **reenquadrar** — coisas que um plugin "burro" de saída não faz. E o mesmo desenho vira **relay na nuvem** (BYO-VPS) pra economizar banda, tipo Restream.

2. **Já somos donos de dados que ninguém cruza:** **chat unificado + alertas + métricas da sessão (relatório)**. As features de maior alavancagem são as que **conectam esses dados** — ex.: "pico de chat → sugestão de clipe", "alerta de raid → clipe automático". Isso é território que nem Aitum nem Restream ocupam.

> **Tese:** não competir no "abrir mais saídas RTMP" (Aitum já é ótimo e grátis). Brilhar em **(a)** transformar o sinal (vertical, slate, gravação/clipe) e **(b)** usar o que já sabemos (chat/alertas/sessão) pra gerar valor — clipes, resiliência e insight.

---

## 2. Matriz (valor × esforço × encaixe na arquitetura)

| Ideia | Valor | Esforço | Encaixe | Já planejado? |
|---|---|---|---|---|
| Tela **"JÁ VOLTO"** quando cai o sinal | 🟢🟢🟢 | 🟡 | ✅ ótimo | não |
| **Aviso no celular/Discord** se um destino cai | 🟢🟢🟢 | 🟢 | ✅ ótimo | não |
| **Gravação local** (MediaMTX → disco) | 🟢🟢🟢 | 🟢 | ✅ ótimo | parcial |
| **Replay/clipe instantâneo** (backtrack) | 🟢🟢🟢 | 🟡 | ✅ ótimo | não |
| **Clipes sugeridos por pico de chat** (no relatório) | 🟢🟢 | 🟡 | ✅ único | não |
| **Reframe vertical** (TikTok/Shorts/IG) | 🟢🟢🟢 | 🔴 | ✅ bom | citado |
| **Áudio por plataforma** (DMCA-safe) | 🟢🟢 | 🟡 | ✅ bom | não |
| **Contador de viewers somado** (todas plataformas) | 🟢🟢 | 🟡 | ➖ ok | não |
| **Cloud relay BYO-VPS** (economiza banda) | 🟢🟢🟢 | 🔴 | ✅ bom | planejado |
| **Auto-bitrate** quando a banda aperta | 🟢🟢 | 🔴 | ✅ bom | não |
| **Início agendado** | 🟢 | 🟢 | ➖ ok | não |
| **Soundboard / som no alerta** | 🟢 | 🟡 | ➖ ok | não |

---

## 3. As ideias, por tema

### 🎬 Conteúdo: clipes & VOD (onde a Corneta pode surpreender)
- **Gravação local da sessão** — o MediaMTX grava o sinal em disco (`record: yes`) enquanto você transmite. Vira **VOD/backup** e matéria-prima pra clipe. Quase de graça (já temos o MediaMTX no meio).
- **Replay/clipe instantâneo (backtrack)** — buffer rolante dos últimos ~30–60 s; um **atalho** salva esse trecho como `.mp4`. É o recurso que o pessoal mais ama no Aitum. Encaixa porque o sinal passa pela Corneta.
- **Clipes sugeridos por pico de chat** — no **relatório pós-live**, marcar automaticamente os momentos em que o **chat explodiu** (mensagens/min acima da média) ou em que **caiu um alerta forte** (raid/donate). Se houver gravação, cada pico vira um **link com timestamp** pra clipar. *Isto usa dados que já temos* — ninguém faz cruzando multi-plataforma.
- **Auto-clipe em alerta** — raid grande ou super chat gordo → salva o backtrack sozinho. Junta os três de cima.

### 📡 Resiliência: não cair / não perder audiência
- **Tela "JÁ VOLTO"** — hoje, se o OBS some, o FFmpeg morre e a plataforma marca *offline*. Em vez disso, a Corneta podia **trocar a fonte por um slate** (imagem + música) e **manter a live de pé** até o sinal voltar. Estende direto o estado **"Aguardando sinal"** que acabamos de criar.
- **Aviso no celular/Discord** — webhook do Discord (ou push) quando um destino **cai/dá erro**. Você tá jogando, nem percebe que o YouTube caiu — a Corneta avisa. Barato e salva live.
- **Auto-bitrate** — quando o relatório detecta congestionamento, **baixar o bitrate** daquele destino automaticamente (respawn do FFmpeg com preset menor) em vez de ficar derrubando.

### 📲 Alcance & formato
- **Reframe vertical** (TikTok/Shorts/IG) — segundo "enquadramento" 9:16 a partir do sinal landscape, com **preview de corte** e envio simultâneo. Já está citado no PENDENCIAS e o modo híbrido já transcoda vertical — falta a **UI de enquadrar**. É o maior diferencial de alcance, mas é o de maior esforço.
- **Áudio por plataforma (DMCA-safe)** — silenciar a música só pra Twitch (DMCA) mantendo no YouTube, ou trilhas diferentes por destino. O FFmpeg por destino já isola — dá pra mapear áudio por target.
- **Resolução/bitrate por plataforma** — já dá no modo transcode (preset por destino); falta deixar **explícito e fácil** ("manda 720p pro Facebook, 1080p pra Twitch").

### 💬 Engajamento
- **Overlay de alertas + metas (goals) + TTS** — já desenhado nas fases 3–4 do [`ALERTAS.md`](./ALERTAS.md).
- **Enviar/moderar o chat** pela Corneta — já desenhado no [`ENVIO.md`](./ENVIO.md).
- **Contador de viewers somado** — um número só com a audiência de **todas** as plataformas ao vivo (Twitch/YouTube/Kick têm endpoints de viewers). Dopamina diária e fácil de exibir (na bandeja, na sidebar, num overlay).
- **Soundboard / som no alerta** — tocar um som quando entra sub/raid; ou botões de som por atalho. Engajamento barato.

### 🎛️ Controle & automação
- **Início agendado** — programar a multitransmissão pra começar num horário (e avisar "faltam 5 min").
- **Mais ações no atalho global / Stream Deck** — além de começar/parar, expor **pausar destino**, **marcar momento**, **clipe**, **mute** como atalhos (já temos o plugin de global-shortcut).

---

## 4. Minhas recomendações (top 5, por ordem de "bang for the buck")

1. **Aviso no celular/Discord quando um destino cai** 🟢 — minúsculo, evita a pior dor (descobrir 40 min depois que o YouTube caiu).
2. **Gravação local + clipe instantâneo (backtrack)** 🟡 — o MediaMTX entrega a gravação quase de graça; o clipe por atalho é o recurso que mais encanta. Vira pilar de "repurpose de conteúdo".
3. **Clipes sugeridos por pico de chat no relatório** 🟡 — usa **dados que já temos**, fecha o ciclo com a gravação e é **diferencial nosso** (multi-plataforma). 
4. **Tela "JÁ VOLTO" no sumiço do sinal** 🟡 — transforma o estado "Aguardando sinal" em algo que **protege a audiência**, não só informa.
5. **Contador de viewers somado** 🟢 — simples, satisfatório, todo dia.

> Os quatro primeiros se reforçam: gravação → clipe → "pico de chat vira clipe" → e o slate usa o mesmo "trocar a fonte". É uma **família coerente** em cima do fato de o sinal passar pela Corneta.

---

## 5. O que **não** fazer (e por quê)

- **Editor de vídeo completo / cenas / overlays de fonte** — é trabalho do **OBS**. A Corneta entra **depois** do OBS; duplicar isso é briga perdida.
- **Bot de chat completo (comandos, timers, loyalty points)** — território do **Streamer.bot/Nightbot**. Podemos **enviar/moderar** (ENVIO), mas não virar plataforma de bot.
- **Ser "mais um Restream na nuvem"** com servidor nosso — custo de infra e suporte. O caminho é **BYO-VPS** (o usuário traz o servidor), não hospedar.
- **Detecção de highlight por IA pesada no cliente** — caro/frágil. Nosso atalho é **pico de chat + alertas** (heurística barata e específica), não visão computacional.

---

## 6. Próximo passo sugerido

Se topar, eu começaria por um **doc de planejamento da "família de conteúdo"** (gravação → clipe → clipes por pico de chat) — é o conjunto de maior valor com encaixe perfeito na arquitetura — ou pela dupla barata **aviso no Discord + tela "JÁ VOLTO"**, que entrega resiliência rápido.

---

## Fontes
- [StreamYard — Best Multistreaming Software 2026](https://streamyard.com/blog/best-multistreaming-software-2026)
- [Restream — Why Restream beats multistreaming plugins](https://restream.io/blog/why-restream-beats-multistreaming-plugins/)
- [Aitum — automation tool for streamers](https://aitum.tv/) · [Aitum Vertical](https://aitum.tv/vertical/)
- [NearStream — Aitum Multistream OBS guide](https://www.nearstream.us/blog/how-to-use-aitum-multistream-obs-plugin)
- [Best OBS Plugins 2026 (VPE)](https://getvpe.com/resources/blog/best-obs-plugins) · [GitHub — Awesome OBS Plugin List](https://github.com/streamgeeks/Awesome-OBS-Plugin-List)
- [Streamer.bot — Features](https://streamer.bot/features)
- [Eklipse — Clipping software for gaming streamers 2026](https://blog.eklipse.gg/tools/clipping-software-for-gaming-streamers.html)
- [EarlyGame — Common pain points with live streaming](https://earlygame.com/entertainment/common-pain-points-live-streaming)
