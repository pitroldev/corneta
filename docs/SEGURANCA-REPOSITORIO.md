# Segurança do repositório

Verificação em 6 de setembro de 2026 (horário de Brasília). Este registro cobre a
abertura do código, não certifica o aplicativo e não aprova uma release.

## Histórico e arquivos publicáveis

Execute com Node 24, Git e `tar` disponíveis, em Windows ou Linux x64:

```sh
git fetch --all --tags
node --test scripts/audit-secrets.check.mjs
node scripts/audit-secrets.mjs
```

O script baixa **Gitleaks 8.30.1** da release oficial, verifica o SHA-256 fixado no
código, recusa clones rasos e analisa todas as refs locais com `--all --full-history`.
Também cria um snapshot dos arquivos rastreados e dos novos arquivos não ignorados;
arquivos privados ignorados não entram nele. Não carrega `.env`, publica resultados
ou usa credenciais de provedores. [Release e documentação do scanner](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1).

O resultado sanitizado fica em `.artifacts/secret-audit/summary.json`: versão do
scanner, HEAD, refs, total de commits, hash do inventário do snapshot, hash da
configuração e achados sem valores, trechos de código, autores ou e-mails. Os
relatórios locais ficam ignorados pelo Git. Não anexe relatórios brutos a issues.

A primeira varredura integral do HEAD `add1e3bd9503ab80554130525e4b09f53f42d7ed`
encontrou quatro ocorrências em fixtures sintéticas dos redatores de telemetria,
introduzidas no commit `2031d2199d20dbd1075270bb624e0ef8dee02a4a`:

| Regra             | Arquivo                            | Ocorrências | Justificativa                                  |
| ----------------- | ---------------------------------- | ----------- | ---------------------------------------------- |
| `jwt`             | `src/lib/telemetry-schema.test.ts` | 1           | Assinatura fictícia do teste de redação.       |
| `generic-api-key` | `web/lib/telemetry-schema.test.ts` | 2           | Placeholder numérico de token público PostHog. |
| `generic-api-key` | `src-tauri/src/telemetry.rs`       | 1           | JWT inválido no teste do redator Rust.         |

As três exceções em [`.gitleaks.toml`](../.gitleaks.toml) exigem simultaneamente
regra, caminho completo e valor exato. Não ignoram arquivos inteiros nem commits.
Os testes provam que trocar o valor ou o caminho volta a gerar achado. Nenhuma
credencial foi rotacionada e nenhum histórico foi reescrito: não foi identificada
credencial real nesses achados. A execução com exceções passou com zero achados no
histórico e no snapshot. Reexecutar depois das **últimas alterações e do commit
final**; um resultado de um snapshot anterior não atesta o próximo.

Também foram consultados, sem publicação, os textos de PRs/issues e comentários
de issues/revisões disponíveis pela API: 38 PRs, nenhuma issue comum e nenhuma
release existente. Esses textos passaram no scanner sem achados e sem referências
de anexos `user-attachments`/`assets` detectadas. Isso não substitui a revisão
humana de imagens, direitos, dados pessoais, links externos ou material novo.

Se uma credencial real surgir, revogue/rotacione primeiro e só depois planeje
a limpeza coordenada. Não publique seu valor no diagnóstico nem tente validá-lo
contra um provedor. [Procedimento do GitHub para dados sensíveis](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).

## Configurações verificadas no GitHub

Repositório `pitroldev/corneta`, ainda **privado**. Não foi alterada a visibilidade,
não foram criados PRs/issues/releases e não foram concedidas permissões novas.

| Controle                                  | Resultado                                                                                                                              |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Branch principal                          | `main`, anteriormente sem proteção; proteção aplicada e conferida por GET.                                                             |
| Force push e deleção de `main`            | Proibidos.                                                                                                                             |
| Administradores                           | Também sujeitos à proteção.                                                                                                            |
| Checks obrigatórios                       | `resolve`, `secrets`, `frontend`, `rust`, `media-integration`.                                                                         |
| Atualização da branch                     | Exige branch atualizada antes de integrar.                                                                                             |
| Revisores obrigatórios                    | Nenhum mínimo imposto; não há equipe fictícia de dois mantenedores.                                                                    |
| Contextos dos checks                      | Confirmados em execução real do CI; associados ao GitHub Actions.                                                                      |
| Colaboradores                             | Apenas o proprietário, administrador.                                                                                                  |
| Permissão padrão de workflow              | Somente leitura.                                                                                                                       |
| Workflow aprovar PR                       | Desabilitado.                                                                                                                          |
| Actions permitidas                        | Todas; não foi imposta exigência global de SHA que quebraria actions ainda fixadas por versão.                                         |
| Relato privado nativo                     | GET e tentativa de habilitação por PUT retornaram HTTP 404. **Não está validado como canal utilizável.**                               |
| Aprovação de execuções de forks           | API retornou HTTP 422: recurso não aplicável enquanto o repositório é privado. Reavaliar na abertura.                                  |
| Secret scanning/push protection do GitHub | Não informados por `security_and_analysis`; disponibilidade/ativação ainda não comprovadas. O scanner local/CI não é o mesmo controle. |

Os cinco checks já existem no workflow. Exigi-los não significa que suas execuções
anteriores passaram: o SHA final precisa passar depois de enviado pelo mantenedor.
Mantenha seus nomes estáveis ou atualize a proteção junto com eventual renomeação.

### Rechecagem sem alterações externas

```sh
gh api repos/pitroldev/corneta --jq '{visibility,default_branch,security_and_analysis}'
gh api repos/pitroldev/corneta/branches/main/protection --jq '{required_status_checks,enforce_admins,allow_force_pushes,allow_deletions}'
gh api repos/pitroldev/corneta/actions/permissions/workflow
gh api repos/pitroldev/corneta/private-vulnerability-reporting
gh api repos/pitroldev/corneta/actions/permissions/fork-pr-contributor-approval
```

### Ações ainda dependentes do mantenedor/da visibilidade

1. Confirmar o recebimento do canal privado descrito em [SECURITY.md](../SECURITY.md),
   sem enviar segredos como teste. O arquivo sozinho não comprova entrega.
2. Quando o recurso estiver disponível, habilitar o relato nativo com
   `gh api --method PUT repos/pitroldev/corneta/private-vulnerability-reporting` e
   conferir `enabled: true` no GET. Isso não muda a visibilidade por si só.
3. Na abertura, revisar Settings → Actions → General para exigir aprovação de
   execuções de contribuidores externos novos; verificar as opções disponíveis
   de secret scanning e push protection em Settings → Code security.
4. Conferir todos os novos textos/anexos e repetir o scanner no SHA final.

Nenhum desses passos autoriza tornar o repositório público automaticamente.

## Rechecagem no segundo lote

Em 6 de setembro de 2026 (Brasília), o HEAD local passou a `8a2815d` após o commit
das correções anteriores. A nova varredura cobre 270 commits/40 refs e o snapshot
das mudanças seguintes; os números/hash exatos ficam no resumo ignorado de cada
execução. Três achados novos eram digests da baseline de formatação associados a
nomes de documentos sobre OAuth/chaves, não credenciais. Os digests passaram a
usar o tipo explícito `sha256:`; comparação de bytes mantida e nenhuma nova
allowlist foi criada. A varredura com esse formato passou sem achados.

As consultas externas confirmaram novamente repositório privado, relato privado
404 e aprovação de forks 422; secret protection continua sem estado informado.
Não houve novas mudanças de configuração no GitHub. O novo smoke do navegador é
pré-requisito do check `frontend`, que falha explicitamente se ele não passar;
isso preserva os cinco contextos já exigidos, sem tratar job pulado como aprovação.
Ainda é necessário executar os workflows remotos do SHA final após o envio pelo
mantenedor e confirmar recebimento do canal privado.

Referências: [proteção de branches](https://docs.github.com/en/rest/branches/branch-protection),
[relato privado](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository).
