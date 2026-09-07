# Avisos de terceiros

O código da Corneta é distribuído sob a licença MIT. O instalador inclui componentes com
licenças próprias; a licença MIT da aplicação não substitui essas obrigações.

## FFmpeg

O script `scripts/fetch-binaries.ps1` fixa um build GPL do FFmpeg fornecido por
BtbN/FFmpeg-Builds. Ao distribuir o instalador que contém esse binário, publique junto os
avisos da GPL, o código-fonte correspondente e as informações de configuração/build exigidas
pela licença. Não publique o instalador antes de concluir esse pacote de conformidade.

O pipeline preserva licenças e `-buildconf` no instalador. `pnpm compliance:prepare` gera
`corneta-third-party.zip` com fontes verificadas por SHA-256 e inventários Rust/JS. Antes disso,
preencha e revise `compliance/ffmpeg-sources.json` para o build exato; o manifesto começa
deliberadamente não aprovado. A automação não substitui a revisão da correspondência das fontes.

- Projeto: https://ffmpeg.org/
- Build usado e hash: documentados em `scripts/fetch-binaries.ps1`
- Licença: https://ffmpeg.org/legal.html

## MediaMTX

O MediaMTX é baixado de um release fixo e verificado por SHA-256 pelo mesmo script. Preserve
seu arquivo de licença/aviso na distribuição.

- Projeto: https://github.com/bluenviron/mediamtx

## Dependências Rust e JavaScript

As dependências exatas estão em `src-tauri/Cargo.lock` e `pnpm-lock.yaml`. O CI executa
`cargo audit` e `cargo deny check`; uma release deve anexar o inventário de licenças gerado
para a versão publicada.

## Fontes e ícones

As famílias Inter e Baloo 2 são obtidas pelos pacotes `@fontsource-variable/inter`
e `@fontsource/baloo-2`, com licença **SIL Open Font License 1.1** e os avisos dos
respectivos autores nos arquivos `LICENSE` dos pacotes instalados. Preserve esses
arquivos e avisos ao distribuir os recursos; não relacione as fontes à MIT do código.

Lucide declara **ISC** e inclui avisos **MIT** para os ícones derivados de Feather.
Simple Icons declara **CC0-1.0**, sem eliminar direitos de marcas e outros direitos
dos símbolos representados. O inventário da release precisa preservar os avisos
completos desses pacotes, não somente o nome da licença.

## Arte própria e capturas

Os ícones da Corneta e a arte do instalador têm geração em
`scripts/make-icons.ps1`, `scripts/make-tray-icons.ps1` e
`scripts/make-installer-art.ps1`; a geometria da interface também está em
`src/components/decor.tsx`. O manifesto editorial em `web/content/assets/manifest.json`
registra as capturas da interface e seus dados de demonstração. Veja a
[revisão dos materiais públicos](docs/MATERIAIS-PUBLICOS.md).

Nomes/logos de Twitch, YouTube, Kick, OBS e demais serviços identificam integrações;
o projeto não reivindica sua titularidade ou afiliação oficial. Emotes e outros
elementos de plataforma vistos no chat não passam a ser de autoria da Corneta por
aparecerem numa captura. A licença do código não concede direitos de marca de terceiros.

## OCR e modelos baixados em runtime

O backend usa OAR-OCR e ONNX Runtime, com suas licenças próprias no inventário Rust.
Os três arquivos de modelo/dicionário PP-OCRv6 Tiny são obtidos da release OAR-OCR
`v0.7.0`, com nomes, tamanhos e hashes fixados em `src-tauri/src/guardian/ocr.rs`.
Eles não estão versionados como assets neste repositório.

O [repositório OAR-OCR nessa versão](https://github.com/GreatV/oar-ocr/blob/v0.7.0/LICENSE)
e o [projeto PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR/blob/main/LICENSE)
publicam licença Apache-2.0. Isso identifica a licença declarada pelos projetos;
não substitui conferir a procedência e os avisos dos pesos exatos antes de
redistribuí-los ou criar um espelho. Não presumir que todo arquivo baixado tem
a mesma licença do wrapper Rust.

## Evidência de conformidade da distribuição

O estado das fontes verificadas do FFmpeg e do que ainda falta está em
[CONFORMIDADE-FFMPEG.md](docs/CONFORMIDADE-FFMPEG.md). Fontes parciais e hashes corretos
não bastam para aprovar o conjunto. O manifesto permanece não aprovado enquanto
a correspondência completa e os avisos da distribuição não estiverem conferidos.
