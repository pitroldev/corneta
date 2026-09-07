# Corneta: o que corrigir antes de abrir o código

Data: 6 de setembro de 2026. Base inspecionada: commit `add1e3b` e arquivos presentes no workspace.

## Estado após P0 e implementação dos itens restantes

Atualizado em 6 de setembro de 2026 (Brasília). O segundo lote começou no commit `8a2815d`, com árvore limpa, após o resultado anterior ter sido commitado. **Os itens locais foram ampliados; nem todos os gates operacionais estão encerrados.** Não houve novo commit, push, release ou mudança de visibilidade neste segundo lote. A distribuição de instaladores continua bloqueada pelas fontes incompletas e pela validação operacional pendente.

As seções OS-* abaixo preservam os achados da auditoria inicial para rastreabilidade. Consulte esta tabela para o estado atual, em vez de tratar cada descrição histórica como um problema ainda presente.

| Item               | Estado atual                                     | Entrega / pendência exata                                                                                                                                                                                                                         |
| ------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OS-01              | Corrigido e verificado localmente                | Scanner Gitleaks fixado, histórico completo e snapshot sem achados não justificados; exceções exatas para fixtures, com regressões. Repetir no commit final antes de publicar.                                                                    |
| OS-02              | Corrigido tecnicamente                           | Política de opt-out preservada, documentação e páginas PT/EN alinhadas, matriz de preferências e quatro bugs de estado/correlação corrigidos. Revisão jurídica da operação não foi realizada.                                                     |
| OS-03              | Corrigido                                        | README com status experimental, comandos reais, arquitetura atual, links corretos e captura sanitizada identificada com a versão verdadeira.                                                                                                      |
| OS-04              | Corrigido e validado nos caminhos descritos      | Perfil `contrib:*` sem credenciais oficiais, clone/snapshot limpo validado, cofre/identidade separados, updater ausente e poda externa bloqueada. Não é sandbox nem validação de instalador.                                                      |
| OS-05              | Corrigido                                        | CONTRIBUTING com setup, testes, invariantes e procedimento de PR.                                                                                                                                                                                 |
| OS-06              | Parcial                                          | SECURITY publicado com o contato já existente `corneta@pitrol.dev`. Falta confirmar recebimento; recurso nativo do GitHub retornou 404. Não foi enviado e-mail de teste.                                                                          |
| OS-07              | Revisão local concluída no escopo inventariado   | 36 arquivos visuais e o README dos masters revisados/inventariados; hashes e teste contra mudança de escopo/bytes. Procedência e limites dos direitos de terceiros documentados; não é certificação jurídica.                                     |
| OS-08              | Parcial, proteção principal aplicada             | `main` protegida inclusive para admin, sem force push/deleção e com cinco checks reais obrigatórios. Relato privado/controles de forks e secret protection precisam de rechecagem quando disponíveis; a visibilidade continua privada.            |
| OS-20, condicional | Preservação local implementada; espelho pendente | Coletor online/offline preserva ZIP exato, fontes e proveniência com hashes/limites. Cache local não é hospedagem durável; nenhum espelho foi publicado.                                                                                          |
| OS-27              | Parcial; distribuição bloqueada                  | Nove arquivos de fontes verificados; manifesto/config OCI e camada de dependências inspecionados sem execução. A imagem era de agosto, não da data da release. Faltam correspondência completa, transitivos e revisão. `reviewed: false` mantido. |
| OS-28              | Pendente                                         | Não há instalador/release aprovado para testar a cadeia real; faltam instalação/upgrade em ambiente limpo, OAuth real e matriz de lives longas/hardware. Testes automatizados não substituem esses gates.                                         |

### Evidências do primeiro lote P0 (históricas)

- **Segredos:** Gitleaks 8.30.1, histórico de 269 commits em 40 refs locais. Os quatro achados iniciais eram fixtures sintéticas; três exceções exigem regra, caminho e valor exatos, com testes que rejeitam mudanças. Scanner local/CI não envia o código a um serviço externo de análise. Os totais de arquivos e hashes de cada execução estão em `.artifacts/secret-audit/summary.json`, fora do Git.
- **Clone/snapshot limpo:** fontes copiadas sem `.env`, `node_modules`, `target` ou dados do app, seguidas de instalação frozen. `contrib:check` final passou com **570 testes em 59 suítes**, lint/tipos app+web, budgets, 39 artigos válidos e build Next de 44 páginas. O ciclo final levou aproximadamente 44 segundos com dependências/cache preparados; a primeira instalação com cache incompleto levou aproximadamente 10 minutos nesta máquina. Não são requisitos universais de performance.
- **Nativo:** `cargo fmt --all -- --check`, Clippy com `-D warnings` e `cargo test --locked --all-targets` passaram: **237 testes da biblioteca + 4 do experimento offline + 2 da assinatura**. Os três testes marcados `ignored` não foram repetidos nesta rodada. Houve mensagens informativas de biblioteca/exportação do linker MSVC, não erros de compilação.
- **Perfil Contributor:** `cargo check --locked --all-targets` com a configuração Contributor e os dois testes de poda passaram. Foram usadas somente árvores temporárias com arquivos fictícios; nenhum vídeo real foi removido. Não foi executado o app nativo nem instalado um pacote no perfil do streamer.
- **Navegador real:** smoke Chromium em perfil descartável, sem exceções JavaScript. Worker analisou 14.400 amostras; chat com 10.000 mensagens manteve página limitada a 700; transferência de buffer, exclusão e exportação verificadas. A medição final de análise foi 25,3 ms nesse cenário/máquina, não uma garantia para todos os relatórios.
- **GitHub:** configurações consultadas via API e proteção de `main` aplicada e reconferida. Não foram concedidos acessos, criados reports públicos ou publicada release. O recebimento de relatos de segurança continua dependendo de confirmação do mantenedor.
- **Conformidade:** as duas fontes registradas têm hashes realmente calculados. O gate continua recusando aprovação de fontes incompletas; nenhum `reviewed` foi marcado artificialmente para passar o build.

Os fixes incluem bugs encontrados ao implementar os itens, não somente documentação: normalização de preferências inválidas agora falha fechada; `unset` ativo é respeitado na geração/regeneração do UUID; kill switch também impede a correlação enviada à API; e um perfil de contribuição não poda gravações de uma pasta personalizada/importada da instalação real.

Referências vigentes: [desenvolvimento](DESENVOLVIMENTO.md), [contribuição](../CONTRIBUTING.md), [segurança do repositório](SEGURANCA-REPOSITORIO.md), [materiais públicos](MATERIAIS-PUBLICOS.md), [fontes do FFmpeg](CONFORMIDADE-FFMPEG.md) e [runbook beta](RUNBOOK-BETA.md).

### Segundo lote — itens restantes

| Item  | Estado / entrega                                                                                                                                                                                                                                                                                                                                |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OS-09 | Perfil Contributor preservado e matriz oficial/BYOK/fork publicada. White-label/self-hosting arbitrário continua explicitamente não suportado; não foram relaxadas origens, cofre ou assinatura. O aceite da auditoria permite essa limitação honesta.                                                                                          |
| OS-10 | Wrapper sem shell, parser dotenv nativo, precedência inclusive vazio/case Windows, argumentos literais, falha de leitura explícita, CLI Tauri via Node e testes. Matriz de variáveis/carregamento em CONFIGURACAO.                                                                                                                              |
| OS-11 | Índice por tarefa, estado de todas as famílias de documentos e referências vigentes; verificador de links locais com testes e CI. Histórico preservado, não apagado nem apresentado como promessa atual.                                                                                                                                        |
| OS-12 | SUPPORT e código de conduta com responsável real e sem SLA fictício. Recebimento do canal privado continua pendente de confirmação, compartilhando a ressalva de OS-06.                                                                                                                                                                         |
| OS-13 | Formulários de bug/proposta, template de PR, CODEOWNERS do mantenedor atual e tarefas iniciais delimitadas no roadmap. Não foram publicadas issues externas para simular uma comunidade.                                                                                                                                                        |
| OS-14 | Formatação cobre app/web/scripts/config/docs; baseline por hash mantém dívida histórica intacta explícita. Arquivos novos/modificados não são dispensados. Lint de scripts/config, checagem de sintaxe JS/PowerShell, EditorConfig/Gitattributes e testes de cobertura; sem normalização global.                                                |
| OS-15 | `any`, catch vazio, labels, autofocus e legendas deixam de ter dispensa global. Exceções locais justificadas para prévias ao vivo/edição explícita; desabilitações inúteis falham. Corrigido autofocus indevido do chat e nome acessível da chave.                                                                                              |
| OS-16 | Smoke Chromium PT/EN integrado ao CI: worker, paginação/chat volumoso, abrir detalhe no topo, vídeo ausente, modal pelo teclado e retorno de foco. O teste revelou e levou à correção do foco do Modal compartilhado. Não é certificação de OBS/OAuth.                                                                                          |
| OS-17 | Gerador usa pasta descartável por padrão, Contributor somente por flag; cenário selecionável, referência temporal fixa e vídeo sob demanda. Manifesto/hashes e proteção de caminhos na limpeza/restauração; dados reais não são o destino padrão.                                                                                               |
| OS-18 | Concorrência/timeouts no CI, Rust `--locked`, implementação da action Rust fixada por SHA com toolchain explícito, verificação de lockfiles e permissões restritas. Release não é cancelada pela regra de PR.                                                                                                                                   |
| OS-19 | Checks comuns validam integridade sem depender do calendário de artigos. Publicação oficial do site mantém manutenção obrigatória; release desktop não é bloqueada por artigos antigos sem alteração. Workflow editorial agendado fica opt-in fora do repositório oficial e falha diante de erro nas consultas antes de tentar criar uma issue. |
| OS-21 | Contrato mensurável, benchmark reproduzível e baseline sintética versionada. CPU/GPU/RSS/startup nativos e lives longas continuam sem baseline certificada; metodologia e estado pendente explícitos.                                                                                                                                           |
| OS-22 | Mapa de arquitetura, propriedade/cancelamento/retensão, testes e fronteiras de extração. Modularização incremental em ambiente e segurança de fixtures; sem reescrita arriscada dos módulos de mídia apenas por tamanho.                                                                                                                        |
| OS-23 | Confirmada ausência de consumidores e removidos somente `lib/i18n/pt.ts` e `en.ts` da raiz. Catálogos ativos desktop/site preservados, versões antigas recuperáveis pelo Git.                                                                                                                                                                   |
| OS-25 | Metadados MIT/repositório/homepage/bugs nos dois pacotes. Avisos de terceiros/procedência preservados; MIT não substitui licenças de componentes ou direitos de marcas.                                                                                                                                                                         |
| OS-24 | Matriz de rede/plataformas com autenticação, portas, dados, limites e restrições. Mesa sinaliza por HTTP/WS em interface LAN, não é descrita falsamente como serviço autenticado/TLS ou pronto para exposição pública.                                                                                                                          |
| OS-26 | Changelog não lançado, contrato de compatibilidade e roadmap curto. Sem reconstruir histórico fictício de releases nem prometer suporte a plataformas não validadas.                                                                                                                                                                            |

### Validações do segundo lote

- **Snapshot limpo:** `contrib:check` passou com **647 testes em 68 arquivos**, lint app/scripts/config/web, TypeScript app/web, integridade de 39 artigos e builds. Node 24.18.1; dependências congeladas já instaladas foram reutilizadas, sem `.env` pessoal ou `.git`. Ciclo final de aproximadamente **30,9 s com caches preparados**, não benchmark universal de clone frio.
- **Bundles/site:** entrada principal **189,9 KiB JS gzip**, dentro dos budgets; Next gerou **44 páginas**. Nenhuma biblioteca nova foi colocada no caminho inicial para esses ajustes.
- **Browser real:** smoke PT/EN passou com 14.400 amostras, 10.000 mensagens, página de chat limitada a 700, seek trocando página, abertura do detalhe no topo, vídeo ausente, modal via teclado e retorno de foco. Texto ampliado sem overflow nos cenários verificados. Capturas inspecionadas; isso não certifica todos os tamanhos/leitores de tela.
- **Ferramentas/documentação:** no repositório, formatação inspecionou **479 arquivos**, com **86 débitos históricos intactos** explicitamente preservados e nenhum erro novo; links locais em **93 documentos/515 destinos**, sem erro. O parser PowerShell passou nos **sete scripts** sem executá-los. `git diff --check` e `cargo fmt --all -- --check` passaram. Os testes/Clippy nativos do primeiro lote não são apresentados como uma nova execução aqui; a mudança Rust deste lote é um comentário de rede.
- **Fixtures:** geração real de **19 cenários**, incluindo quatro arquivos MP4 sintéticos, passou na pasta ignorada `.artifacts/report-fixtures/`; nada foi instalado no perfil oficial. E2Es temporários cobrem timestamps inteiros, determinismo, ausência de FFmpeg, colisões, falha de geração, links quebrados e restauração sem sobrescrita. Staging/backup de falhas são preservados com escopo explícito.
- **Segredos:** testes do scanner (**3/3**) e Gitleaks 8.30.1 passaram; histórico de **270 commits/40 refs** e snapshot de **587 arquivos** sem achados. Três hashes de formatação geraram falsos positivos iniciais; foram tipados como `sha256:`, sem criar allowlist. O resumo ignorado registra o hash de cada execução; repetir após o commit final e atualização das refs que serão publicadas.
- **Performance sintética:** benchmark versionado, cinco aquecimentos e 25 medições, p50 **28,83 ms** e p95 **38,80 ms** no i7-13700K/32 GiB, Node 24.18.1, 14.400 amostras/quatro destinos. Não mede startup, IPC, RSS da live ou GPU. Esses permanecem na matriz real pendente.
- **Conformidade:** coleta online/offline, hashes e inspeção passiva executados; testes do coletor/gate passaram. O pacote futuro passa a incluir avisos/proveniência/instruções. `compliance:check` continua saindo com erro por revisão incompleta, **resultado esperado**, sem marcar fontes parciais como aprovadas.

Os workflows foram alterados e testados localmente, mas não enviados/executados remotamente nesta rodada. Nenhum instalador foi publicado e nenhuma conta foi autenticada para fingir cobertura operacional.

### O que não pode ser encerrado apenas por mudanças de código

- Confirmar a caixa de segurança/conduta. A pergunta foi apresentada ao mantenedor; não presumir recebimento sem resposta.
- Recursos nativos do GitHub: reconferidos, relato privado retorna 404; aprovação de forks retorna 422 enquanto privado; `security_and_analysis` não informa secret protection. Não alterar visibilidade nem contratar serviço para fazer o checklist passar.
- FFmpeg: completar a correspondência real das dependências/transitivos e provisionar hospedagem durável dos artefatos/materiais. Nove tarballs corretos não são sinônimo de fontes completas.
- Validar instalador aprovado, upgrade/cofre/dados, OAuth com contas reais, provedores, ensaios de 4–8 h e matriz de GPU/driver. Nenhuma simulação local ou baseline do parser substitui esses ensaios. A revisão jurídica da operação permanece fora desta execução.

## Resumo direto

O Corneta já tem engenharia de verdade: testes, separação desktop/site, controles de segurança, otimizações e um processo de release com verificações importantes. Não é necessário reescrever o projeto para publicá-lo.

O maior risco para a primeira impressão é outro: **o repositório ainda exige conhecimento privado do mantenedor para ser entendido e reproduzido**. Há documentação contraditória, comandos de início que omitem configuração obrigatória, acoplamento à infraestrutura oficial e ausência de instruções de contribuição e segurança.

Os primeiros problemas que eu resolveria são:

1. Conciliar a descrição de telemetria com o comportamento implementado.
2. Validar credenciais e dados pessoais no histórico completo antes de mudar a visibilidade.
3. Atualizar o README, inclusive o link quebrado e o status real do produto.
4. Fazer uma pessoa conseguir rodar e validar um clone novo sem suas credenciais.
5. Publicar instruções de contribuição e um canal privado para vulnerabilidades.
6. Separar claramente código aberto, serviço oficial e distribuição de instaladores.

**Abrir o código não é lançar uma versão estável.** É possível publicar o projeto como experimental, com limitações honestas e contribuição bem orientada, enquanto a validação de lives longas e o empacotamento final continuam. A pendência de fontes do FFmpeg é um bloqueador concreto da distribuição que o inclui; não deve ser apresentada automaticamente como impedimento para publicar somente o código próprio.

## Como interpretar esta auditoria

- **P0 · abertura:** resolver ou concluir a verificação antes de anunciar o repositório público.
- **P0 · distribuição:** obrigatório antes de distribuir o instalador correspondente; não confundir com abertura do código.
- **P1:** alto retorno para quem chega ao projeto; priorizar no primeiro ciclo de contribuições.
- **P2:** evolução incremental, sem transformar a abertura em uma reforma interminável.
- **Confirmado:** evidência encontrada nos arquivos ou verificações locais.
- **Verificação pendente:** exige execução adicional, inspeção visual, contas, infraestrutura ou configurações externas.
- **Recomendação:** melhoria preventiva; não significa que exista uma vulnerabilidade ou um bug demonstrado.

Esforços são estimativas de trabalho ativo, não compromissos: **PP** até meio dia; **P** aproximadamente um dia; **M** alguns dias; **G** trabalho em etapas. Revisões externas e testes longos podem aumentar o prazo.

## O que já está bom e deve ser preservado

- [Licença MIT](../LICENSE) existente e [avisos de terceiros](../THIRD_PARTY_NOTICES.md) que distinguem a aplicação dos componentes distribuídos.
- Toolchains fixados, lockfiles, instalação congelada no CI, testes JavaScript/TypeScript e Rust, análise estática e verificações de dependências.
- [CI](../.github/workflows/ci.yml) com Gitleaks, permissões restritas e checkout sem persistência de credenciais; várias actions fixadas por SHA.
- [Sidecars](../scripts/fetch-binaries.ps1) com versões e hashes fixados, incluindo possibilidade de espelho.
- Verificações específicas para artefatos, assinatura do updater e pacote de conformidade na [release](../.github/workflows/release.yml).
- [Demonstração no navegador](../README.md), testes de relatórios e [smoke em Chromium](../scripts/smoke-reports.mjs) já existentes.
- Relatórios divididos em [componentes e hooks](../src/screens/reports/), carregamento sob demanda e processamento fora do fluxo principal em partes importantes do frontend.
- [Orçamentos de bundle](../scripts/check-bundle.mjs), [testes de performance de relatórios](../src/lib/report.performance.test.ts) e registros de otimizações. Não estamos partindo do zero em performance.
- Fronteiras entre dados públicos de build e segredos de servidor, redatores de telemetria e testes de contratos. A inconsistência de documentação não apaga esses controles.
- [Procedência de assets editoriais](../web/content/assets/manifest.json) já registrada; aproveitar esse inventário, não inventar outro paralelo.

O [runbook beta](RUNBOOK-BETA.md) registra 698 aprovações na validação anterior. Esse é um registro existente, **não uma nova execução das suítes nesta auditoria**.

## A. Antes de anunciar a abertura

### OS-01 — Verificar segredos no histórico completo

**P0 · abertura | Verificação pendente | P + eventual resposta a exposição**

**Evidência:** o [`.gitignore`](../.gitignore) protege `.env`, chaves, certificados e logs. As consultas desta auditoria não encontraram `.env`, chaves privadas, certificados, logs, relatórios NDJSON ou vídeos nos padrões de arquivos rastreados consultados. A busca por nomes de arquivos de credenciais no histórico também não retornou ocorrências. O CI já contém Gitleaks, mas não executei uma nova varredura integral de conteúdo local; Gitleaks e TruffleHog não estavam disponíveis como comandos no PATH.

**Risco:** procurar nomes não encontra uma stream key colada num teste, comentário, URL, commit antigo, screenshot ou descrição de PR. Arquivo ignorado no diretório local não prova vazamento, e ignorá-lo hoje não prova ausência no passado.

**Ação:** executar o scanner do projeto com escopo explícito para todas as refs que serão publicadas, registrar versão, SHA e resultado sanitizado, e revisar exceções. Complementar com inspeção dos assets e dos anexos que forem publicados. Se existir credencial real exposta, revogar/rotacionar primeiro; decidir depois a limpeza coordenada do histórico. Não reescrever o histórico apenas para “ficar bonito”. Essa ordem segue a [orientação do GitHub para dados sensíveis](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).

**Aceite:** nenhuma credencial real válida exposta; exceções justificadas; evidência da varredura do SHA e das refs finais. Client IDs e chaves públicas não devem ser tratados automaticamente como segredos.

### OS-02 — Fazer a documentação de telemetria dizer a verdade

**P0 · abertura | Confirmado | P/M**

**Evidência:** [`.env.example`](../.env.example) chama a telemetria desktop de “opt-in”; o [runbook PostHog](RUNBOOK-POSTHOG.md) diz que os dois consentimentos começam desligados. Em contraste, os [gates](GATES-DE-RELEASE.md) dizem que começam ligados, e tanto [`Consent::active`](../src-tauri/src/telemetry.rs) quanto [`telemetryPurposeActive`](../src/lib/telemetry-schema.ts) consideram ativa a preferência diferente de `disabled`. O estado padrão é `Unset`/`unset`.

**Impacto:** com a telemetria configurada, a documentação promete uma escolha inicial diferente da implementada. Isso afeta confiança e revisão independente de privacidade, mesmo com payloads redigidos e kill switches existentes.

**Ação:** alinhar comportamento, textos do app, exemplos, runbooks e páginas públicas à política efetivamente adotada. A intenção de usar legítimo interesse já está documentada; esta auditoria não valida essa base jurídica nem exige trocar automaticamente para consentimento. Submeter a política e os tratamentos reais à revisão apropriada. Explicar finalidades, categorias, destino, retenção, oposição/desativação e funcionamento offline.

**Aceite:** uma matriz testada para `unset`, `enabled`, `disabled`, ausência de token e kill switch; nenhuma contradição entre código e informação pública. Se a política escolhida for opt-in, provar ausência de envio antes da escolha. Se não for, não chamar o comportamento de opt-in.

### OS-03 — Atualizar o README para o produto que existe

**P0 · abertura | Confirmado | P**

**Evidência no [README](../README.md):**

- O status ainda descreve uma fase muito anterior e trata assinatura como bloqueio genérico, enquanto [ASSINATURA.md](ASSINATURA.md) registra o adiamento de Authenticode.
- A árvore inclui `legacy/`, que não corresponde à estrutura atual, e omite áreas importantes como `web/` e `compliance/`.
- O link para `docs/ATUALIZACAO-DEPENDENCIAS-2026-08-01.md` aponta para arquivo inexistente. Foi o link local quebrado encontrado na checagem simples dos 75 Markdown rastreados.
- O resumo “um FFmpeg por plataforma” e o diagrama “decode-once → encode-N” precisam distinguir os modos realmente implementados, incluindo compartilhamento e passagem sem reencodificação quando aplicáveis.
- Não há imagem de apresentação no README nem um caminho inicial claro para “quero usar”, “quero testar” e “quero contribuir”.

**Ação:** apresentar o produto em poucos parágrafos, com uma captura atual e sanitizada, plataformas/arquiteturas validadas, status experimental ou beta, funcionalidades atuais, limitações e três caminhos de entrada. Atualizar comandos, árvore e arquitetura. Badges de CI/licença ajudam, mas somente se seus destinos forem reais.

**Aceite:** uma pessoa entende para que serve, o que já funciona, em quais ambientes e como começar sem abrir um documento de planejamento. Nenhum link quebrado ou promessa de distribuição ainda indisponível.

### OS-04 — Garantir o caminho de um clone novo, sem suas credenciais

**P0 · abertura | Confirmado no código; teste limpo pendente | M**

**Evidência:** o README manda executar `pnpm web:check`, mas só pede `NEXT_PUBLIC_SITE_URL` “no deploy”. [`web/lib/site.ts`](../web/lib/site.ts) exige essa variável em produção e rejeita origem diferente de `https://www.corneta.live`. O comando inclui build de produção, e o CI injeta a variável explicitamente. Além disso, [`tauri.conf.json`](../src-tauri/tauri.conf.json) habilita artefatos do updater e o próprio [`with-env.mjs`](../scripts/with-env.mjs) documenta a falha de build sem chave privada correspondente.

**Ação:** publicar e testar três caminhos independentes: demonstração React sem Rust; desktop de desenvolvimento com sidecars; site/API local. Explicar exatamente o arquivo de ambiente usado por cada processo. Disponibilizar um caminho documentado para build local do desktop, com identidade/chave próprias ou configuração de desenvolvimento sem updater; a chave privada oficial nunca é requisito de contribuição.

Informar PowerShell 7, ferramentas de compilação Windows, versões fixadas, WebView2, OBS quando necessário, portas e resolução de conflitos. Medir e informar o custo aproximado do primeiro download/build, sem prometer duração universal.

**Aceite:** em diretório e perfil limpos, seguir apenas o guia permite instalar, abrir a demo e executar os checks de contribuição. Não exige `.env` privado, PostHog, Redis de produção, conta pessoal do mantenedor ou chave oficial. Instalar a própria build de teste não sobrescreve o perfil real do streamer.

### OS-05 — Criar o contrato mínimo de contribuição

**P0 · abertura | Confirmado: ausente neste repositório | P**

**Evidência:** não há `CONTRIBUTING.md` no repositório. README e planejamento não explicam o processo de uma contribuição externa.

**Ação:** escrever um guia curto com setup, comandos por área, organização de testes, padrão de PR, convenções de idioma e processo de discussão para mudanças grandes. Dizer explicitamente que contribuições pequenas e em português são aceitas, se essa for a política escolhida. Explicar invariantes: a live tem prioridade sobre tarefas auxiliares; não expor segredos no frontend; não bloquear o caminho de transmissão com análise, logs ou I/O dispensável.

**Aceite:** alguém consegue escolher uma issue, localizar a área relevante, testar sua alteração e abrir um PR sem perguntar “como vocês fazem aqui?”. README e templates apontam para o guia. São práticas compatíveis com as [recomendações do GitHub para repositórios](https://docs.github.com/en/repositories/creating-and-managing-repositories/best-practices-for-repositories).

### OS-06 — Criar SECURITY.md e um canal privado utilizável

**P0 · abertura | Arquivo ausente; configuração externa não verificada | PP/P**

**Ação:** documentar versões atendidas, como reportar vulnerabilidades em particular, dados mínimos, cuidados com tokens e prazo de resposta realista. Diferenciar falhas de segurança de dúvidas e bugs comuns. Configurar e testar o recebimento do canal escolhido; não criar um endereço fictício para preencher o arquivo.

Se usar o recurso nativo, habilitar e verificar o [relato privado de vulnerabilidades do GitHub](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository). A existência de `SECURITY.md` não comprova que essa configuração esteja ativa.

**Aceite:** um pesquisador consegue enviar detalhes em particular e o mantenedor recebe a notificação. O texto não promete certificação, auditoria formal ou atendimento contínuo que o projeto não oferece.

### OS-07 — Revisar dados e direitos dos materiais que serão públicos

**P0 · abertura | Verificação pendente | P**

**Evidência:** existem masters rastreados em [`web/content/assets/originals/`](../web/content/assets/originals/), um manifesto de procedência e ferramentas de segurança editorial. Relatórios e vídeos reais não apareceram nos padrões rastreados consultados. Isso não equivale a verificar pixels de todas as imagens ou todo texto de exemplos.

**Ação:** revisar masters e derivadas, capturas do README, nomes de contas, URLs personalizadas, mensagens de chat, e-mails, caminhos locais e dados de demonstração. Usar fixtures sintéticas nos exemplos públicos. Conferir direitos de imagens, ícones, fontes, marcas e modelos externos; registrar exceções ao código MIT quando houver.

**Aceite:** nenhum material pessoal ou segredo identificável sem autorização; cada asset público tem procedência/licença conhecida. Não é necessário apagar arquivos privados ignorados da máquina para tornar o repositório público: o escopo é o que será efetivamente publicado.

### OS-08 — Conferir as configurações do GitHub antes da mudança de visibilidade

**P0 · abertura | Verificação externa pendente | PP/P**

**Ação:** verificar proteção da branch principal, checks obrigatórios, permissões dos workflows, aprovação de execuções de contribuidores novos, permissões de colaboradores, tratamento de secrets em PRs de forks e proteções disponíveis para segredos. Revisar também informações de issues, PRs, releases e anexos que ficarão visíveis.

**Evidência:** a configuração local já usa várias boas práticas de Actions. Ela não permite concluir se rulesets, push protection, relato privado ou as permissões reais da organização/conta estão ativos.

**Aceite:** checklist externo registrado pelo responsável, permissões mínimas e caminho de manutenção viável. Não impor dois aprovadores obrigatórios num projeto de um único mantenedor sem planejar como integrar contribuições. O GitHub documenta essas medidas nas [boas práticas de repositórios](https://docs.github.com/en/repositories/creating-and-managing-repositories/best-practices-for-repositories).

## B. Tornar o repositório fácil de manter e contribuir

### OS-09 — Separar perfil oficial de perfil de desenvolvimento/fork

**P1; antecipar se anunciar self-hosting | Confirmado | M/G**

**Evidência:** [`web/lib/site.ts`](../web/lib/site.ts) fixa o domínio de produção; [`download.ts`](../web/lib/download.ts) aceita instaladores somente de `pitroldev/corneta`; [`release-config.ts`](../web/lib/server/release-config.ts) aplica requisitos da operação oficial; [`tauri.conf.json`](../src-tauri/tauri.conf.json) fixa identificador, publicador e updater oficiais. [`next.config.ts`](../web/next.config.ts) executa gates oficiais em produção na Vercel.

**Impacto:** abrir o código não torna automaticamente o app e o backend fáceis de hospedar ou distribuir por terceiros. Um fork pode continuar apontando para serviços, atualizações e identidade do projeto original.

**Ação:** criar configuração explícita para a distribuição oficial e documentar configuração própria para forks: domínio, API, repositório de releases, identificador do app, credenciais OAuth, chaves e telemetria. Não relaxar allowlists e validações de segurança da distribuição oficial para acomodar forks. Nunca fazer um fork enviar dados ao projeto de analytics do mantenedor por acidente.

**Aceite:** um fork pode operar com infraestrutura e identidade próprias, ou a limitação é declarada honestamente enquanto esse suporte não existe. Uma build oficial continua recusando origem, assinatura e configuração inválidas.

### OS-10 — Unificar a documentação das variáveis e seu carregamento

**P1 | Confirmado | P/M**

**Evidência:** [`.env.example`](../.env.example) ainda cita `landing/`, orienta genericamente que o secret Kick fica no cofre e diz que o arquivo não é carregado pelo build Rust. Hoje o site está em `web/`, o fluxo oficial Kick usa segredo no servidor, e [`build.rs`](../src-tauri/build.rs) lê uma allowlist pública do `.env`. Há caminhos diferentes de leitura em Rust, Next e [`with-env.mjs`](../scripts/with-env.mjs), que tem parser próprio e executa o filho com `shell: true`.

**Ação:** manter uma matriz por variável: consumidor, pública/secreta, momento de leitura, obrigatoriedade, ambiente e exemplo seguro. Distinguir fluxo oficial de credenciais próprias/BYOK. Alinhar parsers ou testar diferenças de aspas, espaços, valores vazios e precedência. Rever propagação indiscriminada do ambiente e passagem de argumentos ao shell sem quebrar os shims do Windows; isto é endurecimento preventivo, não exploração demonstrada.

**Aceite:** nenhum colaborador precisa adivinhar onde colocar um valor, e nenhum segredo de servidor recebe prefixo público `VITE_`/`NEXT_PUBLIC_`. Testes cobrem os casos de parsing e invocação suportados; mensagens de erro não imprimem valores sensíveis.

### OS-11 — Dar uma entrada única à documentação e arquivar planos antigos

**P1 | Confirmado | P/M**

**Evidência:** `docs/` reúne dezenas de documentos de produto, brainstorms, revisões e operação, sem um `docs/README.md` que separe implementação atual de intenção histórica. As contradições de assinatura e telemetria mostram que já existe divergência prática.

**Ação:** criar um índice por tarefa: usar, desenvolver, entender arquitetura, operar o backend, preparar release e consultar decisões. Marcar documentos como vigente, histórico, proposto ou substituído; indicar data/versão de referência e sucessor. Converter decisões realmente adotadas em registros pequenos, sem apagar todo o raciocínio anterior. Separar pendências executáveis de listas de ideias.

**Aceite:** cada assunto sensível tem uma referência vigente identificável. O README não manda quem só quer contribuir ler um plano de produto inteiro. Um verificador de links locais roda no CI sem tratar exemplos de código como links reais.

### OS-12 — Definir suporte, convivência e expectativas de manutenção

**P1 | Confirmado: arquivos próprios ausentes | P**

**Ação:** criar `SUPPORT.md` ou seção equivalente e um código de conduta com canal real. Explicar idioma, onde perguntar, como reportar bugs e quais ambientes são atendidos. Distinguir suporte comunitário de compromisso comercial; evitar promessa de SLA que um mantenedor independente não consegue cumprir. O código de conduta precisa ter responsável e processo, não apenas texto copiado, como recomenda o [guia do GitHub](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/adding-a-code-of-conduct-to-your-project).

**Aceite:** usuários não abrem detalhes sensíveis em issues por falta de orientação, e contribuidores sabem como agir e pedir ajuda. Discussions é opcional: não abrir canais demais sem capacidade de acompanhar.

### OS-13 — Criar templates de issues/PRs e orientar áreas do código

**P1 | Confirmado: ausentes neste repo | P**

**Ação:** adicionar formulários de bug e proposta e um template curto de PR. Para bugs, coletar versão do Corneta, Windows, OBS, GPU/driver, plataforma, modo de transmissão, reprodução mínima e resultado esperado. Não pedir stream key, token, chat completo ou log bruto indiscriminadamente. Para PRs, pedir testes, efeito em performance/privacidade e imagens somente se relevantes.

Mapear áreas críticas e revisores disponíveis; adicionar `CODEOWNERS` se houver responsáveis reais. Criar algumas issues pequenas e reproduzíveis para primeira contribuição, em vez de rotular uma refatoração inteira como `good first issue`.

**Aceite:** reportar um problema leva poucos minutos, produz informação útil e orienta sanitização. Os templates encaminham vulnerabilidades ao canal privado e referenciam o guia de contribuição.

### OS-14 — Corrigir a diferença entre os checks anunciados e seu alcance

**P1 | Confirmado | P/M**

**Evidência:** em [`package.json`](../package.json), `format:check` inclui `docs/**/*.md`, mas [`.prettierignore`](../.prettierignore) ignora `docs`. O lint da raiz cobre `src`, não todos os scripts de manutenção. O CI faz `node --check` para uma seleção de cinco scripts; isso verifica sintaxe, não substitui lint ou testes de comportamento. O formato do site também não está integralmente coberto pelo comando de formatação da raiz.

**Ação:** definir escopos explícitos para app, web, scripts, configuração e documentação; incluir tudo que se promete validar, respeitando ferramentas próprias de Rust e arquivos gerados. Adicionar `.editorconfig` e `.gitattributes` com política adequada de codificação, texto e binários, evitando diffs integrais por CRLF/LF. Fazer normalização necessária em PR separado.

**Aceite:** introduzir deliberadamente um erro em cada escopo pertinente faz o respectivo check falhar; os comandos e a documentação descrevem a mesma cobertura. Um PR comum não reformata acidentalmente todo o repositório.

### OS-15 — Tornar as exceções de lint locais e justificadas

**P1 | Confirmado; impacto caso a caso | M**

**Evidência:** [`eslint.config.js`](../eslint.config.js) desliga globalmente `no-explicit-any`, alertas de desabilitações não usadas e algumas regras de acessibilidade, além de permitir `catch` vazio. Há motivos legítimos para exceções, mas o escopo atual não distingue um caso documentado de um problema novo.

**Ação:** revisar por área, ativar checks gradualmente e restringir exceções aos casos justificados. Priorizar contratos IPC, caminhos de erro, labels e controles interativos. Manter o uso obrigatório dos componentes do design system já estabelecido no projeto.

**Aceite:** exceções críticas explicam por que são seguras ou necessárias; código novo não herda dispensa genérica. Não forçar toda mídia ao vivo a ter legenda por um check cego, nem substituir `any` por casts igualmente inseguros só para passar no lint.

### OS-16 — Integrar o smoke de interface existente à validação contínua

**P1 | Confirmado: script existe, sem chamada no CI inspecionado | M**

**Evidência:** [`smoke-reports.mjs`](../scripts/smoke-reports.mjs) já abre Chromium com perfil descartável e exercita o worker de produção. Não é necessário começar do zero. Há também testes de relógio, chat, relatórios e performance que devem continuar.

**Ação:** executar esse smoke em job apropriado, com navegador identificado e timeout. Expandir gradualmente para regressões importantes: abrir relatório no topo, marcar momento sem remontar a página, seek com chat sincronizado, vídeo ausente, lista extensa e paginação. Incluir navegação por teclado, foco, escala de texto e os idiomas suportados nos testes relevantes. Separar mocks de browser dos testes reais Tauri/OBS/OAuth.

**Aceite:** uma regressão nesses fluxos é detectada antes do merge, sem conta externa ou perfil pessoal. Falhas produzem diagnóstico sanitizado. Testes de browser não são apresentados como prova de funcionamento do encoder, cofre ou OAuth real.

### OS-17 — Oferecer fixtures seguras e cenários fáceis de reproduzir

**P1 | Recomendação sobre infraestrutura existente | P/M**

**Evidência:** há [`seed-report-fixtures.mjs`](../scripts/seed-report-fixtures.mjs), comandos de geração/restauração e [documentação dos relatórios fictícios](RELATORIOS-FICTICIOS.md). Aproveitar esse trabalho em vez de versionar a live real enviada durante o desenvolvimento.

**Ação:** documentar um conjunto pequeno para contribuição, com resultado esperado: sem vídeo, com vídeo sintético, relatório longo, chat volumoso, sessão interrompida, timestamps inválidos/antigos, ausência de telemetria e múltiplos destinos. Tornar explícitos destino, backup e restauração; oferecer perfil/pasta descartável para os cenários nativos. Gerar mídia grande sob demanda.

**Aceite:** um colaborador reproduz um bug de relatório com um identificador de cenário, sem seus arquivos privados e sem arriscar as próprias lives. A demo é determinística o suficiente para comparar mudanças.

### OS-18 — Ajustar custo, reprodutibilidade e segurança do CI público

**P1 | Confirmado + recomendações | P/M**

**Evidência:** o CI usa instalação congelada de pacotes JS, mas chamadas de testes/Clippy Rust não explicitam `--locked`. Não há `concurrency` ou `timeout-minutes` nos jobs inspecionados. A action `dtolnay/rust-toolchain` está referenciada pela tag de versão, enquanto várias outras já usam SHA.

**Ação:** impedir alteração incidental dos lockfiles nos checks pertinentes; fixar a implementação das actions sem perder a versão explícita do toolchain; definir limites por job e cancelar execuções de PR superadas. Preservar execuções de release que não podem ser canceladas pela mesma regra. Revisar caches e permissões sem entregar secrets a código de forks. Medir antes de criar filtros que possam deixar mudanças críticas sem testes.

**Aceite:** PRs externos rodam checks úteis sem infraestrutura privada; repetição do mesmo commit usa as mesmas dependências fixadas; uma execução travada tem limite e um novo push não mantém builds redundantes desnecessários.

### OS-19 — Não fazer manutenção editorial bloquear contribuições sem relação

**P1 | Confirmado | P/M**

**Evidência:** [`web/package.json`](../web/package.json) inicia `check` com `content:maintenance:check --fail-on-overdue`. O check geral do repositório inclui `web:check`. Portanto, o envelhecimento de artigos pode reprovar uma contribuição ao desktop sem relação com conteúdo. Já existe um [workflow editorial agendado](../.github/workflows/editorial-maintenance.yml).

**Ação:** separar qualidade do código, integridade/revisão de conteúdo alterado e manutenção editorial por calendário. Manter bloqueios pertinentes para publicação do site oficial e alertas periódicos para material vencido. Deixar workflows operacionais específicos do mantenedor opt-in em forks, quando aplicável.

**Aceite:** uma correção de Rust ou relatório não exige que o contribuidor revise artigos antigos sobre streaming para conseguir um CI verde; uma publicação editorial continua passando pelos controles apropriados.

### OS-20 — Garantir disponibilidade durável das dependências de mídia

**P1 para contribuição; P0 se impedir distribuição | Confirmado: risco já registrado | M**

**Evidência:** o [fetch de binários](../scripts/fetch-binaries.ps1) registra que o pin anterior foi removido pelo upstream e oferece `CORNETA_FFMPEG_MIRROR_URL`. O [runbook beta](RUNBOOK-BETA.md) pede preservação do ZIP verificado. Não foi verificada a existência de um espelho público durável configurado.

**Ação:** preservar artefatos exatos num local adequado, com hashes, fontes e avisos associados; documentar cache, espelho e recuperação de um pin removido. Não fazer contribuição normal depender de uma variável privada do mantenedor. Manter qualquer uso de FFmpeg do sistema explicitamente restrito ao desenvolvimento, como o script já alerta.

**Aceite:** um clone novo consegue obter os binários esperados mesmo se o fornecedor remover o arquivo original. A alternativa não muda os bytes silenciosamente nem usa `latest` para contornar falha de hash.

### OS-21 — Publicar um contrato mensurável de performance

**P1 | Recomendação sobre controles existentes | M**

**Evidência:** existem [plano](PLANO-PERFORMANCE-2026-09-06.md), [registro de implementação](IMPLEMENTACAO-PERFORMANCE-2026-09-06.md), testes de relatórios, script de benchmark de build e budgets de bundle. Isso ainda precisa virar uma entrada simples para quem quer preservar a promessa de app rápido.

**Ação:** registrar baseline por hardware e cenário para: startup frio/quente; resposta perceptível ao abrir relatório; marcação de momento; chat sob carga; RSS de Corneta e sidecars; CPU/GPU nos modos de cópia e encode; crescimento de memória em live longa; encerramento e liberação de processos. Separar percentis, warm-up, volume de dados e tempo total do trabalho em segundo plano.

**Aceite:** resultados reproduzíveis, baseline versionada e critérios de regressão proporcionais. Preservar lazy loading, limites de filas, virtualização e workers nas contribuições React; não puxar SDKs e bibliotecas pesadas para o caminho inicial por conveniência. Budgets sintéticos no CI ajudam, mas não substituem teste controlado com OBS/GPU nem justificam prometer performance universal.

### OS-22 — Documentar arquitetura e reduzir os módulos difíceis de revisar

**P2, começando pela documentação | Confirmado + recomendação | M/G**

**Evidência:** arquivos como [`commands.rs`](../src-tauri/src/commands.rs), [`chat.rs`](../src-tauri/src/chat.rs), [`auth.rs`](../src-tauri/src/auth.rs), [`telemetry.rs`](../src-tauri/src/telemetry.rs), [`ChatScreen.tsx`](../src/screens/ChatScreen.tsx), [`report.ts`](../src/lib/report.ts) e [`api.ts`](../src/lib/api.ts) concentram bastante implementação. Contagens de linhas também incluem testes e comentários; tamanho sozinho não demonstra lentidão nem má arquitetura.

**Ação:** desenhar o caminho OBS → ingestão → processamento → destinos, a troca de eventos com a UI e as responsabilidades de site/API. Explicar propriedade de processos, cancelamento, locks, timeouts, limites e persistência. Extrair por domínio quando houver mudança na área: comandos finos, serviços/use cases testáveis, hooks/controladores e adaptadores de plataforma. Usar a organização atual de relatórios como referência, sem criar uma abstração genérica para tudo.

**Aceite:** um contribuidor encontra a implementação e seus testes sem ler milhares de linhas não relacionadas; a separação não muda comportamento, contratos IPC ou prioridade da live. Refatorações grandes são incrementais e independentes da abertura pública.

### OS-23 — Investigar o diretório de traduções aparentemente remanescente

**P1 | Indício concreto; remoção depende de confirmar uso | PP/P**

**Evidência histórica:** havia `lib/i18n/pt.ts` e `lib/i18n/en.ts` na raiz, além dos dicionários ativos em `src/lib/i18n/` e `web/lib/i18n/`. Os arquivos sem consumidores foram removidos nesta implementação e continuam recuperáveis no histórico Git. Os `tsconfig` cobrem `src` e `web`; não havia consumidor de build, script ou import para os dois arquivos da raiz.

**Ação:** confirmar referências em scripts/configuração e finalidade histórica. Se não forem consumidos, remover em PR pequeno com os checks completos. Se forem intencionais, incluí-los na validação e explicar sua responsabilidade. Não unificar traduções de desktop e site apenas porque os nomes coincidem: os produtos têm conteúdo próprio.

**Aceite:** cada diretório de código tem consumidor, proprietário conceitual e validação; não há dicionário que um colaborador possa editar acreditando mudar o produto quando nada o utiliza.

### OS-24 — Explicitar superfície de rede e limites das integrações

**P1 | Confirmado + revisão recomendada | M**

**Evidência:** o projeto reúne API de setup, callbacks OAuth, ingestão local, comunicação com OBS, chat e download de modelos/sidecars. O adaptador [Cinefy](../src-tauri/src/chat/cinefy/adapter.rs) registra expressamente que depende de contrato não publicado. Há fluxos oficiais e de credenciais próprias com responsabilidades diferentes.

**Ação:** criar uma referência de segurança/arquitetura por superfície: onde escuta, quais dados atravessam, quem autentica, como cancela/expira, quais limites aplica e o que fica no cofre. Documentar diferenças entre transmitir por URL/chave, integrar chat e fazer OAuth: suporte a uma dessas funções não implica suporte às outras. Marcar integrações não oficiais/experimentais e revisar requisitos dos provedores sem afirmar violação de termos não demonstrada.

**Aceite:** matriz por plataforma com transmissão, autenticação, leitura/envio/moderação de chat e limitações. Testes de regressão para callbacks, revogação/refresh, rate limiting e isolamento local correspondem ao desenho documentado; mudanças nessa área recebem revisão proporcional.

### OS-25 — Completar a apresentação legal e os metadados do projeto

**P1; direitos de arquivos públicos entram em OS-07 | Confirmado + verificação | P/M**

**Evidência:** o [package.json da raiz](../package.json) não informa `license`, `repository`, `homepage` e `bugs`, embora `LICENSE` exista. O aviso de terceiros cobre os principais sidecars e dependências; [`guardian/ocr.rs`](../src-tauri/src/guardian/ocr.rs) também baixa modelos externos, cuja documentação de distribuição merece entrar no inventário.

**Ação:** completar metadados, documentar licenças de modelos e assets e distinguir código, marcas e componentes de terceiros. Esclarecer a licença das contribuições e decidir conscientemente se é necessário algum processo adicional; não impor CLA complexo por padrão. Preservar avisos de autoria válidos.

**Aceite:** licença do código clara, inventário rastreável dos materiais distribuídos e nenhuma afirmação de que a MIT da aplicação substitui licenças alheias. `private: true` nos pacotes pode continuar: impede publicação acidental em registro de pacotes, não impede que o código seja open source.

### OS-26 — Manter histórico de mudanças, compatibilidade e roadmap público

**P1 para changelog/compatibilidade; P2 para maturidade | Confirmado + recomendação | P/M**

**Evidência:** não há `CHANGELOG.md` no repositório; há vários planos e pendências. O app está em `0.7.0` e o pacote web em `0.1.0`, o que pode ser uma escolha legítima de versionamento independente, não um erro automático.

**Ação:** registrar mudanças por versão em linguagem de usuário, migrações de configuração/relatórios, quebras de compatibilidade e limitações conhecidas. Explicar quais versões pertencem ao desktop e ao backend e o contrato entre elas. Dar uma pequena lista de prioridades aceitas, não apresentar todos os brainstorms como compromisso. Declarar Windows/arquiteturas realmente testados e o status de macOS/Linux, sem obrigar ports antes da abertura.

**Aceite:** um usuário consegue decidir se deve atualizar e um contribuidor entende o que o projeto aceita neste momento. README em português não é problema; uma entrada curta em inglês pode ampliar contribuição, desde que tenha manutenção. Não é necessário traduzir todo comentário ou reescrever commits antigos.

## C. Antes de distribuir o instalador oficial

### OS-27 — Concluir a conformidade do FFmpeg exato que será enviado

**P0 · distribuição | Confirmado | M/G + revisão especializada quando necessária**

**Evidência:** [`compliance/ffmpeg-sources.json`](../compliance/ffmpeg-sources.json) está deliberadamente com `reviewed: false` e `sources: []`. Os [avisos](../THIRD_PARTY_NOTICES.md) e o [runbook](RUNBOOK-BETA.md) reconhecem a pendência. O script de preparação existe, mas não substitui o conteúdo nem a revisão das fontes.

**Ação:** reunir e conferir fontes correspondentes do build fixado, bibliotecas pertinentes, patches, configurações e instruções necessárias, além dos avisos. Gerar e inspecionar o pacote de terceiros e vinculá-lo ao instalador exato. Não marcar `reviewed: true` só para destravar o workflow. As exigências dependem do build/licenças efetivos; consultar a [documentação oficial do FFmpeg](https://ffmpeg.org/legal.html) e obter revisão apropriada, sem presumir que executar em processo separado elimina obrigações de distribuição.

**Aceite:** pacote aprovado, verificações passando e materiais acessíveis junto à release. A descrição MIT se refere ao código próprio nos termos indicados, não transforma o conjunto de binários em MIT.

### OS-28 — Validar a cadeia real de instalação, atualização e operação

**P0 · distribuição | Verificação pendente já registrada | G**

**Evidência:** [RUNBOOK-BETA.md](RUNBOOK-BETA.md) registra explicitamente o que não foi executado: publicação, empacotamento final com fontes aprovadas, OAuth em conta real e demais gates manuais. [ASSINATURA.md](ASSINATURA.md) permite lançamento inicial sem Authenticode, mas mantém assinatura do updater obrigatória.

**Ação:** testar o arquivo baixado do draft oficial: instalação limpa, primeiro uso, upgrade preservando configurações/cofre/relatórios, encerramento sem processos órfãos, rejeição de artefato adulterado e recuperação de falhas. Validar contas reais por plataforma, transmissão personalizada, OBS, gravação, reconexões e estabilidade longa no hardware declarado. Conferir as condições operacionais da API e os limites/quota dos provedores.

**Aceite:** matriz com versão/SHA/hardware/cenário/resultado, falhas resolvidas ou limitações explicitamente aceitas, suporte preparado e instruções de download honestas. Não exigir compra de certificado para abrir o código, nem confundir checksum, assinatura do updater e Authenticode. Não mandar desativar antivírus para contornar problemas.

## Estrutura mínima sugerida de documentação

Esta é uma proposta, não uma lista de arquivos já existentes. Reaproveitar runbooks e documentos atuais, evitando duas fontes de verdade.

```text
README.md                       produto, status e três caminhos de entrada
CONTRIBUTING.md                  desenvolvimento, testes e como enviar PR
SECURITY.md                      relato privado e versões atendidas
SUPPORT.md                      suporte, diagnóstico e limites
CODE_OF_CONDUCT.md               convivência e canal responsável
CHANGELOG.md                     mudanças por versão
.github/
  ISSUE_TEMPLATE/               bug e proposta
  PULL_REQUEST_TEMPLATE.md       escopo, testes e impactos
  CODEOWNERS                    se houver responsáveis reais
docs/
  README.md                     índice e fontes vigentes
  desenvolvimento.md            setup por superfície e troubleshooting
  arquitetura.md                fluxos, processos, contratos e invariantes
  configuracao.md                matriz de variáveis e perfis
  seguranca-e-privacidade.md      dados, rede, credenciais e preferências
  performance.md                cenários, baseline e como medir
  self-hosting.md                infraestrutura própria e limitações
  decisoes/                     decisões adotadas
  historico/                    planos substituídos, claramente marcados
```

## Ordem de execução recomendada

| Etapa               | Itens                              | Resultado esperado                                                          |
| ------------------- | ---------------------------------- | --------------------------------------------------------------------------- |
| 1. Confiança        | OS-01, OS-02, OS-06, OS-07, OS-08  | Saber o que será exposto e oferecer informação/canais corretos.             |
| 2. Porta de entrada | OS-03, OS-04, OS-05                | Um desconhecido consegue entender, rodar e contribuir.                      |
| 3. Colaboração      | OS-10 a OS-19, OS-23, OS-25, OS-26 | Documentação e checks coerentes, fixtures e processo sustentável.           |
| 4. Evolução técnica | OS-09, OS-20, OS-21, OS-22, OS-24  | Forks claros, dependências duráveis, performance e arquitetura preservadas. |
| 5. Distribuição     | OS-27, OS-28                       | Instalador e operação prontos para o público declarado.                     |

As etapas 3 e 4 podem continuar depois de abrir o código como experimental. Antecipar qualquer item delas que impeça os caminhos prometidos no README. A etapa 5 é independente da visibilidade do código, mas precede a entrega do instalador ao público.

## Checklist para decidir “posso abrir?” — estado atualizado

- [x] Varredura do histórico local e snapshot de trabalho concluída, com achados tratados; repetir no commit final.
- [x] Materiais rastreados inventariados e revisados no escopo de MATERIAIS-PUBLICOS, com procedência e limites de direitos registrados.
- [x] Licença do código e limites relativos a terceiros claros.
- [x] Telemetria implementada e informação pública consistentes; revisão jurídica não realizada.
- [x] README atual, sem links quebrados nem afirmações de estabilidade não comprovadas.
- [x] Caminho de contribuição testado em snapshot/perfil limpos e sem secrets oficiais.
- [ ] Instruções de contribuição e segurança publicadas; canal privado testado.
- [ ] Permissões e políticas do GitHub conferidas pelo responsável.
- [ ] CI do SHA final executado no ambiente adequado, com limitações conhecidas registradas.
- [x] Código aberto, serviços oficiais, limitações de fork e estado dos instaladores claramente separados.

Para dizer “posso distribuir este instalador?”, acrescentar:

- [ ] OS-27 concluído para os binários exatos que serão anexados.
- [ ] OS-28 concluído para o público/hardware anunciados.
- [ ] Avisos de download, assinatura e limitações coerentes com o arquivo efetivamente entregue.

## O que não precisa virar condição para abrir o código

- Reescrever tudo, dividir qualquer arquivo grande ou trocar de stack.
- Atingir 100% de cobertura ou alegar ausência absoluta de bugs.
- Comprar Authenticode antes de disponibilizar apenas o código.
- Implementar macOS/Linux, todos os provedores, marketplace ou todas as ideias antigas.
- Traduzir todo o código para inglês ou abandonar a identidade brasileira do projeto.
- Criar Kubernetes, microsserviços, CLA complexo ou processo de empresa grande sem necessidade.
- Usar Git LFS ou apagar o histórico sem evidência de problema de tamanho ou exposição.
- Esconder como o projeto foi desenvolvido em vez de oferecer código compreensível, direitos claros e validação reproduzível.

## Escopo, evidências e limites desta revisão

Foram inspecionados README, inventário rastreado, nomes de arquivos sensíveis no histórico, documentação de release/privacidade, configurações de build, workflows, manifestos de conformidade/assets e trechos relevantes de React, Next.js, Rust e scripts. Uma checagem simples de destinos locais em 75 Markdown rastreados encontrou o link quebrado descrito em OS-03; ela não valida todos os anchors, links externos, imagens ou construções possíveis de Markdown.

As diretrizes de Next.js e React orientaram especialmente a separação entre servidor/cliente, configuração oficial versus desenvolvimento e preservação do carregamento sob demanda. As recomendações foram confrontadas com a implementação encontrada, não tratadas como motivo para reescrever o frontend.

Na auditoria inicial, não houve novo build, repetição de suítes, varredura integral de segredos ou consulta às configurações privadas do GitHub. Essas verificações foram ampliadas na implementação posterior, conforme as evidências no início deste documento. Continuam não realizados: pentest, validação jurídica, publicação, instalação real do pacote aprovado, OAuth em conta real e matriz completa de lives/hardware. Ausência de achado não é certificação de segurança.

Este documento reúne o plano e o estado de execução posterior dos P0. Atualize a tabela inicial e anexe evidências sanitizadas quando os bloqueios restantes forem concluídos, sem criar outro backlog contraditório nem marcar testes simulados como validação de produção.
