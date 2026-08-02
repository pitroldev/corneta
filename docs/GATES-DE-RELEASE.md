# Gates de release

Uma release só pode ser publicada quando todos os itens abaixo estiverem concluídos.

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
- O step shell de Vite envia os source maps ao projeto correto e os apaga; é o único que recebe
  `POSTHOG_API_KEY` e `POSTHOG_PROJECT_ID`. Gate, build Rust, scanner e upload não recebem a
  Personal API Key. Antes do build, um GET autenticado e sem redirects confirma no PostHog US que
  o ID existe e que seu `api_token` é exatamente o project token público embutido; erro de
  rede/auth/schema ou divergência bloqueia sem imprimir resposta ou credencial.
- O PostHog CLI 0.9.4 é baixado em step sem segredos, conferido pelo SHA-256 fixado no
  repositório e passado ao Vite por caminho explícito; download, integridade, extração ou versão
  divergente bloqueiam o build.
- Um único `pnpm tauri build` com Rust 1.97.1 produz o executável, o NSIS e a assinatura do updater.
  A tag precisa ser exatamente `v` + a versão do Tauri, e `create-updater-manifest.mjs` gera o
  `latest.json` v2 usando o conteúdo do `.exe.sig` e a URL desse mesmo instalador.
- Antes de qualquer upload de artefato da release, `pnpm artifacts:check` exige 7-Zip, lista e extrai o NSIS e confirma
  que `.map`, `phx_`, chaves minisign/PEM e outros segredos não aparecem no `dist`, binário,
  árvore de bundle ou conteúdo extraído. O scan cobre o conteúdo que o 7-Zip consegue
  interpretar; não é uma prova sobre bytes comprimidos em um formato opaco que ele não abra.
- Somente após esse scan o workflow usa `gh release create/upload` para criar ou atualizar um
  draft. Um draft existente é recusado se contiver qualquer asset fora dos basenames exatos do
  `.exe`, `.exe.sig` e `latest.json` aprovados; nenhuma action de release recebe os segredos de
  assinatura/telemetria.
- O gate `telemetry:release:check` confirma região US e o mesmo project token público no
  desktop, site e Setup API, faz smoke da metadata publicada sem expor a Personal API Key e exige
  SHA idêntico entre React/Rust/Next.js e a versão publicada do aviso de telemetria.
- A variável de Environment `TELEMETRY_DISABLED` alimenta os switches Vite e Rust com o mesmo
  valor. O modo emergencial só é válido com ambos em `1` e não recebe credenciais de source maps;
  qualquer divergência bloqueia a release.

## Manuais e externos

- Certificado Authenticode válido disponível e instalador NSIS assinado; verificar com
  `Get-AuthenticodeSignature` em uma máquina limpa.
- Chave pública e endpoint do updater configurados; testar atualização N-1 → N e rollback usando
  o `latest.json` do draft antes de publicar.
- Pacote de conformidade GPL do FFmpeg anexado à distribuição conforme
  `THIRD_PARTY_NOTICES.md`.
- Matriz real aprovada: Windows 10 e 11; NVIDIA, Intel, AMD e software; OBS autenticado e sem
  senha; Twitch/YouTube/Kick e um RTMP custom; queda de rede, queda do OBS, suspensão e retomada;
  instalação limpa e upgrade preservando a configuração.
- Credenciais reais devem vir de contas de teste sem dados pessoais. Nunca anexar `.env`,
  chaves, tokens, logs crus ou certificados ao issue/artefato.
- O Environment GitHub `production-telemetry` tem reviewer obrigatório; DPA/MFA, descarte de IP,
  retenção de 90 dias e política PT/EN versão `2026-08-02` precisam estar ativos antes da
  aprovação.
- Em uma instalação limpa, confirmar zero request ao PostHog com as duas finalidades
  **desligadas** — elas agora vêm LIGADAS por legítimo interesse, então o teste é desligar e
  conferir que parou, e não instalar e conferir que está mudo. Depois religar uma de cada vez,
  inspecionar payloads e validar uma stack React simbolicada conforme o
  [`RUNBOOK-POSTHOG.md`](./RUNBOOK-POSTHOG.md). Ver o teste de balanceamento em
  [`LGPD-LEGITIMO-INTERESSE-TELEMETRIA.md`](./LGPD-LEGITIMO-INTERESSE-TELEMETRIA.md).

Registre data, versão, máquina, GPU/driver, cenário e resultado em cada execução. Falha em um
item bloqueia publicação; não deve ser convertida em “risco aceito” sem uma decisão explícita.
