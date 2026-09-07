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
- O limitador local já funciona sem serviço de armazenamento ou segredo adicional. Antes de expor a API, configure e verifique a proteção WAF/edge descrita abaixo: os contadores locais não são compartilhados entre instâncias.
- Na Vercel, a origem de IP é `x-vercel-forwarded-for`. Em self-host, defina `OAUTH_TRUSTED_IP_HEADER`, faça o proxy sobrescrever o header e impeça acesso público direto ao Next.
- Confira domínio canônico, SHA e CTA HTTPS para um instalador aprovado. Uma URL com formato válido não comprova que o download existe.
- Configure telemetria e kill switches coerentemente no desktop, site e API. Cumpra o [contrato operacional](RUNBOOK-POSTHOG.md) e a [política de telemetria](LGPD-LEGITIMO-INTERESSE-TELEMETRIA.md), incluindo a revisão jurídica aplicável. Esta documentação não substitui essa revisão.

Na raiz, `pnpm web:release:check` executa o gate configurado. Fora da Vercel, use `pnpm --dir web build:release` para o build de distribuição ou configure `CORNETA_RELEASE_CHECK=1`; Vercel production aplica o gate automaticamente. `pnpm contrib:web:check` é o caminho de contribuição sem credenciais, não uma aprovação da produção.

Depois do deploy, confira `/api/v1/health`, identidade/SHA e o arquivo realmente baixado pelo CTA. `status: ok` informa que a API responde; não prova autenticação, regras de WAF/edge ou instalação. O gate de build verifica a configuração disponível no código, não o estado dessas regras no provedor.

### Proteção na borda antes de publicar

- Cubra `POST /api/v1/oauth/kick/exchange` e `POST /api/v1/oauth/kick/refresh` com regra(s) de rate limiting compatíveis com o plano do host. Registre orçamento, janela, chave de contagem e escopo territorial; não presuma que o host reproduza os limites locais de 20/60 ou que permita duas regras no plano contratado.
- Aplique a cobertura em todos os hosts e aliases públicos que atendam à API, inclusive domínios diretos de deployment, ou restrinja seu acesso. Inclua rewrites e variantes normalizadas de caminho que alcancem os handlers. Impeça acesso à origem que contorne a borda e revise exceções/bypass da configuração do host.
- Use bloqueio com resposta `429`, não desafio de navegador: o cliente é o backend desktop e não pode resolver uma página interativa. Uma regra em modo de observação/log não bloqueia tráfego.
- Na Vercel, os contadores de WAF são **por região**, não globais. Tráfego distribuído entre regiões pode superar o teto de uma região. Confira quantidade de regras, disponibilidade e cobrança no plano efetivamente contratado antes de definir a política. [Documentação de rate limiting da Vercel](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting).
- Publique as regras no host e teste a cobertura antes de aprovar o deploy. Guarde evidências sanitizadas de bloqueio na borda, sem bodies OAuth, tokens ou IPs reais. Estes arquivos não configuram o WAF e não atestam que alguma regra esteja ativa.

O WAF complementa os limites da aplicação; nenhum deles garante bloquear todo abuso, ataque distribuído ou custo. Alertas, quotas dos provedores e controles de orçamento continuam necessários.

### OAuth em ambiente de teste

1. Em contas de teste novas, exercite Twitch/YouTube/Kick: login, cancelamento, renovação, revogação e reconexão. Aprovação, quotas e permissões nos consoles são verificações externas.
2. Na Kick, confira exchange PKCE e refresh; recuse código reutilizado, verifier incorreto, callback diferente e refresh revogado.
3. Na mesma instância, exceda 20 exchanges e 60 refreshes por origem em janelas fixas de 60 segundos; confirme contadores independentes e `429`/`Retry-After`. Confira IPv6 /64 e a origem compartilhada `unknown` quando não houver IP confiável. Um header forjado pelo cliente não pode substituir aquele sobrescrito pelo proxy.
4. Nos testes do limitador, exercite expiração/TTL e capacidade com relógio e identidades sintéticos. Uma tabela cheia deve recusar novas entradas com `503`/`Retry-After`, sem expulsar contadores ativos; após a expiração, deve voltar a admitir entradas. Não gere essa carga em produção.
5. Alterne entre instâncias/reinícios em ambiente controlado: os contadores locais são independentes e reiniciam. Confirme separadamente que o WAF bloqueia antes das instâncias dentro do escopo configurado, inclusive em todos os hosts/caminhos cobertos e após o scale-out. Se houver múltiplas regiões, ensaie cada uma; não registre esse resultado como limite global.

O cache local guarda chaves HMAC, contadores e expiração, até 10.000 entradas por instância; não guarda IP bruto ou corpos OAuth. A chave HMAC é efêmera, sem configuração externa. A expiração da própria identidade é verificada a cada tentativa; a limpeza das demais entradas expiradas acontece sob demanda em requisições, no máximo uma vez por segundo. Não há exclusão física cronometrada ao completar 60 segundos sem tráfego. Pessoas no mesmo NAT compartilham limite. HMAC é pseudonimização, não anonimização; proxies/WAF têm seus próprios registros e controles de privacidade. Consulte a [superfície de rede](SUPERFICIE-DE-REDE.md).

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
