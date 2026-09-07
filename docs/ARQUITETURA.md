# Arquitetura: onde uma mudança pertence

Referência: linha 0.7.0. Este mapa descreve responsabilidades e contratos de implementação.

```text
OBS → ingestão local (MediaMTX) → programa da live → destinos
                                    │                ├─ cópia
                                    │                └─ rendições/encode compartilhável
                                    ├─ gravação local (filho isolado)
                                    └─ métricas/eventos → sessão NDJSON

React ↔ API/IPC Tauri ↔ comandos Rust ↔ runtimes e provedores
Relatórios: leitura local → worker de análise → hooks/modelos → replay/chat/UI
Site/API Next.js: setup/OAuth/manifestos, não transporte da live
```

## Mapa para revisão

| Responsabilidade                                 | Entrada e testes próximos                                                                                                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registro de IPC, janelas, bandeja e encerramento | [lib.rs](../src-tauri/src/lib.rs), [commands.rs](../src-tauri/src/commands.rs).                                                                                                 |
| Presets, argumentos de mídia, estado do motor    | [engine.rs](../src-tauri/src/engine.rs), [engine_policy.rs](../src-tauri/src/engine_policy.rs); testes nos módulos.                                                             |
| Reuso de codificação e programa                  | [renditions.rs](../src-tauri/src/renditions.rs), [compositor.rs](../src-tauri/src/compositor.rs), [splicer.rs](../src-tauri/src/splicer.rs).                                    |
| Gravação isolada                                 | [recorder](../src-tauri/src/recorder/): domínio puro, disco, FFmpeg e testes separados.                                                                                         |
| Relatórios e retenção                            | [session](../src-tauri/src/session/): domínio, armazenamento, operações e testes.                                                                                               |
| Auth/cofre, chat e recursos                      | [auth.rs](../src-tauri/src/auth.rs), [keys.rs](../src-tauri/src/keys.rs), [chat.rs](../src-tauri/src/chat.rs), [resources.rs](../src-tauri/src/resources.rs).                   |
| Fronteira desktop/browser                        | [api.ts](../src/lib/api.ts): fachada de seleção; [api/](../src/lib/api/) separa contrato, ambiente, IPC e demonstração.                                                         |
| Estado compartilhado do frontend                 | [store.ts](../src/lib/store.ts): composição e persistência; [store/](../src/lib/store/) contém tipos e slices de OAuth, chat e navegação.                                       |
| Chat e configurações                             | [ChatScreen.tsx](../src/screens/ChatScreen.tsx), [chat/](../src/screens/chat/), [SettingsScreen.tsx](../src/screens/SettingsScreen.tsx), [settings/](../src/screens/settings/). |
| Relatório no frontend                            | [report.ts](../src/lib/report.ts), [report.worker.ts](../src/lib/report.worker.ts), [reports](../src/screens/reports/), testes `report*` e `replay*`.                           |
| Site e setup                                     | [web/app/api](../web/app/api/), [web/lib/server](../web/lib/server/), testes próximos dos contratos.                                                                            |
| Ferramentas de contribuição                      | [contributor.mjs](../scripts/contributor.mjs), [with-env.mjs](../scripts/with-env.mjs), [segurança das fixtures](../scripts/report-fixture-safety.mjs).                         |

## Propriedade e encerramento

`AppState` mantém os runtimes; `EngineRuntime` possui os handles de MediaMTX/FFmpeg, snapshot, flags e geração do start. O claim de uma sessão acontece sob lock antes do trabalho lento; a geração impede que setup cancelado instale processos de uma tentativa antiga. Não substituir isso por um estado visual de “iniciando”.

Supervisores observam flags de execução/pausa/erro terminal. O caminho de encerramento centraliza o término das árvores de processos, incluindo gravador. Fechar para a bandeja não significa parar a live. Erros de gravação/disco não devem promover a transmissão inteira a erro: a prioridade é transmissão, relatório, chat gravado e vídeo, nessa ordem.

Ao revisar código assíncrono, confira duração de locks, cancelamento após cada operação demorada, limites de filas, espera de filhos e quem possui o handle. Não segure `Mutex` enquanto faz rede/disco lento sem necessidade demonstrada; não introduza tarefa sem dono que sobreviva ao encerramento.

## Persistência, memória e interface

A sessão atual usa schema 4, relatórios limitados a 32 MiB e chat a 16 MiB, com retenção oficial de 50 sessões. A listagem lê caudas limitadas; vídeo é um arquivo separado. O perfil Contributor não poda diretórios de gravação externos. Constantes e testes em `session/domain.rs` são a referência executável, não aumente os limites só para esconder um caso de carga.

O frontend carrega telas/módulos sob demanda. O worker retira parsing/análise pesada do fluxo de interação; replay separa relógio, segmentos e paginação de chat. Um marcador não deve invalidar a página inteira nem recriar o player. Preserve buffers transferíveis, listas limitadas e assinaturas estreitas de estado.

### Fronteiras do frontend

`src/lib/api.ts` é a entrada usada pelas telas e pelo store. O diretório `api/` separa quatro responsabilidades:

- `types.ts`: contrato `CornetaApi` e payloads compartilhados; mudanças de comando, evento ou formato precisam manter paridade com o Rust e com a demo.
- `native.ts`: invocações e assinaturas Tauri, diálogos e recursos nativos. Cada assinatura devolve sua função de encerramento.
- `demo.ts`: simulação do navegador; seus dados e resultados não comprovam transmissão, OAuth ou servidor local reais.
- `runtime.ts`: detecção de Tauri e códigos compartilhados, incluindo `START_CANCELLED`, que deve continuar igual ao código Rust, independentemente do idioma.

`src/lib/store.ts` cria uma única instância Zustand por WebView. Os slices em `store/oauth.ts`, `store/chat.ts` e `store/navigation.ts` recebem o mesmo `set`/`get` e contexto tipado em `store/types.ts`; não são stores independentes. A fila `saveChain`, a revisão de configuração, `persist` e `flushSave` pertencem à composição em `store.ts`. Toda alteração de configuração deve passar por essa fila; as operações de cofre que dependem de um namespace recém-criado aguardam `flushSave`. A sincronização `config://changed` aplica revisões recebidas sem regravar o mesmo evento, evitando ciclos entre janelas.

O slice de chat preserva o processamento em lotes e os limites de mensagens/alertas, além do encerramento das assinaturas e timers. O de OAuth concentra configuração, modos e estado dos fluxos; trocar entre credenciais próprias e oficiais não equivale a apagá-las. O de navegação mantém pedidos consumíveis de foco, abas e telas. Os testes em [store.slices.test.ts](../src/lib/store.slices.test.ts) cobrem falhas de exclusão de credenciais, sincronização sem regravação e limpeza de lotes de chat; não substituem um ensaio real com provedores.

`ChatScreen.tsx` e `SettingsScreen.tsx` são os pontos de entrada e coordenadores de suas telas. `screens/chat/` agrupa contas, fontes, alertas, overlays, primitivas e constantes; `screens/settings/` agrupa JÁ VOLTO, Guardião, gravação, teste do OBS, atalhos e prévias. Esses componentes usam o design system existente e o store/API comuns. Uma extração não deve criar outra assinatura global, fila de configuração ou cópia local persistente do mesmo estado.

## Como extrair módulos sem parar o produto

Extraia ao modificar uma responsabilidade concreta: política pura, adaptador externo e controlador com ciclo de vida explícito. Mantenha contratos IPC e eventos, use testes de comportamento antes/depois e não misture extração com mudança de formato. Os módulos de sessão/gravador, a tela de relatórios e as fronteiras de API/store acima são referências existentes. Parsing/invocação de ambiente e segurança das fixtures também têm fronteiras testáveis. Tamanho por si só não justifica reescrever módulos de mídia.

Consulte também [configuração](CONFIGURACAO.md), [superfície de rede](SUPERFICIE-DE-REDE.md), [compatibilidade](COMPATIBILIDADE.md) e [performance](PERFORMANCE.md).
