# Fontes correspondentes e distribuição do FFmpeg

Guia de manutenção do pacote de terceiros. A Corneta fixa um FFmpeg Windows x64 GPL estático; distribuir esse binário exige revisar também suas fontes, bibliotecas, patches, receitas e avisos. O código próprio sob MIT não altera as condições dos componentes distribuídos. Este procedimento técnico não substitui revisão jurídica.

## Fontes de verdade

| Arquivo                                                        | Conteúdo                                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [fetch-binaries.ps1](../scripts/fetch-binaries.ps1)            | Versões, URLs e hashes dos sidecars fixados                               |
| [ffmpeg-provenance.json](../compliance/ffmpeg-provenance.json) | Commit FFmpeg, receitas, job upstream e digests OCI associados ao binário |
| [ffmpeg-sources.json](../compliance/ffmpeg-sources.json)       | Arquivos de fontes, URLs fixadas, hashes e decisão de revisão             |
| [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)            | Avisos e condições da distribuição                                        |

O manifesto de fontes mantém `reviewed: false` enquanto a correspondência não estiver aprovada. `pnpm compliance:check` e `pnpm compliance:prepare` devem recusar esse estado. Ter arquivos baixados, estrutura de arquivo válida ou hashes corretos não autoriza marcar a revisão como concluída.

Identidades dos artefatos ficam nos manifests versionados; evidências de revisão pertencem à release correspondente, sem duplicar contagens e resultados de cada coleta neste guia.

## Coleta reproduzível

Na raiz, com as ferramentas descritas em [desenvolvimento](DESENVOLVIMENTO.md):

```sh
node scripts/collect-ffmpeg-evidence.mjs
node scripts/collect-ffmpeg-evidence.mjs --preserve-binary
node scripts/collect-ffmpeg-evidence.mjs --offline --preserve-binary
node scripts/collect-ffmpeg-evidence.mjs --metadata-only
```

Execute a variante necessária: a primeira coleta fontes/metadados e a camada selecionada de dependências; `--preserve-binary` inclui o ZIP binário; `--offline` exige cache completo já verificado; `--metadata-only` não baixa/inspeciona a camada de bibliotecas.

A saída fica em `.artifacts/ffmpeg-evidence/<prefixo-do-hash>/`, ignorada pelo Git:

- `sources/`: arquivos por commit/hash, incluindo receitas e patches;
- `oci/`: manifesto, configuração e camada selecionada com digests verificados;
- `recipe-candidates.json`: candidatos extraídos das receitas, não uma lista aprovada de dependências;
- `pkg-config.json`: metadados instalados na imagem, quando a camada é inspecionada;
- `binary/`: ZIP original, quando solicitado;
- `evidence.json`: identidades, escopo e limitações, sem aprovação automática de distribuição.

Não exige Docker nem executa imagens/receitas. A obtenção de metadados públicos pode usar um token anônimo de leitura do registro, sem persistir ou imprimir o token. Não extrai caminhos do TAR para o sistema nem altera `reviewed`.

O coletor limita downloads/expansão, verifica novamente caches e recusa arquivos truncados, digests divergentes e HTML com HTTP 200. Seus testes estão em [ffmpeg-evidence.test.mjs](../scripts/ffmpeg-evidence.test.mjs). Esses controles comprovam propriedades dos bytes, não a correspondência completa das fontes.

## Revisão de correspondência

1. Cruze `-version`/`-buildconf`, receitas, logs da compilação e a imagem de dependências da build fixada. Branches e tags móveis como `latest` não substituem commit/digest imutável.
2. Identifique o que foi efetivamente vinculado e seus transitivos. O número de receitas ou arquivos `.pc` não é o número de bibliotecas distribuídas: a imagem também pode conter ferramentas, headers e variantes desabilitadas.
3. Preserve fontes, licenças, avisos, submódulos, código gerado necessário, patches inline, locks efetivos e instruções de construção. Revise condicionais das receitas; a primeira variável com nome de commit pode não ser a selecionada para esse alvo.
4. Registre URLs e SHA-256 dos arquivos exatos no manifesto. Uma resposta HTTP 200, um tarball da versão atual ou a disponibilidade de um repositório upstream não bastam.
5. Confira especialmente bibliotecas com patches/união de variantes, dependências SVN, submódulos e scripts adicionais de obtenção de fontes. Preserve as entradas efetivamente usadas em vez de repetir comandos que atualizam dependências hoje.
6. Registre responsável, data, versão e evidências no PR/release. Altere `reviewed` somente depois da revisão técnica e da avaliação especializada necessária.

Para a build fixada, confira a seleção condicional de `nv-codec-headers`; as revisões SVN de Xvid e LAME; patches e variantes de x265; gnulib de libiconv; `git-sync-deps` de shaderc; submódulos de libjxl/libplacebo; e atualizações de dependências executadas por rav1e. Essa lista orienta a inspeção, não comprova cobertura completa. Obtenha arquivos reais dos commits selecionados de x264/dvdcss/dvdread/dvdnav: HTML devolvido como download não é fonte correspondente.

Se a correspondência do fornecedor não puder ser comprovada, uma build controlada exige decisão explícita, entradas preservadas e novos testes de mídia/performance. Não troque o binário ou remova codecs silenciosamente para fazer o gate passar. Consulte as [condições de distribuição do FFmpeg](https://ffmpeg.org/legal.html).

## Empacotamento e disponibilidade

Depois de preparar os sidecars verificados e aprovar o manifesto:

```sh
pnpm compliance:check
pnpm compliance:prepare
```

Inspecione `corneta-third-party.zip`: fontes, avisos, inventários e hashes devem corresponder aos executáveis enviados. O pacote inclui este guia e os manifests de procedência; ele não transforma referências ao repositório em arquivos incluídos no ZIP.

Use `CORNETA_FFMPEG_MIRROR_URL` para uma origem durável dos **mesmos bytes** fixados pelo [downloader](../scripts/fetch-binaries.ps1). Cache local não é espelho público, e upstream pode retirar artefatos. Na ausência do arquivo correto, o download deve falhar; nunca substitua por `latest` ou aceite outro hash automaticamente.

Disponibilize os materiais de conformidade pertinentes junto ao instalador aprovado e confira seu download, conforme [publicação](PUBLICACAO.md). O bloqueio de um pacote com binários de terceiros não equivale a impedir a publicação somente do código próprio; mantenha claras as fronteiras descritas nos avisos de terceiros.
