# Runbook de telemetria e diagnóstico — PostHog

Procedimento operacional da telemetria da Corneta. O tratamento dos dados e suas
salvaguardas estão na [política de telemetria](LGPD-LEGITIMO-INTERESSE-TELEMETRIA.md);
variáveis e perfis ficam em [configuração](CONFIGURACAO.md), e os limites das
integrações em [superfície de rede](SUPERFICIE-DE-REDE.md).

No desktop, **uso é opt-in e falhas são opt-out**. Este procedimento não atesta configuração do
operador nem aprovação jurídica; registre as verificações necessárias no
[checklist de publicação](PUBLICACAO.md).

## 1. Responsáveis e princípios

| Área                             | Responsável               | Backup                | SLA inicial                                 |
| -------------------------------- | ------------------------- | --------------------- | ------------------------------------------- |
| Error Tracking desktop/API       | engenharia                | mantenedor da release | severidade 1: 4 h; severidade 2: 1 dia útil |
| Dashboards de produto            | produto                   | engenharia            | revisão semanal                             |
| Privacidade, retenção e exclusão | controlador do Corneta    | engenharia            | solicitação do titular: até 15 dias         |
| Credenciais e acessos            | mantenedor do repositório | controlador           | revisão trimestral                          |

Regras invariantes:

- uso só envia em `enabled`; `unset` e `disabled` não permitem eventos de uso;
- falhas ficam ativas em `unset` e `enabled`, mas nunca em `disabled`. Com configuração
  válida, exceções e o marcador mínimo de abertura podem sair antes da primeira escolha;
- os controles são independentes. Escolhas explícitas anteriores são preservadas na versão
  de aviso `2026-09-09`; não são substituídas pelos defaults nem consideradas consentimento
  juridicamente validado só porque a migração as preservou;
- fechar o aviso ou aceitar termos não ativa uso. Ativar uso só permite eventos futuros,
  sem guardar etapas anteriores para enviá-las após a adesão;
- uma finalidade desligada não pode produzir evento daquela finalidade;
- texto livre, conteúdo de chat/live, credenciais, tokens, paths e URLs não entram no PostHog;
- logs permanecem locais e separados; o diagnóstico exportável contém somente resumo técnico e eventos estruturados allowlisted, e nunca é anexado automaticamente;
- `phc_…` é token público de ingestão; `phx_…`/Personal API Key é segredo e só existe no CI
  ou em uma estação administrativa;
- indisponibilidade do PostHog não pode alterar o resultado ou o tempo crítico da live.

## 2. Provisionamento inicial

O código assume PostHog Cloud US (`https://us.i.posthog.com`). Se a revisão jurídica escolher
EU, altere em conjunto os hosts, os secrets, a CSP do Tauri, a política e os dois projetos. Nunca
misture token de uma região com host da outra.

Crie dois projetos sem copiar dados entre eles:

| Projeto        | Dados                                                                    | Quem acessa              | Retenção |
| -------------- | ------------------------------------------------------------------------ | ------------------------ | -------- |
| `corneta-dev`  | sintéticos/dogfood                                                       | engenharia               | 30 dias  |
| `corneta-prod` | dados técnicos de produção, respeitando adesão a uso e oposição a falhas | engenharia + controlador | 90 dias  |

Em **Project settings**, para os dois projetos:

1. desative Session Replay, autocapture, surveys, heatmaps, dead clicks e Web Vitals;
2. ative descarte do IP do cliente e não habilite enriquecimento GeoIP;
3. verifique que o cliente JavaScript não chama identificação e que o payload nativo contém
   `$process_person_profile=false`, mantendo o UUID pseudônimo; não habilite enriquecimento de perfis;
4. configure a retenção acima;
5. não instale apps/destinations que repliquem eventos;
6. restrinja a Personal API Key ao projeto e aos escopos mínimos para upload de Error Tracking e
   leitura do projeto/token exigida pelo preflight; não conceda acesso de escrita aos demais
   produtos;
7. habilite MFA para toda conta com acesso e remova acessos inativos;
8. baixe/assine o DPA e registre região, data, titular e aprovador no inventário de operadores.

Antes do primeiro envio para produção, publique as políticas PT/EN presentes no site e confirme
que a versão mostrada no app é a mesma do aviso publicado.

Somente depois dessa publicação e das revisões exigidas, atualize a variável do Environment
`TELEMETRY_POLICY_PUBLISHED_VERSION` para `2026-09-09`. O gate exige essa versão do aviso;
preencher a variável não publica a política, não aprova a base legal e não configura o operador.

Faça a verificação de ausência de criação de perfil com um UUID sintético novo. Um UUID
previamente identificado pode continuar associado a um perfil, mesmo com a propriedade em
`false`; a correção no app não remove dados já recebidos nem muda automaticamente a identidade.
Revise esse legado no operador, conforme a [política de telemetria](LGPD-LEGITIMO-INTERESSE-TELEMETRIA.md)
e a [documentação do PostHog](https://posthog.com/docs/data/anonymous-vs-identified-events), antes de atestar ausência de perfis.

## 3. Configuração por ambiente

### Desktop/Vite e Rust

| Variável                    | Onde                     | Tipo    | Uso                             |
| --------------------------- | ------------------------ | ------- | ------------------------------- |
| `VITE_POSTHOG_TOKEN`        | build do WebView         | público | ingestão React                  |
| `VITE_POSTHOG_HOST`         | build do WebView         | público | origem HTTPS de ingestão        |
| `POSTHOG_DESKTOP_TOKEN`     | build Rust               | público | ingestão nativa                 |
| `POSTHOG_HOST`              | build Rust e plugin Vite | público | ingestão/upload na mesma região |
| `VITE_BUILD_SHA`            | build do WebView         | público | correlação da release           |
| `CORNETA_BUILD_SHA`         | build Rust               | público | correlação da release           |
| `VITE_TELEMETRY_DISABLED=1` | build do WebView         | público | kill switch emergencial         |
| `TELEMETRY_DISABLED=1`      | build Rust               | público | kill switch emergencial         |

O WebView desktop fixa `posthog-js` em **1.409.5**: o adaptador em
`src/lib/telemetry-transport.ts` usa APIs internas dessa versão para fazer uma única
tentativa por envio, sem fila de retries HTTP, compressão assíncrona ou `sendBeacon`.
A entrega é best-effort: eventos podem ser descartados e uma requisição em voo não pode
ser desfeita. Captura automática e replay continuam desligados. Uma nova tentativa de
carregar o SDK após falha não recupera eventos descartados. Antes de atualizar o pacote,
revise a compatibilidade do adaptador e execute testes com o SDK real e o benchmark de
telemetria, incluindo indisponibilidade de rede, revogação e callbacks tardios. Esse
contrato do WebView não altera os transportes do Rust ou do site/API.

### API e site Next.js

| Variável                            | Onde            | Tipo        | Uso                                                       |
| ----------------------------------- | --------------- | ----------- | --------------------------------------------------------- |
| `POSTHOG_PROJECT_TOKEN`             | runtime Next.js | server-only | ingestão server-side; project token, não Personal API Key |
| `POSTHOG_HOST`                      | runtime Next.js | público     | origem de ingestão                                        |
| `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` | build/site      | público     | métricas cookieless do site                               |
| `NEXT_PUBLIC_POSTHOG_HOST`          | build/site      | público     | origem de ingestão do site                                |
| `NEXT_PUBLIC_BUILD_SHA`             | build/site      | público     | correlação de deploy                                      |
| `NEXT_PUBLIC_TELEMETRY_DISABLED=1`  | build/site      | público     | kill switch do cliente web                                |
| `BUILD_SHA`/`VERCEL_GIT_COMMIT_SHA` | runtime Next.js | público     | correlação do deploy da API                               |
| `TELEMETRY_DISABLED=1`              | runtime/build   | público     | kill switch global                                        |

### Source maps no GitHub Actions

| Secret/variable      | Tipo     | Observação                                                                                                                                  |
| -------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `POSTHOG_API_KEY`    | secret   | Personal API Key restrita ao projeto, com apenas `error_tracking:write` e `project:read`; disponível somente no step shell Vite/source maps |
| `POSTHOG_PROJECT_ID` | variable | ID numérico; disponível no mesmo step de source maps                                                                                        |
| `POSTHOG_HOST`       | variable | deve ter a mesma região do token                                                                                                            |

Sem token/host válidos, com kill switch ou com as duas finalidades desligadas, o desktop não
envia telemetria. `unset` significa ausência de escolha: **desativa uso e mantém falhas ativas**.
O site conserva um controle único de opt-out e DNT/GPC, sem compartilhar as escolhas do app.
A API preserva o tratamento de falhas e só recebe o UUID do desktop para as finalidades ativas.
Builds locais e de PR não exigem credenciais. Na release habilitada, um step shell executa o build Vite, gera mapas ocultos, faz
upload associado a `corneta-desktop@<versão>` e os apaga. O processamento inclui o JavaScript
principal, o worker de relatórios e seus imports dinâmicos, que o Vite emite como assets.
Antes do upload, cada arquivo precisa ter um mapa válido e não vazio; após o processamento,
a ausência do identificador de diagnóstico ou a permanência de mapas bloqueia o build.
Esse é o único step que recebe a
Personal API Key e o Project ID de upload; o gate de configuração, o build Tauri, o scanner e o
upload do GitHub não recebem a chave. Antes do Vite, esse step consulta o projeto no PostHog US
com timeout curto e redirects bloqueados e exige que `id`/`api_token` coincidam exatamente com o
ID e project token da release. Rede, autenticação, schema ou divergência falham com mensagem
estática, sem imprimir resposta ou segredo. O CLI do Tauri preserva esse `dist`, gera uma
única vez o EXE/NSIS e seu `.exe.sig`, e o `latest.json` v2 referencia exatamente esse instalador.
O job passa [tauri.release.conf.json](../src-tauri/tauri.release.conf.json) por caminho, evitando
perda de aspas do JSON entre PowerShell e os executáveis Windows. Esse override preserva o
frontend já preparado e é exclusivo do CI; não substitui o build local completo. O job invoca
o CLI diretamente pelo Node, preservando o separador `--` que encaminha `--locked` ao Cargo.
O workflow também baixa o PostHog CLI oficial 0.9.4 em um step sem segredos, confere o SHA-256
fixado em `scripts/fetch-posthog-cli.ps1` e entrega o caminho explícito ao adaptador Vite; falha de
download, integridade, extração ou versão bloqueia o build.

O servidor de desenvolvimento não carrega o CLI, mesmo que existam credenciais no ambiente.
Para um build local deliberado com upload de source maps, prepare o mesmo CLI verificado no
PowerShell antes de executar o build:

```powershell
$env:POSTHOG_CLI_BINARY_PATH = pwsh -NoProfile -File scripts/fetch-posthog-cli.ps1
```

Builds sem upload não exigem esse executável. O CLI de upload é preparado explicitamente,
sem depender de um script `postinstall` do npm.

`pnpm bundle:check` inspeciona o frontend antes de iniciar a compilação e assinatura nativas,
tanto na release com telemetria quanto no modo emergencial.
Antes de qualquer upload de artefato da release, `pnpm artifacts:check` exige o comando `7z`, lista e extrai o NSIS e
procura `.map`, `phx_`, chaves minisign/PEM e segredos conhecidos no `dist`, binário, bundle e
conteúdo extraído. Essa inspeção confirma a árvore que o 7-Zip consegue interpretar; não prova o
conteúdo de bytes comprimidos em formatos opacos que ele não consiga abrir. Falha de listagem,
extração ou ausência do 7-Zip bloqueia o draft.

Nas variáveis de Actions do repositório GitHub, `TELEMETRY_DISABLED` alimenta
`VITE_TELEMETRY_DISABLED` e `TELEMETRY_DISABLED`. Em `0`, o step de source maps exige
`POSTHOG_API_KEY` no formato `phx_` e Project ID numérico. Em `1`, ambos os switches precisam ser
`1` e o workflow usa o caminho emergencial sem expor essas credenciais.

Nas mesmas variáveis de repositório, mantenha também
`NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, `NEXT_PUBLIC_POSTHOG_HOST` e
`POSTHOG_PROJECT_TOKEN` com os mesmos valores públicos configurados no deploy do Next.js. O gate
exige um único project token `phc_*`, host US em desktop/site/API e o mesmo SHA completo em
`VITE_BUILD_SHA`, `CORNETA_BUILD_SHA`, `NEXT_PUBLIC_BUILD_SHA` e `BUILD_SHA`. Nenhuma Personal
API Key recebe prefixo `VITE_` ou `NEXT_PUBLIC_`. Mantenha os secrets no Environment
`production-telemetry` ou no repositório; não duplique variáveis com valores divergentes no
Environment. A configuração completa e suas verificações estão em [PUBLICACAO.md](PUBLICACAO.md).

## 4. Gate de release

Execute na ordem:

O workflow `Release` chama o workflow reutilizável `CI` com a mesma ref exata da tag, inclusive
em disparo manual, e o job que recebe o Environment de produção só começa depois de todos os
jobs de qualidade passarem.

1. `pnpm check`;
2. execute `pnpm release:readiness` para conferir a configuração do GitHub e
   `pnpm telemetry:release:check` com a configuração pública de produção;
3. `cargo +1.97.1 fmt --manifest-path src-tauri/Cargo.toml -- --check`;
4. `cargo +1.97.1 clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`;
5. `cargo +1.97.1 test --manifest-path src-tauri/Cargo.toml`;
6. `cargo audit --file src-tauri/Cargo.lock` e
   `cargo deny --manifest-path src-tauri/Cargo.toml --config deny.toml check`;
7. confirme DPA, MFA, IP discard, retenção e política publicada;
8. produza um draft release pelo workflow `Release`;
9. no draft, execute uma instalação limpa e confirme uso desligado e falhas ligadas. Antes de
   escolher, não pode haver evento de uso; exceções e o marcador mínimo de abertura continuam
   permitidos. Desligue ambos e confirme ausência de novos requests. Repita com token ausente
   e kill switch;
10. habilite apenas uso, depois apenas erros, e inspecione os payloads. Ativar uso não pode
    recuperar eventos anteriores, inclusive etapas do onboarding. Fechar o aviso ou aceitar
    os termos não pode ativá-lo. Repita o upgrade de aviso com `unset`, `enabled` e `disabled`
    em cada finalidade, preservando as escolhas explícitas e testando estado local ilegível;
11. provoque uma exceção React sintética e confira stack TypeScript, `error_id`, versão e SHA;
12. confirme que nenhum `.map`, `phx_`, token OAuth, título, mensagem, path ou query aparece no
    instalador, requests ou issue;
13. confirme no log que o scan do mesmo NSIS terminou antes de `gh release create/upload` e que o
    draft contém exatamente os cinco assets descritos no [checklist de publicação](PUBLICACAO.md),
    incluindo checksums e conformidade; o workflow bloqueia o reaproveitamento se encontrar outro
    basename, mas a revisão manual continua obrigatória;
14. registre os resultados e aprove `production-release` conforme o [checklist de publicação](PUBLICACAO.md).
    O job reconfere os arquivos e o deployment contra a configuração aprovada no build antes
    de publicar. Não altere o draft ou o deployment durante a promoção.

O job Rust usa deliberadamente a toolchain 1.97.1, alinhada ao projeto e acima do MSRV 1.95
exigido por `oar-ocr` 0.8.1.
`notify-rust` está temporariamente pinado ao commit imutável do PR oficial que troca
`tauri-winrt-notification` 0.7 por 0.8.1 e remove `quick-xml` vulnerável. Remova o patch de
`Cargo.toml` quando uma release equivalente chegar ao crates.io, nunca substituindo-o por branch
móvel.

O Windows/PDB ainda não tem upload de símbolos nativos suportado no fluxo adotado. Para falhas
Rust, use `error_code`, `stage`, versão/SHA e o diagnóstico local; não prometa stack nativa
totalmente simbolicada.

## 5. Dashboards

Crie estes dashboards nos dois projetos. Em produção, fixe `environment=production`; em dev,
`environment=development`.

O mesmo checkpoint pode existir nas duas bordas para diagnóstico (por exemplo, clique na UI e
entrada efetiva no motor). Para não contar duas vezes, use sempre a superfície canônica:

| Leitura                                                          | `surface` canônica |
| ---------------------------------------------------------------- | ------------------ |
| navegação, onboarding, check do OBS e atualização                | `desktop_ui`       |
| boot/encerramento, motor, destinos, live e diagnóstico exportado | `desktop_native`   |
| setup/OAuth                                                      | `setup_api`        |
| aquisição, rota, CTA e render do site                            | `marketing_site`   |

Ao investigar uma operação individual, remova esse filtro e compare as superfícies pelo mesmo
`operation_id`; em métricas agregadas, nunca some eventos homônimos de UI e motor.

### Saúde por release

- identificadores com inicialização observada: únicos `distinct_id` em `app_started`, por `app_version`;
- identificadores com exceção nativa observada: contagem e incidência na amostra definida abaixo;
- issues novos/regressões: Error Tracking, por `app_version` e `surface`;
- encerramentos não limpos: `app_started` com `previous_exit=unclean`.

Para **incidência observada de exceções nativas**, fixe a mesma janela, `app_version`,
`environment` e `surface=desktop_native` nas duas contagens:

- **N:** quantidade de `distinct_id` distintos com qualquer evento nativo recebido na janela,
  incluindo `$exception`;
- **E:** quantidade desses identificadores com pelo menos um `$exception` nativo recebido;
- mostre **E de N identificadores observados**. Se útil, apresente `E / N` como incidência na
  amostra; com `N=0`, mostre **sem dados**, nunca 0% de falhas.

Agregue diretamente os eventos pelo `distinct_id`, sem exigir a existência de person profiles.
Como exceções também entram em N, E é sempre um subconjunto de N. Não use apenas `app_started`
como denominador: uma inicialização pode ocorrer fora da janela ou não chegar ao operador.

Essa amostra não mede sessões, usuários reais, disponibilidade nem percentual sem crash. O
UUID persiste entre reinicializações; regenerá-lo ou recriar o estado local pode contar outro
identificador. Os controles são independentes: não aderir a uso ainda permite exceções e o
boot mínimo quando erros estão ativos; desligar erros impede observá-los mesmo que haja uso.
Perdas de entrega e versões com composição diferente de preferências também enviesam a amostra.
Além disso, `$exception` inclui falhas tratadas, não apenas crashes; um encerramento abrupto pode
nem gerar evento. Ausência de exceção recebida não comprova ausência de falha.

Use a contagem para priorizar triagem e verificar recorrência por versão, sempre expondo N,
janela e filtros. Não calcule `1 - E/N` como “sessões sem crash”, não derive SLA dessa medida e
não compare percentuais entre amostras como se fossem uma medida de confiabilidade da população.

### Confiabilidade da live

Eventos de uso descrevem somente a amostra que ativou essa finalidade. Não representam todas
as instalações e não podem ser reconstruídos com dados anteriores à adesão. Mostre volume,
janela e critérios de inclusão junto dos indicadores; não compare com a população de falhas
como se as duas amostras fossem iguais.

- funil `live_start_requested` → `live_start_completed` por `app_version`;
- `live_start_requested` por `platforms` e `mode`;
- `live_start_completed` por `encoder_kind`;
- `live_start_failed` por `stage`, `error_code` e `cancelled`;
- distribuição de `duration_bucket` até `live`;
- sessões com `target_state_changed` em `to=reconnecting`/`to=signal-lost`;
- duração até a primeira falha, sempre em buckets.

### Setup e ativação

O funil pode começar depois das primeiras etapas do onboarding, dependendo de quando houve
adesão. Ausência de uma etapa anterior não prova abandono. Não use exceções ou o marcador
mínimo de boot para reconstruir a navegação de quem não ativou uso.

- funil `onboarding_started` → `onboarding_completed` → `obs_check_completed(outcome=ok)` →
  `live_start_completed`;
- exportações de diagnóstico após `live_start_failed` ou `$exception`;
- atualização por `from_version`, `to_version` e `outcome`.

### Setup API/OAuth

- `api_request_completed` por `route_id`, `provider`, `status_class`, `error_code`;
- contagem e velocidade, por deploy, da soma sem duplicidade entre
  `api_request_completed(status_class=5xx)` e `$exception(surface=setup_api)`; falhas inesperadas
  retornam após emitir só a exceção. Não calcular taxa porque o MVP não captura respostas 2xx e,
  portanto, não tem denominador;
- duração por `duration_bucket`;
- `$exception` por `request_id`, `route_id` e `provider`.

Nunca adicione breakdown por UUID nem propriedades de cardinalidade livre.

## 6. Alertas

Configure notificações no canal operacional do projeto:

| Alerta                                                               | Janela/volume mínimo                                         | Severidade | Encerrar quando                                                             |
| -------------------------------------------------------------------- | ------------------------------------------------------------ | ---------- | --------------------------------------------------------------------------- |
| novo issue não tratado em produção                                   | imediato, ≥ 3 instalações                                    | S2         | issue triado e owner definido                                               |
| sucesso no início da live < 95%                                      | 1 h, ≥ 20 tentativas                                         | S1         | ≥ 95% por duas janelas                                                      |
| exceção nativa em ≥ 5 identificadores observados na mesma versão     | 24 h; limiar provisório, validar após baseline; exibir E e N | S2         | causa triada e correção validada; silêncio isolado não comprova recuperação |
| ≥ 5 falhas 5xx da setup API (`api_request_completed` + `$exception`) | 15 min; limiar provisório, validar após baseline             | S1         | zero por duas janelas                                                       |
| regressão na versão mais recente                                     | 1 h, ≥ 5 ocorrências                                         | S2         | rollback/fix confirmado                                                     |

Alertas de baixo volume são avaliados manualmente no review semanal, sem pager.
O alerta de exceção nativa usa E da definição acima, não uma taxa de sessões sem crash. O limiar
é de triagem e deve ser ajustado à amostra observada, sem prometer cobertura de quem desligou o envio.

## 7. Triagem de incidente

1. copie somente `error_id`, `operation_id` ou `request_id` informado pela pessoa;
2. procure o ID em Error Tracking/Event Explorer;
3. confirme projeto, `environment`, versão, SHA, `surface`, `stage` e `error_code`;
4. determine se é regressão da última release e marque owner/severidade;
5. peça **Exportar diagnóstico** apenas se o evento estruturado não bastar;
6. antes de compartilhar o arquivo, peça que a pessoa revise o conteúdo local;
7. não solicite stream key, token OAuth, mensagem de chat, configuração completa ou upload de log
   bruto;
8. anote resolução e condição de encerramento no issue, sem copiar dados do diagnóstico para o
   PostHog.

Se houver suspeita de PII/segredo:

1. defina `TELEMETRY_DISABLED=1` no Environment da release; o workflow alimenta e valida
   `VITE_TELEMETRY_DISABLED=1` e `TELEMETRY_DISABLED=1` e omite as credenciais de source maps;
2. crie uma drop rule no PostHog para o evento/propriedade afetado;
3. revogue o segredo exposto na origem;
4. elimine os eventos afetados e registre escopo/período;
5. trate como incidente de privacidade e avalie comunicação ao titular/ANPD;
6. só reative após teste ofensivo do redator e revisão de payload.

## 8. Solicitação de acesso/exclusão

O app mostra e permite copiar/regenerar o UUID de telemetria. A regeneração não apaga dados
anteriores.

Procedimento de exclusão:

1. valide a solicitação pelo canal publicado, sem pedir credenciais do app;
2. solicite o UUID antigo, registre protocolo e data;
3. nos projetos dev e prod, pesquise eventos pelo `distinct_id` exato, inclusive eventos
   server-side correlacionados; uma busca vazia em **Persons** não prova ausência de eventos;
4. quando houver pessoa associada, confirme o escopo dos identificadores antes de usar a
   [API administrativa de exclusão](https://posthog.com/docs/api/persons):
   `POST /api/projects/:project_id/persons/bulk_delete/`, com `distinct_ids` contendo somente o
   UUID solicitado, `delete_events=true` e `keep_person=false`. O UUID da Corneta é um
   `distinct_id`, não o `id` interno de uma pessoa. Não basta remover propriedades;
5. confira `persons_found`, `events_queued_for_deletion` e `deletion_errors`. HTTP 202 indica
   aceitação, não conclusão; `persons_found=0` não comprova exclusão de eventos sem perfil;
6. se não houver pessoa, se restarem eventos ou se o retorno não comprovar o enfileiramento
   esperado, escale ao operador para a rota de exclusão de eventos sem perfil. Não crie um
   perfil artificial nem declare o pedido concluído. A rota precisa ser comprovada com UUID
   sintético antes de fechar esse requisito no [checklist de publicação](PUBLICACAO.md);
7. acompanhe `GET /api/projects/:project_id/persons/deletion_status/` para tarefas enfileiradas
   e confirme o resultado por nova busca de eventos, conforme a
   [documentação de exclusão do PostHog](https://posthog.com/docs/privacy/data-storage).
   Registre evidência sem manter o UUID em planilha permanente;
8. só após a conclusão comprovada, confirme ao titular e recomende **Regenerar identificador**,
   com ambas as finalidades desligadas, antes de reativar a coleta;
9. no ensaio trimestral, cubra um UUID sintético novo sem perfil e um com perfil preexistente.
   Confirme que nenhuma busca de eventos encontra cada identificador após o processamento.

Personal API Keys de exclusão nunca entram no app, site, logs, respostas HTTP ou workflow de
release.

## 9. Rollout, revisão e rollback

- **dogfood:** projeto dev, equipe, dados sintéticos;
- **beta:** aviso explícito de uso opt-in, falhas opt-out e preservação das escolhas anteriores, até duas semanas de
  inspeção de payload e impacto, somente após revisão jurídica e configuração do operador;
- **produção:** somente após gate legal/técnico e dashboards úteis;
- **30 dias:** remover eventos sem decisão associada, revisar custo/cardinalidade e retenção;
- **trimestral:** revisar acessos/MFA, executar exclusão sintética e auditar políticas;
- **rollback:** kill switch ou build sem token/host; logs locais e diagnóstico estruturado permanecem ativos e separados.

O rollback é concluído somente quando uma instalação de teste com o novo build não abre conexão
para o PostHog e a live continua funcionando normalmente.
