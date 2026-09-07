# Verify pinned archive hashes before copying any release sidecar.

param(
  # Development only: bypasses hash verification and must never produce an installer.
  [switch]$AllowSystemFfmpeg,

  # Test tools must come from the same verified archive as the distributed sidecar.
  [string]$ToolDirectory,

  # Tests can avoid overwriting workspace sidecars.
  [string]$BinaryDirectory,

  # Mirrors do not bypass the pinned hash.
  [string]$FfmpegMirrorUrl = $env:CORNETA_FFMPEG_MIRROR_URL
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ffmpegVersion = 'n8.1.2-50-g1a748fe2cd (BtbN autobuild-2026-09-06-13-06)'
$ffmpegUrl     = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-09-06-13-06/ffmpeg-n8.1.2-50-g1a748fe2cd-win64-gpl-8.1.zip'
$ffmpegSha256  = 'E254995D48E6E9E88F5A05EB886A75E9AC33D7C6BB2E8A301E2EB65848A2D489'

$mtxVersion = 'v1.19.3'
$mtxUrl     = 'https://github.com/bluenviron/mediamtx/releases/download/v1.19.3/mediamtx_v1.19.3_windows_amd64.zip'
$mtxSha256  = '5D82148D1032A6A190D9909A2997D9989457AAADF49AF87DD02CD4512D31BEBE'

if ($AllowSystemFfmpeg -and $ToolDirectory) {
  throw '-ToolDirectory requires the verified FFmpeg archive; do not combine it with -AllowSystemFfmpeg.'
}

$binDir = if ($BinaryDirectory) {
  [System.IO.Path]::GetFullPath($BinaryDirectory)
} else {
  Join-Path $PSScriptRoot '..\src-tauri\binaries'
}
New-Item -ItemType Directory -Force -Path $binDir | Out-Null
$cacheDir = Join-Path $env:TEMP 'corneta-bins-cache'
New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null
# An owned directory prevents cleanup from deleting another build's extraction.
$tmp = Join-Path $env:TEMP ("corneta-bins-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$noticeDir = Join-Path $binDir 'third-party'
New-Item -ItemType Directory -Force -Path $noticeDir | Out-Null

$triple = 'x86_64-pc-windows-msvc'
try {
  $rv = (& rustc -Vv) -join "`n"
  if ($rv -match 'host:\s*(\S+)') { $triple = $Matches[1] }
} catch { Write-Host "rustc not found; using $triple" }
Write-Host "Target triple: $triple"
if ($triple -notmatch '^x86_64-pc-windows') {
  throw "Pinned binaries require Windows x64; incompatible target: $triple."
}

function Get-VerifiedFile {
  param(
    [string]$Url,
    [string]$OutFile,
    [string]$ExpectedSha256,
    [string]$Label
  )
  if (Test-Path -LiteralPath $OutFile) {
    if ((Get-FileHash -LiteralPath $OutFile -Algorithm SHA256).Hash -eq $ExpectedSha256) {
      Write-Host "  $Label cache SHA-256 verified."
      return
    }
  }
  Invoke-WebRequest -Uri $Url -OutFile $OutFile -TimeoutSec 180
  $actual = (Get-FileHash -Path $OutFile -Algorithm SHA256).Hash
  if ($actual -ne $ExpectedSha256) {
    throw ("$Label SHA-256 mismatch!`n" +
           "  expected: $ExpectedSha256`n" +
           "  actual:   $actual`n" +
           "The download will NOT be used. It may be corrupted or tampered with — " +
           "verify the URL/hash in this script before retrying.")
  }
  Write-Host "  $Label SHA-256 verified."
}

try {
$ffmpegOut = Join-Path $binDir "ffmpeg-$triple.exe"
$verifiedFfprobe = $null
$sys = if ($AllowSystemFfmpeg) { Get-Command ffmpeg -ErrorAction SilentlyContinue } else { $null }
if ($sys) {
  Write-Warning "-AllowSystemFfmpeg: copying ffmpeg from PATH WITHOUT hash verification. Development only; never use for installers!"
  Write-Host "Copying system ffmpeg: $($sys.Source)"
  Copy-Item $sys.Source $ffmpegOut -Force
} else {
  if ($AllowSystemFfmpeg) { Write-Host "ffmpeg not found in PATH; downloading the pinned version." }
  Write-Host "Downloading FFmpeg $ffmpegVersion..."
  $zip = Join-Path $cacheDir "$ffmpegSha256.zip"
  $downloadUrl = $ffmpegUrl
  if ($FfmpegMirrorUrl) {
    $mirror = [uri]$FfmpegMirrorUrl
    if ($mirror.Scheme -ne 'https' -or $mirror.UserInfo -or $mirror.Query -or $mirror.Fragment) {
      throw 'FFmpeg mirror must use HTTPS without credentials, query, or fragment.'
    }
    $downloadUrl = $mirror.AbsoluteUri
  }
  Get-VerifiedFile -Url $downloadUrl -OutFile $zip -ExpectedSha256 $ffmpegSha256 -Label 'FFmpeg'
  $ffDir = Join-Path $tmp 'ffmpeg'
  Expand-Archive $zip -DestinationPath $ffDir -Force
  $exe = @(Get-ChildItem $ffDir -Recurse -File -Filter 'ffmpeg.exe')
  $ffprobe = @(Get-ChildItem $ffDir -Recurse -File -Filter 'ffprobe.exe')
  if ($exe.Count -ne 1 -or $ffprobe.Count -ne 1) {
    throw 'The verified FFmpeg archive does not contain exactly the expected tools.'
  }
  Copy-Item $exe.FullName $ffmpegOut -Force
  $verifiedFfprobe = $ffprobe.FullName
  $license = @(Get-ChildItem $ffDir -Recurse -File -Filter 'LICENSE.txt')
  if ($license.Count -ne 1) { throw 'Missing or ambiguous FFmpeg license.' }
  Copy-Item -LiteralPath $license[0].FullName -Destination (Join-Path $noticeDir 'FFmpeg-LICENSE.txt') -Force
  (& $ffmpegOut -version 2>&1) | Out-File -LiteralPath (Join-Path $noticeDir 'FFmpeg-version.txt') -Encoding utf8
  if ($LASTEXITCODE -ne 0) { throw 'Verified FFmpeg failed to run.' }
  (& $ffmpegOut -buildconf 2>&1) | Out-File -LiteralPath (Join-Path $noticeDir 'FFmpeg-buildconf.txt') -Encoding utf8
  if ($LASTEXITCODE -ne 0) { throw 'Could not read the FFmpeg build configuration.' }
}
Write-Host "  -> $ffmpegOut"

if ($ToolDirectory) {
  $resolvedToolDirectory = [System.IO.Path]::GetFullPath($ToolDirectory)
  New-Item -ItemType Directory -Force -Path $resolvedToolDirectory | Out-Null
  Copy-Item $ffmpegOut (Join-Path $resolvedToolDirectory 'ffmpeg.exe') -Force
  Copy-Item $verifiedFfprobe (Join-Path $resolvedToolDirectory 'ffprobe.exe') -Force
  Write-Host "  -> verified test tools in $resolvedToolDirectory"
}

$mtxOut = Join-Path $binDir "mediamtx-$triple.exe"
Write-Host "Downloading MediaMTX $mtxVersion..."
$zip = Join-Path $cacheDir "$mtxSha256.zip"
Get-VerifiedFile -Url $mtxUrl -OutFile $zip -ExpectedSha256 $mtxSha256 -Label 'MediaMTX'
$mtxDir = Join-Path $tmp 'mtx'
Expand-Archive $zip -DestinationPath $mtxDir -Force
$exe = @(Get-ChildItem $mtxDir -Recurse -File -Filter 'mediamtx.exe')
if ($exe.Count -ne 1) { throw 'Missing or ambiguous MediaMTX in the verified archive.' }
Copy-Item $exe.FullName $mtxOut -Force
$license = @(Get-ChildItem $mtxDir -Recurse -File -Filter 'LICENSE')
if ($license.Count -ne 1) { throw 'Missing or ambiguous MediaMTX license.' }
Copy-Item -LiteralPath $license[0].FullName -Destination (Join-Path $noticeDir 'MediaMTX-LICENSE.txt') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '../THIRD_PARTY_NOTICES.md') -Destination (Join-Path $noticeDir 'THIRD_PARTY_NOTICES.md') -Force
@{
  ffmpeg = @{ version = $ffmpegVersion; upstreamUrl = $ffmpegUrl; archiveSha256 = $ffmpegSha256; binarySha256 = (Get-FileHash -LiteralPath $ffmpegOut).Hash; verified = -not [bool]$sys }
  mediamtx = @{ version = $mtxVersion; upstreamUrl = $mtxUrl; archiveSha256 = $mtxSha256; binarySha256 = (Get-FileHash -LiteralPath $mtxOut).Hash }
} | ConvertTo-Json -Depth 4 | Out-File -LiteralPath (Join-Path $noticeDir 'sidecars.json') -Encoding utf8
Write-Host "  -> $mtxOut"

Write-Host "`nDone. Verified sidecars are available to Tauri."
Get-ChildItem $binDir | Select-Object Name, Length | Format-Table -AutoSize
} finally {
  # Delete only our extraction, never a caller-provided directory.
  $resolvedTemp = [System.IO.Path]::GetFullPath($env:TEMP).TrimEnd('\', '/')
  $resolvedExtraction = [System.IO.Path]::GetFullPath($tmp)
  if ([System.IO.Path]::GetDirectoryName($resolvedExtraction) -ne $resolvedTemp -or
      [System.IO.Path]::GetFileName($resolvedExtraction) -notmatch '^corneta-bins-[a-f0-9]{32}$') {
    throw 'Cleanup refused: temporary directory is outside the expected scope.'
  }
  if (Test-Path -LiteralPath $resolvedExtraction) {
    Remove-Item -LiteralPath $resolvedExtraction -Recurse -Force
  }
}
