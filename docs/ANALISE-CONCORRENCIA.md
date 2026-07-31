# Análise de concorrência — a Corneta como solução unificada

> Existe concorrente tão forte quanto a Corneta? A resposta muda conforme a unidade de
> comparação. Este documento compara **feature a feature, com profundidade**, e depois avalia a
> tese que realmente importa: a de **solução unificada**.

- **Status:** Análise de mercado (desk research) · 2026-07-30
- **Escopo:** internacional. "Concorrente brasileiro" não é a fronteira certa — as ferramentas
  relevantes são globais e chegam aqui sem atrito nenhum.
- **Relacionado:** [`MONETIZACAO.md`](./MONETIZACAO.md), [`PENDENCIAS.md`](./PENDENCIAS.md),
  [`GATES-DE-RELEASE.md`](./GATES-DE-RELEASE.md), [`FEATURE-MESA-P2P.md`](./FEATURE-MESA-P2P.md)

---

## 0. Correção de rumo

A primeira versão desta análise cometeu um erro de enquadramento: comparou **uma** capacidade da
Corneta (o multistream) com o produto inteiro e concluiu fraqueza. É comparar o motor de um carro
com uma oficina.

A tese correta a testar é outra: **existe alguém que entregue o conjunto?** E, dentro do conjunto,
**as peças dos outros são tão fundas quanto as nossas?** É o que este documento responde.

---

## 1. Método e limites

Pesquisa de mesa sobre material público (sites oficiais, documentação, fóruns e reviews de 2026).
**Nenhuma ferramenta concorrente foi instalada e testada** — então "profundidade" aqui significa o
que elas documentam e o que a comunidade relata, não medição direta. Onde a evidência é fraca,
está escrito. Não há número inventado neste documento.

Do lado da Corneta, o inventário vem do **código**, não da documentação: vários
`docs/FEATURE-*.md` estão com status desatualizado (o Recap e o Vertical, por exemplo, aparecem
como "planejamento" e estão implementados).

---

## 2. O mapa: quem disputa cada pedaço

| Capacidade da Corneta | Quem disputa | Tem o resto do pacote? |
|---|---|---|
| Fan-out multiplataforma | **Aitum Multistream** (plugin OBS, grátis), Restream, Castr, Streamlabs | Aitum: não. Restream/Streamlabs: parcialmente |
| Chat unificado + envio | **Restream Chat**, Social Stream Ninja, Chatterino | Restream: sim (nuvem/pago). SSN: não |
| Alertas (nativos + agregador) | **Streamlabs**, **StreamElements** | São o padrão da categoria — e mais fundos que nós |
| Audiência ao vivo somada | Restream, Streamlabs | Sim |
| **Relatório pós-live com diagnóstico causal** | Twitch Stream Health (ao vivo), Livepush (histórico) | **Não achei equivalente** |
| **Proteção de ar (JÁ VOLTO / delay)** | Nada equivalente encontrado | — |
| **Guardião de privacidade (OCR no ar)** | StreamBlur, BlurShield, Stealthly | Escopo bem menor |
| Vertical 9:16 simultâneo | **Aitum Vertical** | Não |
| Overlays de chat/alerta pro OBS | Restream, Streamlabs, StreamElements | Sim, e mais bonitos |
| Co-stream com convidados | **VDO.Ninja**, StreamYard, Restream Studio | VDO.Ninja é mais maduro no P2P |

Leitura imediata: **não existe um concorrente único que cubra a coluna da esquerda.** O que existe
é um *mosaico* — Aitum + Restream Chat + Streamlabs + VDO.Ninja + uma extensão de privacidade. Que
é exatamente o problema que a Corneta se propõe a resolver.

---

## 3. Profundidade, feature a feature

### 3.1 Fan-out multiplataforma — empate técnico, com trocas

**Corneta:** um FFmpeg por destino (métricas e **reconexão independentes por plataforma**), três
modos de encoding (Caprichado / Na lata / Esperto), escolha de encoder (NVENC/QSV/AMF/software),
**auto-bitrate** que baixa a taxa de um destino que engasga em vez de derrubar, **pausar e retomar
um destino ao vivo**, RTMP/RTMPS, endpoint custom, perfis, teste de upload multi-conexão.

**Aitum Multistream:** grátis, dentro do OBS, resolução por plataforma, **encoder por saída**
(inclusive HEVC/AV1 onde a plataforma aceita) e **roteamento de até 6 faixas de áudio** por
destino.

> **Onde eles são mais fundos:** faixas de áudio separadas por plataforma e codecs modernos
> (AV1/HEVC) são coisas que a Corneta **não faz**. É lacuna real.
>
> **Onde nós somos mais fundos:** reconexão e métricas por destino, auto-bitrate, pausar um
> destino sem derrubar os outros. Um plugin dentro do OBS tem dificuldade estrutural aqui, porque
> a saída do OBS é uma só.

**Restream/Castr (nuvem):** você manda **1×** e eles espalham. Estruturalmente melhor pra quem tem
upload ruim — e isso **inverte** o argumento "local é melhor" numa parte relevante do público.

### 3.2 Chat unificado — nós somos mais fundos

**Corneta:** Twitch (IRC), YouTube e Kick; **várias fontes por plataforma** (duas contas Twitch ao
mesmo tempo); emotes nativos + **BTTV/FFZ/7TV**; badges; **moderação** (apagar mensagem, banir,
timeout); **envio de volta** pra Twitch/Kick/YouTube; janela flutuante; overlay pro OBS com filtro
de comandos, fade e limite de mensagens; fonte, timestamps e origem configuráveis.

**Restream Chat:** unifica, permite responder, tem filtro/mute e 20+ templates de overlay. Não
encontrei evidência pública de **BTTV/FFZ/7TV** nem de **moderação nativa** (banir/timeout na
plataforma de origem).

**Veredito:** a Corneta é **mais funda** — sobretudo em emotes de terceiros e moderação, que são
exatamente o que separa "leio o chat" de "uso o chat". Restream ganha em templates prontos.

### 3.3 Alertas — eles são muito mais fundos

**Corneta:** eventos nativos (sub, resub, subgift, bits, raid, member, superchat) + agregadores
Streamlabs/StreamElements, overlay pro OBS com som, posição, escala e duração.

**Streamlabs / StreamElements:** é a categoria deles. Bibliotecas de temas, animações, TTS,
variação por valor, editor visual, alertas por tier, metas e widgets.

**Veredito:** **perdemos, e não é perto.** Nossa entrega é funcional; a deles é um produto inteiro.
O que não é ruim — nós **integramos** com eles em vez de competir.

### 3.4 Relatório pós-live — nossa maior vantagem

**Corneta:** grava NDJSON a cada ~2s durante a live e depois entrega veredito com **causa
provável** ("seu PC não deu conta do encoding" × "a internet não deu conta do upload" ×
"instabilidade da plataforma" × "cena pesada no OBS"), **trechos com problema** com recomendação
acionável e tempo relativo pra achar no VOD, curvas de bitrate/CPU/GPU/render lag do OBS, audiência
e chat **por canal**, seguidores ganhos, momentos pra clipar, comparação com a live anterior,
exportação em HTML/CSV/JSON e recap em PNG pra postar.

**O que existe no mercado:** Twitch **Stream Health** (ao vivo, dentro da Twitch, só Twitch);
Streamlabs documenta a *taxonomia* do problema (lagged = GPU, skipped = encoder, dropped = rede),
mas em artigo de ajuda, não em relatório automático; **Livepush** tem gráficos históricos de
bitrate e quedas.

**Veredito:** **não encontrei nada equivalente.** Existem monitores ao vivo e existem analytics de
audiência. Não achei ninguém que **correlacione** os sinais depois e diga a causa em português de
streamer, com o minuto pra achar no VOD. É a feature mais defensável do produto.

### 3.5 Proteção de ar (JÁ VOLTO, delay, splicer) — sem concorrente identificado

**Corneta:** quando o sinal do OBS cai, a live **não morre** — entra o slate "JÁ VOLTO" e a sessão
RTMP de cada destino segue viva (o `splicer.rs` copia o bitstream sem reencodar). Mais delay
configurável e proteção de buffer.

**Veredito:** não encontrei ferramenta que faça isso. É estruturalmente difícil pra um plugin de
OBS, porque quem caiu foi o próprio OBS.

### 3.6 Guardião de privacidade — mesmo problema, escopo diferente

**Corneta:** OCR (PaddleOCR/ONNX na CPU) lendo o **quadro que vai ao ar**, procurando termos que o
próprio usuário cadastrou (e-mail, nome real, endereço), e disparando o slate preventivo.

**StreamBlur / BlurShield:** extensões de Chrome que borram dados sensíveis **dentro do navegador**.
**Stealthly:** app de macOS que ativa privacidade ao detectar compartilhamento de tela.

**Veredito:** eles cobrem a aba do navegador; nós cobrimos **o que sai no ar** — o quadro composto
pelo OBS inteiro, incluindo jogo, Discord e notificação do Windows. Escopo maior, mesmo problema.
E a existência dessas ferramentas **valida a dor**.

### 3.7 Vertical 9:16 — empate, eles chegaram antes

Corneta recorta por destino com editor de enquadramento; **Aitum Vertical** é a referência
estabelecida e integrada ao ecossistema OBS.

### 3.8 Co-stream (Mesa) — eles são mais maduros

**VDO.Ninja** faz webcam remota → OBS via WebRTC há anos, com os casos de borda resolvidos. A Mesa
está atrás (hoje só LAN, com `MESA_ENABLED = false`). Nosso diferencial projetado é a **integração
nativa com o OBS** (slot fixo, tile JÁ VOLTO em quem cai) — ainda não entregue ao público.

### 3.9 Integração com OBS — nós somos mais fundos que a nuvem

Auto-config via obs-websocket v5, ligar/parar o OBS junto, coleta de `GetStats` (render lag,
congestionamento) que **alimenta o relatório**, criação e posicionamento de browser sources.
Ferramenta de nuvem não tem acesso a nada disso.

### 3.10 Preço

Corneta **grátis e open source**. Restream: grátis com 2 canais e marca d'água, US$ 16/mês por 3
canais, US$ 39 por 5. Streamlabs: multistream só no Ultra, US$ 27/mês. Aitum: grátis.

---

## 4. O placar honesto

| | |
|---|---|
| **Mais fundos que todo mundo** | Relatório pós-live · Proteção de ar · Guardião de privacidade · Chat unificado (emotes/moderação) · Integração com OBS |
| **Empate com trocas** | Fan-out · Vertical · Audiência somada |
| **Mais rasos** | **Alertas** (Streamlabs/StreamElements) · **Co-stream** (VDO.Ninja) · Templates de overlay · Faixas de áudio e codecs por destino (Aitum) |

Cinco vitórias, três empates e quatro derrotas de profundidade. E **nenhum concorrente aparece em
mais de três linhas dessa tabela.**

---

## 5. Por que a tese unificada é forte (e não é só "tem mais coisa")

O argumento fraco da integração é "está tudo num app só". O argumento **forte** é que as peças
**compartilham estado**, e isso produz coisas que a soma de ferramentas separadas não produz:

1. **O relatório só existe porque o app é dono de tudo.** Ele cruza CPU/GPU (sistema), render lag
   (obs-websocket), bitrate por destino (nosso FFmpeg), chat por canal e audiência por plataforma.
   O Restream tem a audiência mas não sabe da sua CPU. O Streamlabs sabe da sua CPU mas não faz
   fan-out com reconexão por destino. **Ninguém tem os dois lados pra cruzar.**

2. **O guardião dispara o slate.** Detectar vazamento só vale se algo agir. Uma extensão de
   navegador detecta e borra a aba; ela não tem como pausar a sua transmissão. Aqui, quem detecta
   e quem controla o ar são o mesmo processo.

3. **O JÁ VOLTO mantém a sessão RTMP viva por destino.** Isso exige ser dono do fan-out. Um plugin
   de OBS não consegue: a saída dele é uma só e, quando o OBS morre, morre com ele.

4. **O chat sabe quais plataformas estão no ar.** Fonte de chat e destino de vídeo são a mesma
   configuração — o usuário configura uma vez.

Essa é a defesa real: **não é um bundle, é um grafo.** Recortar qualquer peça e vender separada
destrói valor. É por isso que o mosaico (Aitum + Restream Chat + Streamlabs + VDO.Ninja) não é
substituto: custa quatro configurações, quatro contas e **nenhuma correlação**.

---

## 6. Onde a tese unificada é frágil

Ser honesto aqui é o que dá crédito ao resto.

1. **Upload multiplicado.** Fan-out local exige N× o upload: três plataformas a 6 Mbps são 18 Mbps
   saindo de casa, contra 6 do Restream. **É a única desvantagem estrutural que dinheiro não
   resolve** — e pesa mais justamente em conexões piores. O auto-bitrate ameniza; não elimina.

2. **Superfície de suporte.** Onze frentes num app grátis, mantido por uma pessoa, são onze fontes
   de ticket. Cada feature ligada é dívida de manutenção.

3. **Distribuição.** O Aitum vive dentro do OBS. A Corneta é app separado pra descobrir, baixar,
   confiar (hoje **sem assinatura** → SmartScreen) e instalar. O atrito de entrada é muito maior
   que o do concorrente mais direto.

4. **"Suite" perde pra "best of breed" em cada categoria isolada.** Quem já usa StreamElements pros
   alertas não troca pelos nossos. A resposta certa não é competir: é **integrar** — que é o que já
   fazemos.

5. **Ponto único de falha.** Se a Corneta cai, caem juntos transmissão, chat, alertas e relatório.
   Ferramentas separadas falham separadamente.

---

## 7. Riscos externos (não são concorrentes, mas mexem na premissa)

- **A Kick corta 50% do pagamento** por hora transmitida simultaneamente em plataforma concorrente.
  Pro parceiro Kick, multistream tem preço direto em dinheiro.
- **A Twitch exige paridade de qualidade** desde que liberou o simulcast (out/2023): o que vai pra
  ela precisa ser igual ou melhor que o resto — o que limita o "Caprichado" na direção mais
  atraente (mandar menos pra Twitch).
- **As plataformas continuam absorvendo features.** Stream Health, chat unificado — tudo que vira
  nativo some da nossa lista de motivos.

---

## 8. O que isso implica

**Posicionamento.** A manchete da LP hoje é multistream. Contra um plugin grátis que já mora dentro
do OBS, essa é a briga com o maior atrito de entrada pelo menor diferencial. A promessa deveria ser
o **grafo**: cuidar da live inteira e contar depois o que aconteceu. O multistream é o meio, não a
promessa.

**A ponta de lança é o relatório.** É a única linha da §4 onde não achei ninguém. É o que eu poria
na primeira dobra.

**Não competir com o que é fundo nos outros.** Alertas e co-stream: integrar, não duplicar. Já
integramos Streamlabs/StreamElements — isso é acerto, não concessão.

**A lacuna do Aitum vale olhar.** Faixas de áudio por destino e AV1/HEVC são pedidos reais de quem
multistreama a sério, e nós não temos.

**Lançar importa mais que qualquer conclusão daqui.** A vantagem descrita só existe pra quem
consegue instalar o app — ver [`PENDENCIAS.md`](./PENDENCIAS.md) e
[`GATES-DE-RELEASE.md`](./GATES-DE-RELEASE.md).

---

## 9. O que não foi verificado

- Nenhuma ferramenta concorrente foi instalada e testada. Profundidade = documentação pública.
- Não achei fonte confirmando se o **Restream Chat** suporta emotes de terceiros (BTTV/FFZ/7TV) ou
  moderação nativa. A §3.2 assume que **não** — confirmar antes de usar isso em comunicação.
- Sem varredura fora do circuito anglófono (CN/KR/RU), onde o mercado de streaming é grande e as
  ferramentas raramente aparecem em busca em inglês.
- Preços conferidos em julho/2026; mudam sem aviso.

---

## Fontes

- [Aitum vs Multiple RTMP — multistream grátis no OBS (2026)](https://www.arthurtully.com/blog/obs-multistream-aitum-vs-multiple-rtmp)
- [Guia do Aitum Multistream — encoders, áudio e vertical](https://www.nearstream.us/blog/how-to-use-aitum-multistream-obs-plugin)
- [Restream Chat — guia completo](https://restream.io/blog/restream-chat-everything-you-need-to-know/)
- [Restream — chat multiplataforma](https://restream.io/chat)
- [Restream — review e preços 2026](https://www.learningrevolution.net/restream-review/)
- [Restream vs Streamlabs — custos e limites](https://talks.co/p/restream-vs-streamlabs/)
- [Twitch Broadcast Health — guia](https://stream-rise.com/blog/guide-to-broadcast-health)
- [Streamlabs — dropped frames, CPU/GPU e qualidade](https://streamlabs.com/content-hub/post/dropped-frames-cpugpu-issues-and-improving-stream-quality)
- [Livepush — monitoramento de bitrate/FPS](https://livepush.io/features/real-time-stream-monitoring.html)
- [StreamBlur — proteção contra vazamento em tela](https://streamblur.com/)
- [BlurShield — extensão de privacidade](https://chromewebstore.google.com/detail/blurshield-privacy-screen/ggfndegeeoidikmemdgnclefonjlpaff)
- [Social Stream Ninja](https://socialstream.ninja/)
- [Regras de simulcast da Twitch em 2026](https://upstream.so/blog/twitch-allows-unified-chat-simulcasting-rules/)
- [Guia de multistreaming 2026 — Twitch, Kick e YouTube](https://streamscharts.com/news/multistreaming-guide-2026-rules-explained)
