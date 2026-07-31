# Assinatura de código (code signing)

> Como assinar a Corneta para que o Windows **não mostre o alerta do SmartScreen** ("aplicativo não
> reconhecido") na instalação. Baseado na doc oficial do Tauri 2.

## As DUAS assinaturas (não confunda)

| | Chave do **updater** | Certificado de **code signing** |
|---|---|---|
| Pra quê | garantir que o update veio de você (integridade) | tirar o alerta do SmartScreen na instalação |
| Obrigatória? | **Sim**, pro auto-update funcionar | **Não** (mas muito recomendada) |
| Onde mora | gerada pelo Tauri (`tauri signer generate`) | comprada de uma CA ou via Azure |
| Variáveis | `TAURI_SIGNING_PRIVATE_KEY` (+ senha) | certificado / `signCommand` |
| Doc | [`ATUALIZACAO-AUTOMATICA.md`](./ATUALIZACAO-AUTOMATICA.md) | **este aqui** |

Este documento trata do **certificado de code signing do Windows**.

---

## Por que assinar

Sem assinatura, ao baixar o `Corneta_x.y.z_x64-setup.exe` o usuário vê o **SmartScreen**:
*"O Windows protegeu o computador… aplicativo não reconhecido"*. Ele consegue instalar clicando em
"Mais informações → Executar assim mesmo", mas assusta e derruba conversão.

- **Certificado EV (Extended Validation):** reputação **imediata** no SmartScreen — zero alerta desde
  o dia 1. Mais caro e exige validação da empresa/identidade.
- **Certificado OV (Organization Validated):** mais barato (e disponível pra pessoa física em alguns
  casos), mas o SmartScreen **ainda alerta no começo** — a reputação melhora conforme downloads.

> Onde comprar: CAs aprovadas pela Microsoft (DigiCert, Sectigo, GlobalSign, SSL.com…). Compre um
> **code signing certificate**, não um certificado SSL.

---

## Caminho recomendado para a Corneta

Sendo um app **gratuito/OSS**, em ordem de custo-benefício:

1. **Começar sem assinar** + documentar o aviso no README (válido pra um beta). Custo zero.
2. **Azure Trusted Signing** — o caminho moderno e barato (assinatura como serviço, ~US$/mês), sem
   precisar guardar um `.pfx`. Bom quando você tiver CNPJ/identidade pra validar.
3. **Certificado OV** tradicional (arquivo `.pfx`) — funciona, reputação cresce com o tempo.
4. **Certificado EV** — se quiser zero alerta imediato e topar o custo/burocracia.

As três formas abaixo cobrem 2–4.

---

## Opção A — Azure Trusted Signing (recomendada)

Assinatura gerenciada pela Microsoft, sem manter chave privada localmente.

**Pré-requisitos:** conta de *Trusted Signing*, .NET 8+, Azure CLI, Windows 11 SDK (signtool).

```bash
cargo install trusted-signing-cli
```

Variáveis de ambiente (de um *App Registration* no Entra ID):
`AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`.

**`src-tauri/tauri.conf.json`:**
```json
{
  "bundle": {
    "windows": {
      "signCommand": "trusted-signing-cli -e https://wus2.codesigning.azure.net -a MinhaConta -c MeuPerfil %1"
    }
  }
}
```
Aí é só `pnpm tauri build` — o Tauri chama o `signCommand` em cada artefato (`%1` = arquivo).

---

## Opção B — Azure Key Vault + relic

Certificado guardado num Key Vault, assinado via [`relic`](https://github.com/sassoftware/relic).

```bash
go install github.com/sassoftware/relic/v8@latest
```

**`src-tauri/relic.conf`:**
```yaml
tokens:
  azure: { type: azure }
keys:
  azure:
    token: azure
    id: https://<KEY_VAULT>.vault.azure.net/certificates/<CERTIFICADO>
```

**`tauri.conf.json`:**
```json
{ "bundle": { "windows": { "signCommand": "relic sign --file %1 --key azure --config relic.conf" } } }
```

Variáveis: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_CLIENT_SECRET`. Dê à app os papéis
*Key Vault Certificate User* e *Key Vault Crypto User* no IAM do Key Vault.

---

## Opção C — Certificado local (.pfx)

Se você tem um arquivo `.pfx` (OV/EV exportado):

1. (se vier separado) **converter** pra pfx:
   ```bash
   openssl pkcs12 -export -in cert.cer -inkey private-key.key -out certificate.pfx
   ```
2. **importar** no repositório de certificados do Windows:
   ```powershell
   $pwd = 'SENHA_DO_PFX'
   Import-PfxCertificate -FilePath certificate.pfx -CertStoreLocation Cert:\CurrentUser\My `
     -Password (ConvertTo-SecureString -String $pwd -Force -AsPlainText)
   ```
3. pegar o **thumbprint** (em `certmgr.msc`) e configurar:

**`tauri.conf.json`:**
```json
{
  "bundle": {
    "windows": {
      "certificateThumbprint": "A1B1A2B2A3B3A4B4A5B5A6B6A7B7A8B8A9B9A0B0",
      "digestAlgorithm": "sha256",
      "timestampUrl": "http://timestamp.sectigo.com"
    }
  }
}
```
`pnpm tauri build` assina automaticamente. O `timestampUrl` (do emissor do cert) faz a assinatura
continuar válida mesmo depois do certificado expirar.

---

## No GitHub Actions (CI) — opção C

Adicione os secrets `WINDOWS_CERTIFICATE` (o `.pfx` em base64) e `WINDOWS_CERTIFICATE_PASSWORD`:

```bash
certutil -encode certificate.pfx base64cert.txt   # gera o base64 pra colar no secret
```

E um passo **antes** do build no workflow ([`ATUALIZACAO-AUTOMATICA.md`](./ATUALIZACAO-AUTOMATICA.md)):

```yaml
      - name: importar certificado (Windows)
        env:
          WINDOWS_CERTIFICATE: ${{ secrets.WINDOWS_CERTIFICATE }}
          WINDOWS_CERTIFICATE_PASSWORD: ${{ secrets.WINDOWS_CERTIFICATE_PASSWORD }}
        run: |
          New-Item -ItemType directory -Path certificate
          Set-Content -Path certificate/tempCert.txt -Value $env:WINDOWS_CERTIFICATE
          certutil -decode certificate/tempCert.txt certificate/certificate.pfx
          Remove-Item -path certificate -include tempCert.txt
          Import-PfxCertificate -FilePath certificate/certificate.pfx -CertStoreLocation Cert:\CurrentUser\My `
            -Password (ConvertTo-SecureString -String $env:WINDOWS_CERTIFICATE_PASSWORD -Force -AsPlainText)
```

Para Azure (A/B), em vez disso passe `AZURE_CLIENT_ID/SECRET/TENANT_ID` como secrets — o
`signCommand` do `tauri.conf.json` faz o resto durante o `tauri build`.

---

## macOS / Linux (futuro)

- **macOS:** exige Apple Developer ID (US$99/ano) + **notarização**. Doc do Tauri: `distribute/sign/macos`.
- **Linux:** AppImage/deb normalmente não exigem assinatura; updates seguem validados pela chave do updater.

---

## Tabela de opções do `tauri.conf.json` (`bundle.windows`)

| Opção | Pra quê |
|---|---|
| `certificateThumbprint` | identifica o cert importado no Windows (opção C) |
| `digestAlgorithm` | algoritmo do hash (`sha256`) |
| `timestampUrl` | servidor de timestamp do emissor |
| `signCommand` | ferramenta externa de assinatura (`%1` = arquivo) — opções A/B |

---

---

## Decisão do v1 (2026-07-30): **lançar SEM assinar**

Não há verba pra certificado agora. Isso é uma decisão consciente, não um esquecimento —
e tem consequência concreta: **todo mundo que baixar vai ver o SmartScreen** ("O Windows protegeu
o seu PC"), com o botão de executar escondido atrás de "Mais informações".

**O que NÃO adianta fazer:**

- **Certificado autoassinado.** O SmartScreen não avalia se a assinatura é válida, e sim se o
  binário/publicador tem **reputação**. Autoassinado dá o mesmo alerta, com trabalho a mais.
- **Esperar reputação chegar sozinha.** Reputação se acumula por volume de downloads. Um app novo
  e sem assinatura praticamente não acumula — o relógio só começa a andar de verdade com cert.

**O que dá pra fazer de graça e reduz a perda:**

1. **Explicar o alerta ANTES de ele aparecer.** Uma seção curta na página de download, com o
   print exato da tela e a seta em "Mais informações → Executar assim mesmo". Quem é avisado
   antes não interpreta como vírus; quem é pego de surpresa fecha a janela.
2. **Publicar o SHA-256** de cada instalador na release. Quem desconfia consegue conferir.
3. **Link do VirusTotal** do `.exe` na própria release. É o argumento mais forte que existe sem
   certificado, porque não é você falando.
4. **Distribuir pelo GitHub Releases**, não por um link qualquer. `github.com/pitroldev/corneta`
   com o código aberto ao lado do binário vale muito como sinal de confiança.

**Quando reavaliar:** assim que houver receita. O caminho mais barato hoje é o Azure Trusted
Signing (ordem de ~US$ 10/mês, confirmar preço e requisitos de validação na hora), bem abaixo do
OV tradicional. Até lá, o item 7 do [`PENDENCIAS.md`](./PENDENCIAS.md) fica ⛔ **por decisão**.

---

## Checklist

- [x] Decidir a estratégia — **v1 sai sem assinar** (ver a seção acima)
- [ ] Página de download com o aviso do SmartScreen explicado + SHA-256 + VirusTotal
- [ ] Configurar `bundle.windows` (thumbprint **ou** signCommand) no `tauri.conf.json`
- [ ] `pnpm tauri build` assinando localmente OK
- [ ] Secrets no GitHub (pfx base64 **ou** credenciais Azure)
- [ ] Verificar: instalar o `.exe` baixado **sem** alerta do SmartScreen (EV) ou com reputação crescente (OV)
