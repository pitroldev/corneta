# Arte do instalador NSIS: header.bmp (150x57) e sidebar.bmp (164x314).
#
# Mesmo vocabulário visual do app — latão, tomate, breu, sombra dura sem blur,
# meio-tom — e o mascote com a MESMA geometria do <Mascot> em
# src/components/decor.tsx. Rodar: `pnpm installer:art`.
#
# POR QUE GERAR EM VEZ DE VERSIONAR UM ARQUIVO DE DESIGN: o mascote e as cores
# moram no código (decor.tsx e index.css). Arte desenhada por script não
# desencontra da identidade quando um token muda — é só rodar de novo. Foi o
# mesmo raciocínio de scripts/make-icons.ps1.
#
# A fonte é a Baloo 2 de verdade, a mesma do app. O @fontsource só distribui
# .woff, que o GDI+ não lê, então o script converte WOFF -> TTF em memória: WOFF
# é um sfnt com cada tabela comprimida em zlib, e o .NET descomprime sem
# dependência nova. Sem a fonte, cai no Segoe UI Black e avisa.
#
# O NSIS exige BMP sem alfa; por isso o canvas é Format24bppRgb desde o começo.
# Os .png ao lado são só pra conferência visual — o bundle usa os .bmp.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root 'src-tauri\installer'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# ============================================================== WOFF -> TTF ==

# Multiplicação em vez de -shl: evita a promoção pra Int32 com sinal do PowerShell.
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
  # Pula os 2 bytes de cabeçalho zlib e deixa o DeflateStream parar sozinho no
  # fim do fluxo. O adler32 do rodapé não precisa ser conferido aqui.
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
  if ((Get-U32BE $w 0) -ne 0x774F4646) { throw "assinatura wOFF ausente em $woffPath" }
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
  # O sfnt exige o diretório ordenado por tag.
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

  # head.checkSumAdjustment: zera o campo, soma o arquivo inteiro em uint32 e
  # grava 0xB1B0AFBA - soma. Alguns carregadores do Windows recusam sem isso.
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

# Baloo 2 ExtraBold (800) — o mesmo peso do `font-display` no app.
$fonts = New-Object System.Drawing.Text.PrivateFontCollection
$family = $null
$woff = Get-ChildItem -Path (Join-Path $root 'node_modules\.pnpm') -Filter 'baloo-2-latin-800-normal.woff' -Recurse -ErrorAction SilentlyContinue |
Select-Object -First 1
if ($woff) {
  $ttf = Join-Path ([System.IO.Path]::GetTempPath()) 'corneta-baloo2-800.ttf'
  ConvertTo-Ttf $woff.FullName $ttf
  $fonts.AddFontFile($ttf)
  $family = $fonts.Families[0]
  Write-Host "Fonte: $($family.Name) (WOFF convertido de $($woff.Name))"
}
if (-not $family) {
  $family = New-Object System.Drawing.FontFamily('Segoe UI Black')
  Write-Warning 'Baloo 2 nao encontrada em node_modules — usando Segoe UI Black. Rode `pnpm install` e gere de novo.'
}

# =================================================================== paleta ==
# Espelha os tokens de src/index.css (tema escuro).
$BRASS = [System.Drawing.Color]::FromArgb(0xFF, 0xB3, 0x23)
$INK = [System.Drawing.Color]::FromArgb(0x2A, 0x1C, 0x00)
$TOMATE = [System.Drawing.Color]::FromArgb(0xFF, 0x5A, 0x36)
$NIGHT = [System.Drawing.Color]::FromArgb(0x0B, 0x08, 0x05)

$TIGHT = [System.Drawing.StringFormat]::GenericTypographic

# =================================================================== helpers ==

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

# Mascote: MESMA geometria do <Mascot> em src/components/decor.tsx (viewBox 24x24).
function Draw-Mascot($g, [single]$x, [single]$y, [single]$size, $color) {
  $s = $size / 24.0
  $pt = { param($a, $b) New-Object System.Drawing.PointF([single]($x + $a * $s), [single]($y + $b * $s)) }
  $brush = New-Object System.Drawing.SolidBrush($color)

  # Corpo do megafone: M3.4 9.1 L13 5.9 V18.1 L3.4 14.9 Z
  # O cast é necessário: sem ele o PowerShell não escolhe entre Point[] e PointF[].
  $g.FillPolygon($brush, [System.Drawing.PointF[]]@(
      (& $pt 3.4 9.1), (& $pt 13 5.9), (& $pt 13 18.1), (& $pt 3.4 14.9)))

  # Cabo: rect x=4.7 y=13.9 w=2.5 h=4.6 rx=1.1
  $rr = New-RoundRect ($x + 4.7 * $s) ($y + 13.9 * $s) (2.5 * $s) (4.6 * $s) (1.1 * $s)
  $g.FillPath($brush, $rr)
  $rr.Dispose()

  # Ondas: arcos de corda vertical abrindo pra direita (a5 5 0 0 1 / a8 8 0 0 1).
  # Do ponto inicial, do raio e da corda saem centro e ângulos — mesma curva do SVG.
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

# Meio-tom do app: malha alternada de pontos que rareia conforme desce.
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

# Encolhe a fonte até o texto caber na largura — o wordmark nunca estoura a arte.
function Get-FittedFont($g, [string]$text, $family, [single]$startPx, [single]$maxWidth) {
  for ($px = $startPx; $px -gt 6; $px -= 0.5) {
    $f = New-Object System.Drawing.Font($family, [single]$px, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    if ($g.MeasureString($text, $f, [System.Drawing.PointF]::Empty, $TIGHT).Width -le $maxWidth) { return $f }
    $f.Dispose()
  }
  return New-Object System.Drawing.Font($family, 6, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
}

function New-Canvas([int]$w, [int]$h) {
  # 24bpp desde o começo: o NSIS não lida com BMP com canal alfa.
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

# ================================================================== SIDEBAR ==
# 164x314, aparece nas páginas de boas-vindas e de conclusão. É a peça grande:
# pôster escuro, bloco de latão torto com o mascote e o wordmark.

$W = 164; $H = 314
$c = New-Canvas $W $H
$g = $c.G
$g.Clear($NIGHT)

Draw-Halftone $g $W $H $BRASS 13 3.1 1.15

# Faixa de latão no rodapé, cortada na diagonal — a "banda" dos pôsteres do app.
$band = New-Object System.Drawing.Drawing2D.GraphicsPath
$band.AddPolygon([System.Drawing.PointF[]]@(
    (New-Object System.Drawing.PointF(0, 250)),
    (New-Object System.Drawing.PointF($W, 232)),
    (New-Object System.Drawing.PointF($W, $H)),
    (New-Object System.Drawing.PointF(0, $H))))
$g.FillPath((New-Object System.Drawing.SolidBrush($BRASS)), $band)
$band.Dispose()

# Bloco do mascote: sombra dura de tomate + tile de latão girado -4°, igual ao
# hero da tela Sobre (rotate-[-4deg] + pop).
$tile = 88.0
$cx = $W / 2.0; $cy = 96.0
$g.TranslateTransform($cx, $cy)
$g.RotateTransform(-4)
$shadow = New-RoundRect (-$tile / 2 + 5) (-$tile / 2 + 6) $tile $tile 15
$g.FillPath((New-Object System.Drawing.SolidBrush($TOMATE)), $shadow)
$shadow.Dispose()
$face = New-RoundRect (-$tile / 2) (-$tile / 2) $tile $tile 15
$g.FillPath((New-Object System.Drawing.SolidBrush($BRASS)), $face)
$face.Dispose()
Draw-Mascot $g (-27.0) (-27.0) 54.0 $INK
$g.ResetTransform()

# Wordmark sobre o breu, e a régua de tomate ancorada na medida REAL do texto —
# a Baloo 2 é bem mais alta que o corpo da fonte, então posição fixa atravessaria
# as letras.
$wmTop = 168.0
$wm = Get-FittedFont $g 'CORNETA' $family 32 ($W - 22)
$wmSize = $g.MeasureString('CORNETA', $wm, [System.Drawing.PointF]::Empty, $TIGHT)
$wmLeft = ($W - $wmSize.Width) / 2
$g.DrawString('CORNETA', $wm, (New-Object System.Drawing.SolidBrush($BRASS)), [single]$wmLeft, [single]$wmTop)

# Régua de tomate: o sublinhado duro do app, na largura exata do wordmark.
$g.FillRectangle((New-Object System.Drawing.SolidBrush($TOMATE)),
  [single]$wmLeft, [single]($wmTop + $wmSize.Height + 3), [single]$wmSize.Width, 6)
$wm.Dispose()

# Assinatura sobre a faixa de latão, na tinta escura.
$tag = New-Object System.Drawing.Font($family, 15, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
foreach ($line in @(@('UMA LIVE,', 272), @('TODO LUGAR', 290))) {
  $sz = $g.MeasureString($line[0], $tag, [System.Drawing.PointF]::Empty, $TIGHT)
  $g.DrawString($line[0], $tag, (New-Object System.Drawing.SolidBrush($INK)),
    [single](($W - $sz.Width) / 2), [single]$line[1])
}
$tag.Dispose()

Save-Art $c 'sidebar'

# =================================================================== HEADER ==
# 150x57, canto do cabeçalho nas páginas internas. Um lockup fechado: bloco de
# latão com mascote e wordmark, faixa de tomate embaixo.

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

$g.FillRectangle((New-Object System.Drawing.SolidBrush($TOMATE)), 0, ($H - 5), $W, 5)

Save-Art $c 'header'

$fonts.Dispose()
Write-Host "Arte do instalador em $outDir" -ForegroundColor Green
