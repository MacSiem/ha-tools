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
$dst = 'C:\Users\macie\ha-tools-repo\www\community\ha-tools'

foreach ($f in $files) {
  $srcFile = Join-Path $src $f
  $dstFile = Join-Path $dst $f
  Copy-Item $srcFile $dstFile -Force
  $srcHash = (Get-FileHash $srcFile -Algorithm MD5).Hash
  $dstHash = (Get-FileHash $dstFile -Algorithm MD5).Hash
  if ($srcHash -eq $dstHash) {
    Write-Host "OK: $f (MD5: $srcHash)"
  } else {
    Write-Host "MISMATCH: $f src=$srcHash dst=$dstHash" -ForegroundColor Red
  }
}
Write-Host "`nDONE - all files synced"
