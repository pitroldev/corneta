# Configuração: desenvolvimento, distribuição oficial e forks

Referência da linha 0.7.0. Não é necessário possuir credenciais do mantenedor para contribuir. Exemplos sem valores reais: [raiz](../.env.example) e [site/API](../web/.env.example). Superfícies e limitações: [rede e integrações](SUPERFICIE-DE-REDE.md).

## Escolha o perfil antes de configurar

| Objetivo                                                       | Comandos/perfil                                  | Credenciais e serviços                                                                                                                     |
| -------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Experimentar telas com dados fictícios                         | `pnpm contrib:demo`                              | Sem `.env`, OBS, Rust ou OAuth. Não transmite.                                                                                             |
| Desenvolver site ou executar checks                            | `pnpm contrib:web`, `pnpm contrib:check`         | Ambiente filtrado; telemetria desligada. Não exige secrets de produção.                                                                    |
| Desenvolver o desktop nativo                                   | `pnpm contrib:app:dev`, `pnpm contrib:app:build` | Identificador/cofre próprios, sem updater, instalador ou telemetria. Exige toolchain/sidecars; não usar simultaneamente com uma live real. |
| Testar integrações reais sob responsabilidade do desenvolvedor | `pnpm app:dev` + `pnpm web:dev`                  | Credenciais próprias conforme recurso desejado; o wrapper oficial pode carregar o `.env` da raiz.                                          |
| Distribuir a Corneta oficial                                   | `pnpm app:build` e gates de release              | Infraestrutura, chaves e revisões do mantenedor. Um build não equivale a autorização para publicar.                                        |
| Distribuir outro produto/fork                                  | Ainda não há perfil white-label completo         | Exige identidade, endpoints, políticas e credenciais próprios; ver limitações abaixo.                                                      |

O perfil contributor usa [`scripts/contributor.mjs`](../scripts/contributor.mjs) e [`tauri.contributor.conf.json`](../src-tauri/tauri.contributor.conf.json). Não lê o `.env` da raiz e recusa executar o site se houver arquivos `.env*` reais em `web/`, porque o Next também possui carregamento automático. Use um clone/worktree limpo; não apague arquivos pessoais para satisfazer o comando. Os arquivos `.env.example` são permitidos.

Esse perfil não é sandbox: portar o mesmo código para uma identidade separada não isola portas, OBS, dispositivos, atalhos nem acesso a arquivos selecionados pelo usuário. Tampouco torna uma integração externa em um serviço local.

## Quem carrega cada arquivo

| Consumidor             | Entrada e momento                                                          | Precedência/exposição                                                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/with-env.mjs` | `.env` da raiz, ao executar `app:dev`/`app:build`                          | Ambiente herdado vence, inclusive valor vazio. Valores do arquivo vão somente para o ambiente do filho, incluindo segredos. Não modifica `process.env` do launcher.           |
| Vite desktop           | Arquivos dotenv do Vite, quando não é contributor; build/dev               | Expõe `VITE_*` e `TAURI_ENV_*` no frontend. Tudo nesses prefixos deve ser público. O arquivo raiz não é um cofre.                                                             |
| `src-tauri/build.rs`   | `.env` da raiz no build nativo não contributor                             | Lê apenas `POSTHOG_DESKTOP_TOKEN`, `POSTHOG_HOST`, `TELEMETRY_DISABLED`, `CORNETA_BUILD_SHA`; ambiente presente vence. Esses valores públicos podem ser embutidos no binário. |
| Next site/API          | Arquivos dotenv em `web/` e ambiente do processo                           | `NEXT_PUBLIC_*` pode ser incorporado no bundle do navegador; variáveis sem esse prefixo continuam disponíveis ao código servidor.                                             |
| `web/next.config.ts`   | Adicionalmente lê `.env` da raiz apenas no desenvolvimento não contributor | Usa `process.loadEnvFile`, sem sobrescrever variáveis já carregadas. No deploy, forneça a configuração ao servidor; não conte com o arquivo pessoal da raiz.                  |
| Gates de publicação/CI | Ambiente explicitamente fornecido pelo runner                              | Secrets restritos ao job necessário; não disponibilizar chaves oficiais a código não confiável de PR.                                                                         |
| Aplicativo instalado   | Configuração do app + cofre nativo                                         | Não depende do `.env` do repositório. Os tokens OAuth/stream keys do usuário não são variáveis públicas de build.                                                             |

Mantenha valores de servidor em `web/.env.local` no desenvolvimento, se possível, para evitar sua propagação aos subprocessos de build desktop. Preencha um único local por variável; conflitos entre arquivos tornam diagnóstico desnecessariamente difícil. `contrib:*` deve ser executado sem esses arquivos do site.

### Contrato de parsing

O wrapper usa `node:util.parseEnv` no Node fixado pelo projeto. Aceita aspas simples/duplas, comentários, espaços, prefixo `export`, valores vazios e valores multiline entre aspas. Não interpreta os valores como comandos. A sintaxe de aspas/comentários segue a [especificação dotenv do Node](https://nodejs.org/docs/latest-v24.x/api/environment_variables.html#dotenv).

Regras adicionais testadas em [`with-env.test.mjs`](../scripts/with-env.test.mjs):

- O ambiente herdado vence inclusive quando contém `VAR=`; Windows compara nomes sem diferenciar maiúsculas/minúsculas.
- Entradas repetidas seguem o parser nativo; evite duplicatas. `with-env` não faz expansão de `$VAR`, `${VAR}`, `%VAR%` ou substituição de comandos.
- A ausência do arquivo é normal em CI. Erros de permissão/leitura interrompem o comando, com mensagem que não imprime conteúdo, valores ou caminhos privados.
- O loader Rust **não é um parser dotenv completo**: trabalha linha a linha, descarta valores vazios, não suporta `export`/multiline nem remove comentários no final da linha. Para as quatro variáveis públicas compartilhadas com Rust, use `NOME=valor` simples, sem comentários inline, expansão, duplicatas ou multiline. Comentários devem ocupar uma linha própria.
- Uma senha vazia `TAURI_SIGNING_PRIVATE_KEY_PASSWORD=` é preservada pelo wrapper. Não confundir vazio intencional com variável ausente.

`with-env` executa o filho com `shell: false`: argumentos com espaços, aspas, `&`, `|`, `$` ou `%` permanecem argumentos. `tauri`/`tauri.cmd` são resolvidos para a entrada JavaScript instalada e executados pelo mesmo Node do launcher. Outros `.cmd`/`.bat` no Windows não são suportados: use um executável nativo ou `node caminho/cli.js`. Não passe uma linha composta como `"comando && outro"`.

Isso não impede que um programa explicitamente chamado interprete os próprios argumentos como código. Execute somente ferramentas confiáveis: elas e seus subprocessos recebem os segredos carregados. O isolamento sem credenciais pertence ao perfil contributor; a defesa contra inclusão em artefatos também depende das allowlists e de `bundle:check`/`artifacts:check`.

## Matriz de variáveis

“Pública” significa adequada para o cliente conhecer, não permissão para publicar credenciais pessoais. Valores de exemplo são estruturais ou vazios; não use identificadores de fixtures como credenciais reais.

### OAuth e identidade do site

| Variável                                             | Consumidor/momento            | Classificação                    | Quando configurar/exemplo seguro                                                                                                                                |
| ---------------------------------------------------- | ----------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_TWITCH_CLIENT_ID`                              | Desktop, build                | Pública                          | OAuth Twitch direto; vazio desabilita a credencial embutida. Tipo de cliente público.                                                                           |
| `TWITCH_CLIENT_ID`                                   | Bootstrap API, request        | Pública                          | Nome preferencial do servidor; fallback em `VITE_TWITCH_CLIENT_ID`. Não há secret Twitch exigido pelo fluxo público atual.                                      |
| `VITE_GOOGLE_CLIENT_ID`                              | Desktop, build                | Pública                          | Cliente Google do tipo desktop para PKCE direto.                                                                                                                |
| `GOOGLE_CLIENT_ID`                                   | Bootstrap API, request        | Pública                          | Preferencial no servidor; fallbacks `YOUTUBE_CLIENT_ID` e `VITE_GOOGLE_CLIENT_ID`. Use o mesmo cliente desktop oficial.                                         |
| `YOUTUBE_CLIENT_ID`                                  | Bootstrap API, request        | Pública                          | Alias de compatibilidade; prefira `GOOGLE_CLIENT_ID`, não defina valores conflitantes.                                                                          |
| `VITE_KICK_CLIENT_ID`                                | Desktop, build                | Pública                          | Cliente Kick oficial; não basta para habilitar o broker sem servidor configurado.                                                                               |
| `KICK_CLIENT_ID`                                     | Bootstrap/broker API, request | Pública                          | Preferencial do servidor; fallback em `VITE_KICK_CLIENT_ID`. Deve corresponder ao secret.                                                                       |
| `KICK_CLIENT_SECRET`                                 | Broker API, request           | **Secreta, servidor**            | Necessária para troca/refresh oficiais Kick. Nunca `VITE_*`/`NEXT_PUBLIC_*`. Localmente pode ficar em `web/.env.local`.                                         |
| `KICK_REDIRECT_URIS`                                 | Broker API, request           | Pública, sensível à configuração | Lista exata de callbacks permitidos. Padrão `http://localhost:7395/callback`; gate oficial só permite esse endereço e a variante `127.0.0.1`. Não use wildcard. |
| `VITE_SETUP_API_URL`                                 | Desktop, build                | Pública                          | Em dev vazio usa `http://localhost:7390`; release requer configuração HTTPS para o login intermediado. Oficial: `https://www.corneta.live`.                     |
| `NEXT_PUBLIC_SITE_URL`                               | Site, build                   | Pública                          | Builds de produção atuais exigem `https://www.corneta.live`, inclusive para metadados. Não existe autodetecção segura de domínio de fork.                       |
| `NEXT_PUBLIC_PRIMARY_CTA_URL`                        | Site, build                   | Pública                          | URL do instalador oficial em GitHub Releases. Placeholder de exemplo não é download publicado.                                                                  |
| `GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION` | Site, render/build            | Públicas                         | Tokens de verificação de propriedade de domínio; opcionais no desenvolvimento. Não são OAuth.                                                                   |

Credenciais **BYOK** do Google/Kick são introduzidas nas configurações avançadas do app e armazenadas no cofre nativo, não devem ser transformadas em `VITE_*_SECRET`. O Google BYOK usa o fluxo legado para TVs/dispositivos de entrada limitada; não é intercambiável com o cliente desktop do fluxo oficial. Tokens de acesso/refresh, senha do OBS, API key opcional de leitura YouTube e stream keys pertencem ao usuário; não devem ir para exemplos, fixtures, screenshots ou commits reais.

### Proteção da Setup API

| Variável                                        | Consumidor/momento    | Classificação             | Quando configurar/exemplo seguro                                                                                                   |
| ----------------------------------------------- | --------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `OAUTH_TRUSTED_IP_HEADER`                       | Rate limiter, request | Configuração de confiança | Self-host: nome do header que o proxy **sobrescreve**, nunca concatena. O Next não pode estar acessível diretamente pela Internet. |
| `CORNETA_RELEASE_CHECK`                         | Next build/gates      | Controle público          | `1` ativa os gates oficiais fora da Vercel; não usar `0` para fingir que um deploy incompleto está pronto.                         |
| `VERCEL`, `VERCEL_ENV`, `VERCEL_GIT_COMMIT_SHA` | Infraestrutura/Next   | Metadados do deploy       | Fornecidos pela plataforma; produção ativa gates. Não simular esses valores para contornar segurança.                              |

O limitador usa memória local em todos os ambientes, com até 10.000 entradas por instância. Cada origem tem contadores independentes por rota: 20 exchanges e 60 refreshes por janela fixa de 60 segundos. IPv6 é agrupado por /64; sem IP confiável, as requisições compartilham a origem `unknown` da respectiva rota. Na Vercel, o header de origem é selecionado automaticamente; em self-host, preserve a fronteira de proxy descrita na tabela.

As chaves do cache são derivadas por HMAC-SHA256 com uma chave aleatória de 32 bytes, criada na inicialização do limitador e mantida somente no processo. Não há segredo configurável nem armazenamento remoto para esses contadores. Tokens OAuth não entram no cache: o broker os manipula transitoriamente para responder ao desktop. Ao atingir o limite, responde `429`/`Retry-After`; sem espaço para uma nova entrada, responde `503`/`Retry-After`, sem expulsar contadores ativos.

**O limite não é compartilhado entre instâncias.** Reiniciar ou escalar cria novos contadores; a memória local não estabelece uma quota global nem um teto de custo. Uma proteção compartilhada antes das instâncias depende de WAF/edge configurado no host, com escopo e comportamento verificados. O [guia de publicação](PUBLICACAO.md) descreve a cobertura das rotas Kick e os ensaios; nenhuma variável de ambiente comprova que essa proteção esteja ativa.

### Telemetria e identidade dos artefatos

| Variável                                                                          | Consumidor/momento                                  | Classificação                               | Quando configurar/exemplo seguro                                                                                                         |
| --------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_POSTHOG_TOKEN`, `VITE_POSTHOG_HOST`                                         | Frontend desktop, build                             | Públicas                                    | Project token de ingestão e origem; vazio torna a integração indisponível/no-op. Não usar Personal API Key.                              |
| `POSTHOG_DESKTOP_TOKEN`, `POSTHOG_HOST`                                           | Rust, build; host também usado pelo servidor/plugin | Públicas                                    | Allowlist do `build.rs`; na release oficial alinhar token/host entre superfícies.                                                        |
| `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, `NEXT_PUBLIC_POSTHOG_HOST`                   | Site browser, build                                 | Públicas                                    | Token de ingestão do site; o host oficial atual é `https://us.i.posthog.com`.                                                            |
| `POSTHOG_PROJECT_TOKEN`                                                           | Telemetria da API, servidor                         | Pública para ingestão, mantida no servidor  | Preferencial servidor; fallback em `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`.                                                                  |
| `VITE_TELEMETRY_DISABLED`, `TELEMETRY_DISABLED`, `NEXT_PUBLIC_TELEMETRY_DISABLED` | Respectivos consumidores, build/servidor            | Controles públicos                          | `1` desliga a superfície. Perfil contributor força desativação; não redefine consentimentos do usuário.                                  |
| `VITE_BUILD_SHA`, `CORNETA_BUILD_SHA`, `NEXT_PUBLIC_BUILD_SHA`, `BUILD_SHA`       | Desktop frontend/Rust/site/API                      | Públicos                                    | SHA completo do commit; release oficial exige identidade coerente.                                                                       |
| `NEXT_PUBLIC_DEPLOYMENT_ENV`, `POSTHOG_ENVIRONMENT`                               | Site/API                                            | Públicos                                    | `development` em testes locais; metadados do ambiente, não credenciais.                                                                  |
| `POSTHOG_API_KEY` / `POSTHOG_CLI_API_KEY`, `POSTHOG_PROJECT_ID`                   | Plugin de source maps e gate, build/CI              | **Chave secreta**; ID é metadado do projeto | Apenas jobs autorizados de publicação. Não embutir, logar nem prefixar com `VITE_`/`NEXT_PUBLIC_`.                                       |
| `REQUIRE_POSTHOG_SOURCE_MAPS`, `POSTHOG_CLI_DRY_RUN`, `POSTHOG_CLI_BINARY_PATH`   | Vite/plugin, build                                  | Controles da ferramenta                     | Gate oficial exige upload real quando ativo; caminho do CLI deve apontar para ferramenta confiável. Não são opções para usuários do app. |
| `NEXT_TELEMETRY_DISABLED`                                                         | Ferramenta Next                                     | Controle da ferramenta                      | `1` desliga telemetria da ferramenta Next; não substitui os kill switches da Corneta.                                                    |

A política desktop implementada é **opt-out**: `unset` está ativo quando há configuração válida, separadamente para uso e falhas. Não chamar isso de opt-in. Consulte [política de telemetria](LGPD-LEGITIMO-INTERESSE-TELEMETRIA.md) e [runbook PostHog](RUNBOOK-POSTHOG.md); a documentação técnica não certifica base legal.

### Build e assinatura

| Variável                                  | Consumidor/momento                | Classificação                    | Quando configurar/exemplo seguro                                                                           |
| ----------------------------------------- | --------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`               | Tauri, empacotamento/updater      | **Secreta**                      | Só publicação assinada sob sua responsabilidade. Não necessária em `contrib:app:build`.                    |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`      | Tauri, empacotamento              | **Secreta**                      | Senha da chave; vazio explícito é permitido se a chave foi gerada sem senha.                               |
| `RUSTC_WRAPPER`                           | Cargo                             | Configuração da ferramenta       | Valor explícito vence, inclusive vazio. Sem valor configurado, wrapper detecta `sccache` com prazo de 3 s. |
| `CORNETA_CONTRIBUTOR`, `VITE_CONTRIBUTOR` | Launchers/build/app               | Controles internos               | Use os comandos `contrib:*`; setar só uma flag manualmente não reproduz o isolamento completo.             |
| `CARGO_TARGET_DIR`, `NEXT_DIST_DIR`       | Compilação                        | Caminhos locais                  | Contributor separa artefatos Rust; diretórios de saída não devem apontar para arquivos pessoais.           |
| `TAURI_DEV_HOST`, `TAURI_ENV_*`           | Tauri/Vite, desenvolvimento/build | Controles públicos da ferramenta | Prefixo `TAURI_ENV_*` também é exposto no frontend. Alterar host de dev pode expor o servidor à rede.      |

Assinatura do updater e certificado Authenticode são mecanismos distintos. Consulte a [política de assinatura](ASSINATURA.md) e os [gates de release](GATES-DE-RELEASE.md), sem compartilhar chaves do mantenedor com um fork.

## Fork/self-host: limite declarado, não atalho de segurança

Há um perfil contributor utilizável, mas **ainda não há distribuição white-label pronta só com variáveis**. Domínio/canonical de produção, links de download, gates do backend, identificador/publisher e updater continuam protegendo a distribuição oficial. Um build contributor do site não é aprovação para hospedar uma cópia pública.

Antes de distribuir um fork, o responsável precisa implementar/revisar em conjunto:

1. Nome, marca, identificador do app, namespace do cofre e diretórios de dados próprios; não assumir identidade do mantenedor.
2. Domínio/canonical, repositório de releases, allowlist de downloads, API e callbacks próprios em configuração explícita, preservando as restrições oficiais.
3. Apps OAuth próprios; Kick secret apenas no seu servidor. Google/Twitch usam IDs públicos, mas quotas, verificações e disponibilidade pertencem ao seu registro.
4. Chave do updater e endpoint próprios; não deixar um fork buscar atualizações ou dados de telemetria do projeto original.
5. Analytics inicialmente desligado no fork até haver configuração e informação adequadas ao seu público; tokens de testes não devem alimentar produção.
6. Limites locais e proteção WAF/edge verificada, proxy HTTPS, política de privacidade, retenção, canal de segurança e licenças/source packs dos binários sob sua responsabilidade.

Arquivos que delimitam isso: [`site.ts`](../web/lib/site.ts), [`download.ts`](../web/lib/download.ts), [`release-config.ts`](../web/lib/server/release-config.ts), [`tauri.conf.json`](../src-tauri/tauri.conf.json), [`keys.rs`](../src-tauri/src/keys.rs) e [`contributor.mjs`](../scripts/contributor.mjs). Não remova uma validação global nem troque o host oficial às escondidas para fazer um fork passar.

## Validar sem expor valores

- Execute os testes de `scripts/with-env.test.mjs` e `scripts/contributor.test.mjs` com o Node fixado; o primeiro usa apenas strings fictícias e não abre o `.env` real.
- Rode `pnpm contrib:check` para a trilha sem credenciais. Para integração real, confira somente presença/ausência e resultado do fluxo, nunca despeje `process.env`.
- Em publicação, rode os gates existentes de bundle, artefatos, telemetria e compliance. Um teste de parsing não prova ausência de segredos no histórico ou em um instalador.
- Revalide este documento ao adicionar variáveis, consumidores ou aliases; atualize os exemplos e os testes no mesmo PR.
