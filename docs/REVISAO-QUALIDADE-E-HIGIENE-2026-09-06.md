# Revisão de qualidade de código e higiene do repositório

Data: 2026-09-06, America/Sao_Paulo. Linha analisada: 0.7.0.

**Estado: diagnóstico, não implementação.** Esta revisão considera o worktree sobre o commit `8a2815d2c5a96666146733e375537f6f5a3826d7`, incluindo as alterações ainda não commitadas da rodada anterior. As linhas citadas correspondem a esse estado; podem mudar após formatação ou refatoração.

Escopo: qualidade de código, comentários inúteis/enganosos, documentação e conteúdo dispensável. Não substitui os [gates de release](GATES-DE-RELEASE.md) nem a [auditoria de abertura do código](AUDITORIA-OPEN-SOURCE-2026-09-06.md). Nenhuma correção, exclusão, publicação ou operação sobre credenciais reais foi realizada nesta revisão.

## Conclusão

O problema principal não é falta de ferramentas: já existem testes, limites, verificações e bons módulos de domínio. O problema é **coerência entre as camadas**. Há erros descartados onde deveriam ser propagados, verificadores que não usam o mesmo contrato do código verificado, traduções existentes que não chegam ao usuário e documentos operacionais que descrevem versões anteriores.

A limpeza mais útil não é apagar comentários em massa nem reduzir artificialmente o número de arquivos. É corrigir esses contratos, retirar código comprovadamente sem consumidores e transformar a documentação em um conjunto menor de fontes de verdade.

| Área                             | P1    | P2     | P3    | Total  |
| -------------------------------- | ----- | ------ | ----- | ------ |
| Qualidade de código              | 3     | 9      | 0     | 12     |
| Comentários                      | 0     | 0      | 4     | 4      |
| Documentação                     | 1     | 5      | 0     | 6      |
| Remoções e redução de superfície | 0     | 0      | 5     | 5      |
| **Total**                        | **4** | **14** | **9** | **27** |

Prioridades desta revisão:

- **P1:** corrigir primeiro; afeta confiança, privacidade declarada ou segurança do fluxo de manutenção.
- **P2:** corrigir em seguida; robustez, contratos, manutenção ou documentação operacional.
- **P3:** limpeza controlada; não é bloqueio de publicação por si só.

Não foi identificado um novo P0 no escopo inspecionado. Isso não encerra os bloqueios externos já documentados nem equivale a uma auditoria completa de segurança.

## Método e limites

- Inventário de arquivos rastreados e novos não ignorados, desconsiderando arquivos já excluídos no worktree: **587 arquivos**, dos quais **364** com extensões de código/CSS analisadas no inventário.
- Antes deste relatório, `docs/` continha **74 arquivos Markdown, 1.049.294 bytes**. Isso é custo de manutenção e descoberta, não consumo de memória do app.
- Leitura dirigida de React/Next.js, Rust, scripts, configurações e documentos; buscas de consumidores por nome e caminho. Foram consideradas entradas implícitas do Next.js, CLIs, testes, exemplos e geradores.
- Para comentários, a contagem apresentada é uma heurística de linhas iniciadas por marcadores de comentário; não mede utilidade nem justifica uma meta de exclusão.
- Verificações executadas nesta rodada: **17 testes passaram** em `reportClient`, `reportTasks`, `summaryCache` e `utils`; checker de links passou sobre os **93 documentos/515 destinos** existentes antes da adição deste relatório.
- Provas adicionais sem alteração de fontes: combinação incorreta de tarefa/resultado aceita pelo TypeScript; três divergências sintéticas de parsing de `.env`; teste de workflow que encontra zero comandos após conversão para YAML multilinha; globals de navegador liberados indevidamente no lint de um script Node.
- Não foram repetidos o build completo, a suíte Rust, ensaios de longa duração ou OAuth real. Os 647 testes da rodada anterior são evidência daquela rodada, não uma nova execução desta revisão.
- Não foram lidos `.env` pessoais, relatórios reais ou conteúdo do cofre. Achados nativos são comprovados pelo fluxo do código, sem provocar falhas no PC do usuário.

## 1. Qualidade de código

### Q01 — P1 — Apagar credenciais pode informar sucesso sem apagá-las

**Evidência:** [keys.rs](../src-tauri/src/keys.rs), linhas 27–34; [commands.rs](../src-tauri/src/commands.rs), 335–340; [auth.rs](../src-tauri/src/auth.rs), 1129–1135 e 1723–1728.

`clear_key` descarta todo erro de `delete_credential()` e retorna `Ok(())`. O comentário promete ignorar somente a ausência idempotente. A memória de presença é apagada antes da confirmação. Os logouts de YouTube/Kick também descartam os resultados e emitem `loggedout`.

Consequência possível: a tela declara que desconectou, mas a credencial continua no cofre e reaparece no próximo status/boot. Não se trata de revogação remota: a exclusão local prometida é que não está garantida.

**Recomendação:** distinguir ausência de falha real, propagar o resultado pelo IPC/logout e atualizar presença/estado conforme o resultado. Tratar exclusão parcial de conjuntos de tokens explicitamente.

**Aceite:** adaptador de cofre simulado cobrindo sucesso, ausência, acesso negado e indisponibilidade; falha não pode produzir evento de logout concluído. Os testes não devem usar o cofre real.

### Q02 — P1 — Scanner de bundles e launcher interpretam `.env` diferentemente

**Evidência:** [check-bundle.mjs](../scripts/check-bundle.mjs), 196–205; [with-env.mjs](../scripts/with-env.mjs), 29.

O launcher usa o parser nativo de ambiente. O scanner ainda usa regex por linha. Declarações com `export`, comentários inline e valores multilinha podem carregar no app sem serem comparadas pelo scanner pelo valor efetivo. As três variantes foram reproduzidas em memória, com dados sintéticos.

Isso é uma lacuna nessa camada de defesa, não prova de segredo vazado. Os padrões fixos e o scanner do repositório continuam sendo outras proteções, mas não tornam equivalentes os dois parsers.

**Recomendação:** compartilhar o contrato de parsing e seus testes. Preservar separadamente a busca intencional por valores históricos em linhas comentadas. Não imprimir os valores. Trocar a mensagem absoluta de saída por “nenhum segredo detectado pelas verificações”.

**Aceite:** fixtures sintéticas cobrindo as três variantes, aspas, vazio, precedência e valores comentados; plantar cada valor em um artefato temporário e confirmar rejeição pela verificação correspondente.

### Q03 — P1 — `bump --commit` pode incluir alterações alheias e terminar pela metade

**Evidência:** [bump.mjs](../scripts/bump.mjs), 87 e 114–123.

O script adiciona os arquivos de versão, mas `git commit` inclui também qualquer outro arquivo previamente staged. Não há preflight da tag de destino: uma tag já existente pode fazer o comando falhar depois de escrever versões e criar o commit.

A validação de conteúdo antes da escrita é boa, mas não torna o procedimento inteiro transacional. O comentário atual pode transmitir uma garantia mais ampla do que a implementada.

**Recomendação:** validar index, alterações nos alvos, versões e tag antes de escrever; recusar um estado ambíguo ou isolar explicitamente o commit. Preferir argumentos separados nas chamadas Git. Documentar recuperação de falhas sem reset destrutivo.

**Aceite:** repositório temporário com arquivo alheio staged e outra execução com tag já existente. Não deve haver commit involuntário nem alteração parcial previsível. O comando não foi executado nesta revisão.

### Q04 — P2 — Limite de configuração aplicado depois da leitura integral

**Evidência:** [config.rs](../src-tauri/src/config.rs), 679–680; [commands.rs](../src-tauri/src/commands.rs), 3700–3704.

O carregamento lê o arquivo inteiro antes de verificar 2 MiB. Na importação, a checagem de metadata ocorre antes, mas a leitura posterior continua ilimitada. O limite protege a aceitação, não necessariamente a alocação.

**Recomendação:** helper de leitura limitada, abrindo uma vez e consumindo no máximo `MAX + 1` bytes. Metadata pode antecipar rejeição, mas não substituir o limite sobre bytes efetivamente lidos. Preservar backups e recuperação de arquivos inválidos.

**Aceite:** limites exatos, excesso, UTF-8 inválido e leitor que entrega mais bytes que o tamanho anunciado. Não foi medido um pico real de memória nesta revisão.

### Q05 — P2 — Tipagem do worker permite declarar o resultado errado

**Evidência:** [reportClient.ts](../src/lib/reportClient.ts), 16 e 43; [reportTasks.ts](../src/lib/reportTasks.ts), 15–28.

`run<T extends ReportTaskResult>(task: ReportTask)` deixa o chamador escolher qualquer resultado da união, sem vínculo com `task.kind`. A implementação termina em `value as T`.

Este exemplo incorreto foi aceito pelo TypeScript, em um arquivo virtual sem emissão:

```ts
const result: Promise<ReportSummaryResult> =
  new ReportClient().run<ReportSummaryResult>({
    kind: "chatPage",
    epoch: 0,
  });
```

Não encontrei esse par incorreto nos consumidores atuais; a falha está na garantia oferecida pela API.

**Recomendação:** mapear cada `kind` ao resultado, usando overloads ou tipos condicionais. Inferir o resultado da tarefa e reduzir duplicações locais de tipos como `LoadedReport`.

**Aceite:** teste de tipos que rejeite o exemplo, mais os testes de transferência, cancelamento e limite da fila. Não adicionar validação pesada de cada amostra no caminho quente apenas para resolver um problema estático.

### Q06 — P2 — A fila da lista continua trabalhando enquanto o detalhe está aberto

**Evidência:** [ReportsScreen.tsx](../src/screens/ReportsScreen.tsx), 9 e 32–46; [useReportSessions.ts](../src/screens/reports/useReportSessions.ts), 39–85; [useReportDetailData.ts](../src/screens/reports/useReportDetailData.ts), 78–145.

`useReportSessions()` permanece montado quando a rota passa a renderizar o detalhe. Havendo resumos ausentes, a lista continua lendo/analisando sessões sequencialmente em seu worker, enquanto o detalhe cria outro worker. Os `setSummaries` também atualizam o componente pai mesmo com a lista invisível.

Isso não contradiz o limite de um worker **por consumidor**, mas falta coordenação da prioridade entre consumidores. Não foi medido impacto percentual ou travamento real.

**Recomendação:** separar listagem de metadados da fila de resumos; pausar/cancelar o trabalho de resumos da lista ao abrir o detalhe e retomá-lo ao voltar, preservando cache e a identificação da live anterior.

**Aceite:** histórico com cache vazio; abrir um relatório antes de a fila terminar; confirmar que não começam leituras de sessões invisíveis enquanto o detalhe tem prioridade e que a lista retoma corretamente.

### Q07 — P2 — Traduções nativas existem, mas a interface ainda duplica português

**Evidência:** [engine_policy.rs](../src-tauri/src/engine_policy.rs), 46–78 e 93–124; [i18n.rs](../src-tauri/src/i18n.rs), 495–503 e 628–660; [lib.rs](../src-tauri/src/lib.rs), 68–72, 102–110 e 345–402.

Tooltip, erros amigáveis, menus, notificações e confirmação de saída ainda têm strings fixas em português. Há mensagens correspondentes no catálogo. Os testes de erro atuais também fixam frases portuguesas.

O catálogo contém 224 variantes; 15 nomes não aparecem fora dele, incluindo 11 relacionados à bandeja. **Essas traduções não devem ser simplesmente apagadas como código morto:** parte delas resolve uma integração faltante.

**Recomendação:** separar classificação do erro de apresentação ou passar locale explicitamente às funções puras; conectar as mensagens existentes e atualizar elementos nativos quando o idioma mudar.

**Aceite:** classificação idêntica e apresentação correta em PT/EN; troca de idioma refletida em bandeja/menu sem reiniciar a live. Paridade de chaves, sozinha, não comprova integração.

### Q08 — P2 — Supervisores usam threads bloqueantes apenas para esperar

**Evidência:** [commands.rs](../src-tauri/src/commands.rs), 1940, 1954, 1976 e 2182. No mesmo supervisor, a linha 1990 já usa temporizador assíncrono.

Quatro caminhos de supervisão assíncrona fazem `spawn_blocking` cujo único trabalho é `std::thread::sleep`: pausa, erro terminal, ausência de sinal e reconexão. Isso ocupa capacidade de threads sem trabalho bloqueante real.

**Recomendação:** usar temporizadores assíncronos nesses caminhos, preservando durações e cancelamento. Não remover `spawn_blocking` usado para operações realmente bloqueantes, como cofre e determinados acessos a disco.

**Aceite:** múltiplos destinos pausados/sem sinal; stop/retry durante cada espera; nenhum respawn posterior ao cancelamento. Medir threads e latência antes de anunciar ganho de performance.

### Q09 — P2 — Módulos ainda concentram responsabilidades independentes

**Evidência e recortes concretos:**

| Arquivo                                                 | Tamanho observado | Responsabilidades a separar                                                                          |
| ------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------- |
| [ChatScreen.tsx](../src/screens/ChatScreen.tsx)         | 2.611 linhas      | Tela principal; overlays em 1316/1392; fontes em 1707; formulários BYOK em 2245/2365; login em 2457. |
| [SettingsScreen.tsx](../src/screens/SettingsScreen.tsx) | 1.642 linhas      | Abas; teste OBS em 628; guardião em 741; captura de atalho em 847; gravação em 1308.                 |
| [api.ts](../src/lib/api.ts)                             | 1.927 linhas      | Contrato IPC; adaptador Tauri em 297; simulador e dados de demonstração em 872.                      |
| [store.ts](../src/lib/store.ts)                         | 1.135 linhas      | Configuração/perfis, ciclo da live, chat, OAuth, alertas e pedidos de navegação no mesmo store.      |

Tamanho não prova bug. Aqui ele vem acompanhado de motivos de mudança diferentes e de um mesmo arquivo reunir apresentação, coordenação e integração.

**Recomendação:** extrações por domínio, em PRs pequenos, preservando APIs e testes. Usar a separação já existente em `screens/reports/` como referência. Separar contrato de API, implementação nativa e demo; não remover a demo, que sustenta a contribuição sem Rust/credenciais. Uma eventual separação do store não deve perder a ordenação de saves nem a sincronização entre janelas.

**Aceite:** mesmos fluxos, imports sem ciclos, testes focados nos módulos extraídos e comparação dos bundles. Não prometer redução de bundle só por mover arquivos; isso depende das fronteiras de carregamento.

### Q10 — P2 — O domínio de relatórios ainda reexporta o adaptador de armazenamento

**Evidência:** [report.ts](../src/lib/report.ts), 1965–1971; [summaryCache.ts](../src/lib/summaryCache.ts), 106 em diante; imports em [useReportSessions.ts](../src/screens/reports/useReportSessions.ts), 4, e [ReportDetail.tsx](../src/screens/reports/ReportDetail.tsx), 6.

O comentário diz que a extração deixou `report.ts` “100% puro”, mas o módulo continua reexportando o cache. O adaptador registra listeners no ambiente de janela e importa a responsabilidade de armazenamento para a superfície pública do domínio. As funções de análise podem continuar puras; o acoplamento de módulos é que não terminou de ser removido.

**Recomendação:** consumidores de cache importarem `summaryCache` diretamente; remover os reexports transitórios e a narrativa de migração. Manter tipos/transformações no domínio e I/O nos adaptadores.

**Aceite:** testes puros de análise sem dependência de `Storage`; testes de cache continuam cobrindo invalidação, limites e múltiplas janelas; funcionamento no worker preservado.

### Q11 — P2 — Teste de CI pode passar sem verificar nenhum comando

**Evidência:** [workflow-policy.test.mjs](../scripts/workflow-policy.test.mjs), 25–34.

O teste de `--locked` filtra apenas linhas `run: cargo ...` ou `run: pnpm tauri build ...`. Ao converter os quatro comandos atuais para blocos YAML `run: |`, uma transformação válida, o total verificado cai de **4 para 0** e as verificações restantes de toolchain continuam satisfeitas.

Os workflows atuais não foram encontrados sem `--locked`; o achado é um falso negativo latente do teste.

**Recomendação:** ler a estrutura YAML e os valores de `run`; exigir que os comandos esperados tenham sido encontrados. Adicionar fixtures de comandos simples/multilinha, comentários e ausência de comandos. Preferir testar a propriedade de segurança, não uma formatação específica.

**Aceite:** retirar `--locked` de uma fixture deve falhar em ambas as representações; zero comandos inspecionados também deve falhar.

### Q12 — P2 — Validação de fontes diverge entre coleta e empacotamento

**Evidência:** [prepare-release-compliance.mjs](../scripts/prepare-release-compliance.mjs), 85–116; [ffmpeg-evidence.mjs](../scripts/ffmpeg-evidence.mjs), 26 e 165; [ffmpeg-evidence.test.mjs](../scripts/ffmpeg-evidence.test.mjs), 109.

O coletor verifica o formato inicial do arquivo e rejeita HTML retornado com HTTP 200. O empacotador usa outro caminho de download e valida resposta/hash, mas não o formato: um HTML cujo hash fosse aprovado por engano poderia entrar com nome de arquivo comprimido.

Isso não significa que um pacote inválido foi publicado. O manifesto continua com `reviewed: false`, e a revisão de correspondência permanece necessária. Hash correto comprova identidade dos bytes, não que os bytes sejam as fontes esperadas.

**Recomendação:** compartilhar primitivas de download/verificação de artefatos, mantendo limites e políticas específicos de cada comando. Validação de assinatura inicial é defesa adicional, não revisão jurídica nem validação completa do conteúdo.

**Aceite:** o teste HTTP 200 + HTML + hash correspondente deve falhar também no empacotador; pacote não deve ser aprovado após falha.

## 2. Comentários inúteis, excessivos ou enganosos

### C01 — P3 — Comentários de componentes viraram relatos de redesign

**Evidência:** [locale-switch.tsx](../web/app/_components/locale-switch.tsx), 13–46; [icons.tsx](../web/app/_components/icons.tsx), 42–72; [go-live.tsx](../web/app/_components/go-live.tsx), 10–28; [live-room.tsx](../web/app/_components/live-room.tsx), 347–360; [utils.ts](../src/lib/utils.ts), 14–15.

Há explicações longas sobre como a versão anterior era ruim, dimensões que existiam antes, alternativas rejeitadas e decisões que o código atual já mostra. Em `locale-switch.tsx`, 39 de 91 linhas começam com marcadores de comentário; isso sinaliza onde revisar, não uma meta de redução.

**Recomendação:** apagar narrativa de implementação superada; conservar o contrato atual em poucas linhas. Exemplo do que vale preservar: gravar a preferência de idioma antes de navegar evita que a negociação de idioma reverta a escolha. A discussão sobre os antigos botões de 105 px pode ficar no histórico Git.

Não mover todos esses parágrafos para novos `.md`: isso apenas mudaria o ruído de lugar. Registrar uma decisão arquitetural somente quando ela ainda orientar decisões futuras.

**Aceite:** diff predominantemente de comentários; sem alterar copy visível ou comportamento. Um leitor deve entender a restrição atual sem reconstruir o redesign anterior.

### C02 — P3 — Dicionário inglês contém notas de revisão truncadas e cabeçalho errado

**Evidência:** [src/lib/i18n/en.ts](../src/lib/i18n/en.ts), 2, 20, 33, 44 e 94. Inventário: 631 linhas iniciadas por comentário em 2.590 linhas.

O cabeçalho chama o arquivo de dicionário da LP, mas ele pertence ao desktop. Há notas cortadas no meio da frase, como “tem que ca”, “pra não” e “perde o ca”, além de justificativas repetidas para traduções comuns.

**Recomendação:** corrigir o cabeçalho; remover notas truncadas, relatos de escolha e traduções óbvias. Manter contexto que evite erros: significado de placeholders, termos de plataformas, pluralização e rótulos reais do OBS. Usar o guia de voz/glossário para regras recorrentes, não repetir a regra em dezenas de entradas.

**Aceite:** valores traduzidos e placeholders não mudam nesta limpeza; testes de paridade dos dicionários e interpolação passam. Não apagar o dicionário ativo junto com comentários.

### C03 — P3 — Comentários técnicos descrevem contratos antigos

| Local                                                    | Problema comprovado                                                                               | Ação sugerida                                                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [guardian/ocr.rs](../src-tauri/src/guardian/ocr.rs), 6–8 | Diz resize 1280/detecção 640; constantes atuais em 21/23 são 1920/1280.                           | Referenciar constantes ou corrigir o texto; não mudar valores para fazê-los coincidir com o comentário.     |
| [commands.rs](../src-tauri/src/commands.rs), 1936        | Descreve protetor via ZMQ; a única menção a `zmq` no código nativo é esse comentário.             | Apontar ao compositor/pipeline atual ou remover a explicação obsoleta.                                      |
| [Cargo.toml](../src-tauri/Cargo.toml), 58–59             | Atribui `regex` a detecção automática de dados no OCR; o uso atual está na telemetria/redação.    | Atualizar justificativa; não remover a dependência usada.                                                   |
| [Cargo.toml](../src-tauri/Cargo.toml), 70–72             | Explicação de keyring v3 junto à dependência 4.1.6 e features atuais diferentes.                  | Explicar o backend nativo efetivamente configurado, preservando a invariante de persistência.               |
| [lib.rs](../src-tauri/src/lib.rs), 13–15                 | Justifica visibilidade pública por “220 variantes ainda não fiadas”.                              | Remover contagem histórica; decidir visibilidade por contrato, não para esconder código sem uso.            |
| [commands.rs](../src-tauri/src/commands.rs), 196–197     | “Fonte ÚNICA” de encerramento, mas compositor possui caminhos próprios.                           | Restringir a afirmação ao escopo correto; não unificar ownership diferente às cegas.                        |
| [make-icons.ps1](../scripts/make-icons.ps1), 1–2         | Ainda chama o ícone de placeholder a substituir, apesar da identidade e revisão de assets atuais. | Confirmar a intenção e documentar o gerador atual; não regenerar a marca por causa de um comentário antigo. |

**Aceite:** revisão cruzada com constantes, dependências e consumidores. Não converter esta tarefa de texto em mudança não validada do pipeline de mídia.

### C04 — P3 — Exceções de lint justificadas por compatibilidade abandonada

**Evidência:** [guardian/domain.rs](../src-tauri/src/guardian/domain.rs), 242 e 257; [Cargo.toml](../src-tauri/Cargo.toml), 11.

Há duas permissões para `clippy::unnecessary_map_or`; uma justifica compatibilidade com Rust anterior a 1.82. O projeto declara MSRV 1.97.1 e já usa alternativas modernas em outros pontos.

**Recomendação:** modernizar as expressões equivalentes e remover as permissões/justificativa obsoletas. Não retirar exceções de lint em massa: várias documentam acessibilidade ou restrições reais.

**Aceite:** testes de timeline/fila, formatação e Clippy com o toolchain declarado, sem introduzir uma supressão mais ampla.

## 3. Documentação

### D01 — P1 — README do site contradiz o modelo de telemetria

**Evidência:** [web/README.md](../web/README.md), 65–68; [README.md](../README.md), 114; [telemetry.rs](../src-tauri/src/telemetry.rs), 68–78.

O README do site diz que UUID, operação e finalidades só são enviados “com consentimento”. O README principal descreve captura ativa por padrão e desativável; o código considera `Unset` ativo. Há uma contradição em um contrato sensível, não um novo vazamento demonstrado.

**Recomendação:** descrever habilitação efetiva por finalidade, opt-out e kill switches conforme a implementação; apontar à política canônica. Evitar usar “consentimento” como sinônimo genérico de configuração ativa. Não mudar o modelo de coleta como efeito colateral desta limpeza documental.

**Aceite:** README, política PT/EN e testes de defaults/correlação descrevem o mesmo comportamento. Revisão de coerência técnica não substitui avaliação jurídica da política.

### D02 — P2 — Decisão OAuth tratada como vigente descreve limiter antigo

**Evidência:** [docs/README.md](README.md), seção de estado documental; [DECISAO-OAUTH-VIA-API.md](DECISAO-OAUTH-VIA-API.md), 136 e 221; [PLANO-BACKEND-NEXTJS-OAUTH.md](PLANO-BACKEND-NEXTJS-OAUTH.md), 192; [rate-limit-core.ts](../web/lib/server/rate-limit-core.ts), 189–190.

A decisão OAuth está classificada como referência operacional vigente, mas afirma que o limite é apenas em memória/instância e que falta implementar distribuição. O código já exige armazenamento remoto em produção e falha fechado sem ele.

**Recomendação:** preservar a decisão arquitetural como registro datado e apontar o estado operacional para [CONFIGURACAO.md](CONFIGURACAO.md) e runbooks. Separar implementação existente de Redis/credenciais efetivamente configurados no host.

**Aceite:** nenhum documento apresentado como operacional vigente descreve memória local como fallback de produção; documentos históricos carregam aviso e sucessor no próprio arquivo.

### D03 — P2 — Fonte editorial promete evidência que o link atual não contém

**Evidência:** [web/PRODUCT.md](../web/PRODUCT.md), 42 e 64; [PENDENCIAS.md](PENDENCIAS.md), 37.

`PRODUCT.md` afirma validação real de Twitch documentada em `PENDENCIAS.md`, mas o destino atual não contém o ensaio citado; contém exigências de validação futura. Isso não prova que o ensaio nunca ocorreu, somente que a evidência prometida não está ali.

**Recomendação:** recuperar referência real, datada e verificável, se existir; caso contrário, rebaixar/remover a afirmação. O arquivo é fonte declarada de oito artigos MDX: corrigir a base e revisar alegações derivadas.

**Aceite:** cada alegação de validação aponta para plataforma, versão, data, cenário e resultado realmente registrados. Não fabricar retrospectivamente um ensaio nem apagar `PRODUCT.md` para esconder a inconsistência.

### D04 — P2 — Há mais de uma fonte para o “estado atual”

**Evidência:** [PENDENCIAS.md](PENDENCIAS.md), 3, se declara checklist atual; [docs/README.md](README.md) o classifica como histórico; [IDEIAS-v4.md](IDEIAS-v4.md), 3, ainda o indica como fonte do estado atual. Auditoria, roadmap, gates e pendências repetem status relacionados.

**Recomendação de responsabilidades:**

| Documento                            | Responsabilidade                                                                    |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| Roadmap                              | Prioridades e direção do produto.                                                   |
| Gates                                | Critérios para aprovar uma release.                                                 |
| Um checklist de publicação escolhido | Pendências executáveis e evidências ainda necessárias.                              |
| Auditorias, inclusive esta           | Evidências e recomendações datadas, sem prometer status permanentemente atualizado. |
| Changelog                            | Mudanças realizadas, não tarefas pendentes.                                         |

**Aceite:** escolher e linkar um único checklist operacional; remover cópias móveis de status das demais fontes. Este relatório deve alimentar esse checklist, não virar mais uma autoridade concorrente.

### D05 — P2 — Documentos históricos não avisam quem chega por link direto

**Evidência:** [PLANEJAMENTO.md](PLANEJAMENTO.md), título e 494–502: nome antigo “Multi-Stream Studio”, referência textual a `NOMES.md` inexistente e instruções para definir nome/criar esqueleto já existentes.

A classificação por famílias no índice é útil, mas não acompanha quem encontra um plano pela busca ou por link direto. O checker de links não acusa a referência em código inline; passar no checker não comprova que as instruções continuam corretas.

**Recomendação:** cabeçalho local de status, data/versão, escopo e documento sucessor. Arquivar planos superados com cuidado com backlinks, ou manter o caminho e sinalizar o snapshot. Não apagar evidências históricas só por volume.

**Aceite:** abrir qualquer plano superado diretamente deixa claro que não é tutorial nem especificação atual; comandos antigos não são promovidos ao onboarding. Corrigir ou contextualizar referências textuais inexistentes.

### D06 — P2 — Caminhos de desenvolvimento do site são ambíguos

**Evidência:** [web/README.md](../web/README.md), 15–25 e 101; scripts em [package.json](../package.json) e [web/package.json](../web/package.json).

O documento começa com comandos da raiz, depois manda copiar genericamente `.env.example` e executar `pnpm content:check`, que só existe no workspace web. Há dois exemplos de ambiente no repositório e já existe um fluxo de contribuição sanitizado.

**Recomendação:** abrir com `pnpm contrib:web`/`pnpm contrib:web:check`; separar o caminho de operação com `web/.env.local`. Usar `pnpm --dir web content:check` quando o contexto continuar sendo a raiz. Indicar precondições de build de produção, sem exigir credenciais pessoais para contribuir.

**Aceite:** executar o roteiro em snapshot limpo, com os diretórios declarados e sem `.env` pessoal; todos os comandos resolvem os scripts pretendidos.

## 4. O que pode sair ou ter sua superfície reduzida

### R01 — P3 — Exports sem consumidores atuais

A busca nominal em código, testes, scripts e documentos encontrou os símbolos abaixo somente em suas declarações. Rotas especiais do Next.js e outros exports consumidos por convenção foram excluídos desta lista. Os barrels encontrados não têm consumidores desses nomes.

| Local                                                                    | Símbolos candidatos                              | Cuidado na remoção                                                        |
| ------------------------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------- |
| [ReplayPlayer.tsx](../src/components/ReplayPlayer.tsx), 943              | `OpenRecordingsButton`                           | Não remover player nem API de pasta, usados por outros fluxos.            |
| [decor.tsx](../src/components/decor.tsx), 67                             | `WaveCorner`                                     | Preservar `SoundWaves` e os ativos da marca usados.                       |
| [oauth.ts](../src/lib/oauth.ts), 20–21                                   | `HAS_YOUTUBE_OAUTH`, `HAS_KICK_OAUTH`            | `HAS_TWITCH_OAUTH` e a configuração OAuth têm consumidores.               |
| [platforms.ts](../src/lib/platforms.ts), 166                             | `platformInitials`                               | Não remover catálogo/ícones de plataformas.                               |
| [report.ts](../src/lib/report.ts), 310                                   | `obsCongestionSeries`                            | O dado de congestionamento ainda pode ser usado por outras análises.      |
| [telemetry.ts](../src/lib/telemetry.ts), 881                             | `telemetryBootDuration`                          | `bootAt`, na linha 120, só serve a esse helper; revisar junto.            |
| [icons.tsx](../web/app/_components/icons.tsx), 92 e 110                  | `BellIcon`, `MenuIcon`                           | Retirar imports que ficarem sem uso; manter os demais ícones.             |
| [editorial/hub.tsx](../web/app/_components/editorial/hub.tsx), 219 e 223 | `EditorialCategoryGrid`, `EditorialCategoryCard` | Remover também estilos exclusivos, conforme R02.                          |
| [server/posthog.ts](../web/lib/server/posthog.ts), 109                   | `shutdownPostHog`                                | Não alegar que removê-lo corrige um vazamento; nenhum hook atual o chama. |

**Recomendação:** remover esses símbolos após uma última busca no PR, mantendo testes e checagens. Não generalizar ausência de imports para scripts CLI, rotas Next, plugins, exemplos Rust ou catálogo de tradução com integração faltante.

**Aceite:** tipos, lint, testes e builds preservados; nenhuma referência dinâmica identificada. Ganho esperado principal: menos superfície morta. Não há economia de runtime quantificada, e o bundler pode já eliminar parte dos símbolos.

### R02 — P3 — CSS de componentes editoriais sem uso continua no stylesheet global

**Evidência:** [globals.css](../web/app/globals.css), 1430–1567, 2981 em diante, 3176 em diante e 3354; componentes de R01 em [hub.tsx](../web/app/_components/editorial/hub.tsx).

As famílias `editorial-category-grid` e `editorial-category-card*` só aparecem no CSS e nos dois componentes sem consumidores. São candidatas a remoção coordenada, incluindo responsividade e estados.

**Recomendação:** retirar componentes e seletores exclusivos no mesmo PR. **Não apagar o intervalo inteiro às cegas:** a regra da linha 1501 compartilha declaração com `.editorial-card__label`, e o bloco de forced colors da linha 3354 inclui componentes ainda usados.

**Aceite:** busca sem referências remanescentes às famílias removidas; preservar seletores compartilhados; comparar hubs, categorias, artigos, responsividade e forced colors. Medir CSS final se quiser anunciar redução de entrega.

### R03 — P3 — Snapshot de ferramenta de design precisa de uma política

**Evidência:** [web/.impeccable/design.json](../web/.impeccable/design.json), 3 e 94–95: export gerado, com trechos/narrativas reproduzidos em outros locais, total de **23.893 bytes**. Não foi encontrado consumidor no build. [source-files.mjs](../scripts/source-files.mjs), 10, exclui essa pasta no fallback sem Git.

**Remoção condicional, confiança média:** uma ferramenta externa ao build pode consumi-lo.

**Recomendação:** se for cache regenerável, tirar do versionamento e ignorar especificamente a pasta correspondente; se for fonte compartilhada da ferramenta, documentar quem usa/como atualizar e alinhar a política de snapshots. Preservar `DESIGN.md` e `PRODUCT.md`, que têm outra responsabilidade.

**Aceite:** confirmar consumidor/regeneração antes de excluir. Não apagar todos os diretórios ocultos por associação com ferramentas.

### R04 — P3 — Previews PNG do instalador são opcionais no Git

**Evidência:** [make-installer-art.ps1](../scripts/make-installer-art.ps1), 18 e 241–246; [tauri.conf.json](../src-tauri/tauri.conf.json), 66–67; [public-assets-review.json](../compliance/public-assets-review.json), 54 e 62.

`src-tauri/installer/header.png` e `sidebar.png` são previews, total de **9.628 bytes**. O instalador usa os BMPs. Manter os previews como evidência visual também é defensável: a economia é mínima.

**Recomendação opcional:** gerar PNGs em `.artifacts/installer-preview/` e conservar os BMPs necessários. Alterar gerador, inventário e testes juntos.

**Aceite:** geração reproduzível e instalador com os mesmos assets. Não tratar essa remoção como otimização relevante nem reescrever o histórico Git para economizar poucos kilobytes.

### R05 — P3 — Globals de navegador liberados sem necessidade no lint do smoke

**Evidência:** [eslint.config.js](../eslint.config.js), 51–79; [smoke-reports.mjs](../scripts/smoke-reports.mjs).

O bloco habilita 14 globals de navegador e diz que os callbacks executam via CDP. Entretanto, o código do navegador está em strings, que o ESLint não analisa; a AST do script atual contém zero usos desses identificadores fora das strings.

Uma expressão `console.log(document.title)` no contexto Node desse arquivo passa pelo lint com essa configuração, embora `document` seja indefinido no Node.

**Recomendação:** remover somente o bloco e o comentário sem efeito útil. Manter o smoke. Se o código de navegador passar a morar em fixtures JS reais, dar a elas ambiente de lint específico e validação própria.

**Aceite:** o script atual continua passando; inserir uma referência acidental a `document` no lado Node gera erro. A cobertura do JavaScript dentro das strings deve ser declarada honestamente, não presumida por globals.

## 5. O que não deve ser removido nessa limpeza

- **Masters PNG + derivados WebP editoriais:** são origem e entrega, ligados pelo manifesto; não são duplicação inútil. O pipeline está em [web/content/README.md](../web/content/README.md).
- **Licenças, notices, manifestos de compliance e lockfiles:** necessários para reprodução, distribuição e evidência. Não apagar para deixar a árvore mais bonita.
- **Ícones, BMPs e geradores usados pelo instalador/bandeja:** código gerador é parte da reprodução dos assets.
- **Experimento de delay comprimido:** [compressed_delay.rs](../src-tauri/experiments/compressed_delay.rs) é consumido pelo [exemplo de benchmark](../src-tauri/examples/guardian_packet_delay.rs), tem testes e escopo documentado. Não integrar ao app nem excluir apenas por estar fora do caminho de produção.
- **Demo, fixtures, testes de regressão e hooks de teste efetivamente usados:** sustentam contribuição e reprodução de bugs. Não são inúteis por não fazerem parte do produto final.
- **Código atrás de feature flag, como Mesa:** desligado não significa sem valor. A retirada exige decisão de produto e análise de consumidores/capabilities, não só busca por imports.
- **Comentários sobre ownership, cancelamento, ordem de saves, limites, redaction, relógios e acessibilidade:** explicam invariantes que não são óbvias no código. Exemplos em [frame_pool.rs](../src-tauri/src/frame_pool.rs), [recorder/mod.rs](../src-tauri/src/recorder/mod.rs) e [studio.rs](../src-tauri/src/studio.rs).
- **`.format-baseline.json`:** é uma política transitória documentada, não lixo. Reduzir sua dívida por mudanças revisadas; não excluí-la nem ampliar exceções para esconder arquivos mal formatados.
- **`.artifacts`, `node_modules`, `target`, `.next` e dados pessoais ignorados:** podem ocupar o disco local, mas não são automaticamente conteúdo versionado. Limpeza de disco seria outra tarefa, com alvos e política de recuperação próprios.
- **As antigas cópias `lib/i18n/pt.ts` e `en.ts` na raiz:** já estão excluídas no worktree anterior. Não foram contadas novamente como pendência; os dicionários ativos em `src/` e `web/` permanecem necessários.

## 6. Sequência recomendada de execução

1. **Contratos que não podem mentir:** Q01, Q02, Q03 e D01. PRs pequenos, cada um com teste de regressão ou validação documental específica.
2. **Robustez dos verificadores e dados:** Q04, Q05, Q11 e Q12. Testar também a própria ferramenta com entradas que devem falhar.
3. **Coerência funcional:** Q07, D02–D06. Integrar traduções e definir fontes documentais canônicas antes de apagar conteúdo supostamente órfão.
4. **Prioridade de trabalho e fronteiras:** Q06, Q08–Q10. Preservar comportamento e medir; não transformar limpeza em reescrita integral.
5. **Limpeza comprovada:** C01–C04, R01, R02 e R05. Preferir PR separado de comentários/código morto para facilitar revisão e bisect.
6. **Decisões opcionais de higiene:** R03/R04. Só executar após confirmar o papel dos arquivos; o benefício é pequeno.

### Checklist para cada PR

- [ ] O achado tem teste de regressão ou evidência verificável de ausência de consumidores.
- [ ] Comentários preservados explicam o contrato atual, não narram o diff anterior.
- [ ] Mudanças de comportamento, comentários e formatação ampla não estão misturadas sem necessidade.
- [ ] Tipos, lint e testes pertinentes passaram; fluxos visuais/nativos receberam validação proporcional ao risco.
- [ ] Remoções atualizaram imports, seletores compartilhados, geradores, manifestos e documentação relacionados.
- [ ] Nenhum plano histórico foi promovido a especificação atual sem conferência no código.
- [ ] Ganhos de performance só são declarados se medidos; reduzir linhas não é benchmark.
- [ ] O checklist operacional escolhido recebeu o status; esta auditoria continua sendo um registro datado.

## 7. Política simples para impedir a volta do ruído

**Comentários:** explicar por quê, limites, unidades, segurança e ownership. Não repetir nomes de funções, narrar redesigns, deixar notas de tradução cortadas ou duplicar números sem necessidade. Um comentário errado deve ser corrigido ou eliminado, não preservado por ser longo.

**Documentos:** cada guia precisa declarar público, escopo, status e fonte canônica. Decisões históricas precisam de data e sucessor. README deve encaminhar, não copiar vários runbooks. Evitar criar outro documento para cada pequena limpeza.

**Código sem uso:** adicionar uma verificação periódica de exports/arquivos sem consumidores que entenda os entrypoints do Next.js, Vite, Tauri, CLIs, exemplos e testes. Usar resultados como candidatos revisáveis, não como autorização automática de exclusão.

**Exceções:** cada bypass de lint, compatibilidade ou formato deve ter motivo ainda verdadeiro. Testes de políticas devem incluir casos negativos e provar que realmente inspecionaram os alvos.

**Critério final:** menos explicações sobre intenções antigas; mais contratos que o código, os testes e a documentação conseguem sustentar juntos.
