# Publicação do código, site e aplicativo

Guia para mantenedores. Abrir o código, operar a API oficial e distribuir um instalador são ações distintas. Um build local ou CI verde não aprova automaticamente as outras etapas.

Registre a aprovação da versão exata no PR, na execução de CI ou nas notas da release. Issues acompanham trabalho pendente; este guia contém o procedimento reutilizável, não um diário de resultados.

## Repositório público

1. Confira README, licença, avisos de terceiros, contribuição, suporte e o canal privado de [segurança](../SECURITY.md). Teste o recebimento do contato publicado sem enviar dados sensíveis.
2. Faça a [varredura de segredos](SEGURANCA-REPOSITORIO.md) de todas as refs que pretende publicar e do snapshot final. Revise imagens e anexos conforme [materiais públicos](MATERIAIS-PUBLICOS.md).
3. Confira proteções de branch, checks obrigatórios, permissões de Actions e aprovação de execuções de contribuidores externos. Arquivos de workflow não comprovam que essas proteções estão ativas no host.
4. Em clone limpo, siga [desenvolvimento](DESENVOLVIMENTO.md) e execute `pnpm contrib:check`. Confirme que contribuir não exige credenciais oficiais.
5. Preserve licenças, lockfiles e manifestos de procedência. O código próprio sob MIT não transforma componentes de terceiros em MIT; veja [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

Planos de implementação, brainstorms, auditorias pontuais e relatos de execução não pertencem à árvore de documentação pública. Use issues/PRs e o histórico Git. O [changelog](../CHANGELOG.md) continua sendo a referência de mudanças para quem usa o projeto.

## Site e Setup API

Configure o host a partir de [web/.env.example](../web/.env.example) e do [contrato de configuração](CONFIGURACAO.md). Armazene segredos no mecanismo do host, nunca em código, logs ou artefatos. O `.env` do desktop não é fonte de configuração de produção do site.

- Cadastre os clientes Twitch, Google e Kick, incluindo escopos e callbacks. A Kick usa `KICK_CLIENT_SECRET` somente no servidor; confira `KICK_REDIRECT_URIS` com o cadastro do provedor.
- Configure Redis REST HTTPS com EVAL em `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`. `OAUTH_RATE_LIMIT_SALT` deve ser aleatório, estável, ter pelo menos 32 caracteres e ser igual entre instâncias; não reutilize um client secret.
- Na Vercel, a origem de IP é `x-vercel-forwarded-for`. Em self-host, defina `OAUTH_TRUSTED_IP_HEADER`, faça o proxy sobrescrever o header e impeça acesso público direto ao Next.
- Confira domínio canônico, SHA e CTA HTTPS para um instalador aprovado. Uma URL com formato válido não comprova que o download existe.
- Configure telemetria e kill switches coerentemente no desktop, site e API. Cumpra o [contrato operacional](RUNBOOK-POSTHOG.md) e a [política de telemetria](LGPD-LEGITIMO-INTERESSE-TELEMETRIA.md), incluindo a revisão jurídica aplicável. Esta documentação não substitui essa revisão.

Na raiz, `pnpm web:release:check` executa o gate configurado. Fora da Vercel, use `pnpm --dir web build:release` para o build de distribuição ou configure `CORNETA_RELEASE_CHECK=1`; Vercel production aplica o gate automaticamente. `pnpm contrib:web:check` é o caminho de contribuição sem credenciais, não uma aprovação da produção.

Depois do deploy, confira `/api/v1/health`, identidade/SHA e o arquivo realmente baixado pelo CTA. `status: ok` informa que a API responde; não prova autenticação, Redis ou instalação.

### OAuth em ambiente de teste

1. Em contas de teste novas, exercite Twitch/YouTube/Kick: login, cancelamento, renovação, revogação e reconexão. Aprovação, quotas e permissões nos consoles são verificações externas.
2. Na Kick, confira exchange PKCE e refresh; recuse código reutilizado, verifier incorreto, callback diferente e refresh revogado.
3. Exceda os limites de 20 exchanges/minuto e 60 refreshes/minuto por IP e confirme `429`/`Retry-After`. Alterne entre instâncias para confirmar o limite compartilhado.
4. Indisponibilize Redis somente no ambiente de teste: espere `503`/`Retry-After`, sem fallback ilimitado, e confirme recuperação ao restaurar o serviço.

Redis recebe chave HMAC, contador e TTL de 60 segundos, não o IP bruto nem os corpos OAuth. IPv6 é agrupado por /64; pessoas no mesmo NAT compartilham limite. HMAC é pseudonimização, não anonimização. O limite por IP não substitui WAF, alertas e limites de orçamento. Consulte a [superfície de rede](SUPERFICIE-DE-REDE.md).

## Distribuição do desktop

Os [gates de release](GATES-DE-RELEASE.md) são obrigatórios para o artefato distribuído.

1. Revise as fontes correspondentes ao FFmpeg fixado conforme [CONFORMIDADE-FFMPEG.md](CONFORMIDADE-FFMPEG.md). Enquanto `compliance/ffmpeg-sources.json` contiver `reviewed: false`, o pacote deve continuar bloqueado. Arquivos coletados e hashes válidos não encerram essa revisão.
2. Preserve os sidecars fixados em armazenamento durável. `CORNETA_FFMPEG_MIRROR_URL` pode substituir a origem de download, mas nunca o hash ou a build. Disponibilize os materiais de conformidade pertinentes, não apenas o espelho binário.
3. Confira backups, secrets e reviewer do Environment `production-telemetry`, conforme [assinaturas](ASSINATURA.md), [updater](ATUALIZACAO-AUTOMATICA.md) e runbook de telemetria. Não gere outra chave para substituir um backup perdido em instalações já distribuídas.
4. Atualize versões com `pnpm bump patch` (ou `minor`/`major`), revise o diff, atualize o changelog e faça o commit incluindo ambos. O script exige index sem alterações staged e alvos de versão intactos. Neste fluxo, não use `--commit`: essa opção faz commit somente dos alvos de versão e já cria a tag. Não misture trabalho alheio com a alteração de versão.
5. Crie a tag `vX.Y.Z`, correspondente à versão exata do Tauri, no commit que contém as versões e o changelog revisados; depois envie a tag. O [workflow](../.github/workflows/release.yml) valida a mesma ref no CI, faz build/assinatura, confere conteúdo e prepara um **draft**, não uma aprovação automática.
6. Execute os ensaios abaixo sobre o instalador desse draft. Só então publique a release e confira os downloads públicos.

O draft admite cinco assets: instalador `.exe`, assinatura `.exe.sig`, `latest.json`, `SHA256SUMS.txt` e `corneta-third-party.zip`. Não adicione logs, dumps, mapas de código ou arquivos de ambiente ao pacote. Depois de preparar os sidecars, `pnpm compliance:prepare` gera o pacote de terceiros se o manifesto estiver aprovado; inspecione também seu conteúdo.

### Instalação, atualização e recuperação

Use VM/máquina descartável e backup de dados de teste. Não ensaie downgrade ou falhas deliberadas no perfil do streamer em produção.

1. Baixe e confira hash/assinatura do instalador, instale em Windows limpo e abra sem terminal.
2. Configure plataformas de teste, faça uma gravação curta e guarde relatório/preferências.
3. Em outro snapshot, atualize N-1 → N; confira cofre, configuração, relatórios, autostart, atalhos, bandeja, fechamento e desinstalação.
4. Use endpoint HTTPS de teste para o updater. Draft privado não é endpoint público acessível pelo desktop; não altere endpoint ou chave das instalações reais.
5. Confira rejeição de assinatura adulterada e tratamento de indisponibilidade. Teste a exclusão mútua nas duas ordens: transmissão iniciando/ativa ou gravação encerrando impede instalar; download/instalação em andamento impede iniciar a live, inclusive por atalho e após recarregar a interface. Dispare as duas ações simultaneamente e confirme que apenas uma é aceita. Após falha da atualização, confirme que iniciar a live e tentar atualizar voltam a funcionar.
6. Ensaie recuperação por snapshot/reinstalação com backup compatível. O updater não oferece downgrade automático e um backup de arquivos não garante portabilidade do cofre.

### Estabilidade e uso real

Compare OBS sozinho com OBS + Corneta no mesmo hardware, cena, bitrate e destinos, usando build release. Siga o [protocolo de performance](PERFORMANCE.md), separando Corneta, sidecars e WebView; não some memória compartilhada como se fosse toda privada.

| Cenário                                    | Ensaio                  | Observar                                                          |
| ------------------------------------------ | ----------------------- | ----------------------------------------------------------------- |
| App parado e chat ativo                    | 15 minutos por condição | CPU, memória e resposta da interface                              |
| Live com múltiplos destinos                | 4–8 horas               | Crescimento após aquecimento, reconexões e áudio/vídeo            |
| Jogo concorrendo por recursos              | 30–60 minutos           | Impacto adicional e causas apresentadas como hipóteses            |
| Gravação ligada/desligada e chat intenso   | 30 minutos por condição | Disco, memória, replay, retenção e exportação                     |
| Queda de OBS, rede e destino personalizado | Três ciclos por cenário | Recuperação, outros destinos vivos e ausência de processos órfãos |
| Relatório volumoso                         | Dez aberturas           | Feedback, scroll, gráficos, seek e marcação sem remontar o player |

Cubra Windows 10/11 e NVIDIA/Intel/AMD/software conforme [compatibilidade](COMPATIBILIDADE.md). Mantenha recursos experimentais fora da aprovação de funcionalidades estáveis. Com participantes não técnicos, observe instalação, conexão, início da live, recuperação e consulta ao relatório sem antecipar instruções; registre as dificuldades encontradas.

## Aprovação por versão

No PR ou na release, registre responsáveis e links para evidências sanitizadas de segurança/materiais públicos; CI/gates da ref exata; fontes correspondentes/artefatos/assinaturas; configuração do host/OAuth/telemetria; instalação/N-1 → N/recuperação/matriz de mídia; conteúdo dos cinco assets e disponibilidade real do download.

Inclua versão/commit, data, ambiente, hardware/driver, cenário e resultado. Falhas continuam abertas em issues ou no PR de release; não transforme teste ignorado, variável presente ou documento atualizado em aprovação. Evidência privada deve ter responsável e escopo identificados, sem publicar tokens, chats, `.env`, relatórios pessoais ou mensagens privadas.
