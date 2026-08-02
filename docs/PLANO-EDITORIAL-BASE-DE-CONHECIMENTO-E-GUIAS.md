# Plano editorial para a base de conhecimento e os guias da Corneta

> - **Data da análise:** 01/08/2026
> - **Escopo:** site público, base de conhecimento, guias de aquisição e medição
> - **Objetivo:** ajudar streamers a concluir tarefas e resolver problemas, enquanto a Corneta conquista buscas relevantes de forma sustentável

Este documento detalha a camada editorial proposta em
[PLANO-SEO-AEO-GEO.md](./PLANO-SEO-AEO-GEO.md). Ele não substitui o plano geral de
distribuição; transforma a seção de conteúdo daquele plano em uma arquitetura,
um backlog priorizado e um processo de publicação.

---

## 1. Decisão em uma frase

A Corneta deve lançar **Guias**, para descoberta e educação, e **Ajuda**, para
configuração e solução de problemas. Não deve abrir agora um blog cronológico
genérico.

Essa separação atende duas necessidades diferentes:

| Coleção | Trabalho que a página faz | Exemplo de busca | Próxima ação natural |
|---|---|---|---|
| **Guias** | Explica um problema, uma escolha ou um conceito antes da pessoa conhecer a Corneta | “quanto upload para multistream” | Testar a solução ou baixar o app |
| **Ajuda** | Ensina uma tarefa concreta dentro da Corneta ou resolve um estado de erro | “Corneta não encontra OBS” | Voltar ao app e concluir a tarefa |
| **Changelog** | Registra mudanças reais por versão | “Corneta versão atual” | Atualizar ou conhecer a mudança |

“Guias” é preferível a “Blog” porque o principal ativo será conteúdo evergreen,
mantido por intenção e não por data. Uma área de notícias só deve existir quando
houver cadência própria.

---

## 2. O que a análise do repositório mostrou

### 2.1 A base técnica é boa; a superfície editorial não existe

O site já possui:

- renderização server-side;
- canonical e idiomas;
- sitemap com data de atualização real;
- dados estruturados factuais;
- Open Graph;
- robots e llms.txt;
- telemetria cookieless, com preferência local e sem captura automática.

Porém, o sitemap contém apenas as duas versões da home e as quatro páginas
legais. Não há hub, categoria, artigo, pipeline Markdown/MDX ou rota pública de
ajuda. Hoje, intenções muito diferentes — instalar, configurar o OBS, calcular
upload, entender bitrate e diagnosticar uma queda — disputam espaço em uma única
landing page.

### 2.2 O repositório já contém matéria-prima suficiente

As melhores fontes editoriais internas são:

1. código, testes e textos atuais da interface;
2. [web/PRODUCT.md](../web/PRODUCT.md), como resumo público do produto;
3. [PLANEJAMENTO.md](./PLANEJAMENTO.md), para personas e conceitos técnicos;
4. [PROPOSTA-DE-VALOR.md](./PROPOSTA-DE-VALOR.md), para posicionamento;
5. [TOM-DE-VOZ.md](./TOM-DE-VOZ.md), para linguagem;
6. documentos de recurso já implementado, conferidos contra o código.

Documentos históricos de ideia ou pendência **não são prova de disponibilidade**.
Há divergências concretas: envio e moderação de chat, enquadramento vertical e
estatísticas do OBS já aparecem no código, enquanto alguns textos antigos ainda
os tratam como futuros. O caminho inverso também existe: uma especificação
detalhada não significa que o recurso esteja pronto.

### 2.3 O encaixe editorial mais forte

O produto atende principalmente streamers brasileiros no Windows que já usam ou
estão começando a usar o OBS Studio. Os cinco trabalhos editoriais com melhor
encaixe são:

1. colocar a mesma live em mais de uma plataforma;
2. saber se upload, CPU, GPU e encoder aguentam;
3. entender por que a live engasgou ou uma plataforma caiu;
4. operar chat, alertas e destinos sem trocar de painel;
5. entregar um diagnóstico útil sem expor chaves ou dados pessoais.

O diferencial técnico da Corneta — distribuição local com controle e diagnóstico
por destino — raramente é uma busca por si só. O conteúdo deve capturar a dor
conhecida e mostrar esse diferencial durante a resposta.

### 2.4 Limites que precisam aparecer cedo

- Cada saída local consome upload; um relay na nuvem pode ser melhor para quem
  tem upload fraco.
- Transcode consome CPU ou GPU; o modo que copia o sinal custa menos.
- A Corneta é Windows-first e depende do OBS para produzir a live.
- Uma plataforma pode impor regras, limites e mudanças fora do controle do app.
- Comparações, preços, bitrates e políticas precisam de fonte e data de revisão.
- Não existem métricas públicas de usuários, depoimentos ou benchmarks
  comerciais que possam ser usados como prova social.

---

## 3. Pesquisa de intenção: leitura qualitativa, não volume

Foi feita uma amostra qualitativa de buscas em português do Brasil, com consultas
como:

- como transmitir em várias plataformas ao mesmo tempo com OBS;
- Twitch e YouTube ao mesmo tempo;
- multistream grátis no OBS;
- quanto upload para multistream;
- bitrate para Twitch, YouTube e Kick;
- OBS perdendo quadros;
- live travando com Speedtest normal;
- uma plataforma caiu no multistream;
- chat Twitch, YouTube e Kick junto;
- stream key e RTMPS.

Não foram usados nem estimados volumes. A prioridade inicial é uma inferência
baseada em recorrência, qualidade dos resultados disponíveis, proximidade da dor
com o produto e capacidade de produzir uma resposta melhor. Antes de projetar
tráfego, validar demanda com Search Console e, se necessário, Keyword Planner.

### Lacunas mais defensáveis em português

| Lacuna | Por que a Corneta pode responder bem |
|---|---|
| Multistream local sem nuvem | A maior parte do conteúdo encontrado é comercial, antigo ou ensina infraestrutura manual |
| Rede, renderização e encoder tratados separadamente | Muitos resultados chamam problemas diferentes apenas de “frames dropados” |
| Uma única plataforma falhando | É uma dor pouco coberta e coincide com o controle independente por destino |
| Upload total do multistream | A conta da soma dos bitrates e a margem de estabilidade cabem em calculadora verificável |
| Bitrate atualizado por plataforma | As regras estão fragmentadas e mudam; uma matriz versionada pode ganhar confiança |
| Painel privado versus overlay público de chat | Há desinformação sobre o que as regras de simulcast permitem |
| Stream keys e privacidade do relay | As orientações oficiais existem, mas estão espalhadas entre plataformas |
| Diagnóstico compartilhável sem segredos | A implementação da Corneta oferece um exemplo concreto e reproduzível |

Nos títulos, usar “OBS Studio”, “live” ou “streaming”. A sigla “OBS” sozinha
também representa outros assuntos nas buscas.

---

## 4. Arquitetura de informação

### 4.1 URLs públicas

O português continua sem prefixo e o inglês mantém o prefixo atual:

~~~text
/help
/help/getting-started/{slug}
/help/streaming-software/{slug}
/help/platforms/{slug}
/help/quality/{slug}
/help/chat-and-alerts/{slug}
/help/reports-and-data/{slug}
/help/troubleshooting/{slug}

/guides
/guides/multistream/{slug}
/guides/quality/{slug}
/guides/quality/{slug}
/guides/operations/{slug}
/guides/security/{slug}
/guides/comparisons/{slug}

/changelog

/en/help/{category}/{slug}
/en/guides/{category}/{slug}
~~~

Os caminhos sugeridos no plano SEO anterior ainda não foram publicados. Portanto,
é possível adotar esta estrutura sem migração ou redirect. Se algum caminho já
tiver sido indexado fora deste repositório, verificar antes do lançamento.

### 4.2 Regras da arquitetura

- Home → hub → artigo deve ficar a no máximo três cliques.
- **Todos os segmentos e slugs de URL são sempre em inglês**, mesmo quando o
  título, a interface e o conteúdo estão em português.
- Cada artigo pertence a uma categoria principal; tags não geram páginas
  indexáveis no lançamento.
- Guias e Ajuda podem compartilhar componentes, mas não intenção nem CTA.
- A busca interna só entra quando houver corpus suficiente. Resultados e
  combinações de filtro não devem ser indexados.
- Artigos em português são a prioridade. Traduzir para inglês apenas páginas
  comprovadas ou necessárias ao suporte.
- Só declarar hreflang quando as duas versões completas existirem e apontarem
  reciprocamente uma para a outra.
- A tradução mantém o mesmo caminho semântico depois do prefixo de idioma:
  /guides/multistream/obs-multistream e
  /en/guides/multistream/obs-multistream.
- A translationKey continua unindo as versões internamente; ela não altera a
  regra de caminhos em inglês.

### 4.3 Mapa de ligação interna

| Página-pilar | Apoios principais | Ajuda relacionada |
|---|---|---|
| Multistream no OBS Studio | Twitch + YouTube, três plataformas, upload, local × nuvem | Primeira live, OBS, chaves, modos de qualidade |
| Por que minha live trava? | Dropped frames, encoder, falha isolada, bitrate | Métricas, status, diagnóstico, relatório pós-live |
| Chat unificado | Regras da Twitch, moderação, overlay | Configurar chat, login, popout, alertas |
| Segurança da live | Stream key, RTMPS, privacidade local | Cofre de chaves, telemetria, exportar diagnóstico |
| Depois da live | Encontrar o minuto da falha, comparar desempenho | Relatório, exportações e recap |

Links devem ser contextuais e ter texto descritivo. Não criar blocos enormes de
“veja também” iguais em todas as páginas.

---

## 5. Modelo de prioridade

Cada pauta deve receber de 0 a 3 pontos em:

1. **dor do usuário:** frequência e impacto no fluxo;
2. **intenção observável:** clareza da consulta e qualidade insuficiente dos
   resultados atuais;
3. **prova da Corneta:** quanto o produto e o repositório permitem demonstrar;
4. **proximidade de ação:** chance de levar a uma tarefa, download ou solução;
5. **manutenção:** 3 para evergreen; 0 para regras ou integrações muito voláteis.

Interpretação:

- **12–15:** P0, produzir na primeira onda;
- **9–11:** P1, produzir após a base;
- **6–8:** P2, validar com dados antes;
- **0–5:** manter no banco de ideias.

As prioridades abaixo já aplicam esse raciocínio de forma qualitativa. Elas não
representam volume de busca.

---

## 6. Backlog de Guias

### P0 — primeira onda de aquisição

| ID | Título/H1 sugerido | Caminho sugerido | Intenção e ângulo |
|---|---|---|---|
| G01 | Como fazer multistream no OBS Studio: guia completo | /guides/multistream/obs-multistream | Pilar que compara métodos e conduz ao primeiro setup |
| G02 | Como transmitir na Twitch e no YouTube ao mesmo tempo | /guides/multistream/twitch-youtube-simultaneously | Passo a passo específico, com regras e pré-requisitos atuais |
| G03 | Quanto upload é necessário para fazer multistream? | /guides/quality/multistream-upload-speed | Soma dos bitrates, margem e calculadora reproduzível |
| G04 | Por que minha live trava? Como separar internet, GPU e encoder | /guides/quality/why-stream-lags | Árvore de decisão por sintoma, não lista genérica |
| G05 | Multistream local ou na nuvem: qual faz sentido para você? | /guides/multistream/local-vs-cloud | Comparação honesta de upload, máquina, custo, controle e privacidade |
| G06 | Como transmitir na Twitch, YouTube e Kick ao mesmo tempo | /guides/multistream/twitch-youtube-kick | Configuração de três destinos e regras específicas de cada plataforma |

### P1 — autoridade e diferenciação

| ID | Título/H1 sugerido | Caminho sugerido | Intenção e ângulo |
|---|---|---|---|
| G07 | Qual bitrate usar na Twitch, YouTube e Kick? | /guides/quality/twitch-youtube-kick-bitrate | Matriz versionada, sempre baseada em documentação oficial |
| G08 | Dropped frames no OBS: rede, renderização ou codificação? | /guides/quality/dropped-frames | Explicar os três diagnósticos e como confirmar cada um |
| G09 | Uma plataforma caiu no multistream: o que verificar sem encerrar as outras | /guides/multistream/one-platform-disconnected | Long-tail de alto valor e demonstração do isolamento por destino |
| G10 | Alternativa ao Restream: quando um aplicativo local é melhor — e quando não é | /guides/comparisons/restream-alternative | Intenção comercial com cenário recomendado para cada abordagem |
| G11 | Posso fazer simulcast? Regras atuais de Twitch, YouTube e Kick | /guides/multistream/simulcasting-rules | Fonte oficial, data visível e aviso para acordos individuais |
| G12 | Chat unificado no multistream: painel privado ou overlay público? | /guides/operations/unified-chat-rules | Separar ferramenta pessoal do que aparece na saída transmitida |
| G13 | Stream key é senha? RTMP, RTMPS e como proteger suas contas | /guides/security/protect-stream-key | Segurança operacional e diferença entre transporte aberto e protegido |
| G14 | NVENC, QSV, AMF ou x264: qual encoder usar para live? | /guides/quality/live-stream-encoders | Decisão por hardware, carga e número de transcodes |
| G15 | Copiar ou recodificar a live? Como escolher por plataforma | /guides/quality/copy-vs-transcode | Explica Na lata, Esperto e Caprichado sem depender dos nomes no título |
| G16 | Como transmitir em horizontal e vertical ao mesmo tempo | /guides/multistream/horizontal-and-vertical-live | Enquadramento manual 9:16, custo extra e limites |
| G17 | O que acontece com a live quando o OBS fecha? | /guides/operations/obs-closed-during-stream | Continuidade com JÁ VOLTO, sem prometer proteção contra falha total do PC |
| G18 | Como descobrir em que minuto a live engasgou | /guides/operations/analyze-stream-drop | Usa métricas e relatório como demonstração do diferencial |

### P2 — publicar depois de observar dados

| ID | Título/H1 sugerido | Caminho sugerido | Condição para publicar |
|---|---|---|---|
| G19 | Como colocar chat e alertas de várias plataformas no OBS | /guides/operations/chat-alerts-obs | Validar regras do overlay e mostrar Browser Source real |
| G20 | Como proteger dados pessoais ao compartilhar a tela em live | /guides/security/screen-sharing-privacy | Guardião só aparece como recurso experimental, nunca garantia |
| G21 | Checklist pré-live: internet, áudio, movimento, destinos e gravação | /guides/operations/pre-stream-checklist | Basear em falhas reais e ligar a diagnósticos específicos |
| G22 | Multistream em PC fraco: o que reduzir primeiro | /guides/quality/multistream-low-end-pc | Testes reproduzíveis; não inventar requisitos mínimos |
| G23 | 720p30, 720p60 ou 1080p60: como escolher | /guides/quality/resolution-and-fps | Usar capacidade real e limites das plataformas |
| G24 | RTMP, ingest, keyframe, bitrate e transcode: glossário de live | /guides/quality/streaming-glossary | Uma página útil; não fragmentar em artigos finos |
| G25 | Aitum, Multiple RTMP, Restream ou Corneta: qual escolher? | /guides/comparisons/multistream-tools | Só após teste hands-on, metodologia e versões explícitas |
| G26 | Qual loudness usar em live: -14, -16 ou -18 LUFS? | /guides/quality/live-stream-loudness | Revisão técnica de áudio e aviso para não normalizar duas vezes |

---

## 7. Backlog de Ajuda

### P0 — primeira live e suporte básico

| ID | Artigo sugerido | Categoria | Observação |
|---|---|---|---|
| A01 | Como instalar a Corneta no Windows e verificar o instalador | Primeiros passos | Publicar somente junto da distribuição oficial e refletir o estado real da assinatura |
| A02 | Sua primeira live: do zero ao BORA AO VIVO | Primeiros passos | Fluxo completo, curto e com resultado esperado em cada etapa |
| A03 | Como conectar e configurar o OBS automaticamente | Software de transmissão | WebSocket, porta, senha e ação “Configura pra mim” |
| A04 | Como configurar o OBS manualmente para a Corneta | Software de transmissão | Serviço personalizado, endpoint local e chave do OBS |
| A05 | Como adicionar, testar, pausar e remover uma plataforma | Plataformas | Uma página operacional central antes de criar variações finas |
| A06 | Stream key, URL de ingestão e chave do OBS: qual é qual? | Plataformas | Onde encontrar, como trocar e o que nunca compartilhar |
| A07 | Como testar o upload antes da live | Qualidade | Teste com movimento real e interpretação da margem |
| A08 | Na lata, Esperto ou Caprichado: qual modo de qualidade escolher? | Qualidade | Copy versus transcode, upload e sessões de encoder |
| A09 | O que significam Aguardando, Conectando, Reconectando, Pausado, JÁ VOLTO e Erro | Solução de problemas | Glossário de estados com próxima ação |
| A10 | Como exportar um diagnóstico seguro para o suporte | Relatórios e dados | O que entra, o que fica fora e quais IDs ajudam |

### P1 — uso recorrente

| ID | Artigo sugerido | Categoria | Observação |
|---|---|---|---|
| A11 | Como interpretar bitrate, FPS, quadros perdidos, CPU e GPU | Qualidade | Diferenciar métrica de sintoma e de causa |
| A12 | Como criar perfis e fazer backup da configuração | Primeiros passos | Explicar por que chaves e senhas não vão no backup |
| A13 | Como criar um enquadramento vertical 9:16 | Qualidade | Recorte, pan e zoom manuais; não chamar de auto-reframe |
| A14 | Como usar e personalizar a tela JÁ VOLTO | Software de transmissão | Queda do sinal, acionamento manual e limites da proteção |
| A15 | O que o auto-bitrate faz — e quando ele não atua | Qualidade | Só altera destinos em transcode |
| A16 | Como usar o normalizador de áudio | Qualidade | Opt-in e aviso para quem já normaliza no OBS |
| A17 | Como configurar o chat unificado de Twitch, YouTube e Kick | Chat e alertas | Leitura, fontes, emotes e dependências por plataforma |
| A18 | Como entrar nas contas, enviar mensagens e moderar | Chat e alertas | Matriz real: ações disponíveis mudam por plataforma |
| A19 | Como usar a janela flutuante em outro monitor | Chat e alertas | Chat, alertas ou ambos |
| A20 | Como configurar e testar alertas nativos, Streamlabs e StreamElements | Chat e alertas | Tokens, tipos suportados e teste |
| A21 | Como adicionar o overlay da Corneta como Browser Source no OBS | Chat e alertas | URL local, posição, tamanho, som e teste |
| A22 | Como ler e exportar o relatório pós-live | Relatórios e dados | Causa provável é heurística; explicar HTML, CSV e JSON |
| A23 | O que a telemetria coleta, como desativar e como trocar seu ID | Relatórios e dados | Consentimento, finalidade e ausência de conteúdo sensível |

### P1 — solução de problemas

| ID | Artigo sugerido | Categoria | Observação |
|---|---|---|---|
| A24 | A Corneta não encontra o OBS: WebSocket, senha, porta e firewall | Solução de problemas | Começar pelo sintoma exato |
| A25 | O OBS está aberto, mas a Corneta continua “Aguardando sinal” | Solução de problemas | Separar WebSocket conectado de sinal RTMP chegando |
| A26 | Uma plataforma vive reconectando, mas as outras estão normais | Solução de problemas | Chave, ingest, rede, regra e status do provedor |
| A27 | O chat não carrega, não envia ou não permite moderar | Solução de problemas | Diagnóstico separado por Twitch, YouTube e Kick |
| A28 | O overlay não aparece no OBS | Solução de problemas | Browser Source, servidor local, porta e cache |
| A29 | O jogo ou a live trava durante o multistream | Solução de problemas | Encoder, sessões de GPU, resolução, FPS e modo de qualidade |
| A30 | O login da Twitch, YouTube ou Kick expirou | Solução de problemas | Reconectar sem expor token |

### Manter em rascunho até validar

| ID | Artigo sugerido | Motivo do bloqueio |
|---|---|---|
| A31 | Como gravar e rever a live com chat, gráficos e clipes | Gravação/replay ainda precisa de validação longa real |
| A32 | Como criar uma live do YouTube automaticamente | Fluxo existe, mas ainda precisa de validação pública com canal real |
| A33 | Como testar o Guardião de privacidade | Experimental; exige atraso, watchlist e aviso de que não é garantia |
| A34 | Como configurar TikTok, Instagram ou X | Presets e URLs são experimentais; não há compatibilidade garantida |
| A35 | Como atualizar a Corneta automaticamente | Aguardar validação real do updater entre versões publicadas |

Se a Search Console mostrar demanda clara por “onde encontrar stream key da
Twitch/YouTube/Kick”, A06 pode ganhar páginas filhas por plataforma. Não criar
três páginas curtas e quase iguais antes dessa evidência.

---

## 8. O que não deve virar promessa pública

Não publicar página de aquisição ou tutorial estável para:

- Mesa/co-stream, que está desligada por feature flag;
- macOS ou Linux;
- SRT;
- relay em nuvem, VPS gerenciada ou servidor próprio da Corneta;
- detector automático de dead air, tela preta ou tela congelada;
- auto-reframe por IA;
- recap automático por IA;
- “máquina do tempo” preventiva;
- detector de música/DMCA ou balanceamento automático de mic/jogo;
- sala de espera, rerun/premiere ou anúncio multicanal automático;
- TTS, metas, temas completos e replay de alertas;
- chat de Facebook, TikTok ou X;
- ganho exato de inscritos no YouTube;
- compatibilidade garantida com TikTok, Instagram ou X;
- Guardião como proteção infalível;
- v1 pública, instalador assinado ou atualização automática antes dos gates de
  release correspondentes.

Comparativos só podem ser publicados depois de teste prático recente. Uma
análise de documentação serve para montar o roteiro do teste, não para declarar
qual produto vence.

---

## 9. Ondas de implementação

### Fase 0 — fundação editorial

- [x] Criar hubs de Ajuda e Guias.
- [x] Criar pipeline de conteúdo versionado no repositório, preferencialmente
      Markdown/MDX validado em build.
- [x] Criar um protocolo reproduzível de screenshots, com conta de demonstração,
      estado conhecido, versão, dimensão de captura e checklist de privacidade.
- [x] Criar pipeline de assets com fonte original separada da versão otimizada,
      nomes de arquivo em inglês e manifesto de origem/revisão.
- [x] Criar templates distintos para guia, ajuda, comparação e troubleshooting.
- [x] Adicionar navegação global e links contextuais a partir da home.
- [x] Sobrescrever metadata, canonical e Open Graph em cada artigo.
- [x] Gerar sitemap apenas com artigos publicados e data real de revisão.
- [x] Implementar hreflang apenas para pares completos.
- [x] Adicionar Article ou TechArticle e BreadcrumbList factuais.
- [x] Garantir que drafts sejam noindex e fiquem fora do sitemap.
- [x] Preparar Search Console e Bing Webmaster no domínio canônico, com tokens
      de verificação por ambiente e runbook de ativação.
  - [ ] Ação externa após o deploy: validar a propriedade nos dois consoles e
        enviar `https://www.corneta.live/sitemap.xml`.
- [x] Expandir a telemetria do site para distinguir hubs e artigos.
- [x] Criar checks de CI para links, slugs, H1, imagens, canonical, sitemap e
      traduções.
- [x] Criar um componente editorial de imagem com legenda, zoom acessível,
      dimensões reservadas, srcset/sizes e formatos modernos.

**Status no repositório em 1º de agosto de 2026:** fundação implementada e
validada em build. A Fase 0 não exigiu gerar imagem ou vídeo com IA. Os dois
rascunhos-semente continuam fora das rotas públicas; screenshots reais entram
somente na publicação dos artigos, seguindo o protocolo e o manifesto de assets.

### Fase 1 — resolver a primeira live e capturar a demanda central

Publicar nesta ordem:

- [x] G01 — multistream no OBS Studio;
- [x] A02 — primeira live;
- [x] A03 — configurar OBS automaticamente;
- [x] A05 — gerenciar uma plataforma;
- [x] A06 — chaves e URLs;
- [x] A08 — modos de qualidade;
- [x] G02 — Twitch + YouTube;
- [x] G03 — upload para multistream;
- [x] G04 — por que a live trava;
- [x] A10 — exportar diagnóstico;
- [x] G05 — local × nuvem;
- [x] G06 — Twitch + YouTube + Kick.

Essa onda cria um caminho completo: descoberta → decisão → configuração →
diagnóstico.

**Status no repositório em 1º de agosto de 2026:** os 12 artigos estão
publicados, ligados entre si e incluídos no sitemap. Nenhum artigo usa imagem de
capa. Screenshots reais da Corneta aparecem apenas dentro do conteúdo, perto do
passo que ajudam a explicar; o guia de upload mantém sua calculadora interativa.

#### Pacote visual mínimo da primeira onda

| Conteúdo | Visual dentro do artigo | Origem |
|---|---|---|
| G01 | Destinos, modos de qualidade e ligação local com o OBS | Corneta real |
| A02 | Sequência dos estados decisivos da primeira live | Corneta real, com perfil de demonstração |
| A03 | Estado configurado em “Liga no OBS” | Corneta real |
| A05 | Adicionar, testar, pausar e retomar um destino | Corneta real |
| A06 | Campos de URL e chave com dados fictícios, sem mostrar uma chave real | Corneta real |
| A08 | Comparação visual dos três modos e da estimativa de carga | Corneta real + HTML para os dados |
| G02 | Cards dos destinos prontos e estimativa de qualidade | Corneta real |
| G03 | Calculadora, estimativa do perfil e exemplos em HTML | Corneta real + interface web |
| G04 | Check-up e modos de qualidade junto ao diagnóstico | Corneta real |
| A10 | Listas factuais do que entra e do que fica fora | HTML |
| G05 | Destinos independentes e tabela comparativa | Corneta real + HTML |
| G06 | Destinos e modos de qualidade para três saídas | Corneta real |

Não é necessário ilustrar todo clique. Um print entra quando confirma localização,
estado ou resultado que seria ambíguo apenas em texto.

### Fase 2 — construir autoridade em qualidade e operação

Publicar os itens P1 de qualidade, falha isolada, regras, segurança de chaves,
chat, métricas e pós-live:

- [x] G07 — bitrate de Twitch, YouTube e Kick;
- [x] G08 — dropped frames: rede, renderização e codificação;
- [x] G09 — uma plataforma desconectada sem encerrar as outras;
- [x] G11 — regras atuais de simulcast;
- [x] G12 — painel privado ou overlay público;
- [x] G13 — proteção de stream keys e RTMPS;
- [x] G14 — NVENC, QSV, AMF e x264;
- [x] G15 — copiar ou recodificar;
- [x] G17 — software de transmissão fechado durante a live;
- [x] G18 — localizar o minuto de uma falha;
- [x] A07 — teste de upload;
- [x] A09 — estados da transmissão;
- [x] A11 — interpretação de métricas;
- [x] A14 — uso e personalização do JÁ VOLTO;
- [x] A15 — auto-bitrate;
- [x] A17 — configuração do chat unificado;
- [x] A21 — overlay como Browser Source;
- [x] A22 — leitura e exportação do relatório pós-live;
- [x] A24 — OBS não encontrado;
- [x] A26 — plataforma reconectando.

**Status no repositório em 1º de agosto de 2026:** os 20 artigos estão
publicados e ligados ao corpus da Fase 1. Regras externas foram revalidadas em
fontes oficiais de Twitch, YouTube, Kick e OBS. A antiga categoria exclusiva
`obs` foi retirada da navegação: Ajuda usa `/help/streaming-software` e os
diagnósticos gerais ficam em `/guides/quality`, com redirects permanentes a
partir das URLs antigas.

#### Pacote visual da segunda onda

| Visual | Uso principal | Origem |
|---|---|---|
| Segurança ao vivo | JÁ VOLTO e auto-bitrate | Corneta real em perfil de demonstração |
| Teste de upload concluído | margem por modo de qualidade | Corneta real em perfil de demonstração |
| Chat unificado conectado | painel privado, origens e audiência | Corneta real em perfil de demonstração |
| Relatório pós-live | diagnóstico, métricas e linha do tempo | Corneta real em perfil de demonstração |

Capturas já existentes de destinos, qualidade, conexão do OBS e check-up foram
reutilizadas apenas onde mostram exatamente o estado explicado. O print de
configuração do overlay no modo navegador foi rejeitado porque essa demonstração
não inicia o servidor local do app instalado.

### Fase 3 — comparação, formatos e cauda longa

- [x] G10 — alternativa ao Restream com decisão local versus nuvem;
- [x] G16 — transmissão horizontal e vertical ao mesmo tempo;
- [x] G19 — chat e alertas de várias plataformas no OBS;
- [x] G22 — multistream em PC fraco;
- [x] G23 — escolha entre 720p30, 720p60, 1080p30 e 1080p60;
- [x] G24 — glossário útil de transmissão ao vivo;
- [x] G25 — Aitum, Multiple RTMP, Restream e Corneta.

**Status no repositório em 1º de agosto de 2026:** os sete guias estão
publicados. O laboratório usou Corneta 0.6.0 e OBS Studio 32.2.1 portátil no
Windows 11; Aitum Multistream 1.0.8 e Multiple RTMP Outputs 0.7.4.0 carregaram
no mesmo ambiente. O Restream foi validado até a barreira de login e por fontes
oficiais, sem criar conta externa nem alegar teste de estabilidade que não
aconteceu.

Dois screenshots novos mostram o destino vertical e o editor de enquadramento
9:16. Os demais guias reaproveitam capturas da Corneta quando o estado exibido
corresponde exatamente ao ponto explicado; as tabelas comparativas continuam em
HTML para acessibilidade e indexação.

- Desmembrar páginas de plataforma apenas quando a página-pilar ficar grande ou
  houver demanda comprovada.
- Traduzir para inglês apenas páginas com tráfego, backlinks, necessidade de
  suporte ou oportunidade internacional clara.

### Fase 4 — manutenção contínua

**Status no repositório em 2 de agosto de 2026:** a manutenção contínua está
implementada. O que depende de acesso às contas de produção continua indicado
como ação externa.

- [x] Gerar uma fila semanal por `reviewedAt` e `reviewIntervalDays`, com aviso
  28 dias antes e falha no CI para conteúdo vencido.
- [x] Manter regras, bitrate e integrações em intervalos de no máximo 90 dias e
  conceitos evergreen em 180 dias.
- [x] Limitar comparativos a 60–90 dias no contrato de conteúdo.
- [x] Cruzar mudanças de produto com `sources[].repoPath` em PRs e releases,
  exigindo nova revisão da Ajuda afetada.
- [x] Separar revisão factual (`reviewedAt`) de mudança substancial
  (`updatedAt`) e bloquear datas de frescor artificiais.
- [x] Criar uma issue recorrente a cada 28 dias com o relatório e a lista de
  verificação de Search Console e Bing.
- [x] Documentar a rotina em `docs/RUNBOOK-MANUTENCAO-EDITORIAL.md`.
- [ ] Validar as propriedades de produção no Google Search Console e no Bing
  Webmaster Tools e enviar `/sitemap.xml` (ação externa após o deploy).

Cadência mínima recomendada: **duas publicações ou revisões substanciais por
mês**. Se isso não for sustentável, reduzir o backlog ativo em vez de produzir
páginas rasas.

---

## 10. Requisitos do conteúdo

### 10.1 Estrutura de um Guia

1. H1 que corresponda à pergunta real.
2. Resposta direta em duas a quatro frases, sem introdução promocional.
3. Data de validação, versões e ambiente testado.
4. Decisão, conta, passo a passo ou árvore de diagnóstico.
5. Evidência própria: screenshots, teste ou exemplo reproduzível.
6. Limites e o cenário em que a solução não serve.
7. Fontes oficiais próximas das afirmações voláteis.
8. Onde a Corneta ajuda, depois de a dúvida principal estar resolvida.
9. Próximo artigo e CTA contextual.

Não há meta fixa de palavras. O texto termina quando a tarefa está resolvida.

### 10.2 Estrutura de uma página de Ajuda

1. Resultado esperado.
2. “Aplica-se a” com versão da Corneta e sistema.
3. Pré-requisitos.
4. Passos numerados usando exatamente os nomes da interface.
5. Estado esperado depois de cada etapa crítica.
6. Tabela “sintoma → causa provável → como confirmar → correção”.
7. Bloco “Ainda não resolveu?” com os dados seguros a coletar.
8. Aviso claro sobre o que nunca compartilhar.
9. Artigos relacionados escolhidos manualmente.

### 10.3 Estrutura de um comparativo

- metodologia e data do teste;
- versões, planos e preços verificados na fonte primária;
- mesma tarefa executada nas alternativas comparadas;
- matriz factual, sem notas arbitrárias;
- cenário em que cada alternativa é melhor;
- limitações da Corneta antes da CTA;
- changelog de correções importantes do artigo.

### 10.4 Tom

Seguir [TOM-DE-VOZ.md](./TOM-DE-VOZ.md):

- falar com quem conhece cenas do OBS, mas não quer administrar Docker;
- explicar o resultado antes da tecnologia;
- usar nomes que aparecem na tela;
- começar erro com o que não foi possível e terminar com a ação;
- declarar limites cedo;
- evitar precisão inventada, clichês e linguagem genérica de SEO.

### 10.5 Política de imagens

#### Decisão

Sim, devemos produzir imagens, nesta ordem de preferência:

| Tipo | Uso | Regra |
|---|---|---|
| **Screenshot real da Corneta** | Tutoriais, estados, métricas e diagnóstico | É a evidência padrão para Ajuda e demonstrações de produto |
| **Screenshot real do OBS Studio** | Passos de configuração e diagnóstico que acontecem no OBS | Mostrar apenas a área necessária e registrar a versão testada |
| **Screenshot de Twitch, YouTube ou Kick** | Somente quando localizar uma ação externa for indispensável | Captura própria, atual, sanitizada e revisada contra termos e diretrizes de marca |
| **Ilustração editorial gerada por IA** | Conceitos sem uma tela real correspondente | Usar de forma conservadora; nunca simular interface, erro, métrica, resultado ou integração |
| **Tabela, conta ou checklist** | Não deve virar imagem | Manter em HTML para acessibilidade, atualização, seleção e indexação |

Não usar bancos de imagem com “streamer genérico” como preenchimento. Eles não
provam experiência com o produto e raramente ajudam a concluir a tarefa.

Os artigos não usam imagem de capa. Todo visual precisa ganhar seu lugar dentro
do conteúdo, junto ao passo, estado ou comparação que esclarece.

#### Screenshots da Corneta

- Capturar um build real e declarar a versão no artigo.
- Usar perfil e contas de demonstração; nunca uma conta pessoal.
- Padronizar tema, escala do Windows, dimensão da janela e idioma.
- Capturar em português para o artigo em português e em inglês para a tradução.
- Mostrar um estado significativo por imagem, com contexto suficiente para a
  pessoa se localizar.
- Usar recorte para aproximar a área relevante; não reduzir a janela inteira até
  os textos ficarem ilegíveis no celular.
- Se houver setas ou números, manter os mesmos números nos passos em HTML.
- Preservar a captura original sem anotações fora da pasta pública e publicar
  apenas a derivada revisada e otimizada.
- Repetir a captura quando labels, navegação ou estado visual mudarem; não apenas
  atualizar a data do artigo.

#### Privacidade antes de publicar

Uma imagem reprova se mostrar, mesmo parcialmente:

- stream key, token, senha, API key ou URL com credencial;
- ID de telemetria, operação ou erro real;
- caminho local, nome de usuário do Windows ou IP;
- e-mail, nome de canal, avatar, chat ou título de live de uma pessoa real;
- watchlist do Guardião;
- notificação, janela ou arquivo fora do escopo do tutorial.

Não confiar em blur como única proteção para segredo. Preparar dados fictícios
antes da captura e cortar a área sensível. Toda imagem passa por revisão humana
em tamanho original; uma checagem automatizada por OCR ou padrões pode ser uma
barreira adicional, nunca a única.

#### Screenshots das plataformas

Screenshots de Twitch, YouTube e Kick têm custo de manutenção maior que os da
Corneta. A ordem é:

1. explicar o conceito e apontar para a documentação oficial;
2. usar um recorte próprio somente se a localização visual evitar erro;
3. registrar plataforma, idioma, data de captura e data da próxima revisão;
4. conferir os termos e diretrizes de marca vigentes;
5. não copiar imagens do Help Center de terceiros nem sugerir parceria;
6. substituir ou retirar o print quando a interface mudar.

Em artigos como G02 e G06, o foco visual deve ser a Corneta. Prints dos
dashboards externos pertencem preferencialmente às páginas de Ajuda que ensinam
onde executar uma ação específica.

#### Imagens editoriais geradas

- Nunca gerar um “print” da Corneta, OBS ou plataforma por IA.
- Não usar imagem gerada como prova de funcionalidade.
- Gerar apenas quando o conceito não corresponder a uma tela real útil.
- Manter a linguagem visual editorial da marca, sem texto, logos de plataformas,
  dashboards ou números inventados.
- Toda relação mostrada na ilustração precisa existir também em texto, lista ou
  tabela próxima; a imagem ajuda a entender, mas não carrega a única explicação.
- Registrar prompt, modelo, data, master e derivada no inventário editorial.
- A imagem social deve representar o artigo. Evitar reutilizar apenas o logo ou
  uma arte cheia de texto em todas as páginas.

#### Nomes, formatos e entrega

- Todos os diretórios e nomes de arquivo ficam em inglês, em lowercase e com
  hífens: corneta-obs-auto-setup-connected.webp.
- Alt text e legenda ficam no idioma da página; o filename continua em inglês.
- Manter master de screenshot em PNG; servir derivadas em WebP ou AVIF.
- Manter contas, tabelas, fluxos decisórios e checklists em HTML acessível.
- Renderizar com img/picture ou o componente de imagem do Next.js, nunca apenas
  como background CSS quando a imagem tiver conteúdo.
- Fornecer src de fallback, srcset/sizes responsivos e width/height para reservar
  espaço e evitar layout shift.
- Carregar imagens no corpo sob demanda.
- Colocar cada screenshot perto do passo que ele explica.
- Usar a imagem social padrão da Corneta nos metadados, sem transformá-la em
  capa visível do artigo.
- Um image sitemap não é necessário no lançamento se todas as imagens estiverem
  em elementos HTML rastreáveis; reavaliar apenas se houver problema de
  descoberta.

#### Ciclo de revisão

| Origem | Gatilho de revisão |
|---|---|
| Corneta | Toda release que altera a tela ou o fluxo |
| OBS Studio | Mudança da versão testada ou do caminho mostrado |
| Twitch, YouTube e Kick | A cada revisão trimestral do artigo ou relato de interface divergente |
| Diagrama conceitual | Mudança de arquitetura, conta ou promessa |
| Imagem social | Mudança substancial do foco do artigo |

---

## 11. Contrato editorial e frontmatter

Conteúdo versionado junto do produto facilita revisão técnica e evita que a Ajuda
descreva outra versão. Um frontmatter mínimo:

~~~yaml
contentId: guide_multistream_obs
title: Como fazer multistream no OBS Studio
description: Resumo único para busca e compartilhamento.
summary: Resposta curta exibida no começo da página.
locale: pt-BR
collection: guides
category: multistream
slug: obs-multistream
translationKey: multistream_obs
status: draft
intent: informational
author: nome-real
reviewedBy: nome-real
publishedAt:
updatedAt:
reviewedAt:
productVersion:
testedWith:
reviewIntervalDays: 90
experimental: false
primaryQuery:
related:
sources:
images: []
~~~

Validações de build:

- contentId e slug únicos;
- datas válidas, `updatedAt` não anterior a `publishedAt` e `reviewedAt` não
  anterior a `updatedAt`;
- artigo publicado sem placeholder;
- autor e revisor existentes;
- imagem e alt obrigatórios quando houver passos visuais;
- baseName e todos os diretórios de asset em inglês;
- origem, direitos, captura e versão registrados quando aplicáveis;
- screenshot externo com externalUiReviewedAt;
- links relacionados existentes e sem ciclos artificiais;
- fonte oficial para regras, preço, configuração e limites externos;
- experimental sinalizado;
- tradução declarada somente quando a outra página existe;
- um H1 por página;
- draft ausente do sitemap.

---

## 12. Requisitos técnicos do template

Implementação sugerida, compatível com as rotas atuais:

~~~text
web/app/(site)/[locale]/[collection]/page.tsx
web/app/(site)/[locale]/[collection]/[...slug]/page.tsx
web/content/pt-BR/help/**/*.mdx
web/content/pt-BR/guides/**/*.mdx
web/content/en/help/**/*.mdx
web/content/en/guides/**/*.mdx
~~~

Pontos obrigatórios:

- gerar páginas predominantemente no servidor e enviar JavaScript apenas para
  componentes interativos;
- adaptar o proxy às coleções em português sem prefixo;
- impedir que o layout dos artigos herde o canonical da home;
- fazer o seletor de idioma apontar para a tradução correspondente, não sempre
  para a home;
- gerar title, description e Open Graph exclusivos e localizados;
- usar Article ou TechArticle e BreadcrumbList; usar HowTo somente quando o
  procedimento visível corresponder ao markup;
- não contar com FAQPage como atalho de rich result: para sites comuns, o Google
  deixou de exibir esse resultado regularmente;
- mostrar autoria, revisão técnica, versão testada, publicação e última revisão;
- usar screenshots reais e sanitizados, com dimensões definidas, legenda e alt
  útil;
- declarar uma imagem representativa em Article e Open Graph;
- usar imagens rastreáveis em HTML, responsivas e sem causar layout shift;
- adicionar Ajuda e Guias ao cabeçalho, rodapé e seções relevantes da home;
- adicionar RSS para Guias quando houver cadência;
- listar no llms.txt apenas hubs e artigos estáveis, sem tratar o arquivo como
  fator de ranking;
- revisar o crawl desnecessário de APIs sem tratar robots.txt como mecanismo de
  segurança.

Testes de CI recomendados:

- link interno quebrado;
- canonical apontando para outra página;
- hreflang sem retorno;
- artigo publicado fora do sitemap;
- draft dentro do sitemap;
- slug duplicado;
- mais de um H1;
- imagem ausente ou sem alt;
- asset com nome fora da convenção em inglês;
- screenshot sem origem, versão ou data de revisão aplicável;
- imagem acima do orçamento de bytes definido para o template;
- metadata igual à home;
- página inglesa usando imagem social exclusivamente em português.

---

## 13. Evitar canibalização

| Grupo | Página canônica | O que as páginas de apoio não devem repetir |
|---|---|---|
| Multistream | G01 explica métodos e arquitetura | G02 e G06 focam combinações, regras e passos das plataformas |
| Live travando | G04 é a árvore geral | G08 aprofunda métricas; G09 trata uma única plataforma |
| Local × nuvem | G05 é a decisão técnica | G10 responde à comparação comercial com Restream |
| Regras | G11 cobre simulcast | G12 cobre especificamente painel privado e overlay de chat |
| Chaves | G13 é educativo e de segurança | A06 ensina os campos e ações dentro da Corneta |
| Bitrate | G07 mantém a matriz externa | A08 explica os modos internos do app |

Antes de aprovar uma pauta, procurar a consulta e o assunto no corpus. Se uma
página existente já resolve a mesma tarefa para a mesma pessoa, atualizar a
página em vez de abrir outra.

---

## 14. Medição

### 14.1 Qual ferramenta responde a qual pergunta

| Pergunta | Fonte |
|---|---|
| O Google encontrou e indexou a página? | Search Console e inspeção de URL |
| Quais consultas mostram a página? | Search Console |
| Impressão vira clique? | Search Console, por página e consulta |
| A pessoa navega para ajuda relacionada ou download? | PostHog, com preferência respeitada |
| O artigo resolveu a tarefa? | Feedback explícito “Este artigo ajudou?” |
| A página reduz pedidos de suporte? | Códigos/categorias de suporte, sem inferir apenas por tráfego |

PostHog não substitui Search Console para SEO.

### 14.2 Mudanças mínimas na telemetria do site

Hoje, qualquer página editorial seria classificada como “other”. Na Fase 0:

- adicionar route IDs fechados para help_index, help_article, guides_index,
  guide_article e changelog;
- permitir content_id controlado pelo frontmatter nos eventos de page view;
- adicionar CTAs genéricos e allowlisted, como content_download,
  content_related e content_open_help;
- opcionalmente adicionar voto binário de utilidade;
- nunca coletar termo digitado, título de live, canal, stream key, URL completa,
  query string, texto livre ou conteúdo do artigo;
- manter opt-out, DNT/GPC, ausência de session replay e redaction atuais.

### 14.3 Linha de base e decisões

1. Enviar sitemap e inspecionar as primeiras URLs.
2. Esperar 28 dias para a primeira linha de base, sem chamar ausência de tráfego
   inicial de fracasso.
3. Comparar por cluster e por consulta não relacionada à marca.
4. Reavaliar em 8 e 12 semanas:
   - muitas impressões e CTR baixo: revisar title, descrição e aderência;
   - posição aproximada entre 8 e 20: aprofundar prova, resposta e links internos;
   - pouca impressão: validar intenção, indexação e sobreposição;
   - tráfego sem próxima ação: revisar CTA e encaixe com o produto;
   - feedback ruim: corrigir a tarefa antes de tentar ampliar alcance.
5. Usar os dados para promover, fundir, reescrever ou retirar pautas.

Não definir meta absoluta de tráfego antes da linha de base.

---

## 15. Fluxo editorial

~~~text
ideia
  → validar intenção e sobreposição
  → criar brief e pacote de fontes
  → executar ou testar no produto
  → escrever
  → revisão técnica
  → revisão editorial/SEO
  → publicar
  → inspecionar e medir
  → revisar, fundir ou retirar
~~~

### Definition of Done de um artigo

- [ ] Resolve uma pergunta ou tarefa única.
- [ ] Tem resposta direta no começo.
- [ ] Foi testado na versão declarada.
- [ ] Usa nomes reais da interface.
- [ ] Cita fontes primárias para fatos externos.
- [ ] Mostra limites e quando a solução não serve.
- [ ] Não promete recurso experimental como estável.
- [ ] Tem autor e revisor reais.
- [ ] Tem canonical, metadata e schema corretos.
- [ ] Não usa imagem de capa; screenshots ficam junto ao trecho que explicam.
- [ ] Tem links contextuais de entrada e saída.
- [ ] Funciona em mobile, teclado e zoom de 200%.
- [ ] Não expõe chave, token, caminho local ou dados pessoais em screenshot.
- [ ] Todo conteúdo essencial da imagem também pode ser entendido pelo texto.
- [ ] Screenshots correspondem à versão e ao idioma declarados.
- [ ] Assets têm nome em inglês, alt localizado, dimensões e origem registrados.
- [ ] Imagens externas foram revisadas contra a interface e as regras atuais.
- [ ] Está no sitemap e passa na inspeção de URL.
- [ ] Tem data ou gatilho de próxima revisão.

---

## 16. Fontes oficiais para os primeiros pacotes

Fontes verificadas em 01/08/2026. Revalidar as regras voláteis na revisão de cada
artigo.

### Conteúdo e SEO

- [Google — Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [Google — SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
- [Google — Search Essentials](https://developers.google.com/search/docs/essentials)
- [Google — Article structured data](https://developers.google.com/search/docs/appearance/structured-data/article)
- [Google — General structured data guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)
- [Google — Managing multilingual sites](https://developers.google.com/search/docs/advanced/crawling/managing-multi-regional-sites)
- [Google — Changes to FAQ and HowTo rich results](https://developers.google.com/search/blog/2023/08/howto-faq-changes)
- [Google — Image SEO best practices](https://developers.google.com/search/docs/appearance/google-images)
- [web.dev — Browser-level image lazy loading](https://web.dev/articles/browser-level-image-lazy-loading)

### OBS e plataformas

- [OBS — Stream Connection Troubleshooting](https://obsproject.com/kb/stream-connection-troubleshooting)
- [OBS — Encoding Performance Troubleshooting](https://obsproject.com/kb/encoding-performance-troubleshooting)
- [YouTube — Stream across platforms](https://support.google.com/youtube/answer/16404722?hl=en)
- [YouTube — Encoder settings, bitrates and resolutions](https://support.google.com/youtube/answer/2853702?hl=pt-BR)
- [Twitch — Simulcasting Guidelines FAQ](https://help.twitch.tv/s/article/simulcasting-guidelines)
- [Twitch — Stream Key FAQ](https://help.twitch.tv/s/article/twitch-stream-key-faq?language=pt_BR)
- [Twitch — Terms of Service](https://legal.twitch.com/en/legal/terms-of-service/)
- [Kick — Multistreaming no KICK Partner Program](https://help.kick.com/pt-BR/articles/11091744-multistreaming-no-kick-partner-program)

---

## 17. Próxima ação recomendada

Publicar o site, validar `https://www.corneta.live` no Google Search Console e
no Bing Webmaster Tools e enviar `/sitemap.xml`. Depois de 28 dias completos,
encerrar a primeira issue de manutenção com a linha de base de cliques,
impressões, CTR e posição e com pelo menos duas ações substanciais escolhidas.

Enquanto não houver dados suficientes, o backlog não deve crescer por intuição.
As próximas revisões vêm da fila automática, das mudanças de produto detectadas
nas releases e das dúvidas reais recebidas no suporte.
