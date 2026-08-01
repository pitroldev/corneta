# Otimizações de performance — 20/07/2026

## Escopo

Revisão estática dos caminhos quentes do compositor Tauri/Rust, Guardião/OCR, acesso a disco e
interface React. As mudanças abaixo foram implementadas com foco em CPU, GPU e memória, mantendo
o comportamento funcional e a cadência A/V.

## Correções implementadas

| Área | Problema encontrado | Correção aplicada | Efeito esperado |
|---|---|---|---|
| Compositor de vídeo | `Vec<u8>::clone()` copiava um quadro YUV420 completo ao enviar vídeo real, freeze ou slate | Quadros imutáveis agora usam `bytes::Bytes` do buffer de delay até o encoder | Em 1080p30, elimina aproximadamente 3,11 MB por frame, ou 93 MB/s de cópias no caminho normal |
| FIFO de áudio | Remoção e leitura eram feitas byte a byte com `pop_front()` | Cópia com `VecDeque::as_slices()` e descarte em bloco com `drain()` | Menos branches e chamadas por tick; silêncio continua preenchido exatamente como antes |
| Amostragem do OCR | Cada amostra criava um novo `Vec` de aproximadamente 2 MB | Um buffer do plano Y é reciclado entre produtor e worker | Remove realocações contínuas e reduz pressão no allocator |
| Diff de quadros | O plano Y era clonado para `GrayImage` e redimensionado a cada amostra | Downscale direto para buffer reutilizável, com média por célula | Evita outra cópia integral do quadro e reduz memória temporária sem perder traços entre amostras |
| Diff de quadros | Mesmo uma tela claramente alterada percorria todo o buffer reduzido | Retorno antecipado assim que o limiar de mudança é excedido | Reduz CPU principalmente em jogos, câmera e telas em movimento |
| Watchlist | Termos eram normalizados e tokenizados após todo OCR | Watchlist pré-compilada uma vez por sessão | Elimina trabalho e alocações repetidos |
| Casamento fuzzy | Levenshtein alocava uma linha nova para cada caractere e reconvertia o texto OCR para `char` por termo | Duas linhas reutilizadas, caracteres do texto preparados uma vez e fast path para substring exata | Menos alocações e menor custo de CPU por scan |
| Modelos OCR | Verificação e download carregavam modelos inteiros em RAM; o maior tem 16,6 MB | SHA-256 e gravação em streaming com buffers de 64 KiB; cache já validado não é hashado duas vezes | Reduz pico transitório de RAM e I/O duplicado no startup |
| Recuperação de sessões | O boot lia até 32 MB de cada sessão apenas para descobrir a última linha | Leitura limitada aos últimos 64 KiB | Boot passa de até 1,6 GB lidos para no máximo cerca de 3,2 MB com 50 sessões |
| Diagnóstico | Historicamente, cada log era carregado inteiro para depois manter só 512 KiB | A otimização inicial passou a usar seek; a implementação de telemetria posterior removeu por completo as caudas de log do export compartilhável | O export atual não lê logs e contém apenas resumo allowlisted e ring buffer estruturado |
| Cache Kick | Cache global de IDs não tinha limite | Limite de 64 entradas | Impede crescimento indefinido em processos longos |
| Store do chat | Ao atingir o limite, cada mensagem criava dois arrays | Uma única cópia da janela mantida e `push()` do item novo | Menos alocações no fluxo contínuo de chat |
| Feed do chat | Closures recriadas invalidavam `memo`; listener de wheel era reinstalado | Callbacks indiretos estáveis, comparação explícita das props visuais e ref para o handler | Linhas antigas não renderizam novamente a cada mensagem ou mudança lateral de estado |
| Gráficos | Todo movimento do mouse reconstruía os paths SVG de séries longas | Geometria memorizada e `content-visibility: auto` | Tooltip continua responsivo sem reprocessar milhares de amostras por evento |
| Relatórios | Associação de raids a amostras era busca linear por marcador | Busca binária | De O(eventos × amostras) para O(eventos × log amostras) |
| Build nativo | Release usava `opt-level = "s"` em um processo sensível a throughput | `opt-level = 3`, mantendo LTO, uma codegen unit e strip | Prioriza execução do compositor/OCR; possível aumento moderado do binário |

## Velocidade percebida

A primeira versão da otimização ainda bloqueava toda a interface em `detect_encoders`. Na máquina
de referência, as quatro sondagens FFmpeg sequenciais somavam 2.437 ms (NVENC 1.328 ms, QSV 537
ms, AMF 546 ms e VideoToolbox 26 ms). A experiência foi corrigida da seguinte forma:

- a primeira tela depende somente da leitura da configuração;
- a sonda roda apenas ao visitar Qualidade/Ao vivo ou quando o BORA realmente precisa dela;
- chamadas concorrentes compartilham a mesma operação;
- as quatro sondagens frias rodam em paralelo;
- o resultado persiste por 30 dias e é invalidado por versão do app, versão do FFmpeg, GPU,
  driver ou sistema operacional;
- a tela lembrada é pré-carregada durante o boot e as demais no hover/foco da navegação;
- transições recorrentes caíram de 180 ms/12 px para 110 ms/6 px;
- o PNG padrão do JÁ VOLTO só é regenerado quando sua versão visual muda ou o arquivo desaparece,
  e o trabalho ocorre em idle depois do primeiro paint;
- loaders agora informam o que está acontecendo e preservam a identidade visual da Corneta.

## CPU e GPU

O decode por hardware (`-hwaccel auto`) e os encoders NVENC/QSV/AMF/VideoToolbox já estavam
corretamente priorizados. Não foi introduzido um filtro CUDA/QSV específico porque o Guardião
precisa que os pixels voltem à memória da CPU para OCR, freeze, slate e delay. Forçar um caminho
específico de GPU aumentaria transferências ou quebraria a portabilidade entre fabricantes.

O maior ganho no pipeline híbrido CPU/GPU veio, portanto, de não copiar novamente os quadros
depois do download da GPU. A escolha existente de executar PaddleOCR na CPU também foi mantida:
ela evita disputar a GPU com decode e encode durante a transmissão.

## Memória deliberadamente mantida

O delay preventivo do Guardião conserva quadros crus por 12 segundos. Em 1920×1080, YUV420p e
30 fps, o conteúdo do buffer ocupa aproximadamente 1,12 GB. Isso é custo funcional do modelo
atual, não um vazamento: reduzir o número de quadros diminuiria a proteção; comprimi-los exigiria
um segundo encode/decode e aumentaria latência e uso de CPU/GPU. As otimizações implementadas
removem as cópias transitórias desse conteúdo sem alterar a janela de segurança.

## Validação

- Testes Rust incluindo novos casos para FIFO de áudio envolvente e reutilização do diff.
- `cargo check --all-targets`.
- `cargo clippy --all-targets -- -D warnings`.
- ESLint, 82 testes Vitest, TypeScript, build Vite e orçamento de bundle.

Os números de MB/s acima são derivados do tamanho exato do quadro e da taxa de quadros; não são
uma alegação de benchmark de hardware. Para medir latência e RSS reais por máquina, o próximo
passo recomendado é um soak test com OBS em 720p/1080p, Guardião ligado/desligado e captura de
CPU, GPU, working set e frames perdidos por pelo menos 30 minutos.
