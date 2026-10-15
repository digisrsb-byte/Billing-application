Add-Type -AssemblyName System.Drawing

$targets = @(
  @{ Name = 'exe'; Path = (Join-Path $PSScriptRoot '..\release-icon\win-unpacked\SRK Enterprises Billing.exe') },
  @{ Name = 'setup'; Path = (Join-Path $PSScriptRoot '..\release-icon\SRK Enterprises Billing Setup 0.1.0.exe') }
)

foreach ($t in $targets) {
  $full = (Resolve-Path -LiteralPath $t.Path).Path
  $ico = [System.Drawing.Icon]::ExtractAssociatedIcon($full)
  $bmp = $ico.ToBitmap()
  $out = Join-Path $PSScriptRoot ('..\release-icon\associated-' + $t.Name + '.png')
  $bmp.Save((Resolve-Path (Split-Path $out)).Path + '\associated-' + $t.Name + '.png', [System.Drawing.Imaging.ImageFormat]::Png)
  $outFull = Join-Path (Split-Path ((Resolve-Path -LiteralPath $t.Path).Path)) ('associated-' + $t.Name + '.png')
  if ($t.Name -eq 'exe') {
    $outFull = Join-Path (Split-Path (Split-Path ((Resolve-Path -LiteralPath $t.Path).Path))) ('associated-exe.png')
    # place next to release-icon root
    $outFull = Join-Path $PSScriptRoot '..\release-icon\associated-exe.png'
  } else {
    $outFull = Join-Path $PSScriptRoot '..\release-icon\associated-setup.png'
  }
  $bmp.Save($outFull, [System.Drawing.Imaging.ImageFormat]::Png)
  $c = $bmp.GetPixel(2, 2)
  $m = $bmp.GetPixel([int]($bmp.Width / 2), [int]($bmp.Height * 0.4))
  Write-Host ("{0}: {1}x{2} corner={3},{4},{5} mid={6},{7},{8}" -f $t.Name, $bmp.Width, $bmp.Height, $c.R, $c.G, $c.B, $m.R, $m.G, $m.B)
  $bmp.Dispose()
  $ico.Dispose()
}
