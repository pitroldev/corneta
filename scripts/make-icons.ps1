Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot '..\src-tauri\icons'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function New-Glyph([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::Transparent)

  $amber = [System.Drawing.Color]::FromArgb(245, 165, 36)
  $ink = [System.Drawing.Color]::FromArgb(26, 18, 4)
  $f = { param($x) [float]($x * $size) }

  $r = & $f 0.22
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc(0, 0, $r, $r, 180, 90)
  $path.AddArc($size - $r, 0, $r, $r, 270, 90)
  $path.AddArc($size - $r, $size - $r, $r, $r, 0, 90)
  $path.AddArc(0, $size - $r, $r, $r, 90, 90)
  $path.CloseFigure()
  $g.FillPath((New-Object System.Drawing.SolidBrush($amber)), $path)

  $brush = New-Object System.Drawing.SolidBrush($ink)
  $pen = New-Object System.Drawing.Pen($ink, (& $f 0.05))
  $pen.StartCap = 'Round'; $pen.EndCap = 'Round'

  $horn = @(
    (New-Object System.Drawing.PointF((& $f 0.26), (& $f 0.40))),
    (New-Object System.Drawing.PointF((& $f 0.55), (& $f 0.29))),
    (New-Object System.Drawing.PointF((& $f 0.55), (& $f 0.71))),
    (New-Object System.Drawing.PointF((& $f 0.26), (& $f 0.60)))
  )
  $g.FillPolygon($brush, $horn)

  $g.FillRectangle($brush, (& $f 0.30), (& $f 0.58), (& $f 0.07), (& $f 0.16))

  $g.DrawArc($pen, (& $f 0.56), (& $f 0.34), (& $f 0.20), (& $f 0.32), -55, 110)
  $g.DrawArc($pen, (& $f 0.62), (& $f 0.27), (& $f 0.24), (& $f 0.46), -55, 110)

  $g.Dispose()
  return $bmp
}

function Save-Png([int]$size, [string]$name) {
  $bmp = New-Glyph $size
  $bmp.Save((Join-Path $outDir $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

Save-Png 32 '32x32.png'
Save-Png 128 '128x128.png'
Save-Png 256 '128x128@2x.png'
Save-Png 512 'icon.png'

# Windows Vista+ supports a PNG payload in ICO; zero dimensions encode 256x256.
$png256 = New-Glyph 256
$ms = New-Object System.IO.MemoryStream
$png256.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$pngBytes = $ms.ToArray()
$ms.Dispose(); $png256.Dispose()

$ico = [System.IO.File]::Create((Join-Path $outDir 'icon.ico'))
$bw = New-Object System.IO.BinaryWriter($ico)
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]1)      # ICONDIR
$bw.Write([Byte]0); $bw.Write([Byte]0)                               # 256x256
$bw.Write([Byte]0); $bw.Write([Byte]0)                               # palette/reserved
$bw.Write([UInt16]1); $bw.Write([UInt16]32)                          # planes/bpp
$bw.Write([UInt32]$pngBytes.Length); $bw.Write([UInt32]22)           # size/offset
$bw.Write($pngBytes)
$bw.Flush(); $bw.Dispose(); $ico.Dispose()

Write-Host "Icons generated in $outDir"
Get-ChildItem $outDir | Select-Object Name, Length | Format-Table -AutoSize
