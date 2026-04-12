$root = 'C:\Users\macie\ha-tools-repo'
$www = "$root\www\community\ha-tools"
$samba = '\\192.168.1.124\config\www\community\ha-tools'

# Get all changed ha-*.js files (git diff vs HEAD~1)
$files = Get-ChildItem "$root\ha-*.js" -File | Where-Object { $_.Name -ne 'ha-entity-renamer-temp.js' } | Sort-Object Name

$ok = 0; $fail = 0
foreach ($f in $files) {
    $n = $f.Name
    # Sync to www
    Copy-Item $f.FullName (Join-Path $www $n) -Force
    # Sync to samba
    try {
        Copy-Item $f.FullName (Join-Path $samba $n) -Force
    } catch {
        Write-Host "SAMBA FAIL: $n" -ForegroundColor Red
        $fail++
        continue
    }
    # Verify MD5
    $rh = (Get-FileHash $f.FullName -Algorithm MD5).Hash.Substring(0,8)
    $wh = (Get-FileHash (Join-Path $www $n) -Algorithm MD5).Hash.Substring(0,8)
    $sh = (Get-FileHash (Join-Path $samba $n) -Algorithm MD5).Hash.Substring(0,8)
    if ($rh -eq $wh -and $rh -eq $sh) { $ok++ }
    else { Write-Host "MISMATCH: $n R:$rh W:$wh S:$sh" -ForegroundColor Red; $fail++ }
}
Write-Host "$ok OK, $fail failed out of $($files.Count) files"

# Cache bust
$lr = Get-Content "\\192.168.1.124\config\.storage\lovelace_resources" -Raw -Encoding UTF8
$newTag = [long]((Get-Date).ToUniversalTime() - [datetime]'1970-01-01').TotalSeconds
$updated = $lr -replace 'hacstag=\d+', "hacstag=$newTag"
[System.IO.File]::WriteAllText("\\192.168.1.124\config\.storage\lovelace_resources", $updated, [System.Text.UTF8Encoding]::new($false))
Write-Host "Cache busted: hacstag=$newTag" -ForegroundColor Cyan
