# Pendências para publicação

Atualizado em 2026-09-06. Este é o checklist atual; descrições antigas de funcionalidades
“não implementadas” foram substituídas pelo estado verificável. O histórico permanece no Git.

## Resolvido no repositório nesta rodada

- CI Rust prepara seus próprios sidecars, inclusive para os testes de mídia não ignorados.
- FFmpeg fixado em n8.1.2-50-g1a748fe2cd, com URL versionada e SHA-256 conferido.
  O download anterior retornava 404. Há cache verificado e suporte a espelho HTTPS.
- Avisos FFmpeg/MediaMTX, versão, configuração e hashes acompanham os recursos do instalador.
- OAuth Kick: limitador distribuído via Redis REST, operação atômica, TTL, limite de memória
  em desenvolvimento, IP obtido somente de proxy confiável e pseudonimizado antes do armazenamento.
- Produção não recorre a memória local se Redis estiver ausente ou falhar: responde 503.
  Excesso de tentativas responde 429; ambos informam Retry-After.
- Corpos de requisição/resposta são limitados durante a leitura; há timeout e validação
  de objetos JSON/tokens. Credenciais e respostas brutas não entram nas mensagens de erro.
- Build SHA do site/API alinhado automaticamente. Health usa a identidade compilada do site.
- A versão anunciada nos dados estruturados vem da release vinculada; removida a versão
  antiga fixa. Download de produção fica restrito aos assets do repositório oficial.
- Check específico de produção rejeita configuração incompleta, telemetria divergente e
  download provisório. Vercel production o executa automaticamente durante o build.
- Updater verifica a assinatura real do instalador com a chave pública do app em streaming.
- SHA256SUMS.txt gerado para instalador, assinatura, manifesto e pacote de terceiros.
- Pipeline de fontes/licenças implementado, com manifesto revisado, hashes, inventários
  Rust/JS e avisos. A revisão do conteúdo das fontes continua pendente, não foi simulada.
- Verificação Authenticode alinhada à decisão existente de lançamento sem certificado.
- Dependências retiradas de circulação: chacha20 0.10.1 → 0.10.2 e wide 1.6.0 → 1.7.0;
  safe_arch atualizado para 1.2.0 como dependência compatível.

## Pendências reais antes de distribuir

| Prioridade | Pendência | O que falta |
| --- | --- | --- |
| P0 | Fontes GPL correspondentes | Obter e conferir FFmpeg, bibliotecas, patches e scripts exatos; preencher e revisar compliance/ffmpeg-sources.json. O pipeline bloqueia enquanto estiver vazio/não revisado |
| P0 | Setup API em produção | Configurar Redis REST, salt estável, origem confiável do IP e credenciais OAuth no host; executar web:release:check e fazer deploy |
| P0 | OAuth em contas externas | Validar Twitch, YouTube e Kick com contas de teste novas; aprovação/escopos/quota Google; callbacks e renovação reais |
| P0 | Política/telemetria | Configurar os três ambientes coerentemente, com coleta explicitamente habilitada ou desligada; validar DPA, retenção, aviso e preferências reais |
| P0 | Release e atualização | Secrets do updater, backup, reviewer obrigatório, draft completo, instalação limpa e N-1 → N com recuperação ensaiada |
| P0 | Download público | Disponibilizar instalador aprovado e configurar o CTA; testar arquivo, hash, aviso Windows e versão efetivamente baixados |
| P1 | Espelho durável FFmpeg | Hospedar o mesmo ZIP verificado sob controle do projeto e configurar CORNETA_FFMPEG_MIRROR_URL; o upstream remove builds antigos |
| P1 | Estabilidade e desempenho reais | Lives de 4–8 h, hardware NVIDIA/Intel/AMD, rede instável, jogo competindo por recursos e relatórios grandes |
| P1 | Beta com usuários não técnicos | 10–20 pessoas concluindo instalação, conexão, live, relatório e recuperação de falha sem orientação técnica |
| Acompanhar | Dependências transitivas | Avisos informativos de manutenção continuam; acompanhar atualizações upstream sem ampliar exceções de segurança |
| Decisão | Certificado Authenticode | Adiado por orçamento; não confundir com updater, que continua obrigatoriamente assinado |

Não foram criadas contas, contratados serviços, alteradas credenciais de produção nem
publicados releases/deploys nesta rodada. Isso evita tratar configuração externa como concluída.

## Comandos

```powershell
pnpm check
pwsh -NoProfile -File scripts/fetch-binaries.ps1
cargo test --manifest-path src-tauri/Cargo.toml --locked --all-targets
pnpm web:release:check
pnpm compliance:check
pnpm compliance:prepare
```

Os dois checks de publicação devem falhar enquanto faltarem configurações/revisão.
Isso não impede desenvolvimento, testes nem builds locais comuns.
O pacote de terceiros só pode ser preparado após a revisão; não há flag para ignorar a validação.

Procedimentos e evidências: [RUNBOOK-BETA.md](./RUNBOOK-BETA.md).
Critérios de distribuição: [GATES-DE-RELEASE.md](./GATES-DE-RELEASE.md).
