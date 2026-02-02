$ErrorActionPreference = "Continue"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$addinPath = Join-Path $root "frontend-addin"
$manifestPath = Join-Path $addinPath "manifest\\manifest.xml"
$devBrowserProfile = Join-Path $env:TEMP "prezo-dev-browser"

function Stop-ByTitle {
  param([string]$Pattern)

  Get-Process | Where-Object {
    $_.MainWindowTitle -and $_.MainWindowTitle -like $Pattern
  } | ForEach-Object {
    try {
      Stop-Process -Id $_.Id -Force -ErrorAction Stop
    } catch {
      # Best-effort cleanup
    }
  }
}

function Stop-DevBrowserProcesses {
  param([string]$ProfilePath)

  if (-not $ProfilePath) {
    return
  }

  try {
    $escaped = [Regex]::Escape($ProfilePath)
    $chromeProcesses = Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" |
      Where-Object { $_.CommandLine -match "--user-data-dir=$escaped" }
    foreach ($proc in $chromeProcesses) {
      try {
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
      } catch {
        # Best-effort cleanup
      }
    }
  } catch {
    # Best-effort cleanup
  }
}

function Stop-ByPort {
  param([int]$Port)

  try {
    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop
    foreach ($conn in $connections) {
      try {
        Stop-Process -Id $conn.OwningProcess -Force -ErrorAction Stop
      } catch {
        # Best-effort cleanup
      }
    }
    return
  } catch {
    # Fallback for older environments
  }

  try {
    $netstat = netstat -ano -p tcp | Select-String -Pattern "LISTENING" |
      Select-String -Pattern (":$Port\\s")
    foreach ($line in $netstat) {
      $pid = ($line.Line -split "\\s+")[-1]
      if ($pid -match "^[0-9]+$") {
        try {
          Stop-Process -Id $pid -Force -ErrorAction Stop
        } catch {
          # Best-effort cleanup
        }
      }
    }
  } catch {
    # Best-effort cleanup
  }
}

Write-Host "Stopping Prezo dev sessions..."

if (Test-Path $manifestPath) {
  try {
    Push-Location $addinPath
    npx office-addin-debugging stop $manifestPath desktop | Out-Null
  } catch {
    # Best-effort cleanup
  } finally {
    Pop-Location
  }
}

# Stop dev servers by port
Stop-ByPort -Port 8000
Stop-ByPort -Port 5173
Stop-ByPort -Port 5174

# Close PowerPoint
Get-Process -Name "POWERPNT" -ErrorAction SilentlyContinue | ForEach-Object {
  try { Stop-Process -Id $_.Id -Force -ErrorAction Stop } catch {}
}

# Close any dev browser windows hitting localhost
Stop-DevBrowserProcesses -ProfilePath $devBrowserProfile

# Close the dev terminals we launched
Stop-ByTitle -Pattern "Prezo *"

Write-Host "Done."
