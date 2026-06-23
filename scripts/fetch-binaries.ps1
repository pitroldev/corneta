# Baixa os sidecars (ffmpeg e mediamtx) e os coloca em src-tauri/binaries
# com o sufixo do target-triple exigido pelo Tauri (§14.1 do PLANEJAMENTO.md).
#
# Uso:  pwsh -File scripts/fetch-binaries.ps1
#
# Depois, descomente "externalBin" em src-tauri/tauri.conf.json:
#   "externalBin": ["binaries/ffmpeg", "binaries/mediamtx"]

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

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

# ---------------- FFmpeg ----------------
$ffmpegOut = Join-Path $binDir "ffmpeg-$triple.exe"
$sys = Get-Command ffmpeg -ErrorAction SilentlyContinue
if ($sys) {
  Write-Host "Copiando ffmpeg do sistema: $($sys.Source)"
  Copy-Item $sys.Source $ffmpegOut -Force
} else {
  Write-Host "Baixando FFmpeg (BtbN)..."
  $zip = Join-Path $tmp 'ffmpeg.zip'
  Invoke-WebRequest -Uri 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip' -OutFile $zip
  Expand-Archive $zip -DestinationPath $tmp -Force
  $exe = Get-ChildItem $tmp -Recurse -Filter 'ffmpeg.exe' | Select-Object -First 1
  Copy-Item $exe.FullName $ffmpegOut -Force
}
Write-Host "  -> $ffmpegOut"

# ---------------- MediaMTX ----------------
$mtxOut = Join-Path $binDir "mediamtx-$triple.exe"
Write-Host "Buscando última versão do MediaMTX..."
$rel = Invoke-RestMethod -Uri 'https://api.github.com/repos/bluenviron/mediamtx/releases/latest' -Headers @{ 'User-Agent' = 'corneta' }
$asset = $rel.assets | Where-Object { $_.name -match 'windows_amd64\.zip$' } | Select-Object -First 1
if ($asset) {
  $zip = Join-Path $tmp 'mediamtx.zip'
  Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zip
  Expand-Archive $zip -DestinationPath (Join-Path $tmp 'mtx') -Force
  $exe = Get-ChildItem (Join-Path $tmp 'mtx') -Recurse -Filter 'mediamtx.exe' | Select-Object -First 1
  Copy-Item $exe.FullName $mtxOut -Force
  Write-Host "  -> $mtxOut"
} else {
  Write-Warning "Não encontrei o asset windows_amd64 do MediaMTX."
}

Write-Host "`nPronto. Agora descomente 'externalBin' em src-tauri/tauri.conf.json."
Get-ChildItem $binDir | Select-Object Name, Length | Format-Table -AutoSize
