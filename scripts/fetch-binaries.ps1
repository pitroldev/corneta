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
# `externalBin` já está ativo em src-tauri/tauri.conf.json.

param(
  # Atalho de conveniência p/ dev: copia o ffmpeg encontrado no PATH em vez de
  # baixar a versão fixada. ATENÇÃO: esse binário NÃO passa por verificação de
  # hash — nunca use para gerar o instalador.
  [switch]$AllowSystemFfmpeg,

  # CI de integração: expõe ffmpeg.exe e ffprobe.exe vindos do MESMO arquivo
  # verificado. O sidecar distribuído continua sendo copiado para binaries/.
  [string]$ToolDirectory,

  # Permite validar o script sem sobrescrever os sidecars do workspace.
  [string]$BinaryDirectory,

  # Espelho durável controlado pelo projeto; o hash fixado continua obrigatório.
  [string]$FfmpegMirrorUrl = $env:CORNETA_FFMPEG_MIRROR_URL
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# ------------- Versões fixadas + SHA-256 esperados (dos .zip) ---------------
# Para atualizar uma versão: troque a URL e o hash JUNTOS, e recalcule com
#   Get-FileHash <zip> -Algorithm SHA256
#
# FFmpeg n8.1.2 win64 GPL (build estático) — BtbN/FFmpeg-Builds, release
# versionado "autobuild-2026-09-06-13-06" (NUNCA usar a tag rolante "latest").
# O pin anterior foi removido pelo upstream (404). Hash conferido em 2026-09-06
# contra o digest SHA-256 publicado pelo GitHub
# nos metadados do asset oficial dessa release.
$ffmpegVersion = 'n8.1.2-50-g1a748fe2cd (BtbN autobuild-2026-09-06-13-06)'
$ffmpegUrl     = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-09-06-13-06/ffmpeg-n8.1.2-50-g1a748fe2cd-win64-gpl-8.1.zip'
$ffmpegSha256  = 'E254995D48E6E9E88F5A05EB886A75E9AC33D7C6BB2E8A301E2EB65848A2D489'

# MediaMTX v1.19.3 windows_amd64 — bluenviron/mediamtx.
# Hash conferido em 2026-08-01 contra o checksums.sha256 publicado no release:
#   https://github.com/bluenviron/mediamtx/releases/download/v1.19.3/checksums.sha256
$mtxVersion = 'v1.19.3'
$mtxUrl     = 'https://github.com/bluenviron/mediamtx/releases/download/v1.19.3/mediamtx_v1.19.3_windows_amd64.zip'
$mtxSha256  = '5D82148D1032A6A190D9909A2997D9989457AAADF49AF87DD02CD4512D31BEBE'
# -----------------------------------------------------------------------------

if ($AllowSystemFfmpeg -and $ToolDirectory) {
  throw '-ToolDirectory exige o arquivo FFmpeg verificado; não combine com -AllowSystemFfmpeg.'
}

$binDir = if ($BinaryDirectory) {
  [System.IO.Path]::GetFullPath($BinaryDirectory)
} else {
  Join-Path $PSScriptRoot '..\src-tauri\binaries'
}
New-Item -ItemType Directory -Force -Path $binDir | Out-Null
$cacheDir = Join-Path $env:TEMP 'corneta-bins-cache'
New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null
# Diretório exclusivo: não apaga nem reutiliza uma extração de outro build.
$tmp = Join-Path $env:TEMP ("corneta-bins-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$noticeDir = Join-Path $binDir 'third-party'
New-Item -ItemType Directory -Force -Path $noticeDir | Out-Null

# Descobre o target-triple (default: Windows MSVC x64)
$triple = 'x86_64-pc-windows-msvc'
try {
  $rv = (& rustc -Vv) -join "`n"
  if ($rv -match 'host:\s*(\S+)') { $triple = $Matches[1] }
} catch { Write-Host "rustc não encontrado; usando $triple" }
Write-Host "Target triple: $triple"
if ($triple -notmatch '^x86_64-pc-windows') {
  throw "Os binários fixados são Windows x64; target incompatível: $triple."
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
  if (Test-Path -LiteralPath $OutFile) {
    if ((Get-FileHash -LiteralPath $OutFile -Algorithm SHA256).Hash -eq $ExpectedSha256) {
      Write-Host "  cache SHA-256 do $Label conferido."
      return
    }
  }
  Invoke-WebRequest -Uri $Url -OutFile $OutFile -TimeoutSec 180
  $actual = (Get-FileHash -Path $OutFile -Algorithm SHA256).Hash
  if ($actual -ne $ExpectedSha256) {
    throw ("Hash SHA-256 do $Label NÃO confere!`n" +
           "  esperado: $ExpectedSha256`n" +
           "  obtido:   $actual`n" +
           "Download NÃO será usado. Pode ser corrupção de rede ou release adulterado — " +
           "confira URL/hash no topo deste script antes de tentar de novo.")
  }
  Write-Host "  hash SHA-256 do $Label conferido."
}

# ---------------- FFmpeg ----------------
try {
$ffmpegOut = Join-Path $binDir "ffmpeg-$triple.exe"
$verifiedFfprobe = $null
$sys = if ($AllowSystemFfmpeg) { Get-Command ffmpeg -ErrorAction SilentlyContinue } else { $null }
if ($sys) {
  Write-Warning "-AllowSystemFfmpeg: copiando o ffmpeg do PATH SEM verificação de hash. Use só em dev; nunca para o instalador!"
  Write-Host "Copiando ffmpeg do sistema: $($sys.Source)"
  Copy-Item $sys.Source $ffmpegOut -Force
} else {
  if ($AllowSystemFfmpeg) { Write-Host "ffmpeg não encontrado no PATH; baixando a versão fixada." }
  Write-Host "Baixando FFmpeg $ffmpegVersion..."
  $zip = Join-Path $cacheDir "$ffmpegSha256.zip"
  $downloadUrl = $ffmpegUrl
  if ($FfmpegMirrorUrl) {
    $mirror = [uri]$FfmpegMirrorUrl
    if ($mirror.Scheme -ne 'https' -or $mirror.UserInfo -or $mirror.Query -or $mirror.Fragment) {
      throw 'Espelho FFmpeg deve ser HTTPS, sem credenciais, query ou fragmento.'
    }
    $downloadUrl = $mirror.AbsoluteUri
  }
  Get-VerifiedFile -Url $downloadUrl -OutFile $zip -ExpectedSha256 $ffmpegSha256 -Label 'FFmpeg'
  $ffDir = Join-Path $tmp 'ffmpeg'
  Expand-Archive $zip -DestinationPath $ffDir -Force
  $exe = @(Get-ChildItem $ffDir -Recurse -File -Filter 'ffmpeg.exe')
  $ffprobe = @(Get-ChildItem $ffDir -Recurse -File -Filter 'ffprobe.exe')
  if ($exe.Count -ne 1 -or $ffprobe.Count -ne 1) {
    throw 'O arquivo FFmpeg verificado não contém exatamente as ferramentas esperadas.'
  }
  Copy-Item $exe.FullName $ffmpegOut -Force
  $verifiedFfprobe = $ffprobe.FullName
  $license = @(Get-ChildItem $ffDir -Recurse -File -Filter 'LICENSE.txt')
  if ($license.Count -ne 1) { throw 'Licença do FFmpeg ausente ou ambígua.' }
  Copy-Item -LiteralPath $license[0].FullName -Destination (Join-Path $noticeDir 'FFmpeg-LICENSE.txt') -Force
  (& $ffmpegOut -version 2>&1) | Out-File -LiteralPath (Join-Path $noticeDir 'FFmpeg-version.txt') -Encoding utf8
  if ($LASTEXITCODE -ne 0) { throw 'FFmpeg verificado não executou.' }
  (& $ffmpegOut -buildconf 2>&1) | Out-File -LiteralPath (Join-Path $noticeDir 'FFmpeg-buildconf.txt') -Encoding utf8
  if ($LASTEXITCODE -ne 0) { throw 'Não foi possível obter a configuração do FFmpeg.' }
}
Write-Host "  -> $ffmpegOut"

if ($ToolDirectory) {
  $resolvedToolDirectory = [System.IO.Path]::GetFullPath($ToolDirectory)
  New-Item -ItemType Directory -Force -Path $resolvedToolDirectory | Out-Null
  Copy-Item $ffmpegOut (Join-Path $resolvedToolDirectory 'ffmpeg.exe') -Force
  Copy-Item $verifiedFfprobe (Join-Path $resolvedToolDirectory 'ffprobe.exe') -Force
  Write-Host "  -> ferramentas de teste verificadas em $resolvedToolDirectory"
}

# ---------------- MediaMTX ----------------
$mtxOut = Join-Path $binDir "mediamtx-$triple.exe"
Write-Host "Baixando MediaMTX $mtxVersion..."
$zip = Join-Path $cacheDir "$mtxSha256.zip"
Get-VerifiedFile -Url $mtxUrl -OutFile $zip -ExpectedSha256 $mtxSha256 -Label 'MediaMTX'
$mtxDir = Join-Path $tmp 'mtx'
Expand-Archive $zip -DestinationPath $mtxDir -Force
$exe = @(Get-ChildItem $mtxDir -Recurse -File -Filter 'mediamtx.exe')
if ($exe.Count -ne 1) { throw 'MediaMTX ausente ou ambíguo no arquivo verificado.' }
Copy-Item $exe.FullName $mtxOut -Force
$license = @(Get-ChildItem $mtxDir -Recurse -File -Filter 'LICENSE')
if ($license.Count -ne 1) { throw 'Licença do MediaMTX ausente ou ambígua.' }
Copy-Item -LiteralPath $license[0].FullName -Destination (Join-Path $noticeDir 'MediaMTX-LICENSE.txt') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '../THIRD_PARTY_NOTICES.md') -Destination (Join-Path $noticeDir 'THIRD_PARTY_NOTICES.md') -Force
@{
  ffmpeg = @{ version = $ffmpegVersion; upstreamUrl = $ffmpegUrl; archiveSha256 = $ffmpegSha256; binarySha256 = (Get-FileHash -LiteralPath $ffmpegOut).Hash; verified = -not [bool]$sys }
  mediamtx = @{ version = $mtxVersion; upstreamUrl = $mtxUrl; archiveSha256 = $mtxSha256; binarySha256 = (Get-FileHash -LiteralPath $mtxOut).Hash }
} | ConvertTo-Json -Depth 4 | Out-File -LiteralPath (Join-Path $noticeDir 'sidecars.json') -Encoding utf8
Write-Host "  -> $mtxOut"

Write-Host "`nPronto. Os sidecars verificados estão disponíveis para o Tauri."
Get-ChildItem $binDir | Select-Object Name, Length | Format-Table -AutoSize
} finally {
  # Apenas nossa extração exclusiva; nunca apagar uma pasta fornecida pelo usuário.
  $resolvedTemp = [System.IO.Path]::GetFullPath($env:TEMP).TrimEnd('\', '/')
  $resolvedExtraction = [System.IO.Path]::GetFullPath($tmp)
  if ([System.IO.Path]::GetDirectoryName($resolvedExtraction) -ne $resolvedTemp -or
      [System.IO.Path]::GetFileName($resolvedExtraction) -notmatch '^corneta-bins-[a-f0-9]{32}$') {
    throw 'Limpeza recusada: diretório temporário fora do escopo esperado.'
  }
  if (Test-Path -LiteralPath $resolvedExtraction) {
    Remove-Item -LiteralPath $resolvedExtraction -Recurse -Force
  }
}
