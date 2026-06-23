<div align="center">

# 📣 Corneta

**Transmita para todas as plataformas ao mesmo tempo — sem dor de cabeça.**

App desktop (Tauri 2 + React) que recebe um único stream do OBS e o replica para Twitch,
YouTube, Facebook, Kick, TikTok e outras, com encoding por plataforma, cofre de chaves e
painel ao vivo. Veja o racional completo em [`PLANEJAMENTO.md`](./docs/PLANEJAMENTO.md).

</div>

---

## Status

🟢 **Fase 1 (MVP) em andamento.** Frontend completo e navegável; backend Rust escrito
(pendente de compilação local — requer toolchain Rust).

| Camada | Estado |
|---|---|
| UI (React + Tailwind v4) | ✅ funcional — roda no navegador em modo demonstração |
| Modelo de dados, presets, estimativas | ✅ |
| Backend Rust (config, cofre, motor FFmpeg, supervisão) | ✅ escrito — falta compilar |
| Sidecars (FFmpeg/MediaMTX) embutidos | ⏳ via `scripts/fetch-binaries.ps1` |
| Auto-config OBS / teste de upload | ⏳ stubs |

## Rodando

### 1. Frontend (demonstração, sem Rust)
A UI roda no navegador com um **motor simulado** (dados mock), ótimo para ver/testar o fluxo:

```bash
pnpm install
pnpm dev          # abre http://localhost:1420
```

### 2. App completo (Tauri)
Pré-requisitos: **Rust** (rustup), **VS Build Tools com C++/MSVC** e **WebView2** (Win 11 já traz).

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
  *Otimizado* (um por plataforma), *Simples* (encodar uma vez) e *Híbrido*. Ver §8.
- **Segurança**: chaves no keychain do SO, shell escopado aos sidecars, *tree-kill* ao
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
- [`NOMES.md`](./NOMES.md) — como chegamos no nome "Corneta".
- [`docs/PENDENCIAS.md`](./docs/PENDENCIAS.md) — **o que falta** para o app ficar pronto (com prioridades).
- [`docs/ATUALIZACAO-AUTOMATICA.md`](./docs/ATUALIZACAO-AUTOMATICA.md) — auto-update via GitHub Releases.
- [`docs/ASSINATURA.md`](./docs/ASSINATURA.md) — assinatura de código (Windows) + chave do updater.

## Licença

A definir (sugestão: MIT/Apache-2.0). FFmpeg/MediaMTX são processos externos (não linkados).
