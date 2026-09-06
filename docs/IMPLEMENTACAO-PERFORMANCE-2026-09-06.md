# Execução do plano de performance

Data: 06/09/2026. Referência: [plano F01–F20](PLANO-PERFORMANCE-2026-09-06.md). Base anterior às mudanças: `6e12a60`.

## Resultado e ressalva principal

Foram implementadas otimizações de chat, relatórios, persistência, inicialização, transmissão, OCR, catálogo editorial e build. A interface existente foi preservada; o trabalho de React/Impeccable orientou isolamento de atualizações, montagem sob demanda e limites para listas.

**Isso não significa que as 20 frentes estejam todas prontas para produção.** F14 é uma alternativa experimental desligada por padrão. F16 é um protótipo offline de política de buffer: não publica vídeo, não substitui o Guardião e ainda precisa de integração e prova de proteção com mídia real. As exigências de validação condicionais do plano não foram dispensadas.

Não foram modificados dados pessoais, credenciais, relatórios reais ou gravações existentes. Não houve commit, publicação, deploy nem upload de source maps. Os testes usaram mídia sintética e um perfil descartável de navegador.

## Situação dos 20 itens

| Item | Entrega | Estado / limite |
| --- | --- | --- |
| F01 | Poda das medições antigas do virtualizador depois da compensação do scroll. Testes com renovação de milhares de IDs, incluindo o virtualizador instalado. | Ativo. O cache não cresce com toda a duração da live. |
| F02 | Uma análise canônica no carregamento; resumo reutiliza o resultado. Adicionar marcador troca somente os eventos; remover gravações mantém os diagnósticos. | Ativo. Troca de idioma ou revisão real ainda refaz a análise. |
| F03 | Exportador selecionado dinamicamente e executado em worker; HTML/CSV/JSON não são gerados simultaneamente. Exportação anônima analisa novamente os dados já anonimizados. | Ativo. Não reutiliza texto identificável de uma análise anterior na exportação anônima. |
| F04 | Comandos assíncronos isolam leitura bloqueante em `spawn_blocking`, com semáforo de duas operações. Nova resposta IPC binária limitada em tamanho. | Ativo. A fila nativa não cancela uma leitura já iniciada; a interface descarta resultados obsoletos. |
| F05 | Um handle persistente e uma fila limitada por journal ativo, com escrita em thread dedicada, flush e encerramento com confirmação. | Ativo. Falhas de disco continuam possíveis; não há promessa de durabilidade equivalente a `fsync` a cada mensagem. |
| F06 | Coletor nativo preferencial; fallback NVIDIA espaçado em 10 segundos, timeout de processo de 1 segundo e leitura de stdout limitada. | Ativo. A falha desliga o fallback naquela live. Não transforma valor desconhecido em 0%. |
| F07 | Parsing/análise fora da UI, transferência de `ArrayBuffer`, cancelamento de workers na navegação e chat completo retido no worker com páginas pequenas. | Ativo. O worker ainda carrega o journal inteiro; não é leitura aleatória nativa por índice de arquivo. |
| F08 | Cache em memória, persistência agrupada, poda de órfãos, limite de 50 e invalidação por versão + tamanho/mtime da fonte. Só persiste resumo de sessão com encerramento real. | Ativo. Tamanho/mtime não são prova criptográfica de conteúdo idêntico. |
| F09 | Lotes de mensagens e moderação, deduplicação limitada por plataforma/origem/ID, uma atualização de estado por lote. | Ativo. Mantém a ordem dos eventos e o limite de 400 mensagens. |
| F10 | Relógio externo do replay atualiza os cursores sem atualizar a página inteira. Conteúdo técnico fechado fica desmontado; detalhes individuais são paginados. | Ativo. Listas expandidas mostram no máximo 48 linhas por página. |
| F11 | Render inicial independente da conclusão da telemetria, no app principal e no chat flutuante. | Ativo. A captura continua condicionada ao estado aplicável; não muda a política de consentimento. |
| F12 | Cópia de AAC no programa do Guardião quando o contrato é conhecido e coincide com o destino; áudio de uma conversão compartilhada também não é reconvertido nas saídas. | Ativo, com condições estritas. OBS arbitrário e programa do splicer não são presumidos compatíveis. |
| F13 | Uma conversão local por conjunto de parâmetros efetivos idênticos; cada destino mantém processo de envio, credencial, pausa, reconexão e bitrate adaptativo próprios. | Ativo. Mudança de bitrate sai do grupo; falha recorrente do produtor volta à conversão independente. Precisa de soak test com plataformas reais antes de uma release ampla. |
| F14 | Variante de decode/scale/encode em GPU para NVENC/CUDA e QSV, apenas em escalas landscape simples. Recuo para o caminho estável após falha. | **Experimental e opt-in.** Sem promoção global ou promessa de ganho por GPU. AMD/filtros não elegíveis mantêm o caminho existente. |
| F15 | Pool de buffers que recicla somente após o último dono de `Bytes` liberar o quadro. Instrumentação opcional de alocações/reuso e filas dos decoders. | Ativo. Pool não reduz o tamanho do atraso bruto. Métricas não abrangem ainda cada fila interna do encoder/OCR. |
| F16 | Modelo offline de fila comprimida com teto em bytes, epochs de fonte/codec, exigência de GOP fechado/IDR e cobertura de trechos sensíveis ou desconhecidos. | **Protótipo, não integrado.** Não reduz a RAM do Guardião em produção nesta entrega. |
| F17 | Notificação de disponibilidade do slot de OCR substitui polling vazio. Windows OCR recebe bitmap Gray8 diretamente, sem JPEG; evita cópia preliminar quando não há resize. | Ativo. Cadência, resolução, atraso e orçamento de threads existentes foram preservados. Corpus de precisão e comparação de threads sob jogo continuam pendentes. |
| F18 | Envelope mínimo/máximo com até 600 pontos, mantendo extremos temporais, picos e lacunas; geometria compartilhada com HTML. Busca binária nos índices temporais. | Ativo. Tooltip/seek continuam baseados nos dados originais. |
| F19 | Manifesto editorial versionado com digest, contendo somente publicados, gerado após validação no prebuild. Cache compartilhado entre requisições em produção; normalização de busca reutilizada. | Ativo. Desenvolvimento continua lendo fontes; um deploy invalida o cache. Não houve publicação de artigos. |
| F20 | Orçamento agregado do grafo estático de cada entrada, além do limite por chunk. Benchmark por etapa e smoke test reproduzível com navegador real/worker de produção. | Ativo. Não altera LTO/otimização do Rust nem remove gates para acelerar builds. |

## Limites de memória, filas e encerramento

- Chat ao vivo: 400 mensagens; lote com flush em aproximadamente 16 ms, 100 ms com documento oculto, ou antecipado ao atingir 128 eventos. Moderação segue na mesma sequência do lote.
- Relatórios: no máximo quatro pedidos pendentes por cliente/worker; leitura nativa com concorrência dois; limite de 32 MiB para sessão e 16 MiB para chat. O buffer binário é transferido, não copiado por `postMessage`.
- Chat do replay: até 700 mensagens por página. A janela se move por blocos de 200 mensagens e inclui limites de validade temporal/lacunas. Avançar o relógio dentro desses limites não requisita novamente a página. A visualização continua com uma cauda pequena e virtualizada.
- Cache de resumos: 50 entradas, carregado uma vez por contexto de storage, gravações agrupadas em 100 ms e flush ao sair. Mudanças em outras janelas invalidam o cache em memória.
- Journal: fila de até 512 KiB / 1.024 linhas, com reserva de 16 KiB / 32 posições para controles. O escritor pode estar processando **outro lote limitado** enquanto a fila recebe novos itens; não se deve interpretar 512 KiB como teto total do writer. Há ainda `BufWriter` de 64 KiB, objetos/strings e reserva de 1 KiB no arquivo para controle/encerramento.
- Writer: tráfego pequeno é descarregado pelo ciclo de até 100 ms; lotes grandes antecipam o despertar. `close` aguarda até dois segundos pela confirmação. Falha e ausência de confirmação são registradas no log. Flush não é garantia contra falta de energia.
- Correção de encerramento: um coordenador por arquivo serializa o fechamento e as escritas pós-live, sem manter o registro global bloqueado durante I/O. Se o prazo de fechamento expirar, o worker mantém a propriedade do arquivo e aceita eventos tardios na mesma fila limitada. O caminho síncrono só assume depois da liberação efetiva do handle; criar/truncar/apagar também exige essa liberação. Referências fracas permitem liberar coordenadores inativos.
- Saturação de chat: mensagens descartadas produzem lacuna agregada. Se uma remoção de moderação não puder ser preservada, o journal é invalidado e não é exibido como replay autoritativo com mensagens antigas reaparecendo. Falha física de disco pode impedir qualquer escrita, inclusive desse marcador de invalidação.
- Quadros: até oito buffers livres por fonte. Em 1080p YUV420 são até cerca de 23,7 MiB livres por pool, além dos buffers em uso, filas e atraso. Não há pré-alocação de 12 segundos nem reutilização enquanto um consumidor ainda possui o quadro.

## Transmissão: o que é compartilhado e o que não é

O agrupamento compara argumentos de conversão efetivos, incluindo encoder, resolução, FPS, bitrate, GOP, filtros/enquadramento e áudio. Endereço/chave de saída não fazem parte dessa identidade. O handshake específico de destino personalizado continua no processo de envio correspondente.

O produtor publica em um caminho local separado, com identificador da geração da live. Um destino que precisa reduzir bitrate abandona a conversão compartilhada e usa sua própria conversão. Ao recuperar o bitrate de base, pode voltar ao grupo. Pausar ou perder a conexão de um destino não pausa os demais. Sem consumidores, o produtor é encerrado após a janela de ociosidade; após três falhas inesperadas, os destinos voltam à conversão independente.

O supervisor também exige avanço contínuo do contador de frames: oito segundos sem avanço reiniciam o produtor, mesmo depois de ele ter ficado pronto. Logs repetidos não renovam o prazo. O contador de falhas só é reiniciado após 30 segundos de progresso sustentado, não por tempo de processo parado. Pausa, ausência de fonte e encerramento voluntário continuam seguindo seus caminhos próprios.

O teste de integração usou o FFmpeg empacotado: criou vídeo sintético com áudio mono de 32 kHz, converteu com normalização, abriu duas saídas sequenciais sem reconversão e comparou hashes de vídeo **e áudio decodificados**. Isso valida o contrato da mídia e os argumentos, não substitui um teste prolongado de rede/OBS/ABR nas plataformas.

## Flags para desenvolvimento, não setup do streamer

### Métricas locais de filas e pool

```powershell
$env:CORNETA_PERF_QUEUES = '1'
pnpm app:dev
```

Ao liberar uma fonte, o log informa contagem, ocupação máxima e limites superiores aproximados de p95/p99 de idade, usando histograma fixo de 32 faixas. A contagem inclui o produtor bloqueado em `send`, portanto pode ser capacidade do canal + 1. O pool registra alocações e reutilizações. Não inclui payloads, texto de chat, nomes de aplicativos, URLs nem chaves; não é nova telemetria remota. Sem a flag, não há coleta por item de timestamp/histograma.

### Pipeline de GPU experimental

```powershell
$env:CORNETA_EXPERIMENTAL_GPU_PIPELINE = '1'
pnpm app:dev
```

Desligado por padrão. Limita-se a combinações reconhecidas de NVENC/QSV com escala simples, sem substituir os decoders de inspeção do Guardião. O FFmpeg empacotado oferece `scale_cuda` e `scale_qsv`; não foi encontrada uma alternativa `scale_amf`/`scale_d3d11` nele. Máquina multi-GPU, VRAM, latência e competição com o jogo precisam de avaliação física antes de promoção.

### Experimento comprimido offline

```powershell
cd src-tauri
cargo test --example guardian_packet_delay
cargo run --example guardian_packet_delay
```

Os arquivos estão em [compressed_delay.rs](../src-tauri/experiments/compressed_delay.rs) e [guardian_packet_delay.rs](../src-tauri/examples/guardian_packet_delay.rs), fora dos módulos do app. Não há flag que ative este modelo na transmissão.

O experimento exige metadados de GOPs completos, mas ainda **não extrai nem comprova esses metadados a partir de H.264 real**. Além disso, libera um GOP somente 12 segundos depois do final dele, adicionando até um GOP de latência. Portanto, ainda faltam:

1. Demux e associação exata de PTS/DTS entre pacotes e inspeção decodificada.
2. Verificação real de referências, GOPs fechados, IDRs, headers e mudança de codec.
3. Cobertura compatível com áudio/vídeo, preservando a linha temporal e o atraso atual.
4. Teste de privacidade quadro a quadro, OCR atrasado/indisponível, reconexão e fallback.
5. Benchmark comparável de RSS, qualidade e sincronização antes de qualquer ativação.

Na simulação de dois minutos com payloads sintéticos dimensionados a 6.000 kbps, o pico da fila foi 12.000.000 bytes. **Isso é contabilidade de payload do modelo, não consumo medido do app nem prova de redução de RAM em produção.**

## Verificações realizadas

- JavaScript/TypeScript: **392 testes em 50 arquivos** passaram, incluindo aplicação, site, cache, paginação, cancelamento/limite de worker, exportação seletiva e orçamento de entrada.
- Nativo: **232 testes da biblioteca** passaram; inclui escrita/flush/capacidade/moderação, pool, agrupamento, concessões independentes e mídia real gerada pelo FFmpeg. Três testes de integração opt-in permanecem ignorados na execução padrão.
- Revisão corretiva: **10 testes novos** cobrem timeout com lote já destacado e eventos tardios do gravador, encerramento concorrente, capacidade compartilhada entre appends pós-live, independência entre arquivos, moderação tardia, ausência de progresso após o primeiro frame, contadores repetidos/inválidos, reinício e orçamento de fallback. Os testes de journal usam arquivos temporários próprios e barreiras, sem alterar relatórios reais nem depender da velocidade do disco.
- Experimento comprimido: **4 testes** passaram. Eles verificam a política do modelo, não privacidade de vídeo real.
- Windows OCR: execução explícita de upload Gray8 em larguras pares/ímpares e reconhecimento de bitmap direto passou nesta máquina. O teste de reconhecimento depende de pacote de idioma do Windows; informa indisponibilidade quando ele não existe.
- `cargo fmt --all -- --check` e `cargo clippy --all-targets --all-features -- -D warnings` passaram. O MSVC ainda emite a mensagem preexistente de criação de `.lib/.exp` durante link; ela não foi escondida.
- ESLint da aplicação e do site, TypeScript da aplicação e do site e builds de Vite/Next passaram.
- Validação editorial: 39 fontes, zero avisos. A rota dinâmica `/search?q=obs`, servida pelo build de produção do Next, retornou HTTP 200.
- Navegador real (Edge headless, perfil descartável): abriu a lista e o detalhe de relatório, abriu/fechou o modal carregado sob demanda e executou análise, chat e exportação no worker compilado. Verificou 14.400 amostras, transferência binária efetiva, 10.000 mensagens, página de 700 e remoção aplicada fora do trecho visível.
- Verificação visual por screenshot preservou o layout da história da live. O detector Impeccable apontou apenas avisos consultivos sobre tamanhos tipográficos de 9/10 px já existentes; não foi feita uma reformulação visual fora do escopo.
- Gate de bundle passou, sem segredos/source maps detectados: grafo estático principal com 190,0 KiB de JS gzip e 13,2 KiB de CSS; chat com 160,7 KiB / 13,0 KiB. Orçamentos: 250 KiB JS, 55 KiB CSS e 256 KiB de outros assets por entrada; limite adicional de 110 KiB gzip por chunk. Imports dinâmicos não integram a soma do grafo estático.

### Como repetir

```powershell
pnpm test
pnpm lint
pnpm build
pnpm bundle:check
pnpm benchmark:build
pnpm smoke:reports
pnpm web:check
cd src-tauri
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-targets
```

`smoke:reports` requer o build em `dist` e usa Edge no caminho padrão do Windows. Outro Chromium pode ser passado como argumento do script. Ele bloqueia requests HTTPS da página testada e usa storage isolado; não faz login nem transmite. `benchmark:build --rust` acrescenta `cargo check`; o script informa as etapas e não apaga caches.

Não foi feito benchmark A/B controlado em release com jogo + OBS + múltiplos destinos, nem soak test de oito horas, varredura de GPUs NVIDIA/AMD/Intel ou corpus completo de OCR. Tempos isolados do worker e do build variaram com cache e concorrência das verificações. **Não há porcentagem de ganho prometida nem garantia de ausência de bugs.**

Referências técnicas consultadas: [API de reconhecimento do Windows](https://learn.microsoft.com/en-us/uwp/api/windows.media.ocr.ocrengine.recognizeasync?view=winrt-26100), [implementação oficial de `scale_cuda`](https://github.com/FFmpeg/FFmpeg/blob/master/libavfilter/vf_scale_cuda.c) e os bindings/recursos efetivamente instalados no repositório.
