# Gates de release

Uma release só pode ser publicada quando todos os itens abaixo estiverem concluídos.

## Automatizados

- CI verde: lint, testes e build do frontend.
- `cargo fmt`, Clippy estrito, testes, `cargo audit` e `cargo deny` verdes.
- Testes de integração de mídia ignorados executados com FFmpeg/FFprobe real.
- Sidecars baixados pelo script versionado e com SHA-256 conferido.

## Manuais e externos

- Certificado Authenticode válido disponível e instalador NSIS assinado; verificar com
  `Get-AuthenticodeSignature` em uma máquina limpa.
- Chave pública e endpoint do updater configurados apenas quando houver repositório/release
  oficial; testar atualização N-1 → N e rollback. Este repositório ainda não possui remote Git.
- Pacote de conformidade GPL do FFmpeg anexado à distribuição conforme
  `THIRD_PARTY_NOTICES.md`.
- Matriz real aprovada: Windows 10 e 11; NVIDIA, Intel, AMD e software; OBS autenticado e sem
  senha; Twitch/YouTube/Kick e um RTMP custom; queda de rede, queda do OBS, suspensão e retomada;
  instalação limpa e upgrade preservando a configuração.
- Credenciais reais devem vir de contas de teste sem dados pessoais. Nunca anexar `.env`,
  chaves, tokens, logs crus ou certificados ao issue/artefato.

Registre data, versão, máquina, GPU/driver, cenário e resultado em cada execução. Falha em um
item bloqueia publicação; não deve ser convertida em “risco aceito” sem uma decisão explícita.
