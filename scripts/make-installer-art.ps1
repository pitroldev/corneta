

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root 'src-tauri\installer'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# Multiplication avoids PowerShell's signed Int32 promotion with -shl.
function Get-U32BE([byte[]]$b, [int]$o) {
  [uint32](([long]$b[$o] * 16777216) + ([long]$b[$o + 1] * 65536) + ([long]$b[$o + 2] * 256) + [long]$b[$o + 3])
}
function Get-U16BE([byte[]]$b, [int]$o) { [int](([int]$b[$o] * 256) + [int]$b[$o + 1]) }
function Set-U32BE([byte[]]$b, [int]$o, [long]$v) {
  $b[$o] = [byte](($v -shr 24) -band 0xFF)
  $b[$o + 1] = [byte](($v -shr 16) -band 0xFF)
  $b[$o + 2] = [byte](($v -shr 8) -band 0xFF)
  $b[$o + 3] = [byte]($v -band 0xFF)
}
function Set-U16BE([byte[]]$b, [int]$o, [int]$v) {
  $b[$o] = [byte](($v -shr 8) -band 0xFF)
  $b[$o + 1] = [byte]($v -band 0xFF)
}

function Expand-Zlib([byte[]]$data, [int]$offset, [int]$length) {
  # DeflateStream expects raw DEFLATE, without the two-byte zlib header.
  $ms = [System.IO.MemoryStream]::new($data, $offset + 2, $length - 2)
  $ds = [System.IO.Compression.DeflateStream]::new($ms, [System.IO.Compression.CompressionMode]::Decompress)
  $out = [System.IO.MemoryStream]::new()
  $ds.CopyTo($out)
  $ds.Dispose(); $ms.Dispose()
  $bytes = $out.ToArray(); $out.Dispose()
  return , $bytes
}

function ConvertTo-Ttf([string]$woffPath, [string]$ttfPath) {
  $w = [System.IO.File]::ReadAllBytes($woffPath)
  if ((Get-U32BE $w 0) -ne 0x774F4646) { throw "Missing wOFF signature in $woffPath" }
  $flavor = Get-U32BE $w 4
  $n = Get-U16BE $w 12

  $tables = @()
  for ($i = 0; $i -lt $n; $i++) {
    $o = 44 + ($i * 20)
    $tables += [pscustomobject]@{
      Tag  = Get-U32BE $w $o
      Off  = [int](Get-U32BE $w ($o + 4))
      Comp = [int](Get-U32BE $w ($o + 8))
      Orig = [int](Get-U32BE $w ($o + 12))
      Sum  = Get-U32BE $w ($o + 16)
      Data = $null
    }
  }
  foreach ($t in $tables) {
    if ($t.Comp -lt $t.Orig) {
      $t.Data = Expand-Zlib $w $t.Off $t.Comp
    }
    else {
      $slice = New-Object byte[] $t.Orig
      [Array]::Copy($w, $t.Off, $slice, 0, $t.Orig)
      $t.Data = $slice
    }
  }
  # sfnt requires a tag-sorted table directory.
  $tables = @($tables | Sort-Object Tag)

  $maxPow2 = 1; $entrySelector = 0
  while (($maxPow2 * 2) -le $n) { $maxPow2 *= 2; $entrySelector++ }

  $headerSize = 12 + ($n * 16)
  $total = $headerSize
  foreach ($t in $tables) { $total += (($t.Orig + 3) -band (-bnot 3)) }

  $out = New-Object byte[] $total
  Set-U32BE $out 0 $flavor
  Set-U16BE $out 4 $n
  Set-U16BE $out 6 ($maxPow2 * 16)
  Set-U16BE $out 8 $entrySelector
  Set-U16BE $out 10 (($n * 16) - ($maxPow2 * 16))

  $pos = $headerSize
  for ($i = 0; $i -lt $n; $i++) {
    $t = $tables[$i]
    $rec = 12 + ($i * 16)
    Set-U32BE $out $rec $t.Tag
    Set-U32BE $out ($rec + 4) $t.Sum
    Set-U32BE $out ($rec + 8) $pos
    Set-U32BE $out ($rec + 12) $t.Orig
    [Array]::Copy($t.Data, 0, $out, $pos, $t.Orig)
    $pos += (($t.Orig + 3) -band (-bnot 3))
  }

  # Windows font loaders may reject an incorrect head.checkSumAdjustment.
  for ($i = 0; $i -lt $n; $i++) {
    if ($tables[$i].Tag -eq 0x68656164) {
      $headOff = [int](Get-U32BE $out (12 + ($i * 16) + 8))
      Set-U32BE $out ($headOff + 8) 0
      $sum = [long]0
      for ($p = 0; $p -lt $total; $p += 4) { $sum = ($sum + [long](Get-U32BE $out $p)) -band 0xFFFFFFFF }
      Set-U32BE $out ($headOff + 8) ((0xB1B0AFBA - $sum) -band 0xFFFFFFFF)
      break
    }
  }
  [System.IO.File]::WriteAllBytes($ttfPath, $out)
}

# GDI+ cannot load @fontsource's WOFF directly; convert it before registration.
$fonts = New-Object System.Drawing.Text.PrivateFontCollection
$family = $null
$woff = Get-ChildItem -Path (Join-Path $root 'node_modules\.pnpm') -Filter 'baloo-2-latin-800-normal.woff' -Recurse -ErrorAction SilentlyContinue |
Select-Object -First 1
if ($woff) {
  $ttf = Join-Path ([System.IO.Path]::GetTempPath()) 'corneta-baloo2-800.ttf'
  ConvertTo-Ttf $woff.FullName $ttf
  $fonts.AddFontFile($ttf)
  $family = $fonts.Families[0]
  Write-Host "Font: $($family.Name) (WOFF converted from $($woff.Name))"
}
if (-not $family) {
  $family = New-Object System.Drawing.FontFamily('Segoe UI Black')
  Write-Warning 'Baloo 2 not found in node_modules — using Segoe UI Black. Run `pnpm install` and regenerate.'
}

# Keep these values in sync with the dark-theme tokens in src/index.css.
$BRASS = [System.Drawing.Color]::FromArgb(0xFF, 0xB3, 0x23)
$INK = [System.Drawing.Color]::FromArgb(0x2A, 0x1C, 0x00)
$TOMATO = [System.Drawing.Color]::FromArgb(0xFF, 0x5A, 0x36)
$NIGHT = [System.Drawing.Color]::FromArgb(0x0B, 0x08, 0x05)

$TIGHT = [System.Drawing.StringFormat]::GenericTypographic

function New-RoundRect([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
  $d = $r * 2
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

# Keep the 24x24 geometry in sync with Mascot in src/components/decor.tsx.
function Draw-Mascot($g, [single]$x, [single]$y, [single]$size, $color) {
  $s = $size / 24.0
  $pt = { param($a, $b) New-Object System.Drawing.PointF([single]($x + $a * $s), [single]($y + $b * $s)) }
  $brush = New-Object System.Drawing.SolidBrush($color)

  # The explicit cast disambiguates the Point[] and PointF[] overloads.
  $g.FillPolygon($brush, [System.Drawing.PointF[]]@(
      (& $pt 3.4 9.1), (& $pt 13 5.9), (& $pt 13 18.1), (& $pt 3.4 14.9)))

  $rr = New-RoundRect ($x + 4.7 * $s) ($y + 13.9 * $s) (2.5 * $s) (4.6 * $s) (1.1 * $s)
  $g.FillPath($brush, $rr)
  $rr.Dispose()

  $pen = New-Object System.Drawing.Pen($color, [single](1.9 * $s))
  $pen.StartCap = 'Round'; $pen.EndCap = 'Round'
  foreach ($a in @(@(15.6, 8.4, 15.6, 5.0), @(17.8, 6.4, 17.6, 8.0))) {
    $ax = $a[0]; $y0 = $a[1]; $y1 = $a[2]; $r = $a[3]
    $cy = ($y0 + $y1) / 2.0
    $half = ($y1 - $y0) / 2.0
    $cx = $ax - [Math]::Sqrt(($r * $r) - ($half * $half))
    $start = [Math]::Atan2($y0 - $cy, $ax - $cx) * 180.0 / [Math]::PI
    $g.DrawArc($pen, [single]($x + ($cx - $r) * $s), [single]($y + ($cy - $r) * $s),
      [single](2 * $r * $s), [single](2 * $r * $s), [single]$start, [single](-2 * $start))
  }
  $pen.Dispose(); $brush.Dispose()
}

function Draw-Halftone($g, [int]$w, [int]$h, $color, [int]$step, [single]$rMax, [single]$fade) {
  $row = 0
  for ($yy = 0; $yy -lt $h; $yy += $step) {
    $t = 1.0 - ([double]$yy / ($h * $fade))
    if ($t -gt 0.02) {
      $r = $rMax * $t
      $alpha = [int](78 * $t)
      if ($alpha -ge 4) {
        $b = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb($alpha, $color))
        $off = if (($row % 2) -eq 0) { 0 } else { $step / 2 }
        for ($xx = -$step; $xx -lt ($w + $step); $xx += $step) {
          $g.FillEllipse($b, [single]($xx + $off - $r), [single]($yy - $r), [single](2 * $r), [single](2 * $r))
        }
        $b.Dispose()
      }
    }
    $row++
  }
}

function Get-FittedFont($g, [string]$text, $family, [single]$startPx, [single]$maxWidth) {
  for ($px = $startPx; $px -gt 6; $px -= 0.5) {
    $f = New-Object System.Drawing.Font($family, [single]$px, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    if ($g.MeasureString($text, $f, [System.Drawing.PointF]::Empty, $TIGHT).Width -le $maxWidth) { return $f }
    $f.Dispose()
  }
  return New-Object System.Drawing.Font($family, 6, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
}

function New-Canvas([int]$w, [int]$h) {
  # NSIS does not support BMP alpha channels.
  $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.TextRenderingHint = 'AntiAliasGridFit'
  $g.PixelOffsetMode = 'HighQuality'
  return @{ Bmp = $bmp; G = $g }
}

function Save-Art($canvas, [string]$name) {
  $canvas.G.Dispose()
  $bmpPath = Join-Path $outDir "$name.bmp"
  $pngPath = Join-Path $outDir "$name.png"
  $canvas.Bmp.Save($bmpPath, [System.Drawing.Imaging.ImageFormat]::Bmp)
  $canvas.Bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $canvas.Bmp.Dispose()
  Write-Host ("  {0,-12} {1,7:N0} bytes" -f "$name.bmp", (Get-Item $bmpPath).Length) -ForegroundColor DarkGray
}

$W = 164; $H = 314
$c = New-Canvas $W $H
$g = $c.G
$g.Clear($NIGHT)

Draw-Halftone $g $W $H $BRASS 13 3.1 1.15

$band = New-Object System.Drawing.Drawing2D.GraphicsPath
$band.AddPolygon([System.Drawing.PointF[]]@(
    (New-Object System.Drawing.PointF(0, 250)),
    (New-Object System.Drawing.PointF($W, 232)),
    (New-Object System.Drawing.PointF($W, $H)),
    (New-Object System.Drawing.PointF(0, $H))))
$g.FillPath((New-Object System.Drawing.SolidBrush($BRASS)), $band)
$band.Dispose()

$tile = 88.0
$cx = $W / 2.0; $cy = 96.0
$g.TranslateTransform($cx, $cy)
$g.RotateTransform(-4)
$shadow = New-RoundRect (-$tile / 2 + 5) (-$tile / 2 + 6) $tile $tile 15
$g.FillPath((New-Object System.Drawing.SolidBrush($TOMATO)), $shadow)
$shadow.Dispose()
$face = New-RoundRect (-$tile / 2) (-$tile / 2) $tile $tile 15
$g.FillPath((New-Object System.Drawing.SolidBrush($BRASS)), $face)
$face.Dispose()
Draw-Mascot $g (-27.0) (-27.0) 54.0 $INK
$g.ResetTransform()

# Measure the wordmark: Baloo's tall glyphs would overlap a fixed-position underline.

$wmTop = 168.0
$wm = Get-FittedFont $g 'CORNETA' $family 32 ($W - 22)
$wmSize = $g.MeasureString('CORNETA', $wm, [System.Drawing.PointF]::Empty, $TIGHT)
$wmLeft = ($W - $wmSize.Width) / 2
$g.DrawString('CORNETA', $wm, (New-Object System.Drawing.SolidBrush($BRASS)), [single]$wmLeft, [single]$wmTop)

$g.FillRectangle((New-Object System.Drawing.SolidBrush($TOMATO)),
  [single]$wmLeft, [single]($wmTop + $wmSize.Height + 3), [single]$wmSize.Width, 6)
$wm.Dispose()

$tag = New-Object System.Drawing.Font($family, 15, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
foreach ($line in @(@('UMA LIVE,', 272), @('TODO LUGAR', 290))) {
  $sz = $g.MeasureString($line[0], $tag, [System.Drawing.PointF]::Empty, $TIGHT)
  $g.DrawString($line[0], $tag, (New-Object System.Drawing.SolidBrush($INK)),
    [single](($W - $sz.Width) / 2), [single]$line[1])
}
$tag.Dispose()

Save-Art $c 'sidebar'

$W = 150; $H = 57
$c = New-Canvas $W $H
$g = $c.G
$g.Clear($BRASS)

Draw-Halftone $g $W $H $INK 11 2.2 1.6

Draw-Mascot $g 11 12 33 $INK

$hw = Get-FittedFont $g 'CORNETA' $family 24 ($W - 56)
$hwSize = $g.MeasureString('CORNETA', $hw, [System.Drawing.PointF]::Empty, $TIGHT)
$g.DrawString('CORNETA', $hw, (New-Object System.Drawing.SolidBrush($INK)),
  50, [single](($H - 6 - $hwSize.Height) / 2))
$hw.Dispose()

$g.FillRectangle((New-Object System.Drawing.SolidBrush($TOMATO)), 0, ($H - 5), $W, 5)

Save-Art $c 'header'

$fonts.Dispose()
Write-Host "Installer artwork in $outDir" -ForegroundColor Green
