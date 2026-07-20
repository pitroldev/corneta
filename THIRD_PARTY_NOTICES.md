# Avisos de terceiros

O código da Corneta é distribuído sob a licença MIT. O instalador inclui componentes com
licenças próprias; a licença MIT da aplicação não substitui essas obrigações.

## FFmpeg

O script `scripts/fetch-binaries.ps1` fixa um build GPL do FFmpeg fornecido por
BtbN/FFmpeg-Builds. Ao distribuir o instalador que contém esse binário, publique junto os
avisos da GPL, o código-fonte correspondente e as informações de configuração/build exigidas
pela licença. Não publique o instalador antes de concluir esse pacote de conformidade.

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
