# Gera os ícones de status da bandeja (megafone em fundo de cor por qualidade).
Add-Type -AssemblyName System.Drawing
$outDir = Join-Path $PSScriptRoot '..\src-tauri\icons'

function New-Tray([int]$size, [System.Drawing.Color]$bg, [System.Drawing.Color]$fg) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::Transparent)
  $f = { param($x) [float]($x * $size) }

  $r = & $f 0.22
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc(0, 0, $r, $r, 180, 90)
  $path.AddArc($size - $r, 0, $r, $r, 270, 90)
  $path.AddArc($size - $r, $size - $r, $r, $r, 0, 90)
  $path.AddArc(0, $size - $r, $r, $r, 90, 90)
  $path.CloseFigure()
  $g.FillPath((New-Object System.Drawing.SolidBrush($bg)), $path)

  $brush = New-Object System.Drawing.SolidBrush($fg)
  $pen = New-Object System.Drawing.Pen($fg, (& $f 0.05))
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

function Save-Tray([string]$name, [System.Drawing.Color]$bg, [System.Drawing.Color]$fg) {
  $b = New-Tray 64 $bg $fg
  $b.Save((Join-Path $outDir $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $b.Dispose()
}

$ink = [System.Drawing.Color]::FromArgb(26, 18, 4)
$white = [System.Drawing.Color]::White
Save-Tray 'tray-idle.png' ([System.Drawing.Color]::FromArgb(245, 165, 36)) $ink     # latão (offline)
Save-Tray 'tray-good.png' ([System.Drawing.Color]::FromArgb(34, 197, 94)) $white    # verde (tudo bem)
Save-Tray 'tray-warn.png' ([System.Drawing.Color]::FromArgb(249, 115, 22)) $white   # laranja (atenção)
Save-Tray 'tray-bad.png'  ([System.Drawing.Color]::FromArgb(239, 68, 68)) $white    # vermelho (erro)

Write-Host "Ícones de bandeja gerados:"
Get-ChildItem $outDir -Filter 'tray-*.png' | Select-Object Name, Length | Format-Table -AutoSize | Out-String | Write-Output
