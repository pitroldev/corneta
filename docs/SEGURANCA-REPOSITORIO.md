# Segurança do repositório

Procedimentos para revisar o código publicável e os controles do repositório.
Este guia não comprova o estado atual do GitHub, não certifica o aplicativo e não
aprova uma distribuição. Os critérios de publicação estão em [PUBLICACAO](PUBLICACAO.md).

## Varredura do histórico e dos arquivos publicáveis

Use a versão de Node fixada pelo projeto, Git e `tar`, em Windows ou Linux x64:

```sh
git fetch --all --tags
node --test scripts/audit-secrets.check.mjs
node scripts/audit-secrets.mjs
```

O [scanner](../scripts/audit-secrets.mjs) baixa Gitleaks 8.30.1 da release oficial,
confere o SHA-256 fixado, recusa clones rasos e analisa todas as refs locais com
`--all --full-history`. Em um clone raso, obtenha o histórico completo antes da
varredura. O snapshot inclui arquivos rastreados e novos arquivos não ignorados;
arquivos privados ignorados ficam fora. O processo não carrega dotenv como
configuração, não usa credenciais de provedores e não publica resultados.

Consulte o resumo sanitizado em `.artifacts/secret-audit/summary.json`: ele
identifica HEAD, refs, inventário, configuração e achados sem reproduzir valores,
trechos de código, autores ou e-mails. Mantenha os relatórios locais ignorados e
não anexe saídas brutas a issues. Execute novamente após as últimas alterações,
o commit final e a atualização das refs; um resultado anterior não valida bytes
novos.

A varredura não cobre anexos remotos, OCR de imagens nem validade de credenciais.
Revise também textos, comentários e anexos de PRs/issues que serão expostos,
sem enviar dados privados a serviços externos. Siga o procedimento de
[materiais públicos](MATERIAIS-PUBLICOS.md) para imagens.

### Exceções de fixtures

As exceções de [`.gitleaks.toml`](../.gitleaks.toml) são restritas a entradas
sintéticas dos testes de redação:

| Regra             | Arquivo                            | Entrada permitida                                                     |
| ----------------- | ---------------------------------- | --------------------------------------------------------------------- |
| `jwt`             | `src/lib/telemetry-schema.test.ts` | JWT com assinatura fictícia, no valor exato fixado pela configuração. |
| `generic-api-key` | `web/lib/telemetry-schema.test.ts` | Placeholder numérico de transporte PostHog, no valor exato fixado.    |
| `generic-api-key` | `src-tauri/src/telemetry.rs`       | JWT inválido usado pelo teste do redator Rust, no valor exato fixado. |

Cada exceção exige simultaneamente regra, caminho ancorado e valor exato. Não
ignore arquivos inteiros, commits ou prefixos genéricos de tokens. O teste
`audit-secrets.check.mjs` verifica as fixtures permitidas e exige achados quando
seus valores ou caminhos mudam. Não amplie a configuração apenas para obter uma
varredura verde.

Se surgir uma credencial real, interrompa a publicação, revogue/rotacione primeiro
e coordene a limpeza do histórico. Não publique seu valor nem tente validá-lo
contra um provedor. Consulte o [procedimento de remoção de dados sensíveis do GitHub](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).

## Controles a conferir no GitHub

Revise os controles no repositório e na branch que serão publicados. O estado
depende das permissões, do plano e da visibilidade; ausência de um campo ou
resposta de erro não comprova que um controle está ativo.

- Proteja a branch principal contra force push e deleção, incluindo administradores.
- Exija branch atualizada e os checks `resolve`, `secrets`, `frontend`, `rust` e
  `media-integration` do [CI](../.github/workflows/ci.yml), vinculados à aplicação
  que realmente os publica. O job `frontend` exige que `browser-smoke` tenha
  sucesso; job pulado não deve ser tratado como aprovação.
- Confira os nomes reais em uma execução antes de alterar a proteção. Renomear
  jobs exige atualizar os checks obrigatórios junto; não imponha revisores que
  o projeto não possui.
- Mantenha o token padrão de Actions com leitura e sem permissão de aprovar PRs.
  Revise aprovação de execuções de forks e evite fornecer segredos a código não
  confiável.
- Verifique a disponibilidade e ativação de secret scanning e push protection.
  O scanner local/CI não é equivalente a esses controles do GitHub.
- Confirme o recebimento do canal privado de [SECURITY.md](../SECURITY.md), sem
  usar segredos como teste. Não anuncie o relato privado nativo como utilizável
  sem verificar sua habilitação e acesso.

### Consultas sem alteração externa

```sh
gh api repos/pitroldev/corneta --jq '{visibility,default_branch,security_and_analysis}'
gh api repos/pitroldev/corneta/branches/main/protection --jq '{required_status_checks,enforce_admins,allow_force_pushes,allow_deletions}'
gh api repos/pitroldev/corneta/actions/permissions/workflow
gh api repos/pitroldev/corneta/private-vulnerability-reporting
gh api repos/pitroldev/corneta/actions/permissions/fork-pr-contributor-approval
```

Em forks, substitua proprietário, repositório e branch pelos seus. Registre
somente os campos necessários, junto do SHA/contexto verificado; não publique
tokens, dados de colaboradores ou respostas brutas contendo informações privadas.

Para habilitar o relato privado nativo, o mantenedor autorizado pode executar:

```sh
gh api --method PUT repos/pitroldev/corneta/private-vulnerability-reporting
gh api repos/pitroldev/corneta/private-vulnerability-reporting
```

Confirme `enabled: true` na consulta. Se o recurso não estiver disponível, registre
a limitação e mantenha um canal privado efetivamente testado. Revise também
Settings → Actions → General e Settings → Code security, especialmente ao mudar
a visibilidade. Nenhum comando deste guia autoriza publicar o repositório,
conceder acessos ou criar relatos de teste externos automaticamente.

Referências: [release do Gitleaks](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1),
[proteção de branches](https://docs.github.com/en/rest/branches/branch-protection) e
[relato privado](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository).
