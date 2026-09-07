# Histórico de mudanças

## Não lançado — linha 0.7.0

Este é o estado do código em preparação, não uma release estável nem um instalador aprovado. O projeto não reconstrói notas completas de versões antigas a partir de suposições.

### Para quem usa

- Relatórios organizados em torno da live, com replay, chat paginado, momentos, gráficos e detalhes técnicos secundários.
- Processamento de relatórios em worker e limites de memória/filas para preservar a resposta do app.
- Fluxos oficiais de conexão Twitch, YouTube e Kick via API de setup; URLs/chaves próprias continuam um caminho separado.
- Correções de gravação ausente, relógio/duração de sessões e timestamps de marcação de momentos.

### Para quem contribui

- Perfil Contributor com identidade/cofre separados, telemetria desativada e updater ausente.
- Guias de configuração, arquitetura, suporte, segurança, fixtures e performance; templates de contribuição.
- Verificações de segredos, assets, scripts, documentação e regressões de interface no processo de validação.

### Compatibilidade e limites

O desktop usa a versão da raiz/Cargo/Tauri; `web/package.json` versiona o workspace web independentemente. O contrato da API possui seus próprios validadores: igualdade entre versões de pacotes não é garantia de compatibilidade. Mudanças incompatíveis devem declarar migração e testes antes de release.

Configurações e relatórios antigos são dados do usuário: preserve backups e confira o [guia de compatibilidade](docs/COMPATIBILIDADE.md) antes de testar upgrade/downgrade. Não há promessa de downgrade nem certificação multiplataforma. A distribuição que inclui FFmpeg continua condicionada às fontes correspondentes e aos [gates](docs/GATES-DE-RELEASE.md).
