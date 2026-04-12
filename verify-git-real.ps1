# Verify git HEAD matches working tree using git's own diff
$root = 'C:\Users\macie\ha-tools-repo'
Set-Location $root

# 1. Check git diff HEAD (most reliable)
$diff = & git diff HEAD --name-only 2>&1
if ([string]::IsNullOrWhiteSpace($diff)) {
    Write-Host "GIT: Working tree matches HEAD exactly (0 diffs)" -ForegroundColor Green
} else {
    Write-Host "GIT: Files differ from HEAD:" -ForegroundColor Red
    $diff | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
}

# 2. Check staged
$staged = & git diff --cached --name-only 2>&1
if ([string]::IsNullOrWhiteSpace($staged)) {
    Write-Host "GIT: No staged changes" -ForegroundColor Green
} else {
    Write-Host "GIT: Staged files:" -ForegroundColor Red
    $staged | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
}

# 3. Check remote sync
$local = (& git rev-parse HEAD 2>&1).Trim()
$remote = (& git rev-parse origin/main 2>&1).Trim()
if ($local -eq $remote) {
    Write-Host "GIT: Local HEAD = origin/main ($($local.Substring(0,7)))" -ForegroundColor Green
} else {
    Write-Host "GIT: LOCAL $($local.Substring(0,7)) != REMOTE $($remote.Substring(0,7))" -ForegroundColor Red
}

# 4. Verify root vs www vs samba (file-level MD5)
Write-Host ""
Write-Host "=== FILE SYNC (Root vs WWW vs Samba) ===" -ForegroundColor Cyan
$www = "$root\www\community\ha-tools"
$samba = '\\192.168.1.124\config\www\community\ha-tools'
$files = Get-ChildItem "$root\ha-*.js" -File | Sort-Object Name
$ok = 0; $bad = 0

foreach ($f in $files) {
    $n = $f.Name
    $rh = (Get-FileHash $f.FullName -Algorithm MD5).Hash.Substring(0,8)

    $wp = Join-Path $www $n
    $wh = if (Test-Path $wp) { (Get-FileHash $wp -Algorithm MD5).Hash.Substring(0,8) } else { 'MISSING' }

    $sp = Join-Path $samba $n
    $sh = if (Test-Path $sp) { (Get-FileHash $sp -Algorithm MD5).Hash.Substring(0,8) } else { 'MISSING' }

    if ($rh -eq $wh -and $rh -eq $sh) {
        $ok++
    } else {
        Write-Host "MISMATCH $n  R:$rh W:$wh S:$sh" -ForegroundColor Red
        $bad++
    }
}
Write-Host "Files: $($files.Count), OK: $ok, Mismatch: $bad" -ForegroundColor $(if ($bad -eq 0) { 'Green' } else { 'Red' })
