# Runbook de publicação e beta

Atualizado em 2026-09-06. Testes de código não substituem comprovação em produção.
Não publicar drafts ou transmitir para canais reais automaticamente para executar este roteiro.

## Setup API e site

No host Next.js, configurar `web/.env.example` usando os cofres/contas existentes do projeto.
Não copiar segredos para código, logs ou artefatos. O `.env` do desktop só é reaproveitado em
desenvolvimento, nunca no build de produção.

- Configurar `TWITCH_CLIENT_ID`, `GOOGLE_CLIENT_ID`, `KICK_CLIENT_ID`, `KICK_CLIENT_SECRET`
  e `KICK_REDIRECT_URIS=http://localhost:7395/callback` conforme cadastro na Kick.
- Configurar `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`: Redis REST HTTPS com EVAL.
  Provisionamento, região, orçamento e permissões precisam de decisão do responsável.
- `OAUTH_RATE_LIMIT_SALT`: segredo aleatório estável, pelo menos 32 caracteres, igual em todas
  as instâncias. Gerar em ambiente seguro com `crypto.randomBytes(32).toString("hex")`.
  Não reutilizar um client secret nem trocar o salt a cada deploy.
- Vercel usa `x-vercel-forwarded-for`. Self-host: definir `OAUTH_TRUSTED_IP_HEADER`, configurar
  o proxy para **sobrescrever** o header e impedir conexões públicas diretas ao Next.
- Site canônico `https://www.corneta.live`; CTA HTTPS para instalador `.exe` aprovado em
  `github.com/pitroldev/corneta/releases` (versão fixada ou `latest/download`).
- Os switches de telemetria devem ser explicitamente `0` ou `1`. Ativa exige o mesmo project
  token `phc_`, região US e ambiente production no site/API; o desktop também deve coincidir.
  Desligar exige desligar as três superfícies; não tomar essa decisão implicitamente.
- SHA vem de `NEXT_PUBLIC_BUILD_SHA`, `BUILD_SHA`, `VERCEL_GIT_COMMIT_SHA` ou Git local.
  Valores explícitos divergentes são rejeitados.

Executar `pnpm web:release:check`. Fora da Vercel, usar `pnpm --dir web build:release` ou
`CORNETA_RELEASE_CHECK=1`. Vercel production aplica o gate automaticamente.
`pnpm web:check` continua apropriado para CI sem segredos.

Após deploy, GET `/api/v1/health` deve mostrar SHA do site/API igual ao commit publicado e
switches/host/fingerprints esperados, sem tokens. `status: ok` significa que a API responde,
não comprova Redis, login ou disponibilidade do download. Abrir o link de download e conferir
status, versão e SHA-256: o check de configuração valida formato, não existência da URL.

### Validação OAuth em ambiente de teste

1. Trocar código PKCE válido e renovar sessão em conta Kick de teste.
2. Recusar código reutilizado, verifier incorreto, callback diferente e refresh revogado.
3. Exceder 20 exchanges/minuto ou 60 refreshes/minuto do mesmo IP: esperar 429/Retry-After.
4. Alternar entre duas instâncias: o limite deve continuar único.
5. Indisponibilizar Redis somente no ambiente de teste: esperar 503/Retry-After, sem fallback
   ilimitado. Restaurar e confirmar recuperação.
6. Testar Twitch/YouTube com contas novas: cancelamento, renovação, revogação e reconexão.
   Aprovação Google, escopos, quotas e callbacks nos consoles continuam externos.

Redis recebe chave HMAC, contador e TTL de 60 s; não recebe IP bruto, tokens, stream keys ou
corpos OAuth. IPv6 é agrupado por /64. HMAC é pseudonimização, não anonimização: rever região,
DPA e política de privacidade antes de ativar. Pessoas no mesmo NAT compartilham limite.
Ataques distribuídos ainda exigem WAF, limites de orçamento e alertas no host.
Referências: [Redis REST](https://upstash.com/docs/redis/features/restapi) e
[headers Vercel](https://vercel.com/docs/headers/request-headers).

## Fontes e distribuição

O download FFmpeg anterior retornava 404. Preservar o novo ZIP verificado em um espelho HTTPS
controlado pelo projeto e configurar `CORNETA_FFMPEG_MIRROR_URL` nos workflows. O espelho deve
servir os mesmos bytes; o hash fixado continua obrigatório. Não espelhar apenas o binário sem
atender também às obrigações de fontes/licenças.

`compliance/ffmpeg-sources.json` mantém `reviewed: false` enquanto a correspondência não estiver concluída. Fontes já coletadas não constituem aprovação; veja [a evidência atual](CONFORMIDADE-FFMPEG.md).
Preencher as fontes com entradas `{ "file": "nome.tar.xz", "url": "URL_HTTPS_VERSIONADA",
"sha256": "SHA256_COMPLETO" }`. Incluir FFmpeg, bibliotecas correspondentes, patches e scripts
necessários à reprodução. Conferir correspondência com `-buildconf` e a identidade fixada antes
de mudar `reviewed` para `true`. Apenas scripts BtbN ou apenas o tarball FFmpeg não comprovam
cobertura das bibliotecas embutidas.

Após `fetch-binaries`, executar `pnpm compliance:prepare`: valida binários, baixa fontes com
limites de tamanho/tempo, confere hashes e gera `corneta-third-party.zip` com avisos, lockfiles,
inventário Rust/JS e textos de licenças encontrados. Não é certificação jurídica automática;
conferir as [condições de distribuição do FFmpeg](https://ffmpeg.org/legal.html).

O draft aceita somente cinco assets aprovados: instalador `.exe`, `.exe.sig`, `latest.json`,
`SHA256SUMS.txt` e `corneta-third-party.zip`. O updater verifica a assinatura do instalador com
a chave pública do app em streaming. Authenticode é separado: a compra continua adiada conforme
[ASSINATURA.md](./ASSINATURA.md). Quando adotado, usar `REQUIRE_WINDOWS_CODE_SIGNING=1`.

## Instalação, atualização e recuperação

Usar VM/máquina de teste e backup de configuração/relatórios. Não ensaiar downgrade no perfil
do streamer em produção, nem exportar tokens do cofre para montar evidência.

1. Baixar, conferir SHA256SUMS, instalar em Windows limpo e abrir sem terminal.
2. Configurar plataformas, fazer gravação curta e guardar relatório e preferências.
3. Em outra VM/snapshot, instalar N-1 e atualizar para N. Conferir cofre, configuração,
   relatórios, autostart, atalhos, bandeja, fechamento e desinstalação.
4. Usar endpoint HTTPS de teste para updater. Draft privado não é endpoint público acessível
   pelo desktop. Não trocar chave pública/endpoint das instalações reais.
5. Recusar assinatura adulterada e tratar indisponibilidade sem instalar arquivo inválido.
6. Durante live de teste, confirmar que atualização não reinicia a transmissão.
7. Recuperar por snapshot/reinstalação com backup compatível. O updater normal não oferece
   downgrade automático; migrações de dados também precisam ser consideradas.

## Estabilidade, performance percebida e beta humano

Usar build release. Comparar a mesma cena/bitrate/destinos com OBS sozinho e OBS + Corneta.
Medir a árvore Corneta + sidecars + WebView, separando memória privada de working set; observar
GPU encode/decode/3D e VRAM. Não confundir memória compartilhada com consumo privado somável.

| Cenário                             | Duração       | Evidência                                                         |
| ----------------------------------- | ------------- | ----------------------------------------------------------------- |
| App parado; depois chat ativo       | 15 min cada   | CPU, RAM e responsividade                                         |
| Live 1080p60 com múltiplos destinos | 4–8 h         | Memória após aquecimento, deriva, reconexão, áudio/vídeo          |
| Jogo competindo por recursos        | 30–60 min     | Comparação com OBS sozinho; causas apresentadas como hipóteses    |
| Gravação on/off, chat intenso       | 30 min cada   | Disco, RAM, player, chat limitado, exportação                     |
| Queda OBS/rede/destino custom       | 3 ciclos cada | Recuperação, outros destinos vivos, ausência de órfãos            |
| Relatório grande                    | 10 aberturas  | Feedback, largura dos gráficos, scroll, seek, marcação sem piscar |

Metas iniciais para validar, não resultados já medidos: feedback de ações locais em até 100 ms,
nenhuma espera sem indicação, memória estabilizada sem crescimento proporcional à duração/chat,
nenhum travamento ou perda de relatório. Não impor uma meta única de VRAM para todo hardware.
Repetir em Windows 10/11 e NVIDIA/Intel/AMD/software. Manter F14/F16 experimentais desligados.

Com 10–20 streamers não técnicos, observar sem ensinar: instalar, conectar, iniciar live,
entender estado, recuperar falha e reencontrar um momento. Registrar desistências, tempo até
primeira live e pontos que exigem ajuda. Isso valida “blazing fast” percebido.

Registrar versão/SHA, data, hardware/driver, cenário, duração, resultado e evidência sanitizada.
Não anexar `.env`, chats pessoais, logs crus, stream keys ou tokens.

## Evidências desta rodada

- Site/API: build, lint e TypeScript passaram; 44 páginas geradas.
- Smoke HTTP local do build: health 200/no-store, SHA site/API igual ao Git; exchange sem
  Redis retorna 503/Retry-After=5.
- Suítes JS/TS, Rust, assinatura e testes reais de mídia/OCR passaram com os sidecars novos.
- Total final: 457 testes JS/TS + 232 nativos + 4 do experimento offline + 2 de assinatura
  - 3 integrações de mídia/OCR = 698 aprovações. Lint, TypeScript, formatação, builds e Clippy passaram.
- Cargo audit/deny passaram após remover os pins retirados de circulação. Permanecem avisos
  informativos de manutenção de dependências transitivas e o aviso conhecido de soundness do
  GLib da árvore Linux, conforme política existente; isso não equivale a ausência de qualquer risco.
- Checks de publicação recusaram configuração local incompleta e fontes não revisadas.
  Isso não comprova configuração das contas de produção.
- Não executados: publicação, empacotamento final com fontes aprovadas, OAuth em conta real,
  Redis remoto real, instalação em VM, upgrade real, ensaio de 4–8 h ou beta humano.

Pendências atuais: [PENDENCIAS.md](./PENDENCIAS.md).
