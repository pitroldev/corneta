# Correções aplicadas após a auditoria

Data: 20/07/2026  
Origem: `AUDITORIA-REPOSITORIO-2026-07-19.md`

## Resultado

Os itens corretivos P0, P1 e P2 que podem ser concluídos no repositório foram aplicados. Os únicos
gates ainda abertos dependem de infraestrutura/credenciais externas: certificado Authenticode,
remote/release oficial para o updater, pacote de conformidade GPL e matriz de live com contas e
hardware reais. Eles estão documentados em `GATES-DE-RELEASE.md` e bloqueiam publicação.

## Segurança e dados

- O Guardião não grava mais texto OCR; o diagnóstico registra apenas contagens em nível debug.
- Configuração, importação, IDs de sessão, namespaces do cofre, URLs, portas, presets e tamanhos
  passam por validação no Rust. Ingest local é limitado a `127.0.0.1`.
- Leitura/importação possuem limites de tamanho; sessões recusam path traversal e arquivos grandes.
- Client secrets foram removidos de `.env.example`, tipos Vite e bundle. YouTube e Kick usam BYOK
  com armazenamento no keyring nativo; apenas Client IDs públicos entram no Vite.
- As webviews não têm mais permissões de spawn/kill/execute/open. URLs externas passam por command
  Rust limitado a HTTPS e pelo plugin opener oficial.
- Capabilities foram separadas para `main` e `chat`; CSP remove wildcards de WebSocket e adiciona
  `base-uri`, `object-src` e `frame-ancestors` restritivos.
- Modelos OCR v0.3.0 possuem tamanho e SHA-256 fixos; cache e download são verificados antes do uso.
- SRT deixou de ser anunciado/aceito como saída. Continua no roadmap até muxer e testes dedicados.
- Gitleaks foi adicionado ao CI; arquivos de segredo continuam ignorados.

## Confiabilidade e diagnóstico

- A configuração ganhou `schemaVersion` e `revision`, migração com backup e rejeição de versões
  futuras. Saves são imediatos, serializados e protegidos contra escrita obsoleta entre webviews.
- Sessões usam writer bufferizado, flush periódico/final, limite de 32 MiB, schema no NDJSON e
  recuperação no boot quando o processo anterior terminou sem evento `end`.
- Logs rotacionam em cinco arquivos de 5 MiB. A exportação de diagnóstico remove senha do OBS,
  API key, watchlist, tokens, secrets, stream keys e headers Authorization.
- Stack traces ficam recolhidos em “Detalhes técnicos”; o erro pode ser copiado sob demanda.
- Entrada/config importada é salva atomicamente e sincronizada com as demais janelas.

## Qualidade, performance e UX

- `cargo fmt` foi aplicado; Clippy roda com `-D warnings` e os achados foram corrigidos sem `allow`.
- ESLint, TypeScript, jsx-a11y, React Hooks e Prettier foram configurados; scripts `lint`, `check`,
  `format` e `format:check` foram adicionados.
- Telas secundárias usam `React.lazy`/`Suspense`; o CI impõe 110 KiB gzip por chunk JavaScript.
- O Inter Variable carrega apenas Latin; o build não inclui grego, cirílico ou vietnamita.
- `transition-all` foi removido, modal usa `overscroll-contain`, tema atualiza `color-scheme`, toast
  tem botão nomeado, o favicon remoto foi removido e controles de recorte/reordenação são tecláveis.
- O writer de sessão e chamadas HTTP de commands async não bloqueiam a thread de UI.
- README, pendências, script de sidecars e documento de ideias foram atualizados para o estado real.
- Dependências dentro dos ranges foram re-resolvidas; Dependabot separa npm, Cargo e Actions.

## CI, supply chain e release

- Workflow executa lint/test/build/budget do frontend; fmt/Clippy/test/audit/deny no Rust; e testes
  ignorados de mídia em Windows com FFmpeg/FFprobe reais.
- `pnpm audit` local: nenhuma vulnerabilidade conhecida.
- `cargo audit`/`cargo deny` não estavam instalados no host local; o workflow instala ambos antes de
  executar. `deny.toml` define fontes e licenças aceitas.
- Sidecars continuam versionados por URL e SHA-256 no script. Licença MIT da aplicação,
  `THIRD_PARTY_NOTICES.md` e obrigações GPL do FFmpeg foram formalizados.

## Verificação local

- Frontend: build TypeScript/Vite aprovado; 82 testes aprovados; ESLint retornou código 0.
- Rust: fmt aprovado; Clippy estrito aprovado; 59 testes aprovados, 0 falhas.
- Dois testes E2E FFmpeg são ignorados na suíte rápida e executados no job `media-integration`.
- Bundle: maior chunk principal medido em aproximadamente 98 KiB gzip, abaixo do budget de
  110 KiB; telas secundárias são chunks separados.

## Gates externos ainda obrigatórios

Não é possível fechar estes itens apenas alterando o repositório:

1. adquirir/importar certificado Authenticode e assinar/verificar o NSIS em máquina limpa;
2. definir o remote/repositório oficial, endpoint e chave do updater e testar N-1 → N/rollback;
3. anexar fonte/configuração/avisos correspondentes ao build GPL do FFmpeg distribuído;
4. executar e registrar a matriz Windows/GPU/OBS/plataformas/queda de rede com contas reais.

Até esses quatro gates passarem, o instalador não deve ser publicado como v1.

## Fora do escopo desta aplicação de correções

As features F1–F8 do relatório não foram implementadas, exceto a exportação de diagnóstico (F5),
que também corrigia a lacuna operacional P1.6. A decomposição integral dos arquivos grandes por
domínio (P2.1) permanece uma refatoração arquitetural separada: não corrige comportamento e exige
uma sequência própria de mudanças para não introduzir regressões no motor de live. O carregamento
lazy e a extração dos gates já reduzem o impacto de performance sem misturar esse rewrite ao
hardening.
