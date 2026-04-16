$src = 'C:\Users\macie\ha-tools-repo\www\community\ha-tools'
$dst = 'Z:\www\community\ha-tools'
$files = @(
  'ha-automation-analyzer.js','ha-baby-tracker.js','ha-backup-manager.js',
  'ha-chore-tracker.js','ha-data-exporter.js','ha-device-health.js',
  'ha-encoding-fixer.js','ha-energy-email.js','ha-energy-insights.js',
  'ha-energy-optimizer.js','ha-entity-renamer.js','ha-frigate-privacy.js',
  'ha-log-email.js','ha-network-map.js','ha-purge-cache.js',
  'ha-security-check.js','ha-sentence-manager.js','ha-smart-reports.js',
  'ha-storage-monitor.js','ha-trace-viewer.js','ha-vacuum-water-monitor.js',
  'ha-yaml-checker.js'
)
$ok = 0; $fail = 0
foreach ($f in $files) {
  $s = Join-Path $src $f
  $d = Join-Path $dst $f
  try {
    Copy-Item $s $d -Force
    $sz = (Get-Item $d).Length
    Write-Host "OK $f ($sz bytes)"
    $ok++
  } catch {
    Write-Host "FAIL $f"
    $fail++
  }
}
Write-Host ""
Write-Host "$ok OK, $fail FAIL"
