# Documentação da Corneta

Comece pelo [README do projeto](../README.md) para conhecer o app, os requisitos e a demonstração. Este índice reúne os guias e contratos mantidos junto do código.

## Usar e testar

- [Ajuda e guias](../web/content/): conteúdo de uso publicado pelo site; [suporte](../SUPPORT.md) explica como relatar um problema com segurança.
- [Desenvolvimento](DESENVOLVIMENTO.md): executar a demo, o site e o desktop em um perfil de contribuição isolado.
- [Compatibilidade](COMPATIBILIDADE.md): plataformas, versões e formatos de dados suportados.
- [Relatórios fictícios](RELATORIOS-FICTICIOS.md): gerar, testar e restaurar cenários sem usar relatórios pessoais.

## Contribuir

- [Contribuição](../CONTRIBUTING.md): preparação, testes e critérios para um PR.
- [Arquitetura](ARQUITETURA.md): responsabilidades, módulos e contratos de ciclo de vida.
- [Configuração](CONFIGURACAO.md): variáveis, precedência e separação entre distribuição oficial, Contributor e forks.
- [Superfície de rede](SUPERFICIE-DE-REDE.md): processos, portas, OAuth e integrações.
- [Performance](PERFORMANCE.md): limites, benchmarks e medições que exigem hardware real.
- [Tom de voz](TOM-DE-VOZ.md): linguagem do app, tradução e mensagens de erro.
- [Conteúdo editorial](../web/content/README.md) e [manutenção editorial](RUNBOOK-MANUTENCAO-EDITORIAL.md): escrever, revisar e publicar ajuda e guias.
- [Roadmap](ROADMAP.md): prioridades para discutir novas contribuições.
- [Segurança do repositório](SEGURANCA-REPOSITORIO.md): verificar segredos e revisar exceções de fixtures. Vulnerabilidades seguem o [canal privado](../SECURITY.md).
- [Conduta](../CODE_OF_CONDUCT.md): expectativas para colaboração.

## Operar e distribuir

- [Publicação](PUBLICACAO.md): procedimentos, checklist e evidências necessárias para distribuir.
- [Gates de release](GATES-DE-RELEASE.md): critérios de aprovação; executar um subconjunto não aprova a release.
- [Assinaturas](ASSINATURA.md) e [atualização automática](ATUALIZACAO-AUTOMATICA.md): integridade do instalador, updater e recuperação.
- [Conformidade do FFmpeg](CONFORMIDADE-FFMPEG.md) e [avisos de terceiros](../THIRD_PARTY_NOTICES.md): licenças e fontes correspondentes da distribuição.
- [Materiais públicos](MATERIAIS-PUBLICOS.md): procedência, inventário e revisão de assets.
- [Política de telemetria](LGPD-LEGITIMO-INTERESSE-TELEMETRIA.md) e [operação do PostHog](RUNBOOK-POSTHOG.md): finalidades, configuração e controles. A documentação técnica não substitui revisão jurídica.

## Manter a documentação

Atualize o guia responsável pelo contrato alterado. Mudanças entregues pertencem ao [changelog](../CHANGELOG.md); prioridades futuras, ao roadmap; preparação de distribuição, ao guia de publicação. Registros de execução e relatórios de revisão não devem virar novas páginas permanentes de documentação.

`pnpm docs:check` verifica destinos locais em arquivos Markdown rastreados e novos, incluindo imagens e referências, ignorando exemplos em código e comentários. O comando não consulta URLs externas nem valida âncoras; confira esses casos ao revisar links.
