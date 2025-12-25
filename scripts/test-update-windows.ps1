# Test script for stint-agent update process on Windows
# This script verifies the update process by:
# 1. Installing a specific version
# 2. Verifying installation
# 3. Running update command
# 4. Verifying new version

param(
    [string]$InitialVersion = "1.0.0",
    [string]$TargetVersion = "latest"
)

$ErrorActionPreference = "Stop"
$VerbosePreference = "Continue"

Write-Host "🔍 Testing stint-agent update process on Windows"
Write-Host "Initial version: $InitialVersion"
Write-Host "Target version: $TargetVersion"
Write-Host ""

# Helper function to get current version
function Get-StintVersion {
    try {
        $version = stint -v
        return $version.Trim()
    }
    catch {
        Write-Error "Failed to get stint version: $_"
        return $null
    }
}

# Helper function to verify daemon status
function Test-DaemonStatus {
    try {
        $output = stint daemon status
        return $output -match "running"
    }
    catch {
        return $false
    }
}

# 1. Install initial version
Write-Host "📦 Installing initial version ($InitialVersion)..."
try {
    npm install -g "@gowelle/stint-agent@$InitialVersion"
    $installedVersion = Get-StintVersion
    if ($installedVersion -ne $InitialVersion) {
        throw "Installed version ($installedVersion) does not match expected version ($InitialVersion)"
    }
    Write-Host "✓ Initial version installed successfully" -ForegroundColor Green
}
catch {
    Write-Error "Failed to install initial version: $_"
    exit 1
}

# 2. Start daemon
Write-Host "🚀 Starting daemon..."
try {
    stint daemon start
    Start-Sleep -Seconds 2
    if (-not (Test-DaemonStatus)) {
        throw "Daemon failed to start"
    }
    Write-Host "✓ Daemon started successfully" -ForegroundColor Green
}
catch {
    Write-Error "Failed to start daemon: $_"
    exit 1
}

# 3. Run update
Write-Host "⚡ Running update..."
try {
    if ($TargetVersion -eq "latest") {
        stint update
    }
    else {
        npm install -g "@gowelle/stint-agent@$TargetVersion"
    }
    Start-Sleep -Seconds 2
    Write-Host "✓ Update command completed" -ForegroundColor Green
}
catch {
    Write-Error "Failed to run update: $_"
    exit 1
}

# 4. Verify new version and daemon status
Write-Host "🔍 Verifying update..."
try {
    $newVersion = Get-StintVersion
    if ($TargetVersion -ne "latest" -and $newVersion -ne $TargetVersion) {
        throw "Updated version ($newVersion) does not match target version ($TargetVersion)"
    }
    
    if (-not (Test-DaemonStatus)) {
        throw "Daemon not running after update"
    }
    
    Write-Host "✓ Update verification successful" -ForegroundColor Green
    Write-Host "New version: $newVersion"
}
catch {
    Write-Error "Update verification failed: $_"
    exit 1
}

Write-Host ""
Write-Host "✨ Update test completed successfully" -ForegroundColor Green
