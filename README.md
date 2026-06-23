<div align="center">

# 📣 Corneta

**Transmita para todas as plataformas ao mesmo tempo — sem dor de cabeça.**

App desktop (Tauri 2 + React) que recebe um único stream do OBS e o replica para Twitch,
YouTube, Facebook, Kick, TikTok e outras, com encoding por plataforma, cofre de chaves e
painel ao vivo. Veja o racional completo em [`PLANEJAMENTO.md`](./PLANEJAMENTO.md).

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
Requer o toolchain de desktop:

- **Rust** (rustup): https://rustup.rs
- **Visual Studio Build Tools** com "Desenvolvimento para desktop com C++" (linker MSVC)
- **WebView2** (já vem no Windows 11)

Depois:

```bash
pwsh -File scripts/make-icons.ps1       # ícones (já gerados; rode se quiser regenerar)
pwsh -File scripts/fetch-binaries.ps1   # baixa ffmpeg + mediamtx para src-tauri/binaries
# descomente "externalBin" em src-tauri/tauri.conf.json
pnpm app:dev                            # roda a Corneta de verdade
pnpm app:build                          # gera o instalador (NSIS)
```

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

## Licença

A definir (sugestão: MIT/Apache-2.0). FFmpeg/MediaMTX são processos externos (não linkados).
