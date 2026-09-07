# Atualização automática

O desktop oficial usa o plugin de updater do Tauri e um manifesto HTTPS publicado no GitHub Releases. A integração já faz parte do app; contribuir não exige instalar plugins novamente nem gerar chaves oficiais.

## Comportamento no aplicativo

- A checagem automática é agendada após o boot; também pode ser solicitada na tela Sobre. O intervalo fica em [updater.ts](../src/lib/updater.ts).
- Uma versão disponível aparece na [faixa de atualização](../src/components/UpdateBanner.tsx). O usuário decide quando instalar e pode dispensar o aviso na sessão.
- Atualização e início de live são mutuamente exclusivos no backend nativo, sob a mesma trava do motor. Não é possível instalar com transmissão iniciando/ativa, estado de erro ou processos ainda encerrando a gravação. Do outro lado, iniciar a live fica bloqueado do download até o reinício, inclusive por atalho ou após recarregar a interface. Uma falha libera a trava para tentar novamente.
- A interface desabilita a ação incompatível e explica o motivo. Instalar reinicia o aplicativo; nunca é uma ação automática durante a live. A trava não mantém o mutex preso durante download ou instalação.
- Download e instalação mostram progresso, ou estado indeterminado quando não há tamanho conhecido. A assinatura é validada antes da instalação; uma falha não autoriza aceitar outro arquivo.
- Demo no navegador e perfil Contributor não usam o updater oficial. O retorno `null` da checagem também pode indicar indisponibilidade; ele não comprova que o servidor foi consultado com sucesso.

## Arquivos que definem o contrato

| Arquivo                                                                                            | Responsabilidade                                                               |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [tauri.conf.json](../src-tauri/tauri.conf.json)                                                    | Chave pública, endpoint, `createUpdaterArtifacts` e modo de instalação Windows |
| [lib.rs](../src-tauri/src/lib.rs) e [capability principal](../src-tauri/capabilities/default.json) | Registro dos plugins e permissões; isolamento do Contributor                   |
| [updater.ts](../src/lib/updater.ts)                                                                | Checagem, estado compartilhado, progresso e chamada ao instalador nativo       |
| [updater.rs](../src-tauri/src/updater.rs) e [commands.rs](../src-tauri/src/commands.rs)            | Exclusão mútua com início da live, download assinado, instalação e reinício    |
| [release.yml](../.github/workflows/release.yml)                                                    | Build único, gates, assinatura e preparação do draft                           |
| [create-updater-manifest.mjs](../scripts/create-updater-manifest.mjs)                              | Geração do `latest.json` a partir do instalador e de sua assinatura            |
| [verify-updater.rs](../src-tauri/examples/verify-updater.rs)                                       | Verificação criptográfica do artefato com a chave pública                      |

## Preparação do mantenedor

A interface tem permissão somente para a checagem do plugin. O comando nativo de instalação aceita o identificador do recurso retornado nessa checagem, não uma URL arbitrária; só a janela principal pode acioná-lo. Não reintroduza permissões diretas de download, instalação ou reinício na capability: elas contornariam a trava do motor. O timeout do download fica em `updater.rs`.

Guarde a chave privada correspondente à chave pública embutida em armazenamento seguro e mantenha backup testado. Configure `TAURI_SIGNING_PRIVATE_KEY` e, quando aplicável, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` no Environment de release. Esses dados não pertencem ao repositório, ao site ou aos builds de contribuição.

Perder ou substituir a chave pode impedir atualizações de instalações existentes. Não gere outro par como etapa rotineira de build e não troque a chave para resolver falhas de Authenticode. A [assinatura do updater, Authenticode e SHA-256](ASSINATURA.md) têm finalidades diferentes; certificado Windows não garante ausência de aviso do SmartScreen.

Para distribuir um fork, use identidade, repositório/endpoint e par de chaves próprios **antes** de distribuir instalações. Não aponte o fork para releases ou infraestrutura oficiais. A [configuração](CONFIGURACAO.md) descreve essa separação.

## Manifesto e rotina de release

O endpoint oficial está em `plugins.updater.endpoints`. Ele aponta ao `latest.json` de uma release pública; o desktop precisa conseguir baixar o manifesto e o instalador sem autenticação do mantenedor.

O gerador versionado produz a entrada `platforms.windows-x86_64`, com URL HTTPS do instalador e o **conteúdo** da assinatura `.exe.sig`, não seu caminho. Versão, tag e binário precisam corresponder. Não mantenha um manifesto editado manualmente em paralelo com o gerador.

Siga [PUBLICACAO.md](PUBLICACAO.md) para criar a versão e ensaiar o draft. O workflow entrega instalador, assinatura, manifesto, checksums e pacote de terceiros; todos devem corresponder ao mesmo build aprovado. A publicação do draft é uma decisão do mantenedor depois dos [gates](GATES-DE-RELEASE.md).

## Diagnóstico e recuperação

| Sintoma                         | Conferir                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Nenhuma atualização encontrada  | Versão instalada/candidata, disponibilidade pública do endpoint e rede; `null` não distingue todas as causas |
| Manifesto não encontrado        | Nome `latest.json`, release pública correta e URL configurada                                                |
| Assinatura inválida             | Mesmo instalador e `.sig`, chave pública esperada e resultado do verificador; nunca ignorar a falha          |
| Instalação desabilitada         | Motor parado e gravação encerrada; não forçar reinício durante transmissão                                   |
| Início da live bloqueado        | Atualização em andamento; aguardar reinício ou erro antes de tentar novamente                                |
| Falha depois de uma atualização | Logs sanitizados, compatibilidade de dados e reprodução em VM com backup                                     |

Teste N-1 → N, assinatura adulterada e indisponibilidade em ambiente descartável. Downgrade não é garantido: dados migrados podem não ser compreendidos pela versão anterior. Não edite o perfil real nem apague o cofre como tentativa de reparo. Consulte [compatibilidade](COMPATIBILIDADE.md) e [suporte](../SUPPORT.md).
