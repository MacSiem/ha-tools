$lr = Get-Content "\\192.168.1.124\config\.storage\lovelace_resources" -Raw -Encoding UTF8
$newTag = [long]((Get-Date).ToUniversalTime() - [datetime]'1970-01-01').TotalSeconds
$updated = $lr -replace 'hacstag=\d+', "hacstag=$newTag"
[System.IO.File]::WriteAllText("\\192.168.1.124\config\.storage\lovelace_resources", $updated, [System.Text.UTF8Encoding]::new($false))
Write-Host "Cache busted with hacstag=$newTag"
