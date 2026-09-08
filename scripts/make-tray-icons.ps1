$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'icon-drawing.ps1')
$outDir = Join-Path $PSScriptRoot '..\src-tauri\icons'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function Save-Tray([string]$name, [System.Drawing.Color]$background, [System.Drawing.Color]$foreground) {
  $bitmap = New-CornetaIconBitmap 64 $background $foreground
  try {
    $bitmap.Save((Join-Path $outDir $name), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $bitmap.Dispose()
  }
}

$ink = [System.Drawing.ColorTranslator]::FromHtml('#2a1c00')
$white = [System.Drawing.Color]::White
Save-Tray 'tray-idle.png' ([System.Drawing.ColorTranslator]::FromHtml('#ffb323')) $ink
Save-Tray 'tray-good.png' ([System.Drawing.Color]::FromArgb(34, 197, 94)) $white
Save-Tray 'tray-warn.png' ([System.Drawing.Color]::FromArgb(249, 115, 22)) $white
Save-Tray 'tray-bad.png' ([System.Drawing.Color]::FromArgb(239, 68, 68)) $white

Write-Host 'Tray icons generated:'
Get-ChildItem $outDir -Filter 'tray-*.png' | Select-Object Name, Length | Format-Table -AutoSize | Out-String | Write-Output
