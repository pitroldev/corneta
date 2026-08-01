<div align="center">

# 📣 Corneta

**Transmita para todas as plataformas ao mesmo tempo — sem dor de cabeça.**

App desktop (Tauri 2 + React) que recebe um único stream do OBS e o replica para Twitch,
YouTube, Facebook, Kick, TikTok e outras, com encoding por plataforma, cofre de chaves e
painel ao vivo. Veja o racional completo em [`PLANEJAMENTO.md`](./docs/PLANEJAMENTO.md).

</div>

---

## Status

🟡 **MVP em estabilização.** Frontend e backend compilam localmente; a publicação continua
bloqueada pelos gates manuais de assinatura, conformidade GPL e matriz real de plataformas.

| Camada                                                 | Estado                                                |
| ------------------------------------------------------ | ----------------------------------------------------- |
| UI (React + Tailwind v4)                               | ✅ funcional — roda no navegador em modo demonstração |
| Modelo de dados, presets, estimativas                  | ✅                                                    |
| Backend Rust (config, cofre, motor FFmpeg, supervisão) | ✅ compila e possui testes                            |
| Sidecars (FFmpeg/MediaMTX) embutidos                   | ⏳ via `scripts/fetch-binaries.ps1`                   |
| Auto-config OBS / teste de upload                      | ✅ implementados                                      |

## Rodando

Toolchains fixados e validados: **Node.js 24.18.1 LTS**, **pnpm 11.18.0** e
**Rust 1.97.1**. `.node-version`, `packageManager`, `engines`, `rust-toolchain.toml` e os
workflows mantêm essas versões alinhadas.

### Web: site público + setup API (Next.js)

Tudo da Corneta que roda fora do PC do streamer fica em `web/`: a página pública, as páginas
legais e a **setup API** (`/api/v1/*`) que entrega os Client IDs e faz o exchange/refresh do
OAuth da Kick. Next.js App Router com React Server Components e Tailwind CSS, isolado do bundle
do aplicativo desktop.

```bash
pnpm install
pnpm web:dev       # site + API em http://localhost:7390
pnpm web:check     # lint + tipos + build de produção
```

Defina `NEXT_PUBLIC_SITE_URL` no deploy. Quando houver um instalador ou página de release pública,
defina também `NEXT_PUBLIC_PRIMARY_CTA_URL`; até lá, a CTA permanece honestamente interna à página.

### 1. Frontend (demonstração, sem Rust)

A UI roda no navegador com um **motor simulado** (dados mock), ótimo para ver/testar o fluxo:

```bash
pnpm install
pnpm dev          # abre http://localhost:1420
```

### 2. App completo (Tauri)

Pré-requisitos: **Rust 1.97.1** (rustup), **VS Build Tools com C++/MSVC** e **WebView2**
(Win 11 já traz).

```bash
pwsh -File scripts/fetch-binaries.ps1   # baixa ffmpeg + mediamtx para src-tauri/binaries
pnpm app:dev                            # compila e roda a Corneta
pnpm app:build                          # gera o instalador (NSIS)
```

> **Motor:** o **MediaMTX** é o servidor de ingestão (o OBS publica nele) e a Corneta roda **um
> FFmpeg por plataforma** lendo dele — assim cada destino tem **métricas reais** (bitrate/fps/quedas)
> e **reconexão independente** (uma plataforma cair não derruba as outras). Ambos os binários são
> baixados pelo `fetch-binaries.ps1`.

### 3. Testar ao vivo (OBS)

1. No app: **Plataformas** → adicione um destino e cole a stream key.
2. **Ao vivo** → **BORA AO VIVO** (status: "Aguardando OBS").
3. No OBS → Transmissão → Serviço **Personalizado**:
   - Servidor: `rtmp://127.0.0.1:1935/live` · Chave: `obs`
4. **Iniciar transmissão** no OBS → a Corneta entra no ar e replica para os destinos.

## Arquitetura (resumo)

```
OBS ──RTMP──▶ [ Corneta ]
               UI (React)  ◀──IPC──▶  Core (Rust)
                                       ├─ config (config.json)
                                       ├─ cofre de chaves (keychain do SO)
                                       └─ motor: FFmpeg sidecar (decode-once → encode-N)
                                                   │
                                                   ├──▶ Twitch
                                                   ├──▶ YouTube
                                                   └──▶ ...
```

- **Encoding** (`src/screens/EncodingScreen.tsx` + `src-tauri/src/engine.rs`): modos
  _Otimizado_ (um por plataforma), _Simples_ (encodar uma vez) e _Híbrido_. Ver §8.
- **Segurança**: chaves no keychain do SO, webviews sem permissão direta de shell, _tree-kill_ ao
  fechar. Ver §14.

## Estrutura

```
src/                 Frontend React
  lib/               types, presets, api (Tauri+mock), store (zustand), estimativas
  components/        ui primitives, sidebar
  screens/           Plataformas, Qualidade, Transmitir
src-tauri/           Backend Rust (Tauri 2)
  src/               config, keys, engine, commands, lib
  capabilities/      ACL (menor privilégio)
  binaries/          sidecars (não versionados)
scripts/             make-icons, fetch-binaries
legacy/              setup antigo (nginx-rtmp + docker)
```

## Documentação

- [`PLANEJAMENTO.md`](./docs/PLANEJAMENTO.md) — visão de produto, arquitetura, stacks e decisões.
- [`docs/PENDENCIAS.md`](./docs/PENDENCIAS.md) — **o que falta** para o app ficar pronto (com prioridades).
- [`docs/ATUALIZACAO-AUTOMATICA.md`](./docs/ATUALIZACAO-AUTOMATICA.md) — auto-update via GitHub Releases.
- [`docs/ASSINATURA.md`](./docs/ASSINATURA.md) — assinatura de código (Windows) + chave do updater.
- [`docs/GATES-DE-RELEASE.md`](./docs/GATES-DE-RELEASE.md) — gates automatizados e matriz manual obrigatória.
- [`docs/PLANO-TELEMETRIA-E-DIAGNOSTICO-POSTHOG.md`](./docs/PLANO-TELEMETRIA-E-DIAGNOSTICO-POSTHOG.md)
  — contrato de dados, consentimento e arquitetura da observabilidade.
- [`docs/RUNBOOK-POSTHOG.md`](./docs/RUNBOOK-POSTHOG.md) — provisionamento, dashboards, alertas,
  suporte, exclusão e rollback da telemetria.
- [`docs/ATUALIZACAO-DEPENDENCIAS-2026-08-01.md`](./docs/ATUALIZACAO-DEPENDENCIAS-2026-08-01.md)
  — versões, pins compatíveis, hashes e validação da atualização integral.
- [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) — licenças e obrigações dos sidecars.

## Licença

MIT, conforme o arquivo [`LICENSE`](./LICENSE). FFmpeg/MediaMTX são processos externos (não linkados).
