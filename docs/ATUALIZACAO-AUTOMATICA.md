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
GitHub Actions valida tag, configuração, deploy e política
        │
        ├─ Vite envia/apaga source maps (ou usa o kill switch emergencial)
        ├─ pnpm tauri build gera EXE + NSIS + .exe.sig com a CHAVE DO UPDATER
        ├─ create-updater-manifest.mjs gera latest.json a partir desse .sig
        ├─ 7-Zip lista/extrai o mesmo NSIS; artifacts:check procura mapas/segredos
        └─ só depois do scan, gh release create/upload cria o draft
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

O fluxo Windows-first está versionado em
[`../.github/workflows/release.yml`](../.github/workflows/release.yml). Ele não usa
`tauri-action`: os comandos shell deixam explícito qual step recebe cada segredo e garantem que o
instalador aprovado pelo scanner é o mesmo enviado ao draft.

Na ordem, o workflow:

1. faz checkout da tag existente e exige que ela seja exatamente `v` + `version` do
   `tauri.conf.json`;
2. instala Rust 1.97.1, dependências e sidecars com SHA-256 conferido;
3. executa os gates de telemetria/política e confere a metadata do deploy real;
4. no modo normal, executa o build Vite/upload de source maps no único step que recebe
   `POSTHOG_API_KEY` e `POSTHOG_PROJECT_ID`; no modo emergencial, exige os switches Vite/Rust em
   `1` e não expõe essas credenciais. Antes do Vite, um GET autenticado confirma que ID e project
   token pertencem ao mesmo projeto PostHog US, sem registrar resposta/segredo;
5. executa um único `pnpm tauri build`, com a chave privada do updater, sem refazer o `dist` e sem
   publicar nada;
6. gera `latest.json` com `scripts/create-updater-manifest.mjs`, usando o conteúdo do `.exe.sig` e
   a URL do NSIS gerado;
7. exige 7-Zip, lista/extrai esse mesmo NSIS e roda `pnpm artifacts:check` contra a árvore de
   bundle e conteúdo extraído;
8. somente se o scan passar, usa `gh release create/upload` para criar ou atualizar o draft com
   `.exe`, `.exe.sig` e `latest.json`; se um draft existente tiver qualquer outro asset, bloqueia
   para revisão/remoção manual antes de enviar.

O scan confirma o conteúdo que o 7-Zip consegue extrair do NSIS; ele não promete compreender
bytes comprimidos em um formato opaco que o próprio 7-Zip não abra.

### Secrets a configurar no GitHub

`Settings → Secrets and variables → Actions`:

| Secret | O que é |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | conteúdo da **chave privada do updater** (Passo 2) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | a senha dela, quando a chave for protegida |
| `POSTHOG_API_KEY` | Personal API Key dedicada ao upload de source maps; exigida só com telemetria ativa |
| *(futuro)* `WINDOWS_CERTIFICATE` / `WINDOWS_CERTIFICATE_PASSWORD` | Authenticode ainda não conectado a este workflow — ver [`ASSINATURA.md`](./ASSINATURA.md) |

No Environment `production-telemetry`, configure também as variáveis públicas descritas no
[`RUNBOOK-POSTHOG.md`](./RUNBOOK-POSTHOG.md), incluindo `POSTHOG_PROJECT_ID` e
`TELEMETRY_DISABLED`, e um reviewer obrigatório. O workflow declara `contents: write` para o
`GITHUB_TOKEN` somente criar/enviar o draft depois do scan.

Esses secrets, variables e reviewer são configuração externa: a presença deles não pode ser
confirmada pelo repositório e continua pendente até um administrador revisar o Environment.

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

O Actions valida, builda, assina, gera o manifesto, extrai/escaneia o mesmo NSIS e só então cria o
Release como rascunho. Você executa os gates manuais e **publica** → os apps instalados detectam e
atualizam no próximo `check()`.

---

## latest.json (referência — o script versionado gera)

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
- [x] Chave pública do updater embutida no config
- [ ] Chave privada correspondente recuperável em backup seguro e secrets do Environment
- [x] `createUpdaterArtifacts: true` + `plugins.updater` no `tauri.conf.json`
- [x] `check()/downloadAndInstall()/relaunch()` no app
- [x] `.github/workflows/release.yml` com build → manifesto → scan → draft implementado
- [ ] Secrets, variables e reviewer obrigatório configurados no Environment `production-telemetry`
- [ ] Primeira release de teste publicada e atualização validada de uma versão pra outra

---

## Estado da implementação (2026-08-01)

**Pronto no código:**

- `tauri-plugin-updater` + `tauri-plugin-process` no Cargo, registrados no `lib.rs`.
- `plugins.updater` no `tauri.conf.json`: endpoint no `releases/latest/download/latest.json`,
  chave pública embutida, `installMode: "passive"` (mostra a barra de progresso do NSIS sem pedir
  clique). `bundle.createUpdaterArtifacts: true` — **sem isso o build não emite os `.sig`** e a
  atualização falha em silêncio.
- Permissões `updater:default` e `process:allow-restart` na capability da janela principal.
- `src/lib/updater.ts` (checagem + instalação + store) e `src/components/UpdateBanner.tsx`
  (faixa no topo + botão "Procurar atualizações" na tela Sobre).
- `.github/workflows/release.yml`: valida tag/deploy/política, baixa sidecars com SHA-256, separa
  source maps dos segredos de assinatura, builda e assina uma única vez, gera o `latest.json`,
  verifica a assinatura com a chave pública, extrai/escaneia o mesmo NSIS e só então envia cinco
  artefatos como **rascunho**: instalador, assinatura, manifesto, checksums e pacote de terceiros.
  O pacote exige fontes correspondentes revisadas; ver `RUNBOOK-BETA.md`.

**A regra de produto que moldou o código:** instalar reinicia o app, e o processo é dono do
MediaMTX e de um FFmpeg por destino. Reiniciar no ar **derruba a transmissão**. Por isso o botão
"Atualizar agora" fica desabilitado enquanto o motor não está `stopped`, e a faixa troca o texto
pra "Você está no ar — atualize quando encerrar a live". O plugin sozinho não sabe disso.

**Falta você fazer (uma vez):**

1. Localize a chave privada que corresponde à chave pública do `tauri.conf.json` e confirme um
   backup seguro. Não gere/substitua o par depois de distribuir o app: perder a chave impede
   atualizar instalações existentes.
2. Configure `TAURI_SIGNING_PRIVATE_KEY` e, se aplicável,
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` no Environment `production-telemetry`.
3. Configure os secrets/variables de PostHog e o reviewer obrigatório conforme o runbook. Não
   marque esta etapa como concluída sem verificar o Environment real.
4. Produza o draft e valide assinatura, conteúdo, `latest.json` e atualização N-1 → N numa
   máquina limpa antes de publicar.

> A chave **pública** correspondente já está no `tauri.conf.json` e é pública por natureza —
> ela só serve pra verificar assinatura, não pra criar uma.
