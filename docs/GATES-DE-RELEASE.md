# Gates de release

Critérios de aprovação de uma distribuição oficial, para mantenedores. Uma release só pode ser publicada quando cumprir todos os critérios abaixo. Os procedimentos e o checklist estão no [guia de publicação](PUBLICACAO.md). Guarde os resultados e as evidências junto da execução da release; este documento não certifica um artefato específico.

## Automatizados

- O job de artefato da release depende da execução reutilizável do workflow `CI`; todos os jobs
  recebem a mesma ref exata da tag, inclusive em `workflow_dispatch`, e o artefato não inicia se
  qualquer job de qualidade falhar.
- CI verde: lint, testes e build do frontend.
- `cargo fmt`, Clippy estrito, testes, `cargo audit` e `cargo deny` verdes.
- Os ignores do `cargo deny` ficam restritos a advisories informativos sem correção disponível e
  exigem justificativa no `deny.toml`; vulnerabilidades não podem ser ignoradas.
- Testes de integração de mídia ignorados executados com FFmpeg/FFprobe real.
- Sidecars baixados pelo script versionado e com SHA-256 conferido.
- O job Rust prepara seus próprios sidecars; espelho opcional via `CORNETA_FFMPEG_MIRROR_URL`
  mantém o mesmo hash fixado. O upstream remove builds antigos.
- Next de produção exige `web:release:check` (automático na Vercel production): configuração
  OAuth/proxy, download HTTPS e identidade/telemetria coerentes. O limitador local não exige
  armazenamento remoto; o gate não verifica regras de WAF/edge no host.
- O step shell de Vite envia os source maps ao projeto correto e os apaga; é o único que recebe
  `POSTHOG_API_KEY` e `POSTHOG_PROJECT_ID`. Gate, build Rust, scanner e upload não recebem a
  Personal API Key. Antes do build, um GET autenticado e sem redirects confirma no PostHog US que
  o ID existe e que seu `api_token` é exatamente o project token público embutido; erro de
  rede/auth/schema ou divergência bloqueia sem imprimir resposta ou credencial.
- O PostHog CLI 0.9.4 é baixado em step sem segredos, conferido pelo SHA-256 fixado no
  repositório e passado ao Vite por caminho explícito; download, integridade, extração ou versão
  divergente bloqueiam o build.
- O processamento inclui o worker e seus imports, além dos chunks principais. Pares inválidos
  ou processamento incompleto bloqueiam o build; `pnpm bundle:check` confere o frontend antes
  da compilação nativa, sem substituir a inspeção final do instalador.
- Uma única execução do CLI do Tauri com Rust 1.97.1 produz o executável, o NSIS e a assinatura do updater.
  A tag precisa ser exatamente `v` + a versão do Tauri, e `create-updater-manifest.mjs` gera o
  `latest.json` v2 usando o conteúdo do `.exe.sig` e a URL desse mesmo instalador.
- O exemplo Rust `verify-updater` verifica criptograficamente o instalador com a chave pública
  do app em blocos de 64 KiB. Assinatura inválida bloqueia a geração do manifesto.
- `compliance:prepare` exige fontes correspondentes revisadas e hashes; gera pacote com avisos,
  fontes e inventários. `SHA256SUMS.txt` acompanha os quatro demais arquivos da distribuição.
- Antes de qualquer upload de artefato da release, `pnpm artifacts:check` exige 7-Zip, lista e extrai o NSIS e confirma
  que `.map`, `phx_`, chaves minisign/PEM e outros segredos não aparecem no `dist`, binário,
  árvore de bundle ou conteúdo extraído. O scan cobre o conteúdo que o 7-Zip consegue
  interpretar; não é uma prova sobre bytes comprimidos em um formato opaco que ele não abra.
- Somente após esse scan o workflow usa `gh release create/upload` para criar ou atualizar um
  draft. Um draft existente é recusado se contiver qualquer asset fora dos basenames exatos do
  `.exe`, `.exe.sig`, `latest.json`, `SHA256SUMS.txt` e `corneta-third-party.zip` aprovados; nenhuma action de release recebe os segredos de
  assinatura/telemetria.
- Depois dos ensaios e da aprovação de `production-release`, o job `publish` valida a proteção
  desse Environment, a tag remota, os cinco arquivos preservados pelo ID do artefato da execução,
  seus hashes e a correspondência com os assets remotos. Só então promove o draft; não refaz o
  build nem sobrescreve assets públicos. Promoções são serializadas e versões antigas não
  substituem Latest. Falta de reviewer, bypass habilitado ou metadata inacessível bloqueiam.
- O gate `telemetry:release:check` confirma região US e o mesmo project token público no
  desktop, site e Setup API, faz smoke da metadata publicada sem expor a Personal API Key e exige
  SHA idêntico entre React/Rust/Next.js e a versão publicada do aviso de telemetria.
- O gate aguarda até dez minutos pelo deployment da tag durante o build; a promoção reconfere
  o deployment contra a configuração aprovada para evitar uma aprovação já desatualizada.
- A variável de Actions do repositório `TELEMETRY_DISABLED` alimenta os switches Vite e Rust com o mesmo
  valor. O modo emergencial só é válido com ambos em `1` e não recebe credenciais de source maps;
  qualquer divergência bloqueia a release.

## Manuais e externos

- WAF/edge configurado e verificado para ambas as rotas POST de OAuth Kick, cobrindo hosts,
  aliases e caminhos normalizados, sem acesso direto à origem ou desafio interativo de
  navegador. Validar bloqueio `429` antes de múltiplas instâncias e registrar o escopo regional
  real do provedor; o cache local não impõe limite global. Ver [publicação](PUBLICACAO.md).
- Authenticode segue a [política de assinatura](ASSINATURA.md). O gate aceita
  `NotSigned` com aviso ou `Valid`, nunca assinatura inválida. `REQUIRE_WINDOWS_CODE_SIGNING=1`
  exige assinatura quando adotada. Conferir o aviso em Windows limpo; assinatura não garante
  ausência de SmartScreen.
- Testar N-1 → N em endpoint HTTPS de teste e recuperação com snapshot/backup compatível.
  Draft privado não é endpoint público; não presumir downgrade automático. Ver [publicação](PUBLICACAO.md).
- Pacote de conformidade GPL do FFmpeg anexado à distribuição conforme
  `THIRD_PARTY_NOTICES.md`.
- Matriz real aprovada: Windows 10 e 11; NVIDIA, Intel, AMD e software; OBS autenticado e sem
  senha; Twitch/YouTube/Kick e um RTMP custom; queda de rede, queda do OBS, suspensão e retomada;
  instalação limpa e upgrade preservando a configuração.
- Credenciais reais devem vir de contas de teste sem dados pessoais. Nunca anexar `.env`,
  chaves, tokens, logs crus ou certificados ao issue/artefato.
- O Environment GitHub `production-telemetry` tem reviewer obrigatório; DPA/MFA, descarte de IP,
  retenção de 90 dias e aviso de telemetria PT/EN versão `2026-09-09` precisam estar ativos antes da
  aprovação.
- `production-release` tem reviewer obrigatório para os ensaios do draft. Ambos os Environments
  recusam bypass de administradores e aceitam somente tags `v*`. O repositório/canal precisa
  disponibilizar manifesto e instalador sem autenticação do mantenedor. Confira os requisitos
  do host com `pnpm release:readiness`; o comando não substitui os gates de um artefato real.
- Registrar a revisão jurídica do balanceamento e dos textos PT/EN antes de ativar coleta de
  produção. Uso desktop é opt-in e falhas são opt-out; preservar escolhas explícitas antigas não
  comprova consentimento válido. Teste automatizado, aviso ou publicação do código não
  comprovam adequação da base legal nem configuração de retenção/descarte no operador.
- Em uma instalação limpa, confirmar uso **desligado** e falhas **ligadas** antes de qualquer
  escolha. Não deve haver evento de uso nesse estado; falhas e o marcador mínimo de abertura
  podem ser enviados. Com ambas desligadas, confirmar zero novo request ao PostHog. Ativar uso
  deve permitir apenas eventos futuros, sem recuperar o onboarding anterior. Preservar escolhas
  explícitas `enabled` e `disabled` em upgrades de aviso; fechar o aviso ou aceitar termos não
  pode ativar uso. Depois ligar uma finalidade de cada vez,
  inspecionar payloads e validar uma stack React simbolicada conforme o
  [`RUNBOOK-POSTHOG.md`](./RUNBOOK-POSTHOG.md). Ver o teste de balanceamento em
  [`LGPD-LEGITIMO-INTERESSE-TELEMETRIA.md`](./LGPD-LEGITIMO-INTERESSE-TELEMETRIA.md).

Registre data, versão, máquina, GPU/driver, cenário e resultado em cada execução. Falha em um
item bloqueia publicação; não deve ser convertida em “risco aceito” sem uma decisão explícita.
