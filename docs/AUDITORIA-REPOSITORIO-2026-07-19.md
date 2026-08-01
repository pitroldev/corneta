# Auditoria do repositório Corneta

> Correções, melhorias e novas features recomendadas a partir da análise do código em 19/07/2026.
>
> Escopo: frontend React/Vite, core Tauri/Rust, segurança, build/distribuição, testes, UX e backlog de produto.

## Resumo executivo

A Corneta já passou do estágio descrito no README. O app tem uma base funcional ampla: motor de transmissão, cofre de chaves, OBS, chat e alertas unificados, relatórios, overlay, proteção contra queda, guardião por OCR, loudness, auto-bitrate e metadados cross-platform. O build de produção passa e as suítes atuais estão verdes.

O maior risco agora não é falta de feature. É lançar um produto tecnicamente rico antes de fechar quatro fundamentos:

1. **Segurança de dados e das fronteiras IPC**: há texto reconhecido pelo Guardião indo para logs, segredos OAuth empacotados no JavaScript, entrada não validada no backend e permissões Tauri maiores que o necessário.
2. **Distribuição e compliance**: não há `LICENSE`, auto-update, assinatura, CI/release pipeline nem pacote de notices; o sidecar escolhido é explicitamente um build GPL do FFmpeg.
3. **Qualidade de release**: unit tests são bons, mas faltam testes de integração do fluxo real, smoke test do instalador e validação multi-plataforma/RTMPS.
4. **Consolidação da arquitetura**: arquivos centrais entre 1.000 e 2.300 linhas, formatação Rust fora do padrão, Clippy falhando e documentação contraditória tornam cada mudança futura mais arriscada.

### Recomendação em uma frase

Fazer primeiro um ciclo curto de **hardening + release engineering**, publicar uma beta controlada e, em seguida, investir no **vigia técnico do sinal** (tela preta/congelada/mic mudo), que é a próxima feature com melhor combinação de diferenciação, valor e reaproveitamento da arquitetura atual.

## Estado verificado

| Verificação | Resultado |
|---|---|
| `pnpm build` | ✅ TypeScript + build Vite concluídos |
| `pnpm test` | ✅ 82 testes em 9 arquivos |
| `cargo check --lib` | ✅ concluído |
| `cargo test --lib` | ✅ 56 passaram; 2 testes E2E com FFmpeg estão ignorados |
| `pnpm audit --prod` | ✅ nenhuma vulnerabilidade conhecida encontrada |
| `cargo fmt --check` | ❌ muitos arquivos fora do formato padrão |
| `cargo clippy --all-targets -- -D warnings` | ❌ 12 ocorrências tratadas como erro |
| `cargo audit` | ⚪ não instalado; dependências Rust não foram auditadas contra advisories |
| CI | ❌ não existe `.github/workflows` |
| Licença do projeto | ❌ não existe `LICENSE` |
| Auto-update | ❌ apenas documentado; não implementado |

### Tamanho e concentração de código

Os maiores pontos de concentração são:

| Arquivo | Linhas aproximadas |
|---|---:|
| `src-tauri/src/chat.rs` | 2.294 |
| `src-tauri/src/commands.rs` | 2.198 |
| `src/screens/ChatScreen.tsx` | 1.892 |
| `src-tauri/src/splicer.rs` | 1.780 |
| `src-tauri/src/auth.rs` | 1.368 |
| `src/lib/api.ts` | 1.281 |
| `src/screens/GoLiveScreen.tsx` | 1.256 |
| `src/screens/ReportsScreen.tsx` | 1.135 |
| `src/screens/SettingsScreen.tsx` | 1.101 |

Isso não é defeito isoladamente, mas já está aumentando o custo de revisão, teste e manutenção.

---

## P0 — corrigir antes de uma distribuição pública

### P0.1 Remover dados privados dos logs do Guardião

**Evidência:** `src-tauri/src/guardian/pipeline.rs:139-145` grava a cada poucos segundos até 300 caracteres do texto lido pelo OCR. O logger roda em nível `Info` e grava em arquivo (`src-tauri/src/lib.rs:136-144`).

**Impacto:** a feature criada para impedir vazamento pode persistir em disco nome, endereço, e-mail, conversa, chave ou qualquer outro texto presente na tela. Esses dados também podem parar num pacote de suporte enviado pelo usuário.

**Implementar:**

- remover o trecho OCR dos logs de release;
- registrar apenas duração, tamanho da entrada e booleano de match;
- nunca registrar o termo que casou;
- se diagnóstico detalhado for indispensável, torná-lo opt-in, temporário, com aviso explícito e expiração;
- adicionar teste que falha se uma string-sentinela aparecer no log.

**Pronto quando:** uma busca em logs não consegue reconstruir texto da tela nem itens da watchlist.

### P0.2 Validar toda entrada no backend, não só no React

Hoje o frontend sanitiza parte das entradas, mas os comandos Tauri e a importação aceitam dados diretamente.

**Evidências concretas:**

- `src-tauri/src/session.rs:137-145`: `read_session` e `delete_session` montam o caminho com um `id` não validado. Um identificador contendo separadores ou `..` pode escapar da pasta esperada para arquivos com sufixo `.ndjson`.
- `src-tauri/src/commands.rs:79-87` e `2174-2197`: `save_config` e `import_config` desserializam e persistem `AppConfig` sem validação de domínio.
- `src-tauri/src/engine.rs:502-524`: `ingest.host` é interpolado diretamente no YAML do MediaMTX. Quebras de linha vindas de IPC/config importada podem injetar propriedades no arquivo gerado.
- `src-tauri/src/commands.rs:2043`: `overlay_port` é convertido de `u32` para `u16`; valores importados acima de 65535 sofrem truncamento.
- `set_key`, `clear_key` e `has_key` aceitam qualquer identificador, embora o mesmo namespace do keyring guarde stream keys e tokens internos.
- importação de config, slate em base64 e download de modelos não têm limites de tamanho adequados.

**Implementar:**

- criar `AppConfig::validate_and_normalize()` no Rust;
- usar enums Serde para modo, protocolo, encoder, tema e opções fechadas;
- validar host/IP, portas `1..=65535`, nomes de app/key, URLs e comprimentos;
- proibir `\r`, `\n`, NUL e caracteres de controle em valores usados em YAML/URLs;
- aceitar IDs com uma regex fechada, por exemplo `^[a-zA-Z0-9_-]{1,80}$`;
- em sessões, resolver o caminho canônico e confirmar que continua dentro de `sessions_dir`, além de validar o formato timestamp/UUID;
- separar namespaces/funções do keyring por tipo de credencial;
- impor limites de arquivo e de payload antes de ler tudo em memória;
- aplicar a mesma validação em `save_config`, `import_config` e antes de iniciar o motor.

**Pronto quando:** inputs maliciosos via `invoke` e JSON importado são rejeitados por testes Rust e não alteram arquivos fora das pastas previstas.

### P0.3 Redesenhar o tratamento de credenciais OAuth empacotadas

**Evidência:** `.env.example`, `src/lib/oauth.ts` e `src/lib/store.ts:623-631` levam `VITE_*_CLIENT_SECRET` ao frontend. Variáveis `VITE_` são substituídas no build e ficam legíveis no bundle distribuído.

**Impacto:** um aplicativo desktop distribuído não consegue manter um segredo estático embutido. Rotacionar o segredo também exige novo build, e uma credencial compartilhada facilita abuso de quota/cliente.

**Implementar:**

- tratar o desktop como cliente público;
- usar PKCE/device authorization sem segredo onde a plataforma permitir;
- manter somente `client_id` público no artefato;
- para Google/YouTube, formalizar o modo BYOK já parcialmente existente, ou usar um broker mínimo se a política da API exigir credencial confidencial;
- guardar credenciais BYOK exclusivamente no keyring;
- remover os secrets do `envPrefix`, dos tipos do frontend e do IPC de bootstrap;
- separar escopos OAuth por feature e pedir o menor conjunto possível;
- documentar revogação, troca de conta e quota.

**Pronto quando:** nenhum `client_secret` aparece em `dist/**`, no source map ou na configuração em texto plano.

### P0.4 Fechar licença e compliance dos binários distribuídos

**Evidência:** o repositório não tem `LICENSE`. `scripts/fetch-binaries.ps1` baixa `ffmpeg-...-win64-gpl`, e o próprio provedor descreve a variante `gpl` como incluindo dependências que exigem GPL completa. O README ainda sugere apenas MIT/Apache e afirma, de forma insuficiente, que manter o FFmpeg como processo externo resolve a questão.

**Risco:** distribuir o executável traz obrigações sobre o binário distribuído, notices, licença e código-fonte correspondente. O efeito sobre a licença da aplicação deve ser validado juridicamente; separação por processo ajuda a análise, mas não elimina as obrigações do FFmpeg empacotado.

**Implementar:**

- decidir a licença do código da Corneta e adicionar `LICENSE`;
- decidir conscientemente entre uma variante FFmpeg GPL e uma LGPL que ainda cubra os encoders necessários;
- gerar `THIRD_PARTY_NOTICES.md` e incluir licenças no instalador/Sobre;
- arquivar e disponibilizar o código-fonte exato, configuração e patches correspondentes ao FFmpeg distribuído;
- documentar a origem/licença do MediaMTX e demais assets/binários;
- fazer revisão jurídica antes do release público.

Referências primárias: [FFmpeg Legal](https://ffmpeg.org/legal.html) e [variantes do BtbN/FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds#targets-variants-and-addins).

### P0.5 Criar um portão de release reproduzível

O projeto tem scripts de download com versões e hashes fixos — uma boa base —, mas não há automação que prove o artefato final.

**Implementar:**

- GitHub Actions ou equivalente com `pnpm install --frozen-lockfile`, build, Vitest, `cargo fmt --check`, Clippy, testes Rust e auditoria de dependências;
- job Windows que baixa sidecars, valida SHA-256, compila o Tauri e instala o NSIS em VM limpa;
- smoke test: abrir app, confirmar single-instance, subir/matar sidecars, fechar e provar ausência de processos órfãos;
- release assinada, SBOM, checksums e provenance dos artefatos;
- auto-updater assinado conforme `docs/ATUALIZACAO-AUTOMATICA.md`;
- teste real de atualização `N → N+1` e rollback/erro de rede;
- assinatura de código Windows ou documentação clara do período beta não assinado.

**Pronto quando:** um commit tagueado gera sempre o mesmo conjunto verificável de artefatos sem passos manuais secretos.

### P0.6 Executar a matriz mínima de live real

A Twitch foi validada, mas o próprio backlog registra pendência em RTMPS e multi-plataforma.

**Matriz mínima:**

- Twitch + YouTube simultâneos;
- pelo menos um destino RTMPS (Kick ou Facebook);
- modo cópia e modo transcode por hardware;
- queda e retorno do OBS;
- perda de internet e reconexão individual;
- pausa/retomada de um destino;
- auto-bitrate sob limitação de banda;
- slate de imagem e vídeo;
- encerramento por botão, X, tray e desligamento do Windows;
- execução de 4–6 horas para observar handles, memória, disco e drift A/V.

Guardar resultados, versões do OBS/driver/GPU e logs redigidos como artefatos de QA.

---

## P1 — correções de segurança e confiabilidade

### P1.1 Reduzir capabilities e CSP do Tauri

**Evidência:** `src-tauri/capabilities/default.json` concede ao frontend `shell:allow-spawn`, `shell:allow-kill`, `shell:allow-open` e execução de sidecars com `args: true`. O frontend só usa `open`; os sidecars são controlados pelo Rust, que não depende da ACL do frontend. A CSP permite `ws://*:*` e `wss://*:*`.

**Implementar:**

- remover do frontend spawn, kill e execute de sidecars;
- substituir `plugin-shell.open(url)` por um comando Rust com allowlist de `https` e hosts confiáveis;
- separar capability da janela principal e do popout de chat;
- limitar `connect-src` a IPC/loopback e aos destinos realmente usados;
- manter a Mesa, hoje desligada por feature flag, em capability própria quando voltar;
- adicionar teste automatizado do arquivo de capabilities.

### P1.2 Verificar integridade dos modelos OCR

**Evidência:** `src-tauri/src/guardian/ocr.rs:87-119` baixa três artefatos de um release GitHub e os carrega, mas só verifica se o arquivo existe. O download é atômico, porém não há hash, tamanho máximo ou revalidação.

**Implementar:** SHA-256 fixo por arquivo, limite de bytes, `Content-Length` coerente, limpeza do cache inválido e botão de redownload. Idealmente publicar manifesto assinado/versionado.

### P1.3 Não prometer SRT antes da implementação específica

**Evidência:** o catálogo e a validação aceitam `srt://`, mas `ffmpeg_args_for_target` força `-f flv` para todos os protocolos e o YAML do MediaMTX desliga o servidor SRT. Não há testes de saída SRT nem opções específicas de latência/passphrase/muxer.

**Implementar uma das opções:**

1. remover temporariamente SRT da copy e da validação de destinos; ou
2. implementar uma matriz protocolo → muxer/opções (`RTMP/RTMPS → FLV`, `SRT → MPEG-TS` por padrão), campos seguros de SRT e testes contra listener real.

Entrada SRT é outra feature e requer habilitar/configurar a porta correspondente no MediaMTX.

### P1.4 Garantir persistência antes de sair

**Evidência:** `src/lib/store.ts:185-215` persiste com debounce de 400 ms. O `beforeunload` chama uma função assíncrona, mas o navegador/WebView não aguarda Promises durante unload.

**Impacto:** uma alteração seguida de saída imediata pode ser perdida; duas janelas ainda dependem de sincronização por snapshots inteiros.

**Implementar:**

- mover mutações críticas para comandos transacionais no Rust, ou manter um canal de persistência serializado;
- adicionar revisão/contador de versão da config para impedir last-write-wins silencioso;
- no encerramento Tauri, solicitar flush e aguardar confirmação antes de fechar;
- testar alteração + quit imediato e edição concorrente main/popout.

### P1.5 Versionar e migrar o schema de configuração

Hoje migrações estão dispersas entre defaults Serde e lógica do store, sem `schemaVersion`.

**Implementar:**

- `schemaVersion` explícito;
- migrações Rust determinísticas, uma por versão;
- backup antes de migrar;
- rejeição amigável de config de versão futura;
- round-trip e fixtures de todas as versões já publicadas;
- separação entre config global, perfis e segredos.

### P1.6 Corrigir higiene de logs e diagnósticos

- política de retenção/tamanho dos logs;
- redator central para tokens, stream keys, URLs com credencial, dados OCR e senha do OBS;
- IDs de correlação por live/destino;
- logs estruturados onde for útil;
- botão **Exportar diagnóstico** com logs redigidos, versões, encoder, GPU, resultado do check-up e config sem segredos;
- não mostrar stack trace completo como experiência padrão (`ErrorBoundary` e `chat-main.tsx`); oferecer “Copiar detalhes” atrás de expansão.

### P1.7 Fechar a qualidade estática

**Estado atual:** `cargo fmt --check` falha e Clippy encontra 12 problemas, incluindo conversões inúteis, prefixo removido manualmente, tipos muito complexos e função com argumentos demais.

**Implementar:**

- rodar `cargo fmt` numa mudança isolada;
- resolver Clippy, sem simplesmente silenciar regras amplas;
- adicionar scripts `lint`, `format:check`, `test:all` no `package.json`;
- configurar ESLint para React hooks, acessibilidade e imports;
- adicionar formatter do frontend;
- impedir merge quando format/lint/test/build falharem.

### P1.8 Cobrir integração, não só funções puras

> **Estado em 2026-08-01:** parcialmente resolvido. O CI agora baixa o mesmo FFmpeg fixado e
> conferido por SHA-256 que acompanha a aplicação e executa os testes de integração de mídia com
> ele. Os cenários Tauri/OBS e as demais costuras listadas abaixo continuam sendo trabalho de QA.

A cobertura unitária existente é valiosa, especialmente em engine, policy, guardião e relatórios. As maiores lacunas estão nas costuras.

Adicionar:

- testes Rust dos comandos Tauri com config temporária e keyring fake;
- testes de importação/migração/config maliciosa;
- testes do supervisor com processos fake que caem, travam e reconectam;
- habilitar no CI os 2 testes ignorados do splicer com FFmpeg fixado;
- testes React de onboarding, Plataformas, check-up e botões destrutivos;
- Playwright/WebDriver para o modo demo;
- smoke E2E Tauri/OBS numa máquina Windows dedicada.

### P1.9 Atualizar dependências em dois trilhos

> **Resolvido em 2026-08-01:** os workspaces npm/pnpm, o grafo Rust/Tauri, Actions, toolchains e
> binários externos foram atualizados em conjunto, com lockfiles regenerados, hashes fixos,
> auditorias e a suíte completa. React 19, Vite 8, Framer Motion 12, Tailwind Merge 3 e Lucide 1
> já estão ativos. TypeScript ficou em 6.0.3 enquanto `typescript-eslint` exigir `<6.1`, ESLint em
> 9.39.5 enquanto os plugins usados não aceitarem 10 e `@types/node` na linha 24 do Node LTS.
> A automação semanal passa a acompanhar npm, Cargo e GitHub Actions.

`pnpm outdated` mostrou patches/minors simples e majors relevantes (React 19, Vite 8, Framer Motion 12, Tailwind Merge 3, Lucide 1.x, TypeScript 7).

**Recomendação:**

- aplicar primeiro patches/minors em PR pequeno, com lockfile e toda a suíte;
- tratar majors como projeto separado, um ecossistema por vez;
- adicionar Renovate/Dependabot semanal;
- instalar `cargo-audit`/`cargo-deny` na CI;
- verificar licenças e fontes duplicadas com `cargo deny check`.

---

## P2 — melhorias de arquitetura, performance e UX

### P2.1 Dividir módulos por domínio

Sugestão de cortes:

- `commands.rs`: `engine_commands`, `report_commands`, `obs_commands`, `overlay_commands`, `settings_commands`;
- `chat.rs`: conectores Twitch/YouTube/Kick, parsing, viewers e runtime;
- `auth.rs`: provider por plataforma + serviço de tokens;
- `api.ts`: contrato, adapter Tauri, adapter demo e subscriptions;
- `ChatScreen.tsx`: feed, configurações de fonte, OAuth, overlay e envio;
- `GoLiveScreen.tsx`: setup, preflight, live room e modais;
- `SettingsScreen.tsx`: seções e editores próprios.

Meta prática: nenhum arquivo de UI/orquestração acima de ~500–700 linhas sem justificativa.

### P2.2 Carregar telas pesadas sob demanda

O app importa todas as telas estaticamente em `App.tsx`. O build gerou bundles JS principais de aproximadamente 358 kB e 388 kB, ambos acima de 110 kB gzip, além de fontes para alfabetos não usados.

**Implementar:**

- `React.lazy`/`Suspense` para Chat, Relatórios, Mesa, Configurações e editores raros;
- carregar dependências de recap/gráficos/virtualização somente na tela que as usa;
- criar budget de bundle na CI;
- importar apenas o subset Latin do Inter Variable;
- medir cold start e troca de tela antes/depois.

### P2.3 Tirar I/O bloqueante de comandos async

Há comandos `async` que chamam `ureq`/filesystem bloqueantes diretamente, especialmente em moderação e metadados. O runtime é multithread, mas rajadas podem ocupar workers.

**Implementar:** cliente HTTP compartilhado com timeouts/retries consistentes e execução bloqueante isolada, ou migrar para cliente async. Padronizar erros, cancelamento e backoff.

### P2.4 Tornar a gravação de sessão mais eficiente e recuperável

`session.rs` abre o arquivo a cada amostra/evento. É simples e robusto, mas gera I/O e não há índice/schema formal.

**Implementar:** writer bufferizado dedicado, flush periódico e no encerramento, `schemaVersion` no NDJSON, recuperação de sessão interrompida e limite por tamanho/tempo. Manter o formato append-only.

### P2.5 Finalizar detalhes de acessibilidade e tema

A revisão antiga em `REVISAO-UX-UI.md` está parcialmente obsoleta: foco visível, reduced motion, `aria-live`, Radix Select/Dialog, estados vazios e navegação já foram corrigidos.

Pendências atuais confirmadas:

- `src/components/Toaster.tsx:58`: botão de fechar sem `aria-label`;
- vários ícones decorativos sem `aria-hidden`;
- uso recorrente de `transition-all`, inclusive no botão base, causando transições de propriedades não pretendidas;
- `Modal` deve aplicar `overscroll-behavior: contain`;
- inputs importantes precisam de `name`, `autocomplete` e associação de erro via `aria-describedby` quando aplicável;
- imagens de rede não têm dimensões explícitas; o favicon remoto do Sobre deveria ser asset local;
- o tema claro muda tokens, mas `index.html`/`chat.html` e o documento continuam com `color-scheme: dark`, deixando controles/scrollbars nativos incoerentes;
- manter targets de toque/clique próximos de 40–44 px para ações só com ícone.

Checklist usada como referência: [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines).

### P2.6 Atualizar a documentação para o estado real

Inconsistências encontradas:

- README diz que o backend Rust está “pendente de compilação”, mas ele compila e tem 58 testes registrados;
- `docs/PENDENCIAS.md` ainda diz que não há testes Rust, embora 56 estejam ativos e 2 ignorados;
- README referencia `NOMES.md`, que não existe;
- ideias v4 tratam título/categoria e loudness como backlog, mas ambos já estão no código;
- `fetch-binaries.ps1` termina instruindo descomentar `externalBin`, que já está ativo;
- arquitetura/estrutura do README não cobre os módulos e telas atuais;
- falta uma fonte única de verdade para status, versão e roadmap.

**Implementar:** substituir documentos de status duplicados por um roadmap vivo e marcar docs históricas como “snapshot de data X”.

### P2.7 Higiene local de segredos

`.env`, certificados, chaves e logs estão corretamente ignorados pelo Git, mas existem artefatos sensíveis na raiz local (`auto.key`, `.env`). Preferir um diretório de secrets fora do workspace, com instruções no README e pre-commit/secret scanning para evitar inclusão acidental.

---

## Novas features recomendadas

As features abaixo foram filtradas pelo estado atual do código. Não entram como “novas” as que já existem, como título/categoria unificados, loudness, recap, alertas, overlay, vertical, guardião OCR e proteção de queda.

### F1 — Vigia técnico: tela preta, congelada, silêncio e clipping

**Prioridade:** máxima depois do hardening.

**Por quê:** é diferenciadora, ataca um medo real do streamer e reaproveita captura de frame, pipeline lateral do Guardião, notificações, BRB e relatório.

**MVP:**

- amostrar o feed de programa sem criar novo decode pesado;
- detectar luma quase preta por janela de tempo;
- detectar baixa diferença entre frames, diferenciando cena legítima estática de falha com limiar/tempo configurável;
- medir ausência de áudio, clipping e loudness fora da faixa;
- avisar primeiro; ação automática de BRB deve ser opt-in;
- marcar o incidente no relatório pós-live;
- botão para testar cada detector antes da live.

**Bordas:** cooldown, cenas “Starting Soon” estáticas, tela preta intencional, mute intencional e conteúdo com pouca mudança. O sistema deve dizer “suspeita”, não afirmar falha absoluta.

### F2 — Confidence monitor local do output real

Mostrar uma prévia leve do feed de programa que efetivamente alimenta os destinos, com áudio meter, resolução/fps e atraso estimado. Começar por um monitor compartilhado; “pullback” independente de cada plataforma fica para depois por custo e instabilidade das APIs públicas.

Essa tela combina naturalmente com o vigia técnico e com o check-up pré-live.

### F3 — Presets e compatibilidade atualizáveis, assinados

Hoje endpoints, bitrates e regras estão hardcoded em `src/lib/platforms.ts`, embora a própria documentação diga que mudam.

**Implementar:**

- catálogo remoto versionado e assinado;
- schema validado no Rust;
- fallback embutido conhecido e botão de restaurar;
- cache com data/versão e rollout gradual;
- regras por região/status de parceiro;
- aviso quando um preset local ficou obsoleto, sem mudar uma live em andamento.

### F4 — Sala de espera / “Starting Soon” com contagem regressiva

Reaproveitar o compositor/slate para iniciar os destinos antes do OBS, opcionalmente com chat/alertas já conectados. Escopo enxuto: fundo/imagem/vídeo, texto, contagem e transição manual/automática para o OBS. Não virar editor de cenas.

### F5 — Exportar diagnóstico para suporte

Uma feature pequena com grande retorno operacional:

- versões app/sidecars/Windows/WebView2/OBS;
- GPU/encoders e resultado dos probes;
- teste de banda e portas;
- config redigida;
- últimos logs redigidos;
- relatório da sessão selecionada;
- checklist visual do que será incluído.

Isso reduz drasticamente o custo de beta e suporte sem exigir telemetria remota.

### F6 — Anúncio “estou ao vivo” via webhooks

Começar genérico, sem construir integrações profundas: webhooks Discord/Telegram e template por perfil, disparados quando o estado muda realmente para `live`. Incluir teste, retry idempotente e nunca atrasar o início da transmissão.

### F7 — Entrada SRT completa

Somente depois de corrigir a promessa atual de SRT em destinos:

- habilitar SRT no MediaMTX;
- modo listener/caller, passphrase no keyring, latência e streamid;
- wizard com URL copiável para OBS/encoder;
- métricas e reconexão;
- testes em rede com perda/jitter.

### F8 — Cloud relay “traga seu VPS”

É uma evolução estratégica para usuários com upload doméstico limitado, mas tem custo alto de segurança e suporte. Fazer depois de estabilizar o relay local e SRT. O primeiro corte pode gerar configuração/deploy para VPS do usuário, sem operar infraestrutura da Corneta.

### Features para manter no backlog, não no próximo ciclo

- detecção de música/DMCA: alto risco de falso negativo, base de fingerprints/licenciamento e expectativa jurídica;
- rerun/premiere: útil, mas menos diferenciadora que confiabilidade do sinal;
- pullback independente por plataforma: caro e frágil por API/latência;
- mixer de áudio completo: desvia do papel da Corneta e duplica o OBS;
- macOS/Linux: só após separar dependências Windows e fechar empacotamento/assinatura por SO;
- IA generativa de clipes/copy: depois que a captura e os marcadores básicos estiverem sólidos.

---

## Ordem de implementação proposta

### Ciclo 1 — Hardening (1–2 semanas)

1. Remover OCR de logs.
2. Validar config, IDs, caminhos, portas e keyring no Rust.
3. Remover secrets OAuth do bundle e fechar a estratégia de cliente público/BYOK.
4. Restringir capabilities/CSP.
5. Verificar hashes/tamanhos dos modelos OCR.
6. Corrigir a promessa SRT ou implementar muxer específico.

### Ciclo 2 — Qualidade e release (1–2 semanas)

1. `cargo fmt`, Clippy, ESLint e scripts únicos.
2. CI Windows com testes, auditoria, sidecars e NSIS.
3. Ativar os testes E2E ignorados do splicer.
4. Smoke do instalador e matriz real Twitch + YouTube + RTMPS.
5. Licença, third-party notices e decisão FFmpeg GPL/LGPL.
6. Auto-update assinado e teste `N → N+1`.

### Ciclo 3 — Consolidação da beta

1. Schema/migrações e persistência transacional.
2. Exportar diagnóstico.
3. Refatorar `commands.rs`, `chat.rs`, `auth.rs` e telas gigantes por domínio.
4. Lazy load e budget de bundle.
5. Atualizar README, pendências e docs históricas.

### Ciclo 4 — Próximo diferencial

1. Vigia técnico de vídeo/áudio.
2. Confidence monitor local.
3. Presets remotos assinados.
4. Starting Soon.

---

## Critérios para chamar a v1 de pronta

- [ ] Nenhum segredo ou conteúdo OCR em bundle, config exportada ou logs.
- [ ] Todo comando IPC valida entrada no Rust.
- [ ] Nenhum caminho montado com ID não validado.
- [ ] Capabilities e CSP no menor privilégio necessário.
- [ ] Sidecars e modelos têm versão, hash, licença e origem documentados.
- [ ] Licença do app e notices de terceiros publicados.
- [ ] CI verde em format, lint, build, testes e auditorias.
- [ ] Instalador testado em Windows limpo.
- [ ] Auto-update assinado validado entre duas versões.
- [ ] Twitch + YouTube + um RTMPS validados simultaneamente.
- [ ] Queda/retorno de OBS e rede validados sem processo órfão.
- [ ] Sessão longa validada sem crescimento anormal de memória/disco/handles.
- [ ] Backup/migração de config testados.
- [ ] README e roadmap refletem o código publicado.

## Pontos fortes que devem ser preservados

- Arquitetura local-first e Windows-first coerente com o público inicial.
- Chaves de stream e tokens principais no keyring.
- Escrita atômica do `config.json`.
- Sidecars com versões e SHA-256 fixos no script de download.
- Single-instance, tray e esforço explícito para matar árvores de processos.
- Testes puros fortes no motor, policy, guardião e análise de relatórios.
- Chat virtualizado e buffers limitados no frontend.
- Reduced motion, foco visível, Radix Dialog/Select e identidade visual própria.
- Estados vazios, check-up pré-live e linguagem didática já bem mais maduros que a documentação antiga sugere.
- Produto com diferenciais reais: guardião preventivo, BRB sem derrubar destinos, auto-bitrate, vertical, chat/alertas e relatório pós-live.

## Conclusão

A Corneta não precisa de uma explosão de novas ideias; precisa transformar a riqueza já construída em um release confiável. O melhor investimento imediato é fechar vazamentos de dados, validação, distribuição e QA. Isso reduz risco técnico e jurídico e cria a base para a próxima aposta certa: um vigia técnico que prove ao streamer que imagem e som realmente estão saudáveis no caminho para todas as plataformas.
