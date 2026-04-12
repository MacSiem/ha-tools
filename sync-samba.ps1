$files = @(
  'ha-baby-tracker.js',
  'ha-data-exporter.js',
  'ha-chore-tracker.js',
  'ha-tools-panel.js',
  'ha-vacuum-water-monitor.js',
  'ha-frigate-privacy.js',
  'ha-sentence-manager.js',
  'ha-trace-viewer.js'
)
$src = 'C:\Users\macie\ha-tools-repo'
$samba = 'Z:\www\community\ha-tools'

if (!(Test-Path $samba)) {
  Write-Host "Samba not mounted at Z:\" -ForegroundColor Red
  exit 1
}

$ok = 0; $fail = 0
foreach ($f in $files) {
  $srcFile = Join-Path $src $f
  $sambaFile = Join-Path $samba $f
  try {
    Copy-Item $srcFile $sambaFile -Force
    $srcHash = (Get-FileHash $srcFile -Algorithm MD5).Hash
    $sambaHash = (Get-FileHash $sambaFile -Algorithm MD5).Hash
    if ($srcHash -eq $sambaHash) {
      Write-Host "OK: $f" -ForegroundColor Green
      $ok++
    } else {
      Write-Host "MISMATCH: $f" -ForegroundColor Red
      $fail++
    }
  } catch {
    Write-Host "ERROR: $f - $_" -ForegroundColor Red
    $fail++
  }
}
Write-Host "`n$ok OK, $fail failed"
