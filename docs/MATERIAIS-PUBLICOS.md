# Materiais públicos

Procedimento de privacidade, procedência e revisão dos assets versionados.
O [inventário de revisão](../compliance/public-assets-review.json) associa a revisão
registrada aos bytes dos arquivos; atualizar um hash não substitui inspecionar
o material nem comprova direitos de uso.

## Escopo e fontes de verdade

- O inventário cobre capturas do README, ícones, arte do instalador, masters
  editoriais, imagens públicas do site e seu ícone SVG. As raízes exatas são verificadas pelo
  [teste de materiais públicos](../scripts/public-assets.test.ts).
- O [manifesto editorial](../web/content/assets/manifest.json) registra originais,
  derivadas, procedência, direitos e metadados das capturas editoriais do site. Preserve a versão e
  a data reais de cada imagem; atualizar o aplicativo não atualiza uma captura.
- Marcas e emotes de plataforma mostrados na interface não se tornam propriedade
  da Corneta. Uma revisão de exposição não concede direitos sobre esses elementos.
- Modelos ONNX, fontes binárias e dependências obtidas no install/build/runtime
  exigem seus próprios avisos e verificações de distribuição. Consulte os
  [avisos de terceiros](../THIRD_PARTY_NOTICES.md) e a
  [conformidade do FFmpeg](CONFORMIDADE-FFMPEG.md).
- Relatórios, vídeos, conversas e arquivos dotenv reais do usuário não são assets
  publicáveis. Não os adicione ao Git para depois tentar sanitizá-los.

## Antes de adicionar ou substituir um asset

1. Use perfil descartável e dados fictícios antes da captura. Blur não deve ser
   a única proteção de uma credencial real.
2. Revise original e derivada em resolução legível: título da janela, caminhos,
   tooltips, nomes, URLs, chaves, chat, notificações e texto/metadados embutidos.
   Chaves de contas não devem aparecer, mesmo parcialmente. O exemplo local
   `obs` associado a `127.0.0.1` não deve ser confundido com uma chave de plataforma.
3. Registre a procedência e o direito de uso; não classifique material de terceiros
   como autoria própria. Siga o [protocolo editorial](../web/content/README.md)
   para formatos, nomes, metadados e versões.
4. Inspecione o SVG como código e também renderizado; confira todas as resoluções
   do ICO e as saídas geradas. Um formato conhecido não prova conteúdo seguro.
5. Só depois da revisão atualize o inventário, sua data e o manifesto pertinente.
   Descreva no PR o material revisado e os limites da verificação; não renove
   hashes em massa para fazer o teste passar.

### Arte do instalador e ícones

Os pares `src-tauri/installer/header.bmp`/`header.png` e
`sidebar.bmp`/`sidebar.png` são versionados intencionalmente. O NSIS consome os
BMPs; os PNGs permitem revisar os mesmos pixels sem abrir o instalador. Compare
os pares após regenerar; ter os dois arquivos no Git não demonstra igualdade.

Use `pnpm installer:art` na raiz, em Windows com PowerShell 7 e dependências
instaladas. O gerador usa a Baloo 2 instalada e avisa se recorrer à fonte do
sistema; uma execução com fallback não prova reprodução idêntica. Para ícones,
consulte o [gerador](../scripts/make-icons.ps1). Revise as saídas e o diff antes
de atualizar o inventário. Não regenere assets apenas para limpar comentários.

## Capturas do README

As imagens `docs/images/readme/live.webp`, `chat.webp` e `report.webp` mostram
o modo de demonstração com dados fictícios, não uma transmissão real. A legenda
do README deve tornar essa distinção visível. Uma captura do navegador não
comprova funcionamento de OBS, cofre, OAuth, encoder ou plataformas reais.

A procedência dessas imagens fica em cada entrada do
[inventário de revisão](../compliance/public-assets-review.json), no campo
`provenance`: origem da demonstração, dados sintéticos, commit, data e versão capturadas,
idioma, dimensões, cenário, método de captura e limites dos direitos de uso.
Essas imagens não pertencem ao manifesto editorial do site, cujos originais e
derivadas ficam em `web/content` e `web/public`.

Cada print tem `reviewedAt` e `reviewScope` próprios, associados ao seu hash.
Registre somente a inspeção realmente realizada e quem ou o que a realizou;
uma revisão visual assistida não é assinatura humana nem aprovação jurídica.
Não renove a revisão global dos assets antigos ao adicionar ou trocar um print.
Marcas, logos e emotes de terceiros continuam com seus respectivos titulares.

Para substituir uma captura, prepare uma demo descartável sem contas nem dados
pessoais, inspecione a imagem final em resolução legível e confirme os metadados
antes de atualizar somente sua entrada. Preserve a data e versão históricas das
capturas que não mudaram. O teste exige os três nomes, procedência por imagem e
os hashes correspondentes; ele não verifica visualmente os pixels nem comprova
a veracidade dos metadados informados.

## Verificações antes de publicar

```sh
pnpm exec vitest run scripts/public-assets.test.ts
```

Execute também os checks editoriais descritos no [protocolo](../web/content/README.md)
e a [varredura de segredos](SEGURANCA-REPOSITORIO.md).

O teste confere o inventário completo das raízes fixadas, detecta arquivos
adicionados/removidos, recusa links simbólicos/junctions e verifica os hashes.
Para Markdown/SVG, normaliza somente CRLF para LF; binários são comparados sem
conversão. Ele não detecta dados pessoais visualmente, não substitui a revisão
humana, não inspeciona anexos do GitHub e não cobre arquivos fora dessas raízes.

Revise separadamente novos anexos, imagens e textos que serão publicados fora do
inventário. Contatos e dados públicos de operação devem ser intencionais e
mínimos; não classifique automaticamente toda informação pessoal como credencial.
Os critérios gerais de distribuição estão em [PUBLICACAO](PUBLICACAO.md).
