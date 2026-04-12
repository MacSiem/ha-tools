# Deep verify: git HEAD vs working dir vs www vs samba
$root = 'C:\Users\macie\ha-tools-repo'
$www = "$root\www\community\ha-tools"
$samba = '\\192.168.1.124\config\www\community\ha-tools'

$files = Get-ChildItem "$root\ha-*.js" -File | Where-Object { $_.Name -ne 'ha-entity-renamer-temp.js' } | Sort-Object Name

Write-Host "=== DEEP SYNC VERIFICATION ===" -ForegroundColor Cyan
Write-Host "Files: $($files.Count)"
Write-Host ""

$ok = 0; $issues = @()

foreach ($f in $files) {
    $name = $f.Name
    $rootHash = (Get-FileHash $f.FullName -Algorithm MD5).Hash.Substring(0,8)

    # Check www
    $wwwPath = Join-Path $www $name
    if (Test-Path $wwwPath) {
        $wwwHash = (Get-FileHash $wwwPath -Algorithm MD5).Hash.Substring(0,8)
    } else {
        $wwwHash = 'MISSING'
    }

    # Check samba
    $sambaPath = Join-Path $samba $name
    if (Test-Path $sambaPath) {
        $sambaHash = (Get-FileHash $sambaPath -Algorithm MD5).Hash.Substring(0,8)
    } else {
        $sambaHash = 'MISSING'
    }

    # Check git HEAD content via git show
    $gitContent = $null
    try {
        $gitTmp = [System.IO.Path]::GetTempFileName()
        & git -C $root show "HEAD:$name" 2>$null | Set-Content $gitTmp -Encoding UTF8
        $gitHash = (Get-FileHash $gitTmp -Algorithm MD5).Hash.Substring(0,8)
        Remove-Item $gitTmp -Force
    } catch {
        $gitHash = 'ERROR'
    }

    $allMatch = ($rootHash -eq $wwwHash) -and ($rootHash -eq $sambaHash)
    $gitMatch = ($rootHash -eq $gitHash)

    if ($allMatch -and $gitMatch) {
        Write-Host "OK  $name" -ForegroundColor Green -NoNewline
        Write-Host "  [$rootHash]" -ForegroundColor DarkGray
        $ok++
    } else {
        $status = "ISSUE"
        $detail = "Root:$rootHash Git:$gitHash WWW:$wwwHash Samba:$sambaHash"
        Write-Host "!!  $name  $detail" -ForegroundColor Red
        $issues += "$name : $detail"
    }
}

Write-Host ""
Write-Host "=== SUMMARY ===" -ForegroundColor Cyan
Write-Host "OK: $ok / $($files.Count)"
if ($issues.Count -gt 0) {
    Write-Host "ISSUES: $($issues.Count)" -ForegroundColor Red
    $issues | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
} else {
    Write-Host "All files in sync across Root, Git HEAD, WWW, and Samba" -ForegroundColor Green
}

# Also check for _esc in the 7 files that should have it
Write-Host ""
Write-Host "=== XSS FIX VERIFICATION ===" -ForegroundColor Cyan
$escFiles = @('ha-baby-tracker.js','ha-chore-tracker.js','ha-data-exporter.js','ha-frigate-privacy.js','ha-sentence-manager.js','ha-tools-panel.js','ha-vacuum-water-monitor.js')
foreach ($ef in $escFiles) {
    $path = Join-Path $root $ef
    $content = Get-Content $path -Raw
    if ($content -match 'const _esc') {
        Write-Host "OK  $ef has _esc()" -ForegroundColor Green
    } else {
        Write-Host "!!  $ef MISSING _esc()" -ForegroundColor Red
    }
}

# Check trace-viewer has the disconnectedCallback fix
$tvContent = Get-Content (Join-Path $root 'ha-trace-viewer.js') -Raw
if ($tvContent -match '_expDDClose') {
    Write-Host "OK  ha-trace-viewer.js has _expDDClose cleanup" -ForegroundColor Green
} else {
    Write-Host "!!  ha-trace-viewer.js MISSING _expDDClose cleanup" -ForegroundColor Red
}

# Check baby-tracker has _autoSaveTimer cleanup
$btContent = Get-Content (Join-Path $root 'ha-baby-tracker.js') -Raw
if ($btContent -match '_autoSaveTimer.*clearInterval|clearInterval.*_autoSaveTimer') {
    Write-Host "OK  ha-baby-tracker.js has _autoSaveTimer cleanup" -ForegroundColor Green
} else {
    Write-Host "!!  ha-baby-tracker.js MISSING _autoSaveTimer cleanup" -ForegroundColor Red
}
