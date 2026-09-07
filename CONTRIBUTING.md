# Como contribuir com a Corneta

Contribuições pequenas, correções de documentação e relatos reproduzíveis são bem-vindos. Pode escrever em português ou inglês. O projeto está em fase experimental: não há promessa de prazo de revisão ou suporte contínuo.

## Primeiro passo

Siga o [README](README.md) e o [guia de desenvolvimento](docs/DESENVOLVIMENTO.md). Para UI e lógica de relatórios, comece pela demonstração; não precisa instalar OBS/Rust nem pedir credenciais ao mantenedor.

```sh
pnpm install --frozen-lockfile
pnpm contrib:demo
```

Antes do PR:

```sh
pnpm contrib:check
```

Use um clone limpo para essa validação. Não copie seu `.env`, cofre, configuração pessoal, banco de relatórios ou chave do updater para o projeto de teste. Não teste a contribuição durante sua live de produção.

## Escolha uma mudança delimitada

Para bug, descreva resultado esperado, resultado observado e passos mínimos. Para uma feature grande, discuta primeiro em uma issue: implementação pronta não garante que a mudança será aceita. Mantenha refatoração, normalização de arquivos e alteração de comportamento em PRs separados quando possível.

Inclua versão/commit, Windows, OBS, GPU/driver e modo de transmissão quando forem relevantes. Use dados fictícios ou exemplos mínimos sanitizados; não anexe logs/NDJSON/vídeos pessoais indiscriminadamente. Suspeita de vulnerabilidade vai para o [canal privado](SECURITY.md), não para uma issue pública.

## Onde trabalhar

| Área                              | Código                                                       | Validação principal                                           |
| --------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------- |
| UI e design system                | `src/components/`, `src/screens/`                            | lint, tipos, testes e demonstração                            |
| Relatórios e chat no replay       | `src/screens/reports/`, `src/lib/report*`, `src/lib/replay*` | fixtures, testes de relógio/paginação e smoke de relatórios   |
| Processamento e integração nativa | `src-tauri/src/`                                             | rustfmt, Clippy, testes Rust; testes reais quando necessários |
| Site e API                        | `web/app/`, `web/lib/`                                       | lint/tipos, build e testes das rotas/contratos                |
| Conteúdo de ajuda                 | `web/content/`                                               | [protocolo editorial](web/content/README.md)                  |
| Distribuição                      | `scripts/`, `.github/workflows/`, `compliance/`              | testes dos scripts e gates; não publicar para testar um PR    |

Os testes JS/TS são encontrados pelo Vitest da raiz, inclusive os testes pertinentes de `web/`. Para um ciclo focado, `pnpm exec vitest run CAMINHO_DO_TESTE` pode reduzir o tempo; não substitui a validação integrada antes de entregar.

Para Rust, prepare os sidecars e execute dentro de `src-tauri/`:

```sh
cargo fmt --all -- --check
cargo clippy --locked --all-targets --all-features -- -D warnings
cargo test --locked --all-targets
```

Esses comandos podem ler a configuração pública de build do workspace; execute-os no clone limpo de contribuição, não reutilizando um `.env` oficial. Testes `ignored` incluem mídia/OCR e dependem das ferramentas descritas no [runbook](docs/RUNBOOK-BETA.md). Não informe que foram executados se rodou apenas testes unitários.

## Invariantes que uma contribuição deve preservar

- **Transmissão antes de tarefas auxiliares.** Relatórios, chat, gravação e diagnóstico não podem bloquear o caminho de envio por conveniência. Preserve cancelamento, filas limitadas e liberação de processos.
- **Segredos ficam fora do frontend e dos artefatos públicos.** Prefixos `VITE_`/`NEXT_PUBLIC_` são públicos; não usar para segredos. PKCE, validação de callbacks, cofre e redatores não devem ser relaxados para passar um teste.
- **Uma falha deve ser isolada.** Tratar cancelamento, destino desconectado, arquivo ausente, resposta inválida e encerramento no subsistema adequado.
- **Performance é parte do comportamento.** Preserve lazy loading, workers, virtualização e limites de retenção. Meça antes/depois de mudanças em hot paths; não alegue ganho com base apenas em menos linhas de código.
- **Interface consistente.** Use os componentes do design system, incluindo `Select`, e mantenha navegação por teclado. Atualize português e inglês quando introduzir texto público.
- **Dados locais são do usuário.** Alterações de formato precisam de compatibilidade/migração e testes; não resetar configurações, cofre ou relatórios para corrigir um problema.
- **Gates oficiais continuam fechados.** Um perfil local não autoriza publicação sem assinatura do updater, fontes correspondentes e demais verificações.

## O que deve acompanhar o PR

Explique o problema, a solução escolhida e o que ficou fora do escopo. Liste os comandos realmente executados e seus resultados, inclusive verificações não feitas. Adicione teste de regressão para bugs e evidência visual sanitizada se mudar a interface. Em mudanças de performance, descreva cenário, volume de dados, hardware e medição.

Você deve ter direito de contribuir com código e materiais enviados, mantendo autoria e avisos de terceiros. O código próprio do projeto segue a [MIT](LICENSE); não introduza conteúdo de licença incompatível ou dados privados. Ferramentas de assistência não dispensam revisão, testes e verificação de procedência.

Seja respeitoso, discuta decisões técnicas com evidências e evite ataques pessoais. O mantenedor pode pedir ajustes ou recusar uma mudança por escopo, segurança, manutenção ou prioridade do produto.

Consulte também [conduta](CODE_OF_CONDUCT.md), [suporte](SUPPORT.md), [arquitetura](docs/ARQUITETURA.md) e [performance](docs/PERFORMANCE.md). A indicação em CODEOWNERS corresponde ao mantenedor atual; não existe uma equipe fictícia nem aprovação automática.
