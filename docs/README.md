# Documentação da Corneta

Comece pelo [README do projeto](../README.md) para entender o produto e seu status. Planos antigos não são prova de que uma feature foi implementada ou validada.

## Desenvolver e contribuir

- [Contribuição](../CONTRIBUTING.md): fluxo de trabalho, testes e invariantes.
- [Desenvolvimento](DESENVOLVIMENTO.md): demo, Next.js e desktop com perfil isolado.
- [Segurança](../SECURITY.md): relato privado, escopo e cuidados com evidências.
- [Relatórios fictícios](RELATORIOS-FICTICIOS.md): cenários e geração/restauração de fixtures; não use dados reais em PRs.
- [Conteúdo editorial](../web/content/README.md): regras para guias, ajuda e screenshots.

## Operar e distribuir

- [Runbook beta](RUNBOOK-BETA.md) e [gates de release](GATES-DE-RELEASE.md): preparação e verificações, incluindo as manuais.
- [Assinaturas](ASSINATURA.md): diferença entre updater, Authenticode e checksums.
- [Atualização automática](ATUALIZACAO-AUTOMATICA.md): operação do updater.
- [Avisos de terceiros](../THIRD_PARTY_NOTICES.md): licenças e pacote de fontes da distribuição.
- [Decisão de OAuth](DECISAO-OAUTH-VIA-API.md): responsabilidades do desktop e da API oficial.
- [Política de telemetria](LGPD-LEGITIMO-INTERESSE-TELEMETRIA.md) e [runbook PostHog](RUNBOOK-POSTHOG.md): comportamento, configuração e operação. Não equivalem a parecer jurídico.

## Planos e registros

- [Auditoria de abertura do código](AUDITORIA-OPEN-SOURCE-2026-09-06.md): backlog com evidências e estado das correções P0.
- [Planejamento de produto](PLANEJAMENTO.md), [ideias](IDEIAS.md) e documentos `PLANO-*`/`FEATURE-*`: contexto de decisões e propostas; confira o estado no código e nos runbooks vigentes.
- [Performance: plano](PLANO-PERFORMANCE-2026-09-06.md) e [implementação](IMPLEMENTACAO-PERFORMANCE-2026-09-06.md): hipóteses, alterações e validações registradas.

Quando um plano conflitar com o comportamento atual, não copie a afirmação para o README: verifique a implementação e atualize a fonte pertinente. Mantenha data, escopo e validações reais nos registros de trabalho.
