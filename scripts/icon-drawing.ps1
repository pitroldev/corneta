Add-Type -AssemblyName System.Drawing

function New-CornetaRoundedPath([float]$x, [float]$y, [float]$width, [float]$height, [float]$radius) {
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  try {
    $diameter = $radius * 2
    $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
    $path.AddArc($x + $width - $diameter, $y, $diameter, $diameter, 270, 90)
    $path.AddArc($x + $width - $diameter, $y + $height - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc($x, $y + $height - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()
    return $path
  } catch {
    $path.Dispose()
    throw
  }
}

function New-CornetaIconBitmap(
  [ValidateRange(16, 512)][int]$Size,
  [System.Drawing.Color]$FaceColor = [System.Drawing.ColorTranslator]::FromHtml('#ffb323'),
  [System.Drawing.Color]$GlyphColor = [System.Drawing.ColorTranslator]::FromHtml('#2a1c00')
) {
  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size)
  $resources = [System.Collections.Generic.List[System.IDisposable]]::new()
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $resources.Add($graphics)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)

    # Match web/app/icon.svg's 64-unit canvas and rotate(-6 30 30).
    $scale = $Size / 64.0
    $angle = -6 * [Math]::PI / 180
    $cosine = [Math]::Cos($angle)
    $sine = [Math]::Sin($angle)
    $transform = [System.Drawing.Drawing2D.Matrix]::new(
      [float]($scale * $cosine), [float]($scale * $sine),
      [float](-$scale * $sine), [float]($scale * $cosine),
      [float]($scale * (30 - 30 * $cosine + 30 * $sine)),
      [float]($scale * (30 - 30 * $sine - 30 * $cosine))
    )
    $resources.Add($transform)
    $graphics.Transform = $transform

    $ink = [System.Drawing.ColorTranslator]::FromHtml('#2a1c00')
    $shadowBrush = [System.Drawing.SolidBrush]::new($ink)
    $resources.Add($shadowBrush)
    $faceBrush = [System.Drawing.SolidBrush]::new($FaceColor)
    $resources.Add($faceBrush)
    $glyphBrush = [System.Drawing.SolidBrush]::new($GlyphColor)
    $resources.Add($glyphBrush)
    $outlinePen = [System.Drawing.Pen]::new($ink, 2)
    $resources.Add($outlinePen)
    $glyphPen = [System.Drawing.Pen]::new($GlyphColor, [float]1.9)
    $resources.Add($glyphPen)
    $glyphPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $glyphPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

    $shadow = New-CornetaRoundedPath 11 12 48 48 8
    $resources.Add($shadow)
    $face = New-CornetaRoundedPath 6 6 48 48 8
    $resources.Add($face)
    $graphics.FillPath($shadowBrush, $shadow)
    $graphics.FillPath($faceBrush, $face)
    $graphics.DrawPath($outlinePen, $face)

    $mascotTransform = [System.Drawing.Drawing2D.Matrix]::new(1.6, 0, 0, 1.6, 10.8, 10.8)
    $resources.Add($mascotTransform)
    $graphics.MultiplyTransform($mascotTransform, [System.Drawing.Drawing2D.MatrixOrder]::Prepend)
    $horn = [System.Drawing.PointF[]]@(
      [System.Drawing.PointF]::new(3.4, 9.1),
      [System.Drawing.PointF]::new(13, 5.9),
      [System.Drawing.PointF]::new(13, 18.1),
      [System.Drawing.PointF]::new(3.4, 14.9)
    )
    $graphics.FillPolygon($glyphBrush, $horn)
    $handle = New-CornetaRoundedPath 4.7 13.9 2.5 4.6 1.1
    $resources.Add($handle)
    $graphics.FillPath($glyphBrush, $handle)

    # Convert the mascot's circular SVG arcs from endpoints to GDI+ center angles.
    foreach ($arc in @(@(15.6, 3.6, 5), @(17.8, 5.6, 8))) {
      $x, $halfChord, $radius = $arc
      $centerX = $x - [Math]::Sqrt($radius * $radius - $halfChord * $halfChord)
      $halfAngle = [Math]::Asin($halfChord / $radius) * 180 / [Math]::PI
      $graphics.DrawArc($glyphPen, [float]($centerX - $radius), [float](12 - $radius),
        [float](2 * $radius), [float](2 * $radius), [float](-$halfAngle), [float](2 * $halfAngle))
    }
    return $bitmap
  } catch {
    $bitmap.Dispose()
    throw
  } finally {
    for ($index = $resources.Count - 1; $index -ge 0; $index--) {
      $resources[$index].Dispose()
    }
  }
}
