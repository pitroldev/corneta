# Ideias de features — v4 (o que está SAINDO está certo?)

> **Snapshot histórico.** O status atual vive em `PENDENCIAS.md` e
> `GATES-DE-RELEASE.md`. Normalização de loudness e metadados cross-platform já foram
> implementados; os itens abaixo preservam o raciocínio original.

> Quarta leva. As três anteriores perguntaram *"o que a Corneta pode **gerar** cruzando sinal + chat?"*
> (clipes, comunidade, legendas, copiloto). O v4 vira a moeda e faz a pergunta oposta — igualmente
> óbvia em retrospecto: **"o que está SAINDO está certo?"** — somada à dor nº1 puramente operacional
> do multistream: **gerir título/categoria/anúncio em N plataformas de uma vez**.
>
> O filtro continua o mesmo: ideias que **só a Corneta consegue fazer** porque ela está num lugar
> único — no caminho do **vídeo E do áudio**, dona do momento exato do **"no ar"**, **local** e
> **cross-platform**. Nada aqui repete o v1/v2/v3 (onde encosta numa fronteira, eu digo qual).

- **Status:** Exploração / backlog · 2026-06-29
- **Relacionado:** [`IDEIAS.md`](./IDEIAS.md) (QoL), [`IDEIAS-v2.md`](./IDEIAS-v2.md) (IA/alcance), [`IDEIAS-v3.md`](./IDEIAS-v3.md) (guardião/comunidade), [`FEATURE-DEAD-AIR.md`](./FEATURE-DEAD-AIR.md), [`FEATURE-ANTI-VAZAMENTO.md`](./FEATURE-ANTI-VAZAMENTO.md), [`PENDENCIAS.md`](./PENDENCIAS.md)

---

## 0. O que a pesquisa de 2026 mostrou (e os v1–v3 não cobriram)

- **Ir ao ar "quebrado" sem perceber é dor crônica.** Tela preta, fonte congelada, mic mudo: a prévia
  do OBS mostra tudo certo, mas o que **sai** está errado — e o streamer só descobre quando alguém
  avisa no chat (ou nunca). As causas mais comuns: fonte de captura errada/janela fechada, mismatch de
  resolução, driver de GPU. Não existe um "confidence monitor" do **output real** acessível.
- **DMCA ficou em tempo real.** A detecção da Twitch integra bases das gravadoras e roda **ao vivo**;
  poucos segundos de música protegida já mutam uma janela de 6 min, e **3 strikes = conta encerrada**.
  As soluções vendidas são *música seseira* (DMCA-safe libraries) — ninguém **avisa ao vivo** que a
  faixa que está tocando agora é arriscada.
- **Áudio é o problema técnico mais reportado.** "Mic baixo / game alto", loudness inconsistente entre
  cenas, sem compressor/normalização. A regra de ouro (game 6–12 dB abaixo da voz; alvo ~-14 LUFS
  integrado) é largamente conhecida e largamente **errada na prática**.
- **Metadados por plataforma é fricção pura.** Título e categoria precisam ser setados (e idealmente
  otimizados) **em cada plataforma**, **toda live**. É a tarefa chata que o multistream multiplica.
- **Retenção dos primeiros 30 s é decisiva.** >1/3 dos viewers saem em 30 s; o algoritmo de 2026
  premia *"durable attention"*. Lulls (loading, fila) e começar com a tela de setup derrubam o início.

---

## 1. A vantagem injusta, no ângulo do v4

Tudo o que os v1–v3 construíram olha pra **dentro** (gerar valor do sinal/chat). Mas estar no caminho
do sinal também dá um superpoder defensivo/operacional que ninguém explorou:

1. **Vemos exatamente o que cada plataforma recebe** (frames + áudio reais saindo pelo MediaMTX →
   FFmpeg). Logo, podemos **auditar o output** — preto/congelado/mudo/estourado — coisa que o OBS
   (que só conhece a *própria* prévia) e as plataformas (que só veem o que chega) não fazem de forma
   cruzada e local.
2. **Somos o ponto que fala com TODAS as APIs** (já temos OAuth em [`auth.rs`](../src-tauri/src/auth.rs)).
   Logo, **um título → todas as plataformas**. Plugin de saída RTMP não faz; bot de nuvem é
   por-plataforma.
3. **Sabemos o instante exato do "no ar"** (a Corneta liga o relay). Logo, o **anúncio** e a
   **sala de espera** disparam no tempo certo, sem polling externo.

> **Tese v4:** as features de maior valor que faltam **não geram nada novo** — elas **garantem que o
> que já sai está certo** e **eliminam a tarefa chata** de operar N plataformas. É o "cinto de
> segurança + painel" que todo multistreamer precisa e ninguém montou no lugar certo (entre o OBS e
> as plataformas).

---

## 2. 🩺 "O QUE ESTÁ SAINDO ESTÁ CERTO?" — Vigia técnico do sinal

> A dor: 40 min de **tela preta / fonte congelada / mic mudo** sem perceber. Só dá pra resolver onde
> o sinal de fato passa — exatamente onde a Corneta está. Diferente do [`FEATURE-DEAD-AIR.md`](./FEATURE-DEAD-AIR.md)
> (que é *"o streamer sumiu"*): aqui é **corretude técnica do que sai**, mesmo com o streamer presente.

- **Confidence monitor local.** Uma janela que **decodifica o que cada destino recebe** (lê de volta
  do MediaMTX/da saída) e mostra **exatamente o que vai pro ar** — não a prévia do OBS. É o "monitor
  de retorno" da TV. Reusa o sinal que já passa por nós e o `capture_frame` que já existe (usado no
  editor vertical).
- **Detector de tela preta / congelada.** Heurística barata sobre os frames de saída: luma média ~0
  (preto) ou frames idênticos por X s (congelado) → **avisa** (notificação nativa + Discord, infra de
  aviso já desenhada no v1) ou **aciona o slate/BRB** que já existe. Pega "esqueci de trocar a cena",
  "a captura do jogo morreu", "a fonte travou".
- **Verificação independente por plataforma.** O FFmpeg só sabe que **enviou** os bytes — não que a
  plataforma está **mostrando**. A Corneta pode **puxar o stream público de volta** de cada destino e
  confirmar que vídeo realmente flui lá. Pega problemas do **lado da plataforma** (ingest com soluço,
  transcode preso) que nenhuma métrica de saída revela.

---

## 3. 🎵 GUARDIÃO DE ÁUDIO — o guardião que faltava

> O v3 fez o guardião **visual** ([anti-vazamento](./FEATURE-ANTI-VAZAMENTO.md): OCR de segredos na
> tela). O **áudio também passa por nós** — e é onde moram dores caríssimas. Mesmo lugar, outro
> sentido.

- **Detecção de música com copyright ao vivo (DMCA).** Fingerprint do áudio que está passando →
  **avisa antes do strike** ("essa faixa pode dar DMCA na Twitch") e oferece **mutar só na Twitch**
  mantendo no YouTube. Isso torna **automático** o *"áudio por plataforma DMCA-safe"* que o v1 só
  desenhou **manual** — agora é o sistema que detecta e age. Vender como **rede de segurança**, não
  como garantia (pega muito, não tudo). É a peça que não existe: o mercado só vende *música segura*,
  não **aviso ao vivo**.
- **Loudness / normalização (LUFS).** Medir o loudness integrado do output (FFmpeg `ebur128`, que já
  roda no nosso caminho) e **avisar/normalizar** pro alvo de plataforma (~-14 LUFS). Mata o
  "tá baixo demais / variando entre cenas" sem o streamer entender de compressor.
- **Balance mic × game.** Detectar quando o áudio do jogo **abafa a voz** (mic abaixo do alvo
  enquanto o desktop domina) e **avisar/duckar**. A regra "game 6–12 dB abaixo da voz" é conhecida e
  raramente seguida; quem está no caminho do mix pode flagrar em tempo real.

> *Fronteira honesta:* **não** virar mixer/console de áudio (isso é OBS/VoiceMeeter). A Corneta só
> **mede, avisa e, no máximo, normaliza/muta** — atua como guardião, não como mesa de som.

---

## 4. 🏷️ METADADOS CROSS-PLATFORM — matar a tarefa chata do multistream

> A fricção que o multistream **multiplica**: setar título e categoria **em cada site, toda live**.
> Único da Corneta porque exige estar no caminho do sinal **e** falar com as APIs de todas as
> plataformas (OAuth já existe em [`auth.rs`](../src-tauri/src/auth.rs)).

- **Título + categoria unificados.** Define **uma vez** na Corneta (antes de ir ao ar) → empurra pra
  Twitch/YouTube/Kick via *set-channel-info*. Com espaço pra **override por plataforma** quando quiser
  (a pesquisa lembra que YT pede SEO, TikTok pede gancho) — mas o **default é um só**. Casa com os
  **perfis** que já existem ("Live de sexta" já carrega título/categoria).
- **Anúncio "estou ao vivo" multi-canal.** No **instante exato** em que a Corneta entra no ar, dispara
  Discord/Telegram/X com título + thumb + links das plataformas. Quick-win: existem bots (Streamcord,
  StreamElements), mas são **por-plataforma/nuvem e dependem de polling**; a Corneta **sabe o momento
  exato, local, sem bot externo**. Marcar como **conveniência**, não headliner — e **não** recriar um
  Streamcord completo, só o gatilho no instante certo.

---

## 5. 🔁 CONSISTÊNCIA & ALGORITMO — segurar os primeiros 30 s

> A pesquisa é dura: >1/3 sai em 30 s e o algoritmo premia *durable attention*. Não dá pra escrever o
> gancho por ninguém, mas dá pra **não desperdiçar o começo** e **manter presença** — reusando a infra
> de **slate** que o BRB já trouxe.

- **"Sala de espera" / Starting soon gerenciada.** A Corneta sobe um **slate de contagem regressiva**
  (com chat já rolando) **antes** de você começar no OBS, deixando a live de pé e a galera chegando —
  em vez de o público cair numa tela de setup. É o mesmo mecanismo do slate "JÁ VOLTO", só que **no
  início**. Ajuda retenção e o sinal de "durable attention".
- **Rerun / Premiere.** Transmitir um **arquivo/VOD como "live"** quando você está fora (rerun de
  melhores momentos, loop temático) pra **manter consistência/presença**. Encaixa trivial: é só **mais
  uma fonte entrando no relay** que já temos.

---

## 6. Matriz (valor × esforço × só-a-Corneta-faz × encaixe)

| Ideia | Valor | Esforço | Só nós | Encaixe |
|---|---|---|---|---|
| **Título/categoria unificados** | 🟢🟢🟢 | 🟡 | ✅✅ | ✅ ótimo (OAuth + perfis prontos) |
| **Detector tela preta/congelada** | 🟢🟢🟢 | 🟢 | ✅✅ | ✅ ótimo (reusa frame+slate+aviso) |
| **Confidence monitor local** | 🟢🟢 | 🟡 | ✅✅ | ✅ bom (decode do output) |
| **Loudness/LUFS (medir+avisar)** | 🟢🟢 | 🟢 | ✅ | ✅ ótimo (`ebur128` já no caminho) |
| **Balance mic × game** | 🟢🟢 | 🟡 | ✅ | ✅ bom |
| **DMCA: música protegida ao vivo** | 🟢🟢🟢 | 🔴 | ✅✅ | ✅ bom (fingerprint do áudio) |
| **Anúncio "no ar" multi-canal** | 🟢🟢 | 🟢 | ➖ ok | ✅ bom (sabe o instante exato) |
| **Verificação independente p/ plataforma** | 🟢🟢 | 🔴 | ✅✅ | ➖ ok (puxa stream público) |
| **Sala de espera / Starting soon** | 🟢🟢 | 🟢 | ✅ | ✅ ótimo (reusa slate do BRB) |
| **Rerun / Premiere** | 🟢 | 🟡 | ➖ ok | ✅ bom (fonte extra no relay) |

---

## 7. Minhas recomendações (top 3)

1. **🏷️ Título/categoria unificados.** A dor **operacional** mais pura do multistream, alto valor,
   **encaixe único** (OAuth + perfis já existem) e esforço médio. Mata uma chatice de **toda** live.
   Headliner do v4.
2. **🩺 Detector de tela preta/congelada (porta de entrada do "vigia técnico").** Barato e altíssimo
   alívio: reusa `capture_frame`, as **notificações** e o **slate/BRB**. É o primeiro tijolo do
   confidence monitor — entrega valor sozinho e abre caminho pro resto do Tema A.
3. **🎵 Guardião de áudio (LUFS + balance primeiro, DMCA depois).** LUFS/balance são baratos
   (`ebur128` já roda no caminho) e atacam **a** dor técnica mais reportada; o **DMCA ao vivo** é a
   aposta ambiciosa que vem em seguida e completa o "guardião" (visual do v3 + auditivo do v4).

> Os três formam o "**cinto de segurança + painel**" do multistreamer: o título certo em todo lugar
> (1), a garantia de que a imagem está no ar (2) e de que o som está bom e seguro (3). Tudo só
> possível **entre o OBS e as plataformas** — onde a Corneta vive.

---

## 8. O que **não** fazer (manter a honestidade dos docs)

- **Não virar mesa de som/mixer** — o guardião de áudio **mede, avisa e normaliza/muta**; mixagem fina
  é do OBS/VoiceMeeter.
- **DMCA não é à prova de bala** — vender como **rede de segurança** (pega muito, não tudo), com a
  honestidade de sempre.
- **Anúncio "no ar" não é um Streamcord** — só o **gatilho local no instante exato**, não uma
  plataforma de notificação com dashboard.
- **Fingerprint/STT de áudio: local quando viável**, nuvem **opcional** — mantém o espírito
  "sem login/sem servidor nosso".
- **Não recriar overlays/cenas de "starting soon" ricos** — é um **slate** simples reusando o BRB, não
  um editor de tela inicial (isso é OBS).

---

## 9. Próximo passo sugerido

Se uma destas animar, a de **maior ROI imediato** é o **detector de tela preta/congelada** (um doc de
planejamento curto: amostrar frame do output → heurística de luma/diferença → avisar/slate, reusando
o que já existe). A de **maior impacto-por-esforço** é **título/categoria unificados** (estender os
**perfis** + chamadas *set-channel-info* nas APIs que já autenticamos em `auth.rs`).

---

## Fontes

- [OneStream — Why Gaming Streamers Struggle with Viewer Retention in 2026](https://onestream.live/blog/viewer-retention-gamer-struggles/) · [Switcher — 8 Multistreaming Best Practices](https://www.switcherstudio.com/blog/best-practices-for-multistreaming) · [StreamYard — What Is Multistreaming (2026)](https://streamyard.com/blog/what-is-multistreaming-complete-guide-2026)
- [Twitch — DMCA & Copyright FAQs](https://help.twitch.tv/s/article/dmca-and-copyright-faqs?language=en_US) · [Meld — Live Stream Music Without a DMCA Strike](https://meldstudio.co/blog/live-stream-music-without-getting-a-dcma-strike/) · [Clypse — Avoid DMCA Strikes (2026)](https://clypse.ai/blog/avoid-dmca-strikes-twitch-clips-2026-guide)
- [OBS Forums — Microphone Normalization](https://obsproject.com/forum/threads/microphone-normalization.10682/) · [OBS Forums — Desktop Audio low on stream, loud in headset](https://obsproject.com/forum/threads/desktop-audio-low-on-stream-loud-in-headset.74936/) · [Quora — Handling game volume when streaming](https://www.quora.com/How-do-you-handle-your-game-volume-when-streaming-on-Twitch)
- [Gumlet — Fix Twitch Studio Black Screen](https://www.gumlet.com/learn/how-to-fix-twitch-studio-black-screen/)
- [StreamScheme — Auto-post when going live](https://www.streamscheme.com/how-to-automatically-post-twitter-tweets-to-discord/) · [Streamcord](https://streamcord.io/) · [StreamElements — Live Announcement](https://docs.streamelements.com/chatbot/modules/liveannouncement)
