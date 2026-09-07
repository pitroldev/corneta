# Fontes do FFmpeg da distribuição oficial

Estado em 6 de setembro de 2026: **parcialmente reunidas; distribuição continua
bloqueada**. Este documento registra correspondência técnica, não é parecer jurídico.
Não trocar `reviewed` para `true` até concluir o checklist abaixo.

## O que foi conferido

| Item                                           | Identidade                                                                        |
| ---------------------------------------------- | --------------------------------------------------------------------------------- |
| Binário fixado                                 | `n8.1.2-50-g1a748fe2cd-20260906`, Windows x64, GPL estático.                      |
| Release do fornecedor                          | `autobuild-2026-09-06-13-06`.                                                     |
| ZIP enviado pelo fornecedor                    | `ffmpeg-n8.1.2-50-g1a748fe2cd-win64-gpl-8.1.zip`.                                 |
| SHA-256 do ZIP                                 | `e254995d48e6e9e88f5a05eb886a75e9ac33d7c6bb2e8a301e2eb65848a2d489`.               |
| Commit completo do FFmpeg                      | `1a748fe2cd43e3ead22fafb1b5b7d77f153898a8`.                                       |
| Commit das receitas BtbN apontado pela release | `8267213e26c1031621e6e1210fe3aa4867214f6a`.                                       |
| Configuração extraída do binário               | `--enable-gpl --enable-version3`, além das bibliotecas de `FFmpeg-buildconf.txt`. |
| Compilador declarado pelo binário              | GCC 15.2.0, crosstool-NG `1.28.0.23_185f348`.                                     |

Fontes primárias: [release BtbN](https://github.com/BtbN/FFmpeg-Builds/releases/tag/autobuild-2026-09-06-13-06),
[commit FFmpeg](https://github.com/FFmpeg/FFmpeg/commit/1a748fe2cd43e3ead22fafb1b5b7d77f153898a8),
[receitas e patches](https://github.com/BtbN/FFmpeg-Builds/tree/8267213e26c1031621e6e1210fe3aa4867214f6a).

Foram baixados e hasheados dois arquivos oficiais, agora fixados no
[manifesto](../compliance/ffmpeg-sources.json):

| Fonte                         | Tamanho conferido | SHA-256                                                            |
| ----------------------------- | ----------------- | ------------------------------------------------------------------ |
| FFmpeg no commit acima        | 16.905.235 bytes  | `519e42c103de98a34fc07c2a52c0d6d7b25031f2bd4e42d544bc409fe9fb6477` |
| Receitas BtbN no commit acima | 103.067 bytes     | `08279484656a586c149e119a20d3853f2596ee08192d97595edd2a5ba3b4fd51` |

Esses dois arquivos iniciais estão disponíveis localmente em `.artifacts/ffmpeg-source-review/`,
ignorados pelo Git. **Não constituem, sozinhos, o pacote correspondente completo.**
O manifesto agora reúne **nove arquivos de fontes**: além dos dois acima, x265,
xavs2, davs2, Rubber Band, Vid.Stab, FFTW e frei0r, baixados dos repositórios dos
respectivos projetos nos commits das receitas. Foram verificados os hashes,
a estrutura dos arquivos e a presença dos avisos de licença. Os hashes completos
estão no manifesto; não se trata de uma declaração de correspondência completa.

O manifesto continua `reviewed: false`; `pnpm compliance:check`/`prepare` continuam
recusando sua distribuição, mesmo com URLs e hashes válidos.

## Por que ainda não é possível aprovar

A release consultada contém binários e checksums, não um pacote completo das
fontes de todas as bibliotecas estáticas. A árvore de receitas possui 119 scripts
de dependências: isso inclui ferramentas, variantes e componentes desabilitados,
portanto **119 não é a quantidade de bibliotecas efetivamente distribuídas**.
É preciso cruzar os componentes selecionados com o binário e seus transitivos.

Exemplos concretos já identificados nas receitas desse commit:

- x264 usa `0480cb05fa188d37ae87e8f4fd8f1aea3711f7ee`.
- x265 usa `b81f650e21e8aacbe6a9ad04ce14aefc05b932c0`, com alteração aplicada a
  `source/dynamicHDR10/json11/json11.cpp` e união de builds 8/10/12 bits.
- A configuração do binário inclui, entre outras, x264, x265, xvid, davs2, xavs2,
  dvdread/dvdnav, vidstab, rubberband e bibliotecas LGPL/permissivas adicionais.

Esses exemplos não são uma lista completa de obrigações. As [considerações de
licença do FFmpeg](https://ffmpeg.org/legal.html) distinguem o projeto básico das
partes opcionais GPL; executar o binário em outro processo não dispensa a análise
das obrigações relativas à sua própria distribuição.

Além disso, o script upstream `build.sh` clona a branch `release/8.1` e usa uma
imagem de dependências com tag `latest`. Rodá-lo hoje sem fixar o commit FFmpeg
e o digest da imagem pode construir outro resultado. O arquivo de receitas no
commit da release é evidência útil, não prova isolada de todos os fontes embutidos.

O log público da compilação registra às `2026-09-06T12:35:43Z` a imagem
`ghcr.io/btbn/ffmpeg-builds/win64-gpl-8.1` com digest
`sha256:e73561029585dd796ba432bc6580bc4bd37258b080ae17aec99530c040f269b5`.
Essa identidade foi recuperada do job, não inferida da tag `latest` atual.
O manifesto OCI e a configuração foram baixados e verificados pelos próprios
digests. A imagem contém **17 camadas, 1.889.244.337 bytes compactados** e declara
criação em `2026-08-19T18:32:27.763432049Z`, anterior à release do FFmpeg.
Não foi baixada nem executada a imagem inteira.

A camada que copia `/opt/ffbuild`, de **109.530.618 bytes**, foi preservada e
inspecionada de forma passiva. Seu digest é
`sha256:affce1534023589dc88916522f2cdbf2b6b5299fa105e0d02d8c322642f8ba99`.
Foram recuperados **111 arquivos pkg-config**, incluindo versões e dependências
declaradas. Isso comprova metadados instalados na imagem, não que todas essas
bibliotecas foram incorporadas ao executável.

Exemplos extraídos dessa camada: x264 `0.165.x`, x265 `4.2`, davs2 `1.6.206`,
xavs2 `1.3.232`, Rubber Band `4.0.0`, FFTW `3.3.11`, dvdnav `7.0.1`, dvdread
`7.1.1`, dvdcss `1.6.0`, rav1e `0.8.0` e headers NVIDIA `13.0.19.2.0`.

A comparação do commit anterior à imagem
`48576f197ad1c2afb2e0b8efe204919a1afbff54` com as receitas da release mostra
quatro commits e cinco arquivos alterados; em `scripts.d`, apenas a remoção de
`99-rpath.sh` e sua referência em `zz-final.sh`, relacionadas a Linux.
Isso reduz a incerteza sobre as receitas de bibliotecas, mas não substitui a
prova dos transitivos e entradas realmente usados na imagem.
[Comparação verificável](https://github.com/BtbN/FFmpeg-Builds/compare/48576f197ad1c2afb2e0b8efe204919a1afbff54...8267213e26c1031621e6e1210fe3aa4867214f6a).

Jobs públicos de referência para a execução exata:

- [Compilação FFmpeg Windows GPL 8.1](https://github.com/BtbN/FFmpeg-Builds/actions/runs/34032460921/job/101487116328).
- [Imagem de dependências Windows GPL 8.1](https://github.com/BtbN/FFmpeg-Builds/actions/runs/34032460921/job/101485339852).

## Checklist para concluir OS-27

1. Preservar os metadados do binário, logs relevantes do fornecedor, digest da
   imagem de dependências, receitas, patches e toolchain usados naquela execução.
2. Identificar os fontes **efetivamente** usados por cada dependência e transitivo
   pertinente; baixar seus arquivos exatos, verificar licenças/avisos e registrar
   URLs imutáveis e SHA-256 no manifesto. Não usar HEAD atual de uma biblioteca.
3. Incluir instruções suficientes de construção: commit do FFmpeg, flags,
   dependências selecionadas, alterações locais, versões das ferramentas e
   configuração de vinculação. Conferir que os arquivos arquivados contêm também
   submódulos/fontes gerados que forem necessários.
4. Revisar tecnicamente a correspondência; buscar revisão especializada para
   dúvidas de licença. Registrar responsável, data e evidência antes de alterar
   `reviewed`. O objetivo não é apenas fazer o JSON passar.
5. Rodar `pnpm compliance:prepare`, abrir `corneta-third-party.zip`, conferir
   fontes/avisos/inventários e os hashes dos executáveis exatos enviados.
6. Somente na release aprovada, disponibilizar o pacote junto ao instalador e
   testar o download. Nenhum arquivo foi publicado externamente nesta correção.

Se não for possível comprovar os fontes do fornecedor, a alternativa é uma build
controlada, com entradas preservadas e conformidade revisada. Isso exige decisão
explícita e repetir testes de mídia/performance; não trocar para outro FFmpeg ou
remover codecs silenciosamente para contornar o gate.

## Coleta reproduzível, passiva e limitada

Com Node 24, na raiz do repositório:

```sh
# Fontes com SHA fixo, metadados OCI e apenas a camada de bibliotecas.
node scripts/collect-ffmpeg-evidence.mjs

# Também preserva o ZIP binário exato (reutiliza cache verificado quando existe).
node scripts/collect-ffmpeg-evidence.mjs --preserve-binary

# Repete a verificação integral sem rede, depois da coleta acima.
node scripts/collect-ffmpeg-evidence.mjs --offline --preserve-binary

# Evita baixar/inspecionar a camada de 104 MiB; não produz inventário pkg-config.
node scripts/collect-ffmpeg-evidence.mjs --metadata-only

# Testes locais do coletor, sem depender da internet.
pnpm exec vitest run scripts/ffmpeg-evidence.test.mjs scripts/release-compliance.test.ts
```

Saída em `.artifacts/ffmpeg-evidence/e254995d48e6e9e8/`, ignorada pelo Git:

- `sources/`: arquivos por commit/hash, incluindo as receitas e seus patches.
- `oci/`: manifesto, configuração e camada selecionada, todos verificados por SHA-256.
- `recipe-candidates.json`: 119 arquivos de receitas, pins literais e sinais de
  mecanismos adicionais de obtenção de fontes. Não executa condicionais shell.
- `pkg-config.json`: os 111 metadados da imagem e seus bytes de origem, quando
  executado sem `--metadata-only`.
- `binary/`: ZIP original, somente quando `--preserve-binary` é solicitado.
- `evidence.json`: escopo, identidades, limitações e `distributionApproved: false`.

Não é necessário Docker nem login GitHub. O registro público emite um token
anônimo de leitura somente para baixar a imagem identificada; o token não é
persistido nem impresso. Não há execução de imagens/receitas, extração de paths
do tar para o sistema, alteração do manifesto, upload ou aprovação de release.

Limites: 512 MiB de artefatos por coleta, 160 MiB para a camada selecionada,
2 GiB de expansão ao inspecionar o tar e 8 MiB de metadados retidos. O parser
é incremental; não aloca a imagem inteira em memória. Downloads incompletos
não recebem o nome final, caches são hasheados novamente e respostas HTML
disfarçadas de arquivos de fontes são recusadas.

Execuções online e offline foram realizadas nesta máquina. Os testes cobrem
hash incorreto, ausência offline, respostas HTML com HTTP 200, limites por
arquivo/total/expansão, TAR inválido/truncado, links sem extração e divergências
de configuração OCI. Nenhuma dessas verificações equivale a aprovação jurídica.

### Pendências identificadas com precisão

- URLs de arquivos x264/dvdcss/dvdread/dvdnav em `code.videolan.org` retornaram
  páginas HTML, apesar do HTTP 200, nesta coleta. Elas **não** foram registradas
  como fontes válidas. É necessário obter esses commits por um canal oficial
  utilizável e verificar os arquivos antes de adicioná-los.
- Xvid e LAME usam revisões SVN; um coletor que só conhece tarballs Git não
  satisfaz esses itens. Revisões nas receitas: Xvid `2204`, LAME `6761`.
- `nv-codec-headers` seleciona `SCRIPT_COMMIT2` para 8.1; baixar apenas a primeira
  variável `SCRIPT_COMMIT` seria incorreto.
- libiconv precisa de gnulib adicional; shaderc executa `git-sync-deps`;
  libjxl/libplacebo e outros usam submódulos; rav1e executa `cargo update cc`.
  Fontes transitivas, locks efetivos e alterações inline ainda exigem fechamento.
- Os metadados incluem ferramentas e headers; uma lista de `.pc` não resolve
  sozinha o conjunto realmente vinculado nem substitui revisão das licenças.

## Disponibilidade do pin: OS-20

O ZIP fixado estava acessível durante esta verificação. Porém, o fornecedor
documenta retenção das últimas 14 builds diárias e das últimas builds mensais por
dois anos. O pin é diário, não uma garantia de disponibilidade permanente.
[Política do fornecedor](https://github.com/BtbN/FFmpeg-Builds#release-retention-policy).

O [downloader](../scripts/fetch-binaries.ps1) já aceita
`CORNETA_FFMPEG_MIRROR_URL` e verifica **o mesmo SHA-256**, independentemente da
origem. Antes de depender do pin em novas máquinas/CI, o mantenedor deve escolher
armazenamento durável, preservar o ZIP original e disponibilizar os materiais de
conformidade pertinentes. A criação/publicação desse espelho não foi autorizada
nem executada aqui. A opção não deve apontar para uma build diferente.

O modo `--preserve-binary` mantém agora uma cópia verificada fora do cache
temporário do sistema, junto das evidências. Essa cópia foi produzida localmente;
não é um espelho público e não autoriza distribuir o pacote incompleto.

O cache local ajuda a repetir builds nessa máquina, mas não substitui espelho nem
fontes correspondentes. Sem cache/espelho, a remoção upstream deve falhar com
mensagem explícita; nunca baixar `latest` ou aceitar outro hash automaticamente.

## Distinção importante

O preparador de release inclui a identidade/proveniência, avisos de terceiros e
este registro, preservando seus caminhos de repositório. Um README no pacote
distingue arquivos locais de referências ao repositório completo. Isso melhora a
rastreabilidade do pacote futuro; não aprova a correspondência nem substitui a
inspeção do ZIP após concluir o checklist.

Este bloqueio se aplica a distribuir o instalador que inclui os binários. Não
impede automaticamente abrir somente o código próprio do Corneta sob MIT,
com os avisos e limites descritos em [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
