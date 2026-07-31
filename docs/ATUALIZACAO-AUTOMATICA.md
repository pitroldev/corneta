# Atualização automática via GitHub Releases

> Como ligar o **auto-updater** da Corneta usando o **GitHub Releases** como servidor de updates
> (de graça). O app checa uma URL, compara versões, baixa o instalador novo, valida a assinatura e
> reinicia. Baseado no plugin oficial `tauri-plugin-updater` (Tauri 2).

> ⚠️ **Duas assinaturas diferentes — não confunda** (ver também [`ASSINATURA.md`](./ASSINATURA.md)):
> 1. **Chave do updater** (este doc): um par de chaves *próprio do Tauri* que garante que o update
>    veio de você e não foi adulterado. É **obrigatória** pro updater funcionar.
> 2. **Certificado de code signing do Windows** (outro doc): tira o alerta do SmartScreen na
>    instalação. É **opcional** (mas recomendado). São coisas independentes.

---

## Visão geral do fluxo

```
você cria uma tag (ex.: v0.2.0)
        │
        ▼
GitHub Actions (tauri-action) builda no windows-latest
        │  ├─ assina os artefatos do update com a CHAVE DO UPDATER
        │  ├─ gera Corneta_0.2.0_x64-setup.exe (+ .sig)
        │  └─ gera latest.json (manifesto)  ──► publica tudo no GitHub Release
        ▼
Corneta instalada chama check() ──► lê latest.json do "latest release"
        │  versão nova? baixa o setup.exe, confere a assinatura, instala, reinicia
        ▼
usuário atualizado, sem fazer nada
```

---

## Passo 1 — Adicionar os plugins

Na raiz do projeto:

```bash
pnpm tauri add updater
pnpm tauri add process   # necessário para reiniciar o app após instalar o update
```

O `tauri add` já edita `Cargo.toml`, instala o pacote JS, registra o plugin no `lib.rs` e adiciona
as permissões nas *capabilities*. Se preferir manual:

- **Cargo** (`src-tauri/Cargo.toml`): `tauri-plugin-updater = "2"` e `tauri-plugin-process = "2"`
- **JS**: `pnpm add @tauri-apps/plugin-updater @tauri-apps/plugin-process`
- **`src-tauri/src/lib.rs`** — registrar (desktop only):
  ```rust
  .setup(|app| {
      #[cfg(desktop)]
      app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
      Ok(())
  })
  .plugin(tauri_plugin_process::init())
  ```
- **`src-tauri/capabilities/default.json`** — adicionar `"updater:default"` e `"core:default"` já
  cobre o `relaunch` do process (se não, adicione `"process:default"`).

---

## Passo 2 — Gerar a chave do updater

```bash
pnpm tauri signer generate -w "$HOME/.tauri/corneta-updater.key"
```

Isso gera:
- **Chave privada** (`corneta-updater.key`) + a senha que você definir → **guardar com a vida**.
  ⚠️ Se perder essa chave, **não dá mais pra atualizar quem já instalou** a Corneta.
- **Chave pública** (impressa no terminal / `corneta-updater.key.pub`) → vai no `tauri.conf.json`.

**NUNCA** comite a chave privada. Ela entra como *secret* no GitHub e como variável de ambiente no
build local — `.env` **não** funciona pro Tauri.

---

## Passo 3 — Configurar o `tauri.conf.json`

```jsonc
{
  "bundle": {
    "createUpdaterArtifacts": true        // gera os .sig e o pacote de update
  },
  "plugins": {
    "updater": {
      "pubkey": "COLE_AQUI_O_CONTEUDO_DA_CHAVE_PUBLICA",
      "endpoints": [
        "https://github.com/SEU-USUARIO/corneta/releases/latest/download/latest.json"
      ],
      "windows": { "installMode": "passive" }   // barra de progresso, sem cliques
    }
  }
}
```

- Troque `SEU-USUARIO/corneta` pelo repositório real (ex.: `pitroldev/corneta`).
- `installMode`: `passive` (padrão, barra), `basicUi` (interativo) ou `quiet` (silencioso).
- Os endpoints aceitam variáveis: `{{target}}` (windows/linux/darwin), `{{arch}}` (x86_64…),
  `{{current_version}}` — úteis se um dia hospedar fora do GitHub.

---

## Passo 4 — Checar updates no app (frontend)

Crie algo como `src/lib/updater.ts` e chame na inicialização (ex.: no `App.tsx`):

```ts
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export async function checkForUpdates() {
  const update = await check();          // lê o latest.json do endpoint
  if (!update) return;                   // já está atualizado

  // (opcional) perguntar ao usuário antes — combina com um toast/modal da Corneta
  await update.downloadAndInstall((e) => {
    if (e.event === "Progress") {
      // atualizar uma barrinha na UI, se quiser
    }
  });

  await relaunch();                      // reinicia já na versão nova
}
```

> Boa prática: checar no startup e, se houver update, mostrar um **toast da Corneta** ("Tem corneta
> nova! 📣 Atualizar?") em vez de instalar à força.

---

## Passo 5 — Publicar releases pelo GitHub Actions

Crie **`.github/workflows/release.yml`**. Versão **Windows-first** (adicione macOS/Linux depois):

```yaml
name: release
on:
  push:
    tags: ["v*"]          # dispara ao criar uma tag tipo v0.2.0
  workflow_dispatch:

jobs:
  build:
    permissions:
      contents: write     # necessário pra criar o Release
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: lts/*, cache: pnpm }

      - uses: dtolnay/rust-toolchain@stable
      - uses: swatinem/rust-cache@v2
        with: { workspaces: "./src-tauri -> target" }

      - run: pnpm install
      - run: pwsh -File scripts/fetch-binaries.ps1   # coloca o ffmpeg em src-tauri/binaries

      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
          # (assinatura do Windows entra aqui também — ver ASSINATURA.md)
        with:
          tagName: ${{ github.ref_name }}
          releaseName: "Corneta ${{ github.ref_name }}"
          releaseBody: "Veja os assets para baixar e instalar."
          releaseDraft: true            # publica como rascunho pra você revisar
          prerelease: false
```

O `tauri-action`:
- roda `tauri build`, **assina** os artefatos com a chave do updater,
- cria o **GitHub Release** da tag,
- sobe o `Corneta_x.y.z_x64-setup.exe` (+ `.sig`) e **gera/sobe o `latest.json`**.

### Secrets a configurar no GitHub
`Settings → Secrets and variables → Actions`:

| Secret | O que é |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | conteúdo da **chave privada do updater** (Passo 2) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | a senha dela |
| *(opcional)* `WINDOWS_CERTIFICATE` / `WINDOWS_CERTIFICATE_PASSWORD` | code signing do Windows — ver [`ASSINATURA.md`](./ASSINATURA.md) |

E em `Settings → Actions → Workflow permissions`: marcar **Read and write permissions**.

---

## Como lançar uma versão nova (rotina)

```bash
# 1. suba a versão em package.json E em src-tauri/tauri.conf.json (ex.: 0.2.0)
# 2. commit
git commit -am "release: v0.2.0"
# 3. tag + push
git tag v0.2.0
git push origin v0.2.0
```

O Actions builda, assina e cria o Release (rascunho). Você revisa e **publica** → os apps instalados
detectam e atualizam sozinhos no próximo `check()`.

---

## latest.json (referência — o Action gera, mas é bom saber)

```json
{
  "version": "0.2.0",
  "notes": "Reconexão automática + métricas por plataforma.",
  "pub_date": "2026-07-01T12:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "CONTEUDO_DO_ARQUIVO_.sig",
      "url": "https://github.com/SEU-USUARIO/corneta/releases/download/v0.2.0/Corneta_0.2.0_x64-setup.exe"
    }
  }
}
```
> O `signature` é o **conteúdo** do `.sig` (não o caminho). Updates exigem **HTTPS**.

---

## Checklist

- [x] `pnpm tauri add updater` + `pnpm tauri add process`
- [x] Chave do updater gerada e guardada com segurança (pública no config, privada nos secrets)
- [x] `createUpdaterArtifacts: true` + `plugins.updater` no `tauri.conf.json`
- [x] `check()/downloadAndInstall()/relaunch()` no app
- [x] `.github/workflows/release.yml` com os secrets configurados
- [ ] Primeira release de teste publicada e atualização validada de uma versão pra outra

---

## Estado da implementação (2026-07-30)

**Pronto no código:**

- `tauri-plugin-updater` + `tauri-plugin-process` no Cargo, registrados no `lib.rs`.
- `plugins.updater` no `tauri.conf.json`: endpoint no `releases/latest/download/latest.json`,
  chave pública embutida, `installMode: "passive"` (mostra a barra de progresso do NSIS sem pedir
  clique). `bundle.createUpdaterArtifacts: true` — **sem isso o build não emite os `.sig`** e a
  atualização falha em silêncio.
- Permissões `updater:default` e `process:allow-restart` na capability da janela principal.
- `src/lib/updater.ts` (checagem + instalação + store) e `src/components/UpdateBanner.tsx`
  (faixa no topo + botão "Procurar atualizações" na tela Sobre).
- `.github/workflows/release.yml`: dispara na tag `v*`, baixa os sidecars com verificação de
  SHA-256, builda, assina e publica como **rascunho**.

**A regra de produto que moldou o código:** instalar reinicia o app, e o processo é dono do
MediaMTX e de um FFmpeg por destino. Reiniciar no ar **derruba a transmissão**. Por isso o botão
"Atualizar agora" fica desabilitado enquanto o motor não está `stopped`, e a faixa troca o texto
pra "Você está no ar — atualize quando encerrar a live". O plugin sozinho não sabe disso.

**Falta você fazer (uma vez):**

1. A chave privada está em `~/.tauri/corneta-updater.key` (fora do repositório, senha vazia).
2. Crie dois secrets no GitHub (**Settings → Secrets and variables → Actions**):
   - `TAURI_SIGNING_PRIVATE_KEY` = o conteúdo do arquivo `corneta-updater.key`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = vazio
3. Guarde uma cópia da chave privada em lugar seguro e **apague o arquivo local** se preferir.
   Perder essa chave significa que nenhuma versão futura consegue atualizar quem já instalou —
   todo mundo teria que baixar e instalar na mão de novo.
4. Publique uma release de teste e valide a atualização N-1 → N numa máquina.

> A chave **pública** correspondente já está no `tauri.conf.json` e é pública por natureza —
> ela só serve pra verificar assinatura, não pra criar uma.
