# Documentação da Corneta

Comece pelo [README do projeto](../README.md) para entender o produto e seu status. Planos antigos não são prova de que uma feature foi implementada ou validada.

## Desenvolver e contribuir

- [Contribuição](../CONTRIBUTING.md): fluxo de trabalho, testes e invariantes.
- [Desenvolvimento](DESENVOLVIMENTO.md): demo, Next.js e desktop com perfil isolado.
- [Segurança](../SECURITY.md): relato privado, escopo e cuidados com evidências.
- [Suporte](../SUPPORT.md) e [conduta](../CODE_OF_CONDUCT.md): canais, expectativas e convivência.
- [Configuração](CONFIGURACAO.md): variáveis, precedência e fronteiras oficial/Contributor/fork.
- [Arquitetura](ARQUITETURA.md) e [superfície de rede](SUPERFICIE-DE-REDE.md): responsabilidades, processos e integrações.
- [Performance](PERFORMANCE.md): comandos, baseline sintética e medições reais ainda necessárias.
- [Compatibilidade](COMPATIBILIDADE.md), [changelog](../CHANGELOG.md) e [roadmap](ROADMAP.md): versões, dados e prioridades.
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
- [Revisão de qualidade e higiene](REVISAO-QUALIDADE-E-HIGIENE-2026-09-06.md): diagnóstico datado de código, comentários, documentação e candidatos à remoção; não é um checklist de correções já implementadas.
- [Planejamento de produto](PLANEJAMENTO.md), [ideias](IDEIAS.md) e documentos `PLANO-*`/`FEATURE-*`: contexto de decisões e propostas; confira o estado no código e nos runbooks vigentes.
- [Performance: plano](PLANO-PERFORMANCE-2026-09-06.md) e [implementação](IMPLEMENTACAO-PERFORMANCE-2026-09-06.md): hipóteses, alterações e validações registradas.

Quando um plano conflitar com o comportamento atual, não copie a afirmação para o README: verifique a implementação e atualize a fonte pertinente. Mantenha data, escopo e validações reais nos registros de trabalho.

## Estado documental — setembro de 2026

O estado abaixo vale para todos os arquivos das famílias indicadas, inclusive os documentos que preservam exemplos de uma versão antiga. Arquivar aqui significa manter a evidência com status explícito; não mover arquivos e quebrar referências históricas.

| Família                                                                                                                                                       | Estado / referência para decisões atuais                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desenvolvimento, configuração, arquitetura, rede, performance, compatibilidade e este índice                                                                  | Referências vigentes da linha 0.7.0; mudanças de contrato devem atualizá-las.                                                                                         |
| `RUNBOOK-*`, `GATES-DE-RELEASE`, `ASSINATURA`, `ATUALIZACAO-AUTOMATICA`, `DECISAO-OAUTH-VIA-API`, política LGPD, segurança, conformidade e materiais públicos | Referências operacionais vigentes. Resultados de teste datados dentro delas são históricos, não uma aprovação da próxima release.                                     |
| `AUDITORIA-*`, `CORRECOES-*`, `OTIMIZACOES-*`, `IMPLEMENTACAO-*`, `REVISAO-UX-UI`                                                                             | Registros históricos. Estado executável consolidado na auditoria de abertura e nos runbooks, não em cada achado original.                                             |
| `PLANO-*`, `PLANEJAMENTO`, `FEATURE-*`, `IDEIAS*`, `ideias-v4/*`, `MONETIZACAO`, `PENDENCIAS`                                                                 | Propostas/decisões históricas, às vezes implementadas parcialmente. Não são promessa de roadmap nem substituem código/testes; consulte o [roadmap atual](ROADMAP.md). |
| `CHAT`, `ALERTAS`, `ENVIO`, `YOUTUBE-AUTO`, `RELATORIO-POS-LIVE`                                                                                              | Desenhos históricos de subsistemas; consulte arquitetura, rede e testes para o contrato atual.                                                                        |
| `TOM-DE-VOZ`, `SLOGAN`, `PROPOSTA-DE-VALOR`, `DOMINIOS`, `BUY-ME-A-COFFEE`, `ANALISE-CONCORRENCIA`                                                            | Contexto de produto/marca/negócio, não especificação de suporte ou release.                                                                                           |
| `RELATORIOS-FICTICIOS`, `ROADMAP`                                                                                                                             | Guias vigentes no escopo declarado.                                                                                                                                   |

`pnpm docs:check` verifica destinos locais em arquivos Markdown rastreados/novos, incluindo imagens e referências, ignorando exemplos em código e comentários. Não consulta URLs externas nem valida âncoras; essas verificações não são prometidas por esse comando.
