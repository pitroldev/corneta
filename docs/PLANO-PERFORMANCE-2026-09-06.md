# Corneta ainda mais rápida: plano de otimização

Data: 06/09/2026. Base analisada: commit `6e12a60`.

## Resumo executivo

A próxima rodada deve atacar três coisas diferentes: trabalho desnecessário durante a live, crescimento de memória em sessões longas e travamentos perceptíveis ao interagir com a interface.

As primeiras implementações recomendadas são:

1. Limitar o cache de medições do chat: o limite de 400 mensagens não limita esse outro cache. Um teste isolado reproduziu 10.000 medições retidas.
2. Analisar cada relatório uma única vez e gerar somente o formato escolhido na exportação.
3. Tirar leitura e gravação de arquivos dos caminhos que precisam responder imediatamente, especialmente a entrega de mensagens do chat.
4. Isolar o relógio do replay e processar relatórios grandes fora da thread da interface.
5. Evitar conversões repetidas de áudio e vídeo entre destinos equivalentes.

O maior potencial de redução estrutural de RAM está no Guardião. Entretanto, seu buffer atual faz parte da proteção preventiva: a alternativa comprimida precisa ser um projeto separado, com provas de segurança, e não uma redução apressada de qualidade ou do atraso.

Este documento registra a auditoria anterior à implementação. A execução solicitada depois, seus testes e as ressalvas de F14/F16 estão em [IMPLEMENTACAO-PERFORMANCE-2026-09-06.md](IMPLEMENTACAO-PERFORMANCE-2026-09-06.md). As configurações pessoais, gravações e relatórios reais do usuário não foram alterados nesta rodada.

## 1. Evidências e limites desta análise

Foram revisados os caminhos de transmissão, compositor, OCR, coleta de recursos, persistência de sessões/chat, estado React, relatórios/replay, inicialização, build e catálogo editorial do site.

Classificação utilizada:

- **Confirmado no código:** a operação ou retenção existe; seu impacto no aplicativo completo ainda pode precisar de medição.
- **Reproduzido isoladamente:** um experimento verificou o comportamento, mas não representa um benchmark ponta a ponta.
- **Hipótese/protótipo:** uma alternativa plausível que só deve ser promovida depois de comparação controlada.

### Medições realizadas

| Verificação | Resultado | O que não demonstra |
| --- | --- | --- |
| Teste existente de relatório de 8 horas, 14.400 amostras e 4 destinos | 1 teste passou; Vitest informou 88 ms para o teste | Não é o tempo exclusivo de `analyze`, nem o tempo de abertura no WebView. O teste também cria a fixture; o intervalo verificado internamente inclui serialização, parsing e análise. |
| Virtualizador instalado, `@tanstack/virtual-core` 3.17.7, janela de 400 itens e 10.000 IDs medidos sucessivamente | `count = 400`; `itemSizeCache.size = 10000` | Não mede MB de heap nem reproduz toda a interação React/DOM. Demonstra retenção de medições ao renovar IDs. |

O teste de relatório foi executado com Node 24.18.1:

```powershell
mise.exe exec node@24.18.1 -- node.exe node_modules/vitest/vitest.mjs run src/lib/report.performance.test.ts --reporter=verbose
```

O experimento do virtualizador usou `Virtualizer` da dependência instalada: a cada rodada, `setOptions` manteve `count: 400`, deslocou `getItemKey`, chamou `getTotalSize()` e `resizeItem(399, 29)`, com altura estimada de 28. Não houve mudança no código da dependência.

Não foram feitos nesta auditoria: perfil de uma live real em release, comparação entre GPUs, benchmark completo de build, medição de consumo total do app ou teste visual automatizado. Portanto, não há promessa de redução percentual de CPU, RAM ou tempo de abertura.

### Otimizações que já existem e devem ser preservadas

- Quadros compartilhados com `Bytes`, evitando as antigas cópias integrais entre consumidores; isso não elimina todas as alocações de captura.
- Chat com buffer de 400 mensagens, virtualização, linhas memoizadas e callbacks estabilizados.
- Gráficos com geometria memoizada e limite de 600 pontos desenhados.
- Telas carregadas sob demanda e pré-carregamento por intenção de navegação.
- Detecção de encoder adiada, compartilhamento de consultas concorrentes e cache persistente.
- Recuperação de sessões pela cauda do arquivo, em vez de reler todo o conteúdo.
- Coletor nativo de recursos, amostragem de aplicativos espaçada e modo de investigação temporário.
- Feed de programa adaptativo e Guardião limitado a 1080p/30 para conter memória.
- Caminho comprimido do “Já volto” quando o Guardião está desligado: `use_splicer = brb_enabled && !guard`.
- Tailwind já limitado a `src` por `source(".")`; minificação Oxc; Rust release com `opt-level = 3` e LTO; CI com caches de pnpm, Rust e sccache.

Referências: [otimizações anteriores](OTIMIZACOES-PERFORMANCE-2026-07-20.md), [engine](../src-tauri/src/engine.rs), [compositor](../src-tauri/src/compositor.rs), [inicialização da live](../src-tauri/src/commands.rs), [Vite](../vite.config.ts) e [CI](../.github/workflows/ci.yml).

## 2. Backlog priorizado

P0 = primeira rodada, por evidência e relação entre benefício e risco. P1 = próximo ciclo, depois da instrumentação. P2 = condicionado ao perfil ou a um protótipo. As complexidades são relativas, não estimativas de prazo.

| ID | Prioridade | Oportunidade | Principal benefício | Complexidade / risco |
| --- | --- | --- | --- | --- |
| F01 | P0 | Limitar medições antigas do chat | RAM estável em lives longas | Média / médio: ancoragem do scroll |
| F02 | P0 | Uma análise por revisão do relatório | Menos CPU e espera ao abrir/editar | Baixa–média / baixo |
| F03 | P0 | Exportar somente o formato escolhido | Menos CPU e pico de memória | Baixa / baixo |
| F04 | P0 | Leitura nativa de relatórios fora da thread principal | Janela responsiva durante I/O | Baixa–média / baixo |
| F05 | P0 | Writer persistente e assíncrono para chat/sessão | Menos I/O no caminho da live | Média / médio: durabilidade |
| F06 | P0 | Limitar subprocessos no fallback de GPU | Menos custo recorrente e bloqueios | Baixa–média / baixo |
| F07 | P1 | Worker de relatórios e chat paginado | Menos travamentos e cópias grandes | Alta / médio |
| F08 | P1 | Cache de resumos carregado uma vez e invalidado corretamente | Lista de relatórios mais rápida | Média / baixo |
| F09 | P1 | Lotes no chat e deduplicação limitada por ID | Menos CPU sob rajadas | Média / médio: ordem/moderação |
| F10 | P1 | Isolar relógio do replay e conteúdo fechado | Menos renderizações desnecessárias | Média / médio |
| F11 | P1 | Primeiro desenho independente da telemetria | Abertura percebida mais rápida | Baixa–média / médio: consentimento |
| F12 | P1 | Áudio compatível sem reconversão | Menos CPU por destino | Média / médio: compatibilidade |
| F13 | P1 | Compartilhar conversões entre destinos idênticos | Menos CPU, GPU e sessões de encoder | Alta / alto: isolamento de falhas |
| F14 | P2 | Decodificação e filtros na GPU onde compensar | Menos CPU e transferências | Alta / alto: drivers e filtros |
| F15 | P1 | Pool limitado de quadros e métricas de filas | Menos alocações e jitter | Média–alta / alto: propriedade dos buffers |
| F16 | P2 | Buffer comprimido do Guardião | Maior potencial de redução de RAM | Muito alta / muito alto: proteção |
| F17 | P2 | OCR com menos conversões e orçamento de execução | Menos CPU concorrendo com o jogo | Média–alta / alto: cobertura |
| F18 | P1 | Gráficos limitados sem perder picos | Fluidez com fidelidade dos dados | Média / médio |
| F19 | P2 | Catálogo editorial pré-processado | Menor trabalho em requisições dinâmicas | Média / baixo |
| F20 | P2 | Orçamento de entrada e build por etapa | Menor startup e ciclo de desenvolvimento | Média / baixo |

## 3. Chat e persistência durante a live

### F01 — O cache de alturas também precisa ter limite

**Evidência:** [ChatFeed](../src/components/ChatFeed.tsx), especialmente a ancoragem por `virt.itemSizeCache`; comportamento reproduzido na versão instalada do virtualizador.

O feed usa IDs de mensagens como chaves. Medições de IDs que saíram continuam no mapa durante a renovação normal dos itens. Além da retenção, o cálculo da altura média percorre `sizes.values()` quando faltam medições: esse custo pode crescer com o histórico medido, não apenas com as 400 mensagens atuais.

Proposta:

- Reter apenas medições necessárias para os itens atuais e para a compensação da janela anterior.
- Primeiro calcular a compensação de scroll; depois descartar medições obsoletas.
- Não limpar todo o cache por mensagem: isso provocaria remedições, saltos e perda da posição de leitura.
- Encapsular a política em um adaptador/hook testado. Se a API pública não permitir a poda com consistência, avaliar correção upstream ou patch versionado; não editar `node_modules` manualmente nem depender silenciosamente de detalhes internos.

Aceite: com 100.000 IDs rotativos, a quantidade de medições deve permanecer proporcional à janela, não ao total recebido. Testar chat principal, popout e replay; scroll pausado; mudança de fonte; emotes carregados depois; reconexão e limpeza. Medir heap após aquecimento, sem confundir cache do navegador com vazamento.

### F05 — Não esperar o disco para entregar uma mensagem

**Evidência:** [DiskStore](../src-tauri/src/session/store.rs), [sessões](../src-tauri/src/session/mod.rs) e `emit_chat` em [chat.rs](../src-tauri/src/chat.rs).

O relatório principal registra um `BufWriter`, mas o chat usa o caminho alternativo de abrir, escrever e fechar o arquivo por mensagem. `append` consulta `fs::metadata` a cada linha. A gravação acontece antes da entrega ao overlay e à interface. Nos writers registrados, escrita e flush ainda ocorrem sob um mutex global.

Proposta:

- Um serviço de escrita por sessão, com handles persistentes para relatório e chat e fila limitada por quantidade e bytes.
- O caminho de recepção enfileira trabalho e libera a entrega visual rapidamente; I/O e flush ficam no consumidor.
- Agrupar por tamanho/tempo, começando com valores experimentais como 64 KiB ou 50–100 ms, ajustados por benchmark.
- Controlar o limite do arquivo incluindo bytes persistidos, pendentes e da nova linha; hoje a consulta ao tamanho em disco não contempla tudo isso.
- Flush periódico e drenagem explícita ao encerrar. Definir separadamente durabilidade contra queda do processo e contra perda de energia: `flush` não equivale a sincronizar fisicamente o disco.
- Tratar falhas de escrita sem tempestade de logs. Uma fila cheia não pode virar RAM ilimitada nem travar indefinidamente a live; perdas de chat devem produzir lacuna explícita, preservando ordem, moderação e registros essenciais de sessão.

Aceite: testar 10, 100 e 500 mensagens/s, disco lento/cheio, encerramento e reinício. Contabilizar latência de entrega, abertura de handles, ocupação da fila, descartes, limite dos arquivos e recuperação. Não afirmar que o chat foi salvo antes da confirmação da persistência.

### F09 — Processar rajadas de chat em lotes pequenos

**Evidência:** `bindChat` em [store.ts](../src/lib/store.ts) faz um `set` por mensagem, busca duplicatas com `.some` e copia o buffer limitado. A virtualização já reduz DOM, mas não elimina esse trabalho anterior ao render.

Proposta: acumular eventos por uma janela curta, por exemplo 16–50 ms, aplicar a sequência em um único update e usar índice de deduplicação limitado com chave composta por plataforma, origem e ID nativo. Expulsar a chave quando a mensagem sair do buffer.

Mensagens, exclusões e mudanças de conexão precisam manter a ordem observável; uma exclusão não pode ser aplicada antes da mensagem que estava no lote. Não usar deduplicação sem limite nem descartar mensagens apenas para reduzir renderizações.

Para janelas ocultas/minimizadas, reduzir trabalho de apresentação, não a captura nativa. Ao voltar, entregar um estado atual consistente sem reproduzir uma fila ilimitada de renders antigos. Suspender o WebView inteiro exige antes auditar quais tarefas funcionais ainda dependem dele.

Aceite: medir updates do store e commits React por segundo, latência até exibição, leitura com scroll pausado e sincronização com o popout. A janela de agrupamento é parte da latência e deve entrar no orçamento.

## 4. Relatórios rápidos de verdade

### F02 — Uma análise por revisão relevante

**Evidência:** [useReportDetailData](../src/screens/reports/useReportDetailData.ts) chama `analyze(parsed, t)` ao preencher o cache de uma sessão encerrada e novamente no `useMemo` que alimenta a tela. Marcar um momento ou remover gravações cria outro objeto `data`, invalidando a análise e o índice de replay mesmo quando as amostras não mudaram.

Proposta: uma análise canônica por revisão dos dados que realmente a afetam. Separar séries/amostras, marcadores, gravações e apresentação traduzida. Resumo e tela devem consumir o mesmo resultado; marcador não deve refazer diagnóstico de CPU/GPU. Alterações que afetem uma análise específica continuam invalidando essa parte.

Aceite: instrumentar contagem de chamadas em release, sem confundir verificações extras do Strict Mode em desenvolvimento. Abrir uma sessão encerrada deve executar uma análise integral; adicionar marcador deve preservar player, posição, scroll e análise técnica. Mudança de idioma não deve obrigar nova leitura integral se só os textos mudaram.

### F03 — O exportador deve executar só a opção escolhida

**Evidência:** `DownloadModal` em [ReportModals](../src/screens/reports/ReportModals.tsx) monta um objeto com resultados de `reportHtml`, `seriesCsv` e `reportJson`, e só depois seleciona `[format]`. As três funções são avaliadas. Há também nova análise síncrona antes da primeira espera.

Proposta: selecionar primeiro o formato com `switch`/dispatch preguiçoso; carregar o módulo correspondente sob demanda; reutilizar a análise quando compatível; executar processamento pesado fora da interface. `setBusy(true)` sozinho não garante que o spinner seja pintado antes de trabalho síncrono longo.

A opção anônima deve continuar removendo identificadores de dados e de textos derivados. Reaproveitar uma análise não anonimizada sem verificar seu conteúdo pode reintroduzir dados privados no arquivo.

Aceite: teste com spies garantindo exatamente um exportador por clique; arquivos equivalentes aos atuais; opção anônima verificada; feedback visível enquanto processa; apenas um resultado de exportação retido por operação. Avaliar carregar também o recap sob demanda, sem atrasar a navegação inicial por uma função ainda não aberta.

### F04 — I/O de relatórios não deve bloquear o event loop nativo

**Evidência:** `list_sessions`, `read_session` e `read_session_chat` são comandos síncronos em [commands.rs](../src-tauri/src/commands.rs); [DiskStore::read](../src-tauri/src/session/store.rs) usa `fs::read_to_string`.

Comandos Tauri síncronos, sem a opção assíncrona do macro, executam na thread principal. A documentação também alerta para o custo de serializar arquivos grandes como JSON. [Fonte: comandos Tauri](https://v2.tauri.app/develop/calling-rust/).

Proposta: comandos assíncronos com I/O bloqueante isolado em `spawn_blocking`, concorrência limitada e handles/paths validados. Apenas adicionar `async` em volta de uma leitura bloqueante não transforma a operação em I/O não bloqueante. Começar por isso sem mudar o formato NDJSON existente.

Aceite: listar/abrir relatório em disco lento enquanto a janela responde a input; cancelamento lógico de respostas antigas; testes de arquivo ausente, parcial e inválido; nenhuma ampliação do escopo de acesso ao disco.

### F07 — Worker com propriedade clara dos dados; chat por intervalo

**Evidência:** parsing e análise são executados no frontend; o detalhe abre relatório, chat completo e eventualmente a sessão anterior em efeitos independentes. [Hooks de detalhe](../src/screens/reports/useReportDetailData.ts), [parser](../src/lib/report.ts), [limites de sessão](../src-tauri/src/session/domain.rs).

Proposta em etapas:

1. Aplicar F02/F04 e separar cálculo numérico de textos traduzidos; funções `t` não podem ser enviadas como se fossem dados para um worker.
2. Um worker limitado por tela mantém os dados completos e calcula análise/modelos. A interface recebe resumos e séries necessárias, não cópias integrais sucessivas.
3. Experimentar leitura binária via IPC e transferência de `ArrayBuffer`. Isso evita uma cópia na fronteira worker, mas não torna toda a cadeia disco → Tauri → WebView gratuita. [Fonte: objetos transferíveis](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects).
4. Carregar primeiro a história da live; adiar comparação anterior e detalhes secundários. No replay, buscar chat por faixa de tempo com prefetch limitado, índice e semântica de exclusões/lacunas preservada.
5. Cancelar resultados obsoletos e, quando possível, o próprio processamento. Na troca de relatório, liberar referências, worker e buffers anteriores.

Mover trabalho para um worker melhora responsividade, mas não reduz automaticamente CPU total. Durante a live, esse trabalho deve ter concorrência/orçamento controlados para não competir agressivamente com o jogo e o motor.

Aceite: abrir o maior arquivo suportado e continuar clicando/rolando; repetir navegação entre relatórios; medir long tasks, pico de heap e tempo até conteúdo útil. Não manter simultaneamente texto bruto, todas as linhas, objetos completos e clones em ambos os lados sem necessidade.

### F08 — Cache de resumos: uma leitura, invalidação correta e limite

**Evidência:** [summaryCache](../src/lib/summaryCache.ts) desserializa todo o mapa a cada `getCachedSummary`; [useReportSessions](../src/screens/reports/useReportSessions.ts) chama isso para cada sessão. Cada escrita também relê e serializa o mapa. A chave identifica a sessão, mas não uma substituição externa do arquivo com o mesmo ID.

Proposta: carregar o cache uma vez para memória, consultar em O(1), persistir em lote e podar entradas órfãs. Validar versão da análise e revisão do arquivo, usando metadados adequados; para importação/substituição controlada, invalidar explicitamente. `mtime` isolado não é prova universal de conteúdo idêntico.

Manter a leitura de sessões faltantes limitada: o processamento sequencial atual protege RAM. Priorizar sessões recentes/visíveis e interromper a fila ao navegar. Não trocar por `Promise.all` sobre todo o histórico.

Como evolução, gerar resumos persistentes após o encerramento, em segundo plano, com a mesma implementação de análise. Evitar criar uma segunda heurística independente em Rust que possa divergir da tela e da exportação.

Aceite: lista com cache quente sem parsing de relatórios completos; cache frio sem pico proporcional ao histórico inteiro; importação com ID existente atualiza os números; storage cheio/indisponível não impede abrir a tela.

### F10 — O relógio do replay não deve renderizar a página inteira

**Evidência:** [ReportDetail](../src/screens/reports/ReportDetail.tsx) mantém `useReportTimeline` e passa `timeline.setPlayhead` ao replay. O cursor altera estado no ancestral das seções. Os modelos já têm memoização, mas isso não impede todas as renderizações de componentes. [Modelos](../src/screens/reports/useReportModels.ts), [player](../src/components/ReplayPlayer.tsx).

Proposta: restringir atualizações frequentes ao player, cursor dos gráficos e janela do chat; seções estáticas recebem props estáveis. O chat só precisa de novo recorte quando muda o índice de mensagens ou a moderação relevante, não a cada avanço fracionário do vídeo.

Em [ReportTechnicalEventsPanel](../src/screens/reports/ReportTechnicalEventsPanel.tsx), disclosures fechados ainda recebem filhos construídos, e “ver todos” pode montar todo o conjunto. Montar detalhes sob demanda e paginar/virtualizar apenas conjuntos comprovadamente grandes, preservando o total e a navegação aos instantes.

Aceite: React Profiler confirma que cards estáticos não fazem commit a cada tick; seek continua preciso; abrir detalhes funciona com teclado; gráficos mantêm toda a largura; marcação não pisca nem reinicia o player. A história da live continua em primeiro plano, com diagnóstico técnico secundário.

### F18 — Limitar pontos sem apagar justamente os picos

**Evidência:** [chartPath](../src/lib/chartPath.ts) usa amostragem uniforme de até 600 índices. Para séries maiores, pode pular picos curtos e não inclui necessariamente o último ponto. A proteção contra ligar linhas através de lacunas já existe.

Proposta: agregação visual por faixa de pixels, preservando mínimo/máximo, extremos temporais e lacunas, com teto explícito de pontos. Tooltip e seek continuam usando a série original. Compartilhar a mesma geometria com exportação HTML. Substituir buscas lineares de timestamp em modelos por busca binária quando executadas repetidamente sobre séries ordenadas.

Aceite: fixtures com um pico de uma amostra, último ponto extremo, intervalos nulos, durações longas e múltiplos canais. Medir custo de geração e resize. Não trocar SVG por Canvas/WebGL sem evidência de que o renderer atual, já limitado, é o gargalo.

## 5. CPU/GPU da transmissão e memória do Guardião

### F06 — O fallback de GPU ainda pode criar processos recorrentes

**Evidência:** no loop de recursos em [commands.rs](../src-tauri/src/commands.rs), quando a GPU nativa não está disponível, `read_gpu()` executa `nvidia-smi` com `.output()`. Uma falha desativa novas tentativas; um sucesso permite repetir nos ciclos seguintes, aproximadamente a cada dois segundos mais o tempo de coleta. Não há timeout explícito nessa execução.

Proposta: manter o coletor nativo como preferência. No fallback, comparar processo persistente com leitura periódica contra polling mais espaçado com timeout, encerramento e coleta do processo filho. Evitar sobreposição de chamadas; desligar corretamente ao parar a live; valor desconhecido deve continuar desconhecido, não virar 0%.

Aceite: máquina sem NVIDIA, contador nativo ausente, utilitário lento/travado, driver indisponível e encerramento repetido. Verificar processos restantes e custo de amostragem. A otimização importa no fallback, não é uma acusação de subprocessos constantes no caminho normal nativo.

### F12 — Evitar reconversão de áudio já compatível

**Evidência:** `ffmpeg_args_for_target` em [engine.rs](../src-tauri/src/engine.rs) sempre codifica AAC, inclusive quando o vídeo usa `copy`. Com normalização ligada, cada destino aplica seu próprio filtro.

Proposta: copiar áudio quando codec, parâmetros e contrato do destino forem compatíveis e não houver transformação solicitada. Validar a configuração efetiva da fonte, não presumir compatibilidade só porque ela veio do OBS. Normalização necessária pode ser produzida uma vez por configuração equivalente e reaproveitada.

Aceite: áudio ausente, mono/estéreo, taxas distintas, troca de fonte, normalização on/off e cada plataforma. Conferir volume, timestamps e sincronização. Normalização não é “gratuita” só porque já existe um encoder de áudio; medir seu custo.

### F13 — Converter uma vez, distribuir para vários destinos

**Evidência:** o supervisor cria processos por destino em [commands.rs](../src-tauri/src/commands.rs). Cada destino não-copy configura sua própria conversão em [engine.rs](../src-tauri/src/engine.rs).

Proposta: agrupar pela configuração efetiva completa: codec, resolução, FPS, bitrate, GOP, enquadramento/filtros, áudio e parâmetros relevantes do encoder. Produzir uma versão de vídeo por grupo e distribuí-la por saídas independentes, aproveitando o roteador local quando viável. Não agrupar apenas por “1080p” ou plataforma.

Se um destino precisar reduzir bitrate individualmente, deve sair do grupo ou consumir outra versão. Uma saída lenta, credencial inválida ou reconexão não pode bloquear as demais. Um muxer `tee` não resolve isso automaticamente: a documentação distingue filas por saída e políticas de falha. [Fonte: FFmpeg tee](https://ffmpeg.org/ffmpeg-formats.html#tee).

Aceite: contar encoders e decoders antes/depois com 2–4 destinos idênticos e com todos diferentes; derrubar um destino; saturar sua saída; mudar bitrate/enquadramento. Comparar qualidade, consumo, atraso e recuperação. O ganho esperado está na conversão compartilhada, não em reduzir a banda de upload somada dos destinos.

### F14 — Hardware encoder não significa pipeline inteiro na GPU

**Evidência:** o caminho de destino usa `scale`/reframe e não solicita aceleração de decode como o decoder do compositor faz. Selecionar um encoder de hardware não elimina, por si, o decode e os filtros em CPU. [Engine](../src-tauri/src/engine.rs).

Hipótese: em caminhos sem leitura obrigatória pela CPU, manter decode, escala e encode no mesmo dispositivo pode reduzir transferências e carga de CPU. Prototipar por fornecedor, filtros suportados e GPU efetiva; hardware decode pode perder vantagem quando exige download/upload dos quadros.

Não aplicar globalmente ao Guardião: seu OCR inspeciona pixels na CPU. Tampouco assumir que todo filtro de enquadramento tem equivalente acelerado ou que a GPU do encoder é a mesma usada pelo jogo.

Aceite: comparação por NVIDIA, AMD, Intel e fallback software; engines de decode/encode/3D medidos separadamente; VRAM, transferência, qualidade e latência. Promover somente combinações verificadas, com fallback seguro.

### F15 — Pool de quadros: menos alocação, não um milagre de RAM

**Evidência:** `spawn_frame_source` em [compositor.rs](../src-tauri/src/compositor.rs) cria `vec![0u8; fsize]` para cada quadro. Mais adiante, `Bytes` já permite compartilhamento sem cópias integrais entre consumidores.

Em 1080p YUV420, cada quadro contém 3.110.400 bytes. A 30 FPS, esse caminho aloca aproximadamente 93,3 MB de payload por segundo. Isso é volume de alocação, não crescimento líquido de memória por segundo, nem uma medição de throughput físico da RAM.

Proposta: pool limitado com reutilização apenas depois de todos os consumidores liberarem o quadro, sem alias mutável indevido. Aquecimento gradual, limite por configuração e liberação ao encerrar. Evitar `unsafe` para pular inicialização sem uma necessidade demonstrada e uma prova de inicialização completa.

Instrumentar também ocupação e idade dos itens nas filas de vídeo/áudio. Não diminuir filas arbitrariamente: há produtores independentes e proteção contra bloqueio entre áudio e vídeo. Um pool pode reduzir jitter/alocação e ainda aumentar memória retida se for superdimensionado.

Aceite: alocações por segundo, tempo p95/p99 por quadro, ausência de corrupção, pressão artificial do encoder, reconexões, slate e encerramento. A memória deve estabilizar no teto documentado para a configuração.

### F16 — O buffer comprimido é o maior projeto de RAM

**Evidência:** o Guardião mantém atraso de 12 segundos, com quadros brutos, em 1080p/30. [Engine](../src-tauri/src/engine.rs) e [compositor](../src-tauri/src/compositor.rs).

Estimativa de capacidade, não medição de RSS:

```text
1920 × 1080 × 1,5 × 30 × 12 = 1.119.744.000 bytes
                                  ≈ 1,04 GiB de vídeo bruto
```

Isso exclui folga da fila, canais, frame atual, OCR, modelos, áudio, encoders e WebView. O compartilhamento com `Bytes` evita duplicar quadros, mas não elimina o armazenamento dos 360 quadros de atraso. Não se trata, por esse número sozinho, de vazamento.

Hipótese arquitetural: armazenar o atraso como pacotes comprimidos, manter uma trilha decodificada para inspeção e controlar a saída atrasada com substituição segura dos trechos sensíveis. Como comparação de payload, 12 segundos de vídeo a 6.000 kbps representam cerca de 9 MB; isso não é uma previsão de RAM total da solução.

Requisitos antes de substituir o caminho atual:

- Proteção antes da saída do conteúdo sensível, inclusive no meio de um GOP e com referências entre quadros.
- Timestamps, áudio, parâmetros de codec, keyframes e transições entre conteúdo/cobertura consistentes.
- Cobertura segura quando OCR atrasa, falha ou perde a capacidade de analisar; nunca liberar conteúdo por timeout só para reduzir latência.
- Qualidade e atraso equivalentes; teste de privacidade quadro a quadro com eventos em bordas de transição.
- Fallback para a arquitetura atual e implantação opt-in controlada até a validação.

O splicer existente oferece experiência reaproveitável, mas o “Já volto” sem Guardião não prova que censura preventiva comprimida é segura. Não encurtar os 12 segundos nem reduzir a resolução de inspeção como atalho de performance.

### F17 — OCR eficiente com orçamento, sem perder cobertura

**Evidência:** [pipeline](../src-tauri/src/guardian/pipeline.rs) espera novos quadros com polling de 8 ms, aplica cadência e faz warmup. [OCR](../src-tauri/src/guardian/ocr.rs) converte pixels para o modelo; no fallback Windows, faz JPEG e depois decodificação. O número de threads de inferência já é limitado.

Propostas condicionadas a profiling:

- Sinalizar disponibilidade do slot em vez de acordar continuamente quando vazio, mantendo cancelamento e o contrato de atualização do quadro.
- Reutilizar buffers de conversão quando as APIs permitirem.
- Experimentar entrada direta de bitmap no fallback Windows, evitando o ciclo JPEG; validar formatos e precisão.
- Comparar orçamentos de threads com jogo + transmissão ativos, não só inferência isolada.
- Medir reutilização do worker/modelo entre lives contra o custo de manter memória ocupada quando o recurso não é usado.

Aceite: corpus de textos pequenos, fontes/idiomas, telas densas, conteúdo parado, transições e máquina sob pressão. Medir latência p95/p99 e falsos negativos. Menos CPU com pior proteção não é uma otimização aceitável. Não migrar OCR para GPU apenas por expectativa: pode competir com o jogo ou introduzir transferências e filas maiores.

## 6. Startup, site e build

### F11 — Desenhar a interface sem esperar inicialização secundária

**Evidência:** [main.tsx](../src/main.tsx) só executa `render` em `initializeTelemetry(api).finally(render)`. A inicialização lê o estado local; o SDK já é carregado de forma adiada. Portanto, o gargalo potencial é a dependência de IPC antes do primeiro desenho, não uma espera obrigatória pela rede ou pelo SDK.

Proposta: montar a estrutura inicial e iniciar essa leitura em paralelo, mantendo captura desabilitada até resolver o estado aplicável. Tratar status pendente/erro, respeitar o contrato atual de consentimento e não enviar eventos antecipadamente para depois tentar desfazê-los. A inicialização da configuração pode avançar assim que sua dependência real permitir.

Aceite: cronômetro desde lançamento até primeiro desenho e até controles funcionais; IPC lento/erro; telemetria desligada; revogação durante inicialização; janela principal e popout. Skeleton não conta como tarefa concluída: medir também o instante em que o usuário consegue agir.

### F19 — Pré-processar o catálogo editorial, se o runtime justificar

**Evidência:** [server.ts](../web/lib/editorial/server.ts) varre arquivos, lê MDX e valida o catálogo; [search.ts](../web/lib/editorial/search.ts) normaliza campos de cada documento a cada busca. Já há leituras independentes em paralelo e `React.cache`.

`React.cache` memoiza dentro do contexto de renderização no servidor, não é uma garantia de cache persistente entre requisições; a documentação explicita invalidação por requisição e uso em Server Components. [Fonte: React cache](https://react.dev/reference/react/cache).

Proposta: medir primeiro as rotas dinâmicas e a busca. Onde houver repetição relevante, gerar manifesto/index de conteúdo publicado no build, com campos de busca pré-normalizados e invalidação por versão de deploy. Preservar validação editorial no CI. Páginas já pré-renderizadas não fazem necessariamente esse trabalho em toda visita.

Aceite: mesma busca, idiomas, ordenação e links; rascunhos ausentes do índice público; deploy invalida conteúdo antigo; TTFB e trabalho de filesystem comparados. Não adicionar banco/cache distribuído só para substituir um catálogo pequeno.

### F20 — Medir o custo agregado da entrada e separar etapas do build

**Evidência:** [check-bundle](../scripts/check-bundle.mjs) limita cada chunk a 110 KiB gzip. Isso não limita a soma de todos os chunks necessários para abrir uma tela. [Vite](../vite.config.ts), [scripts](../package.json), [perfil Rust](../src-tauri/Cargo.toml) e [CI](../.github/workflows/ci.yml) já contêm otimizações importantes.

Proposta:

- Acrescentar orçamento por entrada: JS/CSS/fontes efetivamente necessários, tempo de parse/evaluate e primeiro conteúdo útil. No desktop, bytes gzip são um indicador de distribuição, não uma medição direta do custo de execução no WebView.
- Verificar no grafo do build se exportadores/recap foram realmente separados após F03. Não dividir chunks artificialmente apenas para passar o limite individual.
- Medir typecheck, transformação CSS, bundle, compilação/link Rust, empacotamento e upload de source maps separadamente, com cache frio e quente.
- Avaliar paralelizar validações independentes em jobs adequados, mantendo a release dependente do sucesso de todas. Concorrência excessiva na mesma máquina pode piorar tempo e RAM.
- Usar estatísticas de cache para achar misses antes de propor novas ferramentas: CI já tem sccache e cache de dependências.
- Se o linker dominar builds de desenvolvimento, comparar perfis apropriados e alternativas compatíveis em benchmark. Não sacrificar o perfil de runtime da release para melhorar apenas o tempo de build.

O antigo aviso de percentual de tempo em plugins não informa, sozinho, um build lento em termos absolutos. Não desativar validações de tipos, gates de segredos, source maps exigidos em release ou funcionalidades CSS para esconder o aviso. Benchmarks locais não precisam publicar artefatos nem enviar source maps.

## 7. Como provar que ficou “blazing fast”

### Orçamentos iniciais propostos

São metas a calibrar na máquina de referência, não resultados atuais nem limites universais.

| Experiência | Meta inicial | Forma de medir |
| --- | --- | --- |
| Clique em marcar/exportar/abrir detalhe | Feedback visível em até 100 ms no p95 | Input → paint real, não apenas `setState` |
| Navegação para tela já carregada | Conteúdo útil em até 200 ms no p95 | Clique → conteúdo utilizável; separar cache quente/frio |
| Chat durante rajadas | Entrega nativa → mensagem visível em até 100 ms no p95 | Sem incluir a latência externa da plataforma |
| Relatório grande | Sem long tasks recorrentes acima de 50 ms durante interação | Trace do WebView; medir conclusão total separadamente |
| Replay | Cards estáticos sem render recorrente por tick | React Profiler + frame timing |
| Live longa | Memória estabiliza após aquecimento; filas/caches obedecem teto | Heap JS, memória nativa e VRAM por fase |
| Guardião | Cobertura não piora e execução cabe no orçamento preventivo | Corpus com saída quadro a quadro e latência p99 |

Para startup frio, começar medindo lançamento → janela → primeiro conteúdo → controles prontos, antes de fixar um número comercial. Para CPU/GPU, comparar cenários equivalentes: um valor agregado arbitrário ignora resolução, destinos, proteção e hardware.

### Instrumentação mínima

- Registrar spans de leitura, IPC, parsing, análise, preparação dos gráficos e primeiro paint útil; incluir contagens de chamadas e bytes.
- Medir processos da Corneta, WebView, conversores, roteador e OCR; não atribuir todo o custo apenas ao executável principal. Evitar somar memória compartilhada como se fosse toda privada.
- Separar CPU normalizada pelo total de núcleos, memória privada/commit, working set, heap JS e VRAM. Na GPU, distinguir 3D, decode e encode, por adaptador.
- No motor: tempo por quadro, idade/ocupação das filas, frames descartados, latência de OCR, atraso A/V e tempo de reconexão.
- No writer: bytes pendentes, tempo de flush, falhas e descartes. No chat: mensagens/s, deduplicação, tamanho dos índices e medições retidas.
- Coletar com frequência moderada, buffers limitados e logs agregados. Diagnóstico de performance não pode gerar outra carga permanente relevante.
- Dados locais por padrão; não enviar nomes de aplicativos, conteúdo do chat, URLs/chaves ou caminhos privados para telemetria como parte de uma otimização.

### Matriz de comparação

1. App ocioso, visível, minimizado e com popout aberto.
2. Uma saída em copy; quatro destinos iguais; quatro configurações diferentes.
3. 720p/1080p, 30/60 FPS onde suportado; saída vertical; normalização ligada/desligada.
4. “Já volto” sem Guardião; Guardião com texto parado e mudanças densas; com e sem gravação.
5. Jogo ativo consumindo CPU/GPU, considerando máquinas de entrada e intermediárias e GPUs de fornecedores diferentes.
6. Chat de 10/100/500 mensagens/s, emotes, moderação, reconexão e leitura pausada.
7. Relatórios de 30 minutos, 8 horas e próximos dos limites de arquivo; chat ausente/presente; gravação disponível/ausente; muitos marcadores, lacunas, quedas e pontos técnicos.
8. Disco lento/cheio, destino indisponível, OBS reconectando, parada e início repetidos, suspensão/retorno do computador.

Executar na versão empacotada release, com versões de drivers/OBS registradas, mesmas fontes de vídeo e configurações. Usar repetições suficientes para reportar mediana e p95; distinguir máquina fria de aquecida. Fazer testes longos de memória e alternância entre telas, além de microbenchmarks. Um teste sintético rápido não prova fluidez sob contenção real.

## 8. Sequência recomendada de implementação

### Rodada 1 — Remover desperdícios demonstráveis

F01, F02, F03, F04, F05 e F06, acompanhados das métricas mínimas. Entregas pequenas e verificáveis: cache limitado, uma análise, um exportador, I/O fora do caminho interativo, writer com limites e fallback de GPU controlado.

### Rodada 2 — Melhorar a experiência sob carga

F08 e F11; depois F07, F09, F10 e F18. Preservar o layout e comportamento que já funcionam: chat consistente, scroll correto, gráficos fullwidth, marcação sem piscar e narrativa centrada na live.

### Rodada 3 — Reduzir o custo contínuo de mídia

F12 e F15 com testes de áudio/vídeo; F13 com supervisão independente por destino. Estabelecer baseline antes de F14/F17. Medir principalmente com jogo e transmissão simultâneos.

### Rodada 4 — Projetos condicionais

F16 só avança após prova de proteção e ganho real de memória. F19/F20 seguem o perfil medido do site/build e não devem atrasar correções de custo durante a live.

Critério geral de conclusão: ganho demonstrado no cenário relevante, orçamento de memória explícito, teste de regressão e ausência de perda de proteção, sincronização, moderação ou isolamento entre destinos. A Corneta deve continuar leve depois de horas aberta, não apenas nos primeiros segundos.
