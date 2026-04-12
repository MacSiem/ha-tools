param(
    [switch]$Verbose = $false
)

# Define paths
$rootPath = "C:\Users\macie\ha-tools-repo"
$wwwPath = "C:\Users\macie\ha-tools-repo\www\community\ha-tools"
$sambaPath = "\\192.168.1.124\config\www\community\ha-tools"

# Initialize counters
$totalFiles = 0
$okCount = 0
$mismatchCount = 0
$missingCount = 0

# Hash table to store results
$results = @()

Write-Host "=== HA-TOOLS SYNC VERIFICATION ===" -ForegroundColor Cyan
Write-Host "Root:  $rootPath" -ForegroundColor Gray
Write-Host "WWW:   $wwwPath" -ForegroundColor Gray
Write-Host "Samba: $sambaPath" -ForegroundColor Gray
Write-Host ""

# Get all ha-*.js files from root
$rootFiles = Get-ChildItem -Path $rootPath -Filter "ha-*.js" -File | Sort-Object Name

if ($rootFiles.Count -eq 0) {
    Write-Host "ERROR: No ha-*.js files found in root!" -ForegroundColor Red
    exit 1
}

foreach ($file in $rootFiles) {
    $fileName = $file.Name
    $totalFiles++
    
    $rootFile = Join-Path $rootPath $fileName
    $wwwFile = Join-Path $wwwPath $fileName
    $sambaFile = Join-Path $sambaPath $fileName
    
    # Calculate MD5 hashes
    try {
        $rootHash = (Get-FileHash -Path $rootFile -Algorithm MD5 -ErrorAction Stop).Hash
    } catch {
        Write-Host "ERROR reading root: $fileName" -ForegroundColor Red
        continue
    }
    
    # Check www
    $wwwExists = Test-Path $wwwFile
    $wwwHash = $null
    if ($wwwExists) {
        try {
            $wwwHash = (Get-FileHash -Path $wwwFile -Algorithm MD5 -ErrorAction Stop).Hash
        } catch {
            Write-Host "ERROR reading www: $fileName" -ForegroundColor Red
            $wwwHash = "ERROR"
        }
    }
    
    # Check Samba
    $sambaExists = Test-Path $sambaFile
    $sambaHash = $null
    if ($sambaExists) {
        try {
            $sambaHash = (Get-FileHash -Path $sambaFile -Algorithm MD5 -ErrorAction Stop).Hash
        } catch {
            Write-Host "ERROR reading Samba: $fileName" -ForegroundColor Red
            $sambaHash = "ERROR"
        }
    }
    
    # Determine status
    $status = "OK"
    $details = ""
    
    if (-not $wwwExists) {
        $status = "MISSING"
        $details = "Missing in www"
        $missingCount++
    } elseif (-not $sambaExists) {
        $status = "MISSING"
        $details = "Missing in Samba"
        $missingCount++
    } elseif ($wwwHash -eq "ERROR" -or $sambaHash -eq "ERROR") {
        $status = "ERROR"
        $details = "Could not read file"
    } elseif ($rootHash -ne $wwwHash -or $rootHash -ne $sambaHash) {
        $status = "MISMATCH"
        $details = @()
        if ($rootHash -ne $wwwHash) { $details += "www differs" }
        if ($rootHash -ne $sambaHash) { $details += "Samba differs" }
        $details = $details -join ", "
        $mismatchCount++
    } else {
        $okCount++
    }
    
    # Store result
    $result = [PSCustomObject]@{
        FileName = $fileName
        Status = $status
        Details = $details
        RootHash = $rootHash.Substring(0, 8)
        WwwHash = if ($wwwHash) { $wwwHash.Substring(0, 8) } else { "---" }
        SambaHash = if ($sambaHash) { $sambaHash.Substring(0, 8) } else { "---" }
    }
    $results += $result
    
    # Display result with color coding
    $color = switch ($status) {
        "OK" { "Green" }
        "MISSING" { "Yellow" }
        "MISMATCH" { "Red" }
        "ERROR" { "Red" }
        default { "White" }
    }
    
    $displayHash = "[R:$($result.RootHash) W:$($result.WwwHash) S:$($result.SambaHash)]"
    Write-Host "$status ".PadRight(10) -ForegroundColor $color -NoNewline
    Write-Host "$fileName ".PadRight(45) -NoNewline
    Write-Host $displayHash -ForegroundColor Gray -NoNewline
    
    if ($details) {
        Write-Host " ($details)" -ForegroundColor Yellow
    } else {
        Write-Host ""
    }
}

# Display summary
Write-Host ""
Write-Host "=== SUMMARY ===" -ForegroundColor Cyan
Write-Host "Total files:   $totalFiles"
Write-Host "OK:            $okCount" -ForegroundColor Green
Write-Host "Mismatch:      $mismatchCount" -ForegroundColor Red
Write-Host "Missing:       $missingCount" -ForegroundColor Yellow

# Exit code: 0 if all OK, 1 if any issues
if ($mismatchCount -gt 0 -or $missingCount -gt 0) {
    Write-Host ""
    Write-Host "ACTION REQUIRED: Sync issues detected!" -ForegroundColor Red
    exit 1
} else {
    Write-Host ""
    Write-Host "All files synced correctly." -ForegroundColor Green
    exit 0
}
