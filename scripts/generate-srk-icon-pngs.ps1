Add-Type -AssemblyName System.Drawing

function Draw-Droplet([System.Drawing.Graphics]$g, [float]$cx, [float]$cy, [float]$scale, [System.Drawing.Brush]$fill) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $r = $scale * 0.42
  $bodyTop = $cy - $r * 0.15
  $path.AddEllipse($cx - $r, $bodyTop, $r * 2, $r * 2)
  $tipY = $cy - $scale * 0.95
  $pts = @(
    (New-Object System.Drawing.PointF ($cx - $r * 0.72), ($bodyTop + $r * 0.55)),
    (New-Object System.Drawing.PointF $cx, $tipY),
    (New-Object System.Drawing.PointF ($cx + $r * 0.72), ($bodyTop + $r * 0.55))
  )
  $path.AddPolygon($pts)
  $g.FillPath($fill, $path)
  $path.Dispose()
}

function New-SrkBitmap([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

  # Premium navy background (#081C2D)
  $navy = [System.Drawing.Color]::FromArgb(255, 8, 28, 45)
  $g.Clear($navy)

  # Soft inner disc for depth
  $discBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(40, 255, 255, 255))
  $pad = [float]($size * 0.06)
  $g.FillEllipse($discBrush, $pad, $pad, $size - 2 * $pad, $size - 2 * $pad)
  $discBrush.Dispose()

  $dropBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 125, 194, 219)) # #7DC2DB
  $highlight = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(180, 255, 255, 255))

  if ($size -ge 48) {
    $dropScale = [float]($size * 0.18)
    $dropCx = [float]($size * 0.78)
    $dropCy = [float]($size * 0.28)
    Draw-Droplet $g $dropCx $dropCy $dropScale $dropBrush
    $hr = [float]($dropScale * 0.18)
    $g.FillEllipse($highlight, ($dropCx - $hr * 0.6), ($dropCy - $dropScale * 0.35), $hr, $hr * 1.2)
  } elseif ($size -ge 32) {
    $dropScale = [float]($size * 0.16)
    Draw-Droplet $g ([float]($size * 0.78)) ([float]($size * 0.26)) $dropScale $dropBrush
  } else {
    $dropScale = [float]($size * 0.22)
    Draw-Droplet $g ([float]($size * 0.5)) ([float]($size * 0.78)) $dropScale $dropBrush
  }

  $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
  $fontFamily = New-Object System.Drawing.FontFamily "Segoe UI"
  $fontStyle = [System.Drawing.FontStyle]::Bold
  $unit = [System.Drawing.GraphicsUnit]::Pixel
  $em = if ($size -le 16) { 5.5 } elseif ($size -le 32) { 11.0 } elseif ($size -le 48) { 16.0 } else { [float]($size * 0.34) }
  $font = New-Object System.Drawing.Font($fontFamily, $em, $fontStyle, $unit)

  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
  $sf.FormatFlags = [System.Drawing.StringFormatFlags]::NoWrap

  if ($size -le 16) {
    $rect = New-Object System.Drawing.RectangleF 0, ([float]($size * -0.08)), $size, ([float]($size * 0.85))
  } else {
    $rect = New-Object System.Drawing.RectangleF 0, ([float]($size * 0.08)), $size, ([float]($size * 0.72))
  }
  $g.DrawString("SRK", $font, $white, $rect, $sf)

  if ($size -ge 48) {
    $uline = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(160, 125, 194, 219), [Math]::Max(1.0, $size / 128.0))
    $y = [float]($size * 0.78)
    $g.DrawLine($uline, [float]($size * 0.22), $y, [float]($size * 0.42), $y)
    $g.DrawLine($uline, [float]($size * 0.58), $y, [float]($size * 0.78), $y)
    $uline.Dispose()
    Draw-Droplet $g ([float]($size * 0.5)) ([float]($size * 0.82)) ([float]($size * 0.08)) $dropBrush
  }

  $font.Dispose()
  $fontFamily.Dispose()
  $sf.Dispose()
  $white.Dispose()
  $dropBrush.Dispose()
  $highlight.Dispose()
  $g.Dispose()
  return $bmp
}

$sizes = @(16, 24, 32, 48, 64, 128, 256)
$root = Split-Path -Parent $PSScriptRoot
$pngDir = Join-Path $root "build\icon-png"
New-Item -ItemType Directory -Force -Path $pngDir | Out-Null

foreach ($s in $sizes) {
  $bmp = New-SrkBitmap $s
  $out = Join-Path $pngDir ("icon-{0}.png" -f $s)
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "Wrote $out"
}

$master = New-SrkBitmap 256
$master.Save((Join-Path $root "build\icon.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$master.Dispose()
Write-Host "Wrote build/icon.png"
