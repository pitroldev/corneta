# Kick e YouTube "por padrão via nossa API": opções, trade-offs e recomendação

**Status:** decidido em 29/07/2026 — **Y1 + K3 + transversais**. Aplicado o que é código; ver
[Estado da aplicação](#estado-da-aplicação) no fim para o que resta e de quem depende.

**Atualizado em:** 29/07/2026

**Escopo:** como o login oficial de Kick e YouTube deve depender da setup API em
[`landing/`](../landing/). Complementa o [plano de backend](PLANO-BACKEND-NEXTJS-OAUTH.md), que
descreve o que está implementado; aqui estão os caminhos possíveis e o que cada um custa.

## A ambiguidade que trava a decisão

"OAuth via nossa API" tem dois sentidos, e eles pedem trabalhos muito diferentes:

| Sentido | O que passa pela nossa API | O que NÃO passa |
| --- | --- | --- |
| **Control plane** | quem está habilitado, qual Client ID usar, qual fluxo seguir | code, tokens, secret do usuário |
| **Data plane** | além do acima, o `code`, o `refresh_token` e a emissão de access tokens | — |

Hoje a **Kick é data plane** (o token endpoint dela exige Client Secret, então não há alternativa) e
o **YouTube é control plane** (o bootstrap entrega o Client ID e o desktop troca direto com o
Google). A pergunta real é se o YouTube deve virar data plane também.

Adianto a tese, desenvolvida no fim: **control plane é a meta; data plane é um custo que só a Kick
justifica.** Token transitando no nosso servidor não é um recurso, é uma dívida.

## Restrições que já foram verificadas

Nada aqui é suposição — cada linha foi checada na doc oficial ou por probe.

| Fato | Consequência |
| --- | --- |
| Twitch tem tipo de cliente **Public**: device flow sem secret em nenhum passo, nem no refresh | Twitch nunca precisa da nossa API pra autenticar. É o piso de comparação |
| Google device flow: `/device/code` é público, mas `client_secret` é **obrigatório** no polling do token (opcional só no refresh) | Device flow oficial exige secret no binário (extraível) ou um servidor |
| Google PKCE com cliente **Desktop**: `client_secret` é **opcional**, `code_verifier` faz a prova de posse | Existe caminho oficial sem secret algum |
| Kick exige `client_secret` no exchange **e** no refresh, e não documenta modo public client | Kick sem servidor é impossível |
| O Client ID do Google no `.env` aceita `/device/code` e o authorize com redirect loopback responde `Access blocked — Error 400: invalid_request` | É cliente TV/entrada limitada: serve BYOK, não serve PKCE |
| `dist/` contém só os Client IDs públicos; nenhum secret | O bundle está limpo hoje — mas nada verifica isso automaticamente |

## O gargalo que muda a ordem de tudo

Antes de comparar opções: **qualquer** fluxo oficial de YouTube — PKCE, device, brokerado ou não —
passa pela mesma porta do Google. O escopo `youtube` é sensível, então enquanto a tela de
consentimento não estiver verificada o app fica em modo **Testing**, com dois limites duros:

- no máximo **100 usuários de teste**, adicionados um a um;
- **refresh token expira em ~7 dias** — o streamer é deslogado no meio da semana.

O guia de BYOK dentro do app já avisa disso ao usuário. O ponto é que **escolher entre device
brokerado e PKCE direto não antecipa nem um dia** da liberação real: as duas opções destravam
juntas, quando a verificação sair. Isso desqualifica o argumento "o broker funciona hoje" —
funciona hoje para você testar, e BYOK já faz isso sem código novo.

## Opções para o YouTube

### Y1 — PKCE direto, nossa API como control plane (o que o código já faz)

O bootstrap entrega o Client ID de um cliente **Desktop**; o desktop abre o navegador, recebe o
`code` no loopback e troca direto com o Google usando `code_verifier`.

- **Custo de implementação:** zero. Está implementado, testado e é o que o commit `32cc304` fez.
- **O que falta:** um cliente OAuth do tipo "Aplicativo para computador" no Google Cloud. Cinco
  minutos no console — e é o único passo que eu não consigo executar.
- **Trade-off:** nossa API decide *se* e *com qual identidade* o login acontece, mas não vê token
  nenhum. Se a landing cair, quem já está logado continua logado e renovando (o refresh vai direto
  ao Google, e lá o secret é opcional).
- **Risco:** se o Google algum dia passar a exigir `client_secret` para clientes Desktop, este
  caminho quebra e vira Y3. Hoje a doc marca o campo como *Optional* — risco real, probabilidade
  baixa, e a saída existe.
- **Risco secundário:** o Client ID fica no binário. Qualquer um pode rodar um consentimento
  branded como Corneta e queimar a nossa cota. **Isso vale igual para a Twitch hoje** e é inerente a
  cliente público — nenhuma opção abaixo elimina, então não é critério de escolha.

### Y2 — Device flow brokerado (a forma da Kick aplicada ao YouTube)

Nossa API guarda o secret do cliente TV que já existe e expõe `/api/v1/oauth/youtube/device/start`,
`/poll` e `/refresh`. O desktop mostra o código e faz polling contra nós.

- **Custo:** três endpoints novos, o loop de polling de volta no Rust, e rate limit para um endpoint
  que por natureza é chamado a cada 5 segundos por sessão de login.
- **Ganho real:** funciona **hoje**, sem criar nada no Google — basta descomentar
  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` no `.env`, que ficam server-side.
- **Trade-off:** access e refresh tokens do YouTube passam a transitar pelo nosso servidor, em toda
  renovação, para sempre. É exatamente o que o refactor removeu de propósito.
- **Risco alto — continuidade:** o refresh depende da nossa API. Se ela estiver fora quando o access
  token vencer (~1h), o envio e a moderação do YouTube param **no meio da live**. Deixa de valer o
  critério de aceite "indisponibilizar a landing não interrompe uma live já autenticada".
- **Risco de review:** escolher o fluxo de TV para um app de desktop é uma escolha que a verificação
  do Google pode questionar, já que a recomendação dela para apps instalados é PKCE loopback.
- **Risco de descarte:** quando o cliente Desktop existir, esses endpoints viram código morto — e
  código morto que carrega secret é o pior tipo.

### Y3 — PKCE com o exchange brokerado

O desktop faz PKCE e o callback loopback, mas manda `code` + `code_verifier` para a nossa API, que
troca com o Google e devolve os tokens. Igual à Kick, mas sem necessidade do secret.

- **Custo:** dois endpoints, e ainda precisa do cliente Desktop (mesma dependência do Y1).
- **Trade-off:** paga o preço do data plane sem comprar nada — o PKCE já dispensa secret, então não
  há segredo a proteger no servidor.
- **Onde faria sentido:** se um dia existir "conta Corneta" e a gente quiser um ponto único de
  auditoria/revogação. Aí o exchange centralizado é meio caminho. Hoje não existe esse produto.
- **Risco:** mesma dependência de continuidade do Y2, sem o ganho de destravar nada antes.

### Y4 — Híbrido: PKCE quando houver cliente Desktop, device brokerado quando não

O bootstrap já publica um campo `flow`; o Rust passaria a obedecê-lo (`direct-pkce` ou
`brokered-device`).

- **Custo:** tudo do Y2, mais a matriz de teste dobrada (dois caminhos oficiais + BYOK = três modos
  por plataforma).
- **Trade-off:** liga o oficial hoje e migra sozinho depois. Parece o melhor dos mundos.
- **Risco:** é o clássico "temporário que fica". O caminho brokerado nasce marcado para morrer, e
  caminho que ninguém quer manter é onde bug de auth se esconde. Some com o benefício assim que se
  aceita que a verificação do Google, e não o código, é o gargalo.

### Y5 — Não ter fluxo oficial: só BYOK (o estado efetivo de hoje)

- **Custo:** zero.
- **Trade-off:** contraria a promessa do produto — "o usuário não precisa criar aplicação, cadastrar
  redirect URI ou copiar Client ID". Cada streamer teria que passar pelo Google Cloud Console.
- **Risco:** taxa de abandono no onboarding. Mas note: **é o estado atual**, e é aceitável como
  ponte enquanto a verificação não sai, porque o BYOK já está pronto e documentado no app.

## Opções para a Kick

### K1 — Broker (o que existe)

Exchange e refresh nos route handlers, secret só no servidor.

- **Trade-off:** é a única forma possível. A Kick exige o secret nos dois passos.
- **Risco de continuidade:** igual ao descrito no Y2, e aqui **não é evitável** — se a nossa API
  estiver fora quando o token da Kick vencer, o envio para na live. Mitigação real: renovar de forma
  proativa antes de ir ao ar, em vez de renovar sob demanda no primeiro 401.
- **Risco operacional:** o rate limit é em memória e por instância. Com duas instâncias atrás de um
  load balancer ele deixa de valer.

### K2 — Só BYOK para a Kick

- **Trade-off:** zero dependência de servidor. O portal de dev da Kick é self-serve, sem revisão, o
  que torna isso menos absurdo do que no Google.
- **Risco:** o usuário precisa cadastrar `http://localhost:7395/callback` exatamente. É o tipo de
  passo que gera suporte, e contraria a mesma promessa do Y5.

### K3 — Broker com BYOK disponível nas avançadas (o que existe hoje, de fato)

- **Trade-off:** o padrão é oficial; quem quiser separar cota ou não depender de nós tem saída.
- **Risco:** nenhum novo. É estritamente melhor que K1 ou K2 isolados.

## Decisões transversais (valem para qualquer opção acima)

| # | Decisão | Por que não dá pra postergar |
| --- | --- | --- |
| T1 | **Publicar a setup API em HTTPS** e preencher `VITE_SETUP_API_URL` | Em build de release o desktop recusa setup API HTTP fora de loopback. Sem deploy, **nenhuma** opção é "por padrão via nossa API" fora do seu dev |
| T2 | **Oficial é o padrão; BYOK só por escolha explícita** | É o comportamento atual após o fix de hoje. Falta travar com teste para não regredir |
| T3 | **Degradação honesta quando a nossa API está fora** | O `authStatus` já devolve `brokerError`; a UI ainda não mostra. Hoje o streamer vê "indisponível" sem saber que o problema é nosso |
| T4 | **Scan de secret no `check-bundle.mjs`** | O critério de aceite diz que secret nunca entra no bundle. Hoje isso é disciplina, não teste — basta um prefixo `VITE_` por engano |
| T5 | **Rate limit distribuído antes de escalar horizontal** | Já está no plano; vira urgente no dia do deploy com réplica |

## Descartadas por não serem sãs

| Ideia | Por que não |
| --- | --- |
| Embutir o secret do Google (cliente TV) no binário | O Google tolera no modelo de ameaça, mas o ganho é zero frente ao Y1: mesma capacidade, sem nada pra vazar. E rotação exigiria build novo para todos |
| Embutir o secret da Kick no binário | Ali o secret é load-bearing de verdade: quem tiver ele se autentica como Corneta na API da Kick, inclusive renovando tokens |
| Proxy genérico "passa tudo pela nossa API" | Transforma o control plane num data plane para vídeo/chat/API, com custo de banda e responsabilidade de log sobre conteúdo de terceiros |

## Recomendação

**Y1 + K3 + as cinco transversais. Não construir Y2, Y3 nem Y4.**

O raciocínio em uma frase: as duas plataformas ficam "por padrão via nossa API" no sentido que
importa — nossa API decide quem está habilitado e com qual identidade, e o usuário nunca cola
credencial — e só a Kick paga o preço de ver token, porque só ela obriga.

Ordem de execução, do que destrava mais para o que destrava menos:

1. **Deploy da setup API em HTTPS** + `VITE_SETUP_API_URL` no build (T1). Sem isso o resto é teoria:
   em release, hoje, o login oficial não existe para ninguém.
2. **Criar o cliente OAuth "Aplicativo para computador"** e pôr o ID em `VITE_GOOGLE_CLIENT_ID`. O
   Y1 liga sozinho — o código já está pronto — e o bootstrap passa a publicar
   `youtube.enabled: true`.
3. **Iniciar a verificação da tela de consentimento** do Google no mesmo dia. É o item de maior lead
   time do projeto inteiro e não depende de nenhuma decisão de arquitetura. Enquanto não sair, o
   YouTube oficial serve até 100 contas de teste com refresh de 7 dias, e o BYOK segue como
   contingência documentada dentro do app.
4. **Kick: renovar de forma proativa** antes de ir ao ar, em vez de sob demanda no 401 (K1). Fecha o
   único risco que a arquitetura da Kick não permite eliminar.
5. **Travar T2 com teste, ligar T3 na UI, T4 no `check-bundle`.** São mudanças pequenas e evitam
   regressão exatamente nas duas coisas que já quebraram uma vez: o fluxo sumindo e o segredo
   escapando.

O que **não** fazer, explicitamente: não escrever os endpoints de device brokerado para "adiantar" o
YouTube. Eles não adiantam a liberação real, criam dependência da nossa API para renovar token no
meio da live e nascem para ser deletados. Se a verificação do Google atrasar e você precisar de
usuários reais no YouTube antes disso, o caminho é BYOK — que já existe, já está documentado na UI e
não custa código nenhum.

## Estado da aplicação

O que já está no código, com o teste que impede a regressão:

| Item | Estado | O que trava |
| --- | --- | --- |
| **Y1** — oficial do YouTube é PKCE sem secret | aplicado | `oficial_do_youtube_nunca_manda_client_secret` — os forms de token viraram funções puras e o teste barra alguém acrescentar `client_secret` no oficial pra "consertar" um `invalid_client` |
| **K3** — Kick brokerada por padrão, BYOK nas avançadas | aplicado | `kick_official_needs_the_broker` + `oficial_e_o_padrao_sem_escolha_explicita` |
| **T2** — oficial é o padrão; BYOK só por escolha explícita | aplicado | `oficial_e_o_padrao_sem_escolha_explicita`, e a troca de modo recusa quando o outro modo não existe |
| **T3** — degradação honesta com a nossa API fora | aplicado | a aba Conta mostra o motivo vindo de `brokerError`, em vez de esconder o login sem explicação |
| **T4** — nenhum secret no bundle | aplicado | `scripts/check-bundle.mjs` falha o `pnpm check:app`; verificado plantando um vazamento de propósito (var do `.env` e padrão `GOCSPX-`) |
| **Item 4** — refresh proativo da Kick antes de ir ao ar | aplicado | `warm_kick_session` no `start_engine`, destacado do caminho crítico do BORA |
| **Y2/Y3/Y4 não construídos** | por decisão | a `landing/` só expõe `bootstrap`, `health` e os dois endpoints da Kick — nenhuma rota de YouTube |

O que **não** é código e continua aberto:

| Item | Depende de | Por que é o gargalo |
| --- | --- | --- |
| **T1** — setup API em HTTPS + `VITE_SETUP_API_URL` | deploy | Em release o desktop recusa setup API HTTP fora de loopback. Sem isso, hoje, o login oficial não existe pra ninguém fora do seu dev |
| **Cliente OAuth "Aplicativo para computador"** | Google Cloud Console | Liga o Y1 sozinho — o código já está pronto e o bootstrap passa a publicar `youtube.enabled: true` |
| **Verificação da tela de consentimento** | fila do Google | Maior lead time do projeto. Até sair: 100 contas de teste e refresh de 7 dias, com BYOK como contingência |
| **T5** — rate limit distribuído | infra (Redis/KV) | O atual é em memória e por instância; deixa de valer no dia da segunda réplica |

## Se a decisão for outra

Dois gatilhos que legitimamente mudam a recomendação:

- **O Google recusar o cliente Desktop ou exigir secret no exchange.** Aí Y1 morre e Y3 é o
  substituto natural: mantém PKCE e move só a troca para o servidor.
- **Nascer uma "conta Corneta"** com login próprio. Aí o data plane deixa de ser só custo — vira o
  lugar de auditar e revogar sessão, e Y3 passa a valer para as três plataformas.
