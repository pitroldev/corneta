$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'icon-drawing.ps1')

$outDir = Join-Path $PSScriptRoot '..\src-tauri\icons'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function Save-Png([int]$size, [string]$name) {
  $bitmap = New-CornetaIconBitmap $size
  try {
    $bitmap.Save((Join-Path $outDir $name), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $bitmap.Dispose()
  }
}

Save-Png 32 '32x32.png'
Save-Png 128 '128x128.png'
Save-Png 256 '128x128@2x.png'
Save-Png 512 'icon.png'

$bitmap = New-CornetaIconBitmap 256
$memory = [System.IO.MemoryStream]::new()
try {
  $bitmap.Save($memory, [System.Drawing.Imaging.ImageFormat]::Png)
  $pngBytes = $memory.ToArray()
} finally {
  $memory.Dispose()
  $bitmap.Dispose()
}

# Windows Vista+ supports a PNG payload in ICO; zero dimensions encode 256x256.
$file = [System.IO.File]::Create((Join-Path $outDir 'icon.ico'))
try {
  $writer = [System.IO.BinaryWriter]::new($file)
  try {
    $writer.Write([UInt16]0); $writer.Write([UInt16]1); $writer.Write([UInt16]1)
    $writer.Write([Byte]0); $writer.Write([Byte]0)
    $writer.Write([Byte]0); $writer.Write([Byte]0)
    $writer.Write([UInt16]1); $writer.Write([UInt16]32)
    $writer.Write([UInt32]$pngBytes.Length); $writer.Write([UInt32]22)
    $writer.Write($pngBytes)
    $writer.Flush()
  } finally {
    $writer.Dispose()
  }
} finally {
  $file.Dispose()
}

Write-Host "Icons generated in $outDir"
Get-ChildItem $outDir | Select-Object Name, Length | Format-Table -AutoSize
