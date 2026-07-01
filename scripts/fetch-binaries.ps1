# Baixa os sidecars (ffmpeg e mediamtx) e os coloca em src-tauri/binaries
# com o sufixo do target-triple exigido pelo Tauri (§14.1 do PLANEJAMENTO.md).
#
# As versões são FIXADAS (URLs versionadas + SHA-256 hardcoded abaixo) para
# build reproduzível e defesa contra release adulterado/corrompido. Nada é
# copiado para src-tauri/binaries sem o hash conferir.
#
# Uso:  pwsh -File scripts/fetch-binaries.ps1
#       pwsh -File scripts/fetch-binaries.ps1 -AllowSystemFfmpeg   # dev only!
#
# Depois, descomente "externalBin" em src-tauri/tauri.conf.json:
#   "externalBin": ["binaries/ffmpeg", "binaries/mediamtx"]

param(
  # Atalho de conveniência p/ dev: copia o ffmpeg encontrado no PATH em vez de
  # baixar a versão fixada. ATENÇÃO: esse binário NÃO passa por verificação de
  # hash — nunca use para gerar o instalador.
  [switch]$AllowSystemFfmpeg
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# ------------- Versões fixadas + SHA-256 esperados (dos .zip) ---------------
# Para atualizar uma versão: troque a URL e o hash JUNTOS, e recalcule com
#   Get-FileHash <zip> -Algorithm SHA256
#
# FFmpeg n7.1.5 win64 GPL (build estático) — BtbN/FFmpeg-Builds, release
# versionado "autobuild-2026-06-30-13-34" (NUNCA usar a tag rolante "latest").
# Hash calculado em 2026-07-01 via Get-FileHash sobre o download do release
# oficial (o BtbN não publica arquivo de checksums).
$ffmpegVersion = 'n7.1.5 (BtbN autobuild-2026-06-30-13-34)'
$ffmpegUrl     = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-06-30-13-34/ffmpeg-n7.1.5-1-g7d0e842004-win64-gpl-7.1.zip'
$ffmpegSha256  = '405B190F746DB40539EB453967F72C0E69D8BF260B10CEFF36E0C2149A9AD22F'

# MediaMTX v1.19.2 windows_amd64 — bluenviron/mediamtx.
# Hash conferido em 2026-07-01 contra o checksums.sha256 publicado no release:
#   https://github.com/bluenviron/mediamtx/releases/download/v1.19.2/checksums.sha256
$mtxVersion = 'v1.19.2'
$mtxUrl     = 'https://github.com/bluenviron/mediamtx/releases/download/v1.19.2/mediamtx_v1.19.2_windows_amd64.zip'
$mtxSha256  = '53028B551AFCC8D9DDBD56EB8406D5B31E395E5505D52E28347F211696BE9345'
# -----------------------------------------------------------------------------

$binDir = Join-Path $PSScriptRoot '..\src-tauri\binaries'
New-Item -ItemType Directory -Force -Path $binDir | Out-Null
$tmp = Join-Path $env:TEMP "corneta-bins"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

# Descobre o target-triple (default: Windows MSVC x64)
$triple = 'x86_64-pc-windows-msvc'
try {
  $rv = (& rustc -Vv) -join "`n"
  if ($rv -match 'host:\s*(\S+)') { $triple = $Matches[1] }
} catch { Write-Host "rustc não encontrado; usando $triple" }
Write-Host "Target triple: $triple"
if ($triple -notmatch '^x86_64-pc-windows') {
  Write-Warning "Os binários fixados neste script são win64; triple detectado: $triple."
}

# Baixa $Url em $OutFile e confere o SHA-256. Se divergir, apaga o arquivo e
# aborta — nenhum binário não verificado chega em src-tauri/binaries.
function Get-VerifiedFile {
  param(
    [string]$Url,
    [string]$OutFile,
    [string]$ExpectedSha256,
    [string]$Label
  )
  Invoke-WebRequest -Uri $Url -OutFile $OutFile
  $actual = (Get-FileHash -Path $OutFile -Algorithm SHA256).Hash
  if ($actual -ne $ExpectedSha256) {
    Remove-Item $OutFile -Force
    throw ("Hash SHA-256 do $Label NÃO confere!`n" +
           "  esperado: $ExpectedSha256`n" +
           "  obtido:   $actual`n" +
           "Download descartado. Pode ser corrupção de rede ou release adulterado — " +
           "confira URL/hash no topo deste script antes de tentar de novo.")
  }
  Write-Host "  hash SHA-256 do $Label conferido."
}

# ---------------- FFmpeg ----------------
$ffmpegOut = Join-Path $binDir "ffmpeg-$triple.exe"
$sys = if ($AllowSystemFfmpeg) { Get-Command ffmpeg -ErrorAction SilentlyContinue } else { $null }
if ($sys) {
  Write-Warning "-AllowSystemFfmpeg: copiando o ffmpeg do PATH SEM verificação de hash. Use só em dev; nunca para o instalador!"
  Write-Host "Copiando ffmpeg do sistema: $($sys.Source)"
  Copy-Item $sys.Source $ffmpegOut -Force
} else {
  if ($AllowSystemFfmpeg) { Write-Host "ffmpeg não encontrado no PATH; baixando a versão fixada." }
  Write-Host "Baixando FFmpeg $ffmpegVersion..."
  $zip = Join-Path $tmp 'ffmpeg.zip'
  Get-VerifiedFile -Url $ffmpegUrl -OutFile $zip -ExpectedSha256 $ffmpegSha256 -Label 'FFmpeg'
  $ffDir = Join-Path $tmp 'ffmpeg'
  if (Test-Path $ffDir) { Remove-Item $ffDir -Recurse -Force }
  Expand-Archive $zip -DestinationPath $ffDir -Force
  $exe = Get-ChildItem $ffDir -Recurse -Filter 'ffmpeg.exe' | Select-Object -First 1
  Copy-Item $exe.FullName $ffmpegOut -Force
}
Write-Host "  -> $ffmpegOut"

# ---------------- MediaMTX ----------------
$mtxOut = Join-Path $binDir "mediamtx-$triple.exe"
Write-Host "Baixando MediaMTX $mtxVersion..."
$zip = Join-Path $tmp 'mediamtx.zip'
Get-VerifiedFile -Url $mtxUrl -OutFile $zip -ExpectedSha256 $mtxSha256 -Label 'MediaMTX'
$mtxDir = Join-Path $tmp 'mtx'
if (Test-Path $mtxDir) { Remove-Item $mtxDir -Recurse -Force }
Expand-Archive $zip -DestinationPath $mtxDir -Force
$exe = Get-ChildItem $mtxDir -Recurse -Filter 'mediamtx.exe' | Select-Object -First 1
Copy-Item $exe.FullName $mtxOut -Force
Write-Host "  -> $mtxOut"

Write-Host "`nPronto. Agora descomente 'externalBin' em src-tauri/tauri.conf.json."
Get-ChildItem $binDir | Select-Object Name, Length | Format-Table -AutoSize
