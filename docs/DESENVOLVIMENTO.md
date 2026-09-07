# Desenvolvimento sem credenciais oficiais

Este guia é para contribuir com o código. Não configura uma distribuição oficial, não instala o app e não inicia uma transmissão automaticamente.

## Pré-requisitos

Para demo e site, use Node.js **24.18.1** e pnpm **11.18.0**. Para o desktop nativo, o alvo é **Windows x64**, com Rust **1.97.1**, Visual Studio Build Tools/C++/MSVC, Windows SDK, PowerShell 7 e WebView2 Runtime. As versões de ferramentas estão fixadas nos arquivos do repositório.

Use um gerenciador de versões de sua preferência. Confira `node --version` e `pnpm --version` no mesmo terminal em que vai executar o projeto; um shim de pnpm pode usar um Node diferente daquele que você acabou de selecionar. `sccache` é opcional, nunca requisito para começar.

```sh
git clone https://github.com/pitroldev/corneta.git
cd corneta
pnpm install --frozen-lockfile
```

A instalação precisa obter as dependências no registry ou em cache local já preenchido. Os perfis desativam telemetria da aplicação, não tornam a instalação de dependências ou downloads de ferramentas operações offline.

## Escolha o que quer desenvolver

| Comando na raiz          | Resultado                                                 | Não valida                                           |
| ------------------------ | --------------------------------------------------------- | ---------------------------------------------------- |
| `pnpm contrib:demo`      | UI React com motor simulado em `http://localhost:1420`    | OBS, cofre, encoder, contas reais                    |
| `pnpm contrib:web`       | Site/API Next.js local em `http://localhost:7390`         | OAuth configurado, Redis e operação de produção      |
| `pnpm contrib:check`     | Testes/checks do app e qualidade/build do site            | Testes nativos e publicação                          |
| `pnpm contrib:web:check` | Qualidade/build do site sem gate editorial por calendário | Gates de release do site oficial                     |
| `pnpm contrib:app:dev`   | App Tauri de contribuição                                 | Instalação ou live validada                          |
| `pnpm contrib:app:build` | Executável nativo de contribuição, sem bundle             | Instalador, assinatura, conformidade de distribuição |

Os comandos de contribuição não aceitam argumentos arbitrários de override. Eles mantêm um conjunto restrito de variáveis da máquina/toolchain e retiram configurações herdadas de OAuth, assinatura e analytics. Fornecem explicitamente os kill switches e as configurações públicas necessárias para os checks.

## Arquivos de ambiente

Não precisa criar `.env` para usar os comandos `contrib:*`.

- O `.env` da raiz não é carregado no perfil de contribuição por Vite, pelo carregamento manual do Next nem pelo build Rust.
- Next.js também procura arquivos próprios automaticamente. Por isso `contrib:web`, `contrib:web:check` e `contrib:check` recusam arquivos reais `web/.env`, `.env.local` e variantes de desenvolvimento/produção/teste. `.env.example` é permitido.
- Se a sua cópia já tem esses arquivos, use outro clone limpo. Não é necessário apagar ou mover credenciais existentes.
- O build do site usa `https://www.corneta.live` apenas para passar pela validação de metadados canônicos. Não utiliza secrets oficiais nem autoriza publicar um fork sob essa identidade.
- Em ambiente explicitamente marcado como release/produção oficial, o wrapper recusa substituir os gates pelo perfil de contribuição.

`pnpm dev`, `web:dev`, `web:check`, `app:dev` e `app:build` são caminhos de desenvolvimento/operação configurada, não equivalentes aos comandos isolados. `web:check` verifica qualidade e integridade; revisão vencida por calendário fica nos gates de publicação do site, não no check comum. Veja [configuração](CONFIGURACAO.md), [rede e OAuth](SUPERFICIE-DE-REDE.md) e [gates oficiais](GATES-DE-RELEASE.md) antes de operar com credenciais próprias.

## Desktop de contribuição

Prepare os sidecars verificados uma vez no clone:

```powershell
pwsh -NoProfile -File scripts/fetch-binaries.ps1
pnpm contrib:app:dev
```

O script baixa FFmpeg/MediaMTX e verifica SHA-256. O modo que usa um FFmpeg do sistema é somente uma alternativa avançada de desenvolvimento; não produz evidência de compatibilidade com o binário oficial.

A identidade nativa é `br.com.pitroldev.corneta.contributor`. Configuração e relatórios seguem o diretório desse perfil; o serviço do cofre também usa identidade própria. O plugin de updater não é registrado nesse build, e a telemetria fica desativada na compilação. Os artefatos Rust ficam em `.artifacts/contributor/target/`, fora dos artefatos oficiais.

```sh
pnpm contrib:app:build
```

Executa Tauri com `--no-bundle`. Não precisa da chave oficial, não gera NSIS e não instala nem executa o resultado. Não distribua esse executável como se fosse uma release aprovada.

### Limites do isolamento

O perfil não é uma máquina virtual. OBS, portas de ingestão/callback, atalhos globais, GPU, CPU e pastas que você selecionar manualmente continuam sendo recursos da mesma máquina. Feche a Corneta usada em produção antes de testar a versão nativa; não faça isso durante uma live real. Use um perfil e cenas de teste também no OBS. Confira o destino antes de importar configurações, gerar fixtures ou selecionar uma pasta de gravação.

Também não é uma sandbox para executar código malicioso de um PR: processos de build e da aplicação continuam com as permissões do seu usuário no sistema. Revise código e dependências antes de executá-los; use uma VM descartável quando precisar de isolamento de segurança real.

A limpeza automática de gravações no Contributor fica restrita à própria pasta de sessões. Pastas personalizadas/importadas não são varridas nem podadas por esse perfil; ao gravar nelas, cuide da retenção manualmente. Isso evita que um índice de relatórios de teste vazio trate os vídeos da instalação real como órfãos. Exclusões solicitadas explicitamente pelo usuário continuam exigindo cuidado com o caminho escolhido.

Para testar ingestão, use os valores mostrados na própria UI, confira se a porta está livre e só então configure um perfil de OBS de teste. Não altere configurações de OBS, autostart ou destinos reais apenas para conhecer a interface; para isso existe a demo.

## Testes, formatação e artefatos

O [guia de contribuição](../CONTRIBUTING.md) descreve comandos por área e invariantes. `contrib:check` não inclui assinatura, instalação nem revisão editorial vencida por calendário; esses controles permanecem nos caminhos próprios da operação oficial.

| Comando                                              | Alcance                                                                                                                      |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`                                          | App, scripts JS/TS da raiz e configurações de ferramentas. O site usa seu próprio ESLint em `web:check`.                     |
| `pnpm format:check`                                  | App, web, scripts, configuração e documentação reconhecidos pelo Prettier; fontes Rust/PowerShell têm ferramentas próprias.  |
| `pnpm format`                                        | Corrige fontes novas/modificadas; não normaliza de uma vez os débitos históricos intactos da baseline.                       |
| `node scripts/check-format.mjs --all`                | Expõe também a dívida histórica; `pnpm format:all` a reescreve e deve ser uma alteração de normalização deliberada/separada. |
| `pnpm docs:check`                                    | Destinos Markdown locais, sem consultar URLs externas ou âncoras. Funciona em clone ou snapshot de fontes.                   |
| `pnpm scripts:check`                                 | Sintaxe de todos JS/MJS/CJS de fontes, sem executar os scripts. Não substitui lint/testes.                                   |
| `pwsh -NoProfile -File scripts/check-powershell.ps1` | Parser dos scripts PowerShell, sem executar downloads/instalação.                                                            |
| `pnpm smoke:reports`                                 | Fluxos de relatório no Chromium; também executados no CI em PT/EN.                                                           |

A baseline de formatação usa hashes exatos (normalizados somente quanto a LF/CRLF) e a versão fixada de Prettier. Ao modificar um arquivo coberto pela baseline, a exceção deixa de valer: formate-o. Não acrescente hashes para esconder erros novos. EditorConfig/Gitattributes orientam edições e checkouts; mudanças de normalização devem ser deliberadas e separadas das alterações de comportamento.

Builds escrevem artefatos locais em `dist/`, `web/.next/` e caches ignorados. Não rode `contrib:web:check` ou outro build Next ao mesmo tempo que `contrib:web` na mesma cópia. Para tarefas simultâneas, use cópias separadas. Não compartilhe `target` entre perfis de build oficiais e contributor.

O primeiro build nativo pode levar vários minutos e usar bastante disco/memória. Não há um requisito mínimo medido para todas as combinações de máquina. Mantenha os caches nas iterações e consulte o [contrato de performance](PERFORMANCE.md), sem tratar medições de uma máquina como garantia para outras.

O smoke existente pode ser executado após gerar o frontend: `pnpm smoke:reports`. Ele requer Chromium/Edge, usa perfil descartável e dados simulados. O caminho do navegador pode ser passado como argumento. Não confundir esse teste com prova de reprodução de vídeo nativo ou OAuth em conta real.

### Testes nativos de integração

Os testes de mídia `ignored` usam `ffmpeg` e `ffprobe` pelo `PATH`. O download
padrão prepara sidecars com sufixo para o Tauri, mas não instala esses comandos.
Para preparar as duas ferramentas a partir do mesmo arquivo verificado, execute
este bloco em **PowerShell 7, na raiz de um clone limpo de contribuição**:

```powershell
$cornetaMediaTools = Join-Path (Get-Location) '.artifacts/media-tools'
pwsh -NoProfile -File scripts/fetch-binaries.ps1 -ToolDirectory $cornetaMediaTools
if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar ferramentas de mídia verificadas.' }
$cornetaPreviousPath = $env:PATH
try {
    $env:PATH = "$cornetaMediaTools$([System.IO.Path]::PathSeparator)$cornetaPreviousPath"
    cargo test --manifest-path src-tauri/Cargo.toml --locked --lib splicer -- --ignored --test-threads=1
    if ($LASTEXITCODE -ne 0) { throw 'Falha nos testes de integração de mídia.' }
} finally {
    $env:PATH = $cornetaPreviousPath
}
```

Não combine `-ToolDirectory` com `-AllowSystemFfmpeg`. As ferramentas ficam em
`.artifacts/media-tools/`; o bloco restaura o `PATH` da sessão e não inicia o app
ou uma live. Os testes geram mídia sintética em diretórios temporários.

O teste de OCR é separado. Nas configurações de idioma do Windows, confira se há
um pacote com reconhecimento óptico de caracteres instalado para um dos idiomas
preferidos do usuário. Instalar apenas o idioma de exibição pode não fornecer a
capacidade OCR. Execute, ainda na raiz:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --locked --lib guardian::ocr::bitmap_tests::native_ocr_accepts_direct_gray_input -- --ignored --exact --nocapture
```

Confirme que o teste foi encontrado e leia a saída. Se aparecer
`Skipping OCR integration: no Windows OCR language pack available`, registre OCR
como **não validado**: esse caminho retorna sem exercitar o motor, mesmo com
status final de sucesso. Não confunda esse teste do OCR nativo do Windows com
validação dos modelos PaddleOCR, detecção em jogo ou proteção durante uma live.

## Se não funcionar

- **Versão de Node/pnpm:** confira os executáveis realmente usados pelo shell; abra um terminal novo após mudar o gerenciador.
- **Arquivo `web/.env*` encontrado:** use clone limpo. O preflight não remove seus dados.
- **Porta ocupada:** encerre o processo de teste correspondente; não mate OBS ou Corneta de produção indiscriminadamente. Demo usa 1420; Next dev usa 7390. Ingestão e callback dependem da configuração/fluxo mostrados no app.
- **Compilador/linker ausente:** verifique C++/MSVC e Windows SDK, não apenas o editor Visual Studio.
- **Erro de hash/download:** não desative a verificação. Consulte o [guia de publicação](PUBLICACAO.md) para o espelho verificado ou reporte a versão/URL pública do artefato, sem credenciais.
- **Teste falha:** registre comando, versão/commit e saída sanitizada. Não apague cofre, relatórios ou lockfiles como tentativa de reparo.

O código pode ser estudado e alterado sem serviço hospedado. Hospedar e distribuir um fork completo ainda exige configurar identidade, domínios, provedores e atualizações próprios; não é uma capacidade automaticamente garantida pela demo ou por um build local bem-sucedido.
