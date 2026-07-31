# Plano de SEO, AEO e GEO

> O que fazer para a Corneta ser **encontrada** na busca, **respondida** nos snippets e **citada**
> pelos motores generativos — em ordem de alavancagem, com o que a evidência de 2026 sustenta.

- **Status:** Plano · 2026-07-30
- **Relacionado:** [`ANALISE-CONCORRENCIA.md`](./ANALISE-CONCORRENCIA.md),
  [`DOMINIOS.md`](./DOMINIOS.md), [`PENDENCIAS.md`](./PENDENCIAS.md)

---

## 0. O que já está feito (não refazer)

A base técnica do site é melhor que a da maioria dos concorrentes. Antes de propor qualquer coisa,
vale registrar o que **já existe** em `web/`:

| Peça | Onde | Observação |
|---|---|---|
| Grafo JSON-LD único | `lib/seo.ts` | Organization, WebSite, SoftwareApplication, FAQPage e HowTo referenciados por `@id` |
| Schema honesto | `lib/seo.ts` | sem `aggregateRating` inventado, sem `downloadUrl` enquanto o instalador for placeholder |
| FAQ com fonte única | `lib/content.ts` | a FAQ visível e o `FAQPage` saem da mesma constante — impossível divergirem |
| `/llms.txt` | `app/llms.txt/route.ts` | gerado das mesmas constantes da página |
| Allowlist de agentes de IA | `app/robots.ts` | GPTBot, ClaudeBot, PerplexityBot, Google-Extended e outros, nomeados |
| Canônica que quebra o build | `lib/site.ts` | sem `NEXT_PUBLIC_SITE_URL`, o build falha em vez de publicar apontando pra localhost |
| Sitemap com `lastModified` real | `app/sitemap.ts` | alimentado por `CONTENT_UPDATED_ISO` |
| OG/Twitter + imagem dinâmica | `app/layout.tsx`, `opengraph-image.tsx` | |

**Nada disso precisa de trabalho.** O problema está em outro lugar.

---

## 1. O diagnóstico, em uma frase

> **O site é tecnicamente exemplar e não tem conteúdo nenhum.**

São **três páginas indexáveis**: a home e as duas legais. Não há uma única página que responda a
uma pergunta de cauda longa, nem nada que um modelo possa citar além da home. Um prédio com
fundação de arranha-céu e um andar.

E há três buracos fora do site que pesam mais que qualquer ajuste on-page:

1. **O repositório não está preparado pra ser lido.** Ele vai virar público, mas hoje está sem
   descrição, sem topics e com `homepageUrl` apontando pro domínio da Vercel em vez do canônico.
   Página de repositório é uma das que LLM mais lê sobre software — abrir sem arrumar a vitrine é
   desperdiçar a maior superfície citável que o projeto tem de graça.
2. **A Corneta não aparece em nenhum agregador.** Nas buscas feitas para a
   [análise de concorrência](./ANALISE-CONCORRENCIA.md), os resultados que dominam são AlternativeTo,
   G2, Capterra, fórum do OBS e listas do tipo "10 melhores alternativas ao Restream". A Corneta não
   está em nenhuma delas.
3. **Não existe vídeo.** Ver §3 — é o sinal isolado mais forte que a pesquisa de 2026 identificou.

---

## 2. As três siglas, e o que muda entre elas

| | Pergunta que responde | O que premia |
|---|---|---|
| **SEO** | "como eu apareço na lista de resultados?" | relevância, links, desempenho, rastreabilidade |
| **AEO** | "como eu viro *a* resposta (snippet, PAA, voz)?" | resposta direta e curta, marcação, formato de pergunta |
| **GEO** | "como eu sou **citado** por ChatGPT/Perplexity/AI Overviews?" | consenso entre fontes, presença em terceiros, texto declarativo e verificável |

O erro comum é tratar as três como a mesma coisa. Elas se sobrepõem na fundação — e divergem
exatamente no ponto que interessa: **SEO você constrói no seu site; GEO você constrói fora dele.**

---

## 3. O que a evidência de 2026 diz

Números da pesquisa pública consultada em julho/2026 (fontes no fim):

- **68% das citações de IA vêm de fontes de terceiros**; só 32% do site da própria marca.
  Distribuir o mesmo conteúdo em várias publicações chega a aumentar citações em **325%**.
- **Menção de marca em título e transcrição de vídeo do YouTube é o fator isolado que mais
  correlaciona com aparecer no AI Overviews** do Google.
- O **ChatGPT Search cita a Wikipedia em 47,9%** das dez principais fontes — escrever em voz
  declarativa e enciclopédica melhora as chances de ser copiado.
- Motores com recuperação em tempo real (Perplexity, AI Overviews) julgam a página **pelos
  primeiros ~200 palavras**; uma cápsula de resposta de **40–60 palavras logo abaixo do H1** é o
  formato que eles preferem levantar.
- Páginas com **schema robusto têm ~36% mais chance** de aparecer em resumo gerado por IA.
- **Perplexity premia frescor e conteúdo de comunidade** (fórum, Reddit, GitHub).

### O dado que contraria a intuição: `llms.txt`

A gente já tem, e ele **não deve virar prioridade**:

- o Google declarou que a Busca **não usa** o arquivo (guia atualizado em 15/06/2026);
- num monitoramento de mais de 500 milhões de visitas de bots de IA em 90 dias, **408** buscaram
  `llms.txt` diretamente;
- um modelo da SE Ranking testando correlação com frequência de citação **melhorou de precisão ao
  REMOVER** a variável `llms.txt` — ou seja, o arquivo entrou como ruído, não como sinal.

Do outro lado, a Anthropic recomenda explicitamente o formato e a OpenAI o usa no Agents SDK.

> **Decisão:** manter o `/llms.txt` (custo ~zero, já construído, e a aposta pode virar), e **não
> investir mais um minuto nele**. Ele não é a alavanca que alguém vende por aí.

---

## 4. Prioridades

Ordenadas por alavancagem ÷ esforço. As duas primeiras não têm nenhuma linha de código.

### P0 — Arrumar a vitrine do repositório antes de abrir · esforço: baixo

A abertura já está decidida. O que **não** está pronto é o que o visitante (e o modelo) encontra
quando chegar lá: sem descrição, sem topics, e `homepageUrl` apontando pra
`corneta-web.vercel.app` em vez do domínio canônico.

- [ ] Descrição de uma linha com as palavras que a pessoa busca ("multistream local e gratuito para
      Windows — Twitch, YouTube, Kick")
- [ ] Topics: `multistreaming`, `obs-studio`, `twitch`, `youtube-live`, `kick`, `rtmp`, `tauri`,
      `streaming`, `brasil`
- [ ] `homepageUrl` → `https://www.corneta.live`
- [ ] README como **página de resposta**, não como manual de build: o que é, pra quem, o que faz,
      comparação honesta, capturas. É o arquivo que os modelos leem sobre software.
- [ ] Conferir se `corneta-web.vercel.app` está indexável — se estiver, é conteúdo duplicado
      dividindo sinal com o domínio canônico

> **Por que é P0:** o dia em que o repositório abre é o dia em que ele começa a ser rastreado. Ele
> resolve de uma vez credibilidade, sinal de comunidade (que o Perplexity premia) e uma superfície
> citável — mas só se estiver legível quando isso acontecer. Meia hora de texto, feita **antes**.

### P1 — Entrar onde estão os 68% · esforço: baixo a médio, contínuo

- [ ] **AlternativeTo** — cadastrar como alternativa a Restream, Streamlabs e Castr
- [ ] **Fórum do OBS** — o Aitum tem thread própria lá; é onde o público-alvo procura
- [ ] **Product Hunt** no dia do lançamento
- [ ] **Listas "awesome"** de streaming e de OBS no GitHub
- [ ] **G2 / Capterra** — cadastro gratuito de fornecedor; é de onde saem os roundups
- [ ] **Reddit** (r/Twitch, r/obs, r/streaming) e comunidades BR — participando, não panfletando
- [ ] Procurar os artigos "melhores alternativas ao Restream" já publicados e oferecer inclusão

> Uma menção num roundup vale mais, em GEO, que dez ajustes de meta tag na home.

### P2 — YouTube · esforço: médio, retorno alto

É o sinal mais forte pro AI Overviews **e** o público-alvo mora lá. Não precisa de produção cara:

- [ ] "Transmitir na Twitch e no YouTube ao mesmo tempo, de graça" — o termo de busca puro
- [ ] "Por que sua live engasga" usando o relatório pós-live como demonstração — é o diferencial
- [ ] Título e **transcrição** com o nome da marca (a transcrição é o que entra no índice)
- [ ] Descrição apontando pro domínio canônico

### P3 — Conteúdo próprio: sair de três páginas · esforço: alto, é o trabalho de fundo

O que falta é uma camada de páginas que respondam perguntas reais. Formato obrigatório em todas:
**H1 = a pergunta**, **cápsula de 40–60 palavras logo abaixo respondendo direto**, depois o
desenvolvimento com H2 em forma de pergunta.

Candidatas, em ordem de intenção de busca:

- [ ] `/multistream-twitch-youtube` — a busca de maior volume
- [ ] `/alternativa-ao-restream` — intenção comercial alta, e existe demanda comprovada (a
      concorrência tem roundups inteiros sobre isso)
- [ ] `/obs-multistream-gratis` — pega quem já procura plugin
- [ ] `/por-que-minha-live-trava` — cauda longa, dor real, e leva direto ao nosso diferencial
- [ ] `/como-multistream-kick` — nicho menos disputado
- [ ] Uma página de **changelog/releases** — frescor é o que o Perplexity premia, e ela se
      atualiza sozinha a cada versão

> **Regra:** cada página precisa de manutenção. Cinco páginas boas e vivas valem mais que vinte
> abandonadas. Não abrir um blog que não vai ser alimentado.

### P4 — Refinos on-site · esforço: baixo

- [ ] **Cápsula de resposta na home.** O parágrafo do herói hoje é voz de marca ("não larga do
      osso") — ótimo pra humano, ruim pra ser copiado por modelo. Vale um parágrafo declarativo e
      factual logo abaixo, visível, no tom da `ONE_LINER`.
- [ ] **`Article`/`TechArticle`** nas páginas do P3, quando existirem.
- [ ] **`softwareVersion` e `downloadUrl`** entram no schema assim que houver release pública — hoje
      o `SoftwareApplication` está incompleto de propósito e correto por isso.
- [ ] **Desempenho**: medir Core Web Vitals reais. A LP tem bastante animação; INP e CLS merecem
      um número antes de qualquer conclusão.
- [ ] **Versão em inglês (`/en`) com `hreflang`** — decisão de produto, não de SEO: o corpus de
      treino e os agregadores são majoritariamente em inglês, mas a voz da marca é BR e traduzir
      mal custa mais que não traduzir. Ver §6.

### P5 — Medição · esforço: baixo

- [ ] Search Console e Bing Webmaster no domínio canônico
- [ ] Uma planilha simples com 15–20 perguntas ("melhor multistream grátis", "restream
      alternativa", "transmitir twitch e youtube junto") testadas mensalmente no ChatGPT, Perplexity
      e AI Overviews, anotando **se cita a Corneta e qual fonte usou**
- [ ] Acompanhar visitas de `GPTBot`/`PerplexityBot`/`ClaudeBot` nos logs da Vercel

> Sem a linha de base do P5, nada aqui é avaliável. Vale montar **antes** de executar o resto.

---

## 5. O que **não** fazer

- **Não investir mais em `llms.txt`.** Já está pronto; a evidência diz que não move ponteiro.
- **Não inventar marcação.** Nada de `aggregateRating` sem avaliação real — `lib/seo.ts` já protege
  isso, e a proteção precisa continuar valendo quando alguém tiver pressa.
- **Não anunciar `downloadUrl`/`softwareVersion`** enquanto não houver instalador público.
- **Não empilhar palavra-chave.** O `keywords` do `layout.tsx` já está no limite do útil; o Google
  ignora a meta há anos, e ela só existe ali por outros buscadores.
- **Não abrir blog sem cadência.** Página parada envelhece e derruba a percepção de frescor, que é
  justamente o que o Perplexity mede.
- **Não fazer texto separado para robô.** O `/llms.txt` sai das mesmas constantes da página de
  propósito — arquivo que fala diferente do humano é cloaking.

---

## 6. Riscos e tensões honestas

**O link de download ainda é placeholder.** Enquanto `NEXT_PUBLIC_PRIMARY_CTA_URL` não existir, o
`SoftwareApplication` sai sem `downloadUrl` e sem versão — o item de schema mais valioso da página
está pela metade. **Isso é dependência de lançamento, não de SEO.**

**Português versus alcance.** Escrever em pt-BR é o que dá autenticidade ao produto e o que a
persona espera. Mas o corpus dos modelos e os agregadores são majoritariamente em inglês, e a
[análise de concorrência](./ANALISE-CONCORRENCIA.md) mostrou que o mercado é internacional. Uma
página em inglês seria citada mais. É trade-off de posicionamento — decidir com intenção, não por
descuido.

**GEO tem muito vendedor de fumaça.** A área é nova e boa parte do material publicado é conteúdo de
agência vendendo serviço. Este plano se apoia no que tem número atrás; onde não tem, está escrito.

**Métrica de sucesso mudou.** Ser citado por um modelo frequentemente **não gera clique**. O KPI
honesto é participação nas respostas, não sessão orgânica — e isso precisa estar combinado antes,
senão o painel vai parecer que nada funcionou.

---

## 7. Sequência sugerida

1. **P5** (medição) — meia hora, e sem ela o resto é achismo
2. **P0** (vitrine do repositório) — maior retorno por esforço da lista, e tem hora certa: antes
   de abrir
3. **P1** (agregadores) — começar no dia do lançamento, quando há o que apontar
4. **P4** (cápsula de resposta) — uma tarde
5. **P2** (YouTube) e **P3** (conteúdo) — trabalho contínuo, os dois motores de longo prazo

---

## Fontes

- [GEO 2026 — guia e fatores de citação](https://llmpulse.ai/blog/geo-guide/)
- [Como ChatGPT, AI Overviews e Perplexity buscam fontes em 2026](https://www.leapd.ai/blog/ai-visibility/how-chatgpt-google-ai-overviews-and-perplexity-source-information-in-2026)
- [Fatores de ranqueamento em busca com IA: ChatGPT × Perplexity](https://www.dinerotechlabs.com/blog/ai-search-ranking-factors-chatgpt-vs-perplexity/)
- [O que realmente influencia ChatGPT, Perplexity e AI Overviews](https://metaflow.life/blog/ai-search-ranking-factors)
- [Adoção de llms.txt cresce 8,8× e 97% dos arquivos não recebem requisição](https://ppc.land/llms-txt-adoption-rises-8-8x-but-97-of-files-get-zero-ai-requests/)
- [llms.txt em 2026: dados de adoção e quando usar](https://organikpi.com/blog/distribution/llms-txt-adoption-impact/)
- [Orientação do Google sobre llms.txt (2026)](https://www.getpassionfruit.com/blog/should-i-create-an-llms.txt-file-google-s-2026-guidance-explained)
