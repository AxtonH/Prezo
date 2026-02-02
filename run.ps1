$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendPath = Join-Path $root "backend"
$addinPath = Join-Path $root "frontend-addin"
$audiencePath = Join-Path $root "frontend-audience"
$manifestPath = Join-Path $addinPath "manifest\\manifest.xml"
$contentManifestPath = Join-Path $addinPath "manifest\\manifest-content.xml"
$devBrowserProfile = Join-Path $env:TEMP "prezo-dev-browser"
$certDir = if ($env:OFFICE_ADDIN_DEV_CERTS) {
  $env:OFFICE_ADDIN_DEV_CERTS
} else {
  Join-Path $env:USERPROFILE ".office-addin-dev-certs"
}

function Require-Command {
  param(
    [string]$Name,
    [string]$InstallHint
  )

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $Name. $InstallHint"
  }
}

function Ensure-DevCerts {
  param(
    [string]$CertDir,
    [string]$AddinDir
  )

  $keyPath = Join-Path $CertDir "localhost.key"
  $certPath = Join-Path $CertDir "localhost.crt"

  if ((Test-Path $keyPath) -and (Test-Path $certPath)) {
    return
  }

  Write-Host "Office add-in dev certs not found. Installing..."
  Push-Location $AddinDir
  try {
    npx office-addin-dev-certs install
  } finally {
    Pop-Location
  }

  if (-not (Test-Path $keyPath) -or -not (Test-Path $certPath)) {
    throw "Dev certs still missing. Re-run: npx office-addin-dev-certs install"
  }
}

function Get-ListeningProcess {
  param([int]$Port)

  try {
    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
      Select-Object -First 1
    if ($connection) {
      return Get-Process -Id $connection.OwningProcess -ErrorAction Stop
    }
  } catch {
    $netstat = netstat -ano -p tcp | Select-String -Pattern "LISTENING" |
      Select-String -Pattern (":$Port\\s")
    if ($netstat) {
      $pid = ($netstat.Line -split "\\s+")[-1]
      if ($pid -match "^[0-9]+$") {
        try {
          return Get-Process -Id $pid -ErrorAction Stop
        } catch {
          return $null
        }
      }
    }
  }

  return $null
}

function Start-Runner {
  param(
    [string]$Name,
    [string]$WorkDir,
    [string]$Command,
    [int]$Port = 0
  )

  if (-not (Test-Path $WorkDir)) {
    throw "Missing path: $WorkDir"
  }

  if ($Port -gt 0) {
    $existing = Get-ListeningProcess -Port $Port
    if ($existing) {
      Write-Host "$Name already running on port $Port (PID $($existing.Id): $($existing.ProcessName))."
      return $false
    }
  }

  $titleCmd = '$host.UI.RawUI.WindowTitle = ''{0}''' -f $Name
  $fullCommand = "$titleCmd; $Command"

  Start-Process -FilePath "powershell.exe" `
    -WorkingDirectory $WorkDir `
    -ArgumentList "-NoExit", "-Command", $fullCommand | Out-Null

  return $true
}

function Wait-ForPort {
  param(
    [int]$Port,
    [int]$TimeoutSeconds = 15
  )

  $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
  while ($stopwatch.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
    if (Get-ListeningProcess -Port $Port) {
      return $true
    }
    Start-Sleep -Milliseconds 500
  }

  return $false
}

function Get-ChromePath {
  $candidates = @(
    (Join-Path $env:ProgramFiles "Google\\Chrome\\Application\\chrome.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Google\\Chrome\\Application\\chrome.exe"),
    (Join-Path $env:LOCALAPPDATA "Google\\Chrome\\Application\\chrome.exe")
  )

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) {
      return $candidate
    }
  }

  return $null
}

function Open-Url {
  param([string]$Url)

  $chromePath = Get-ChromePath
  if ($chromePath) {
    New-Item -ItemType Directory -Force -Path $devBrowserProfile | Out-Null
    $args = @(
      "--app=$Url",
      "--new-window",
      "--user-data-dir=$devBrowserProfile"
    )
    Start-Process -FilePath $chromePath -ArgumentList $args | Out-Null
    return
  }

  Start-Process $Url | Out-Null
}

function Start-Sideload {
  param(
    [string]$ManifestPath,
    [int]$DevServerPort,
    [switch]$NoSideload
  )

  if (-not (Test-Path $ManifestPath)) {
    throw "Missing manifest: $ManifestPath"
  }

  $sideloadCmd = "npx office-addin-debugging start `"$ManifestPath`" desktop --app powerpoint --dev-server-port $DevServerPort --no-debug"
  if ($NoSideload) {
    $sideloadCmd = "$sideloadCmd --no-sideload"
  }
  Start-Runner -Name "Prezo Sideload" -WorkDir $addinPath -Command $sideloadCmd
}

$backendCmd = @'
if (-not (Test-Path '.\.venv\Scripts\Activate.ps1')) {
  python -m venv .venv
}
. .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
'@

$frontendAddinCmd = @'
if (-not (Test-Path 'node_modules')) {
  npm install
}
npm run dev
'@

$frontendAudienceCmd = @'
if (-not (Test-Path 'node_modules')) {
  npm install
}
npm run dev
'@

Write-Host "Starting Prezo backend, host add-in, and audience..."

Require-Command -Name "node" -InstallHint "Install Node.js LTS from https://nodejs.org/."
Require-Command -Name "npm" -InstallHint "Install Node.js LTS from https://nodejs.org/."
Require-Command -Name "python" -InstallHint "Install Python 3 from https://python.org/."

Ensure-DevCerts -CertDir $certDir -AddinDir $addinPath

$backendStarted = Start-Runner -Name "Prezo Backend" -WorkDir $backendPath -Command $backendCmd -Port 8000
$hostStarted = Start-Runner -Name "Prezo Host" -WorkDir $addinPath -Command $frontendAddinCmd -Port 5173
$audienceStarted = Start-Runner -Name "Prezo Audience" -WorkDir $audiencePath -Command $frontendAudienceCmd -Port 5174

if (-not ($backendStarted -or $hostStarted -or $audienceStarted)) {
  Write-Host "Nothing started. Close any existing dev servers and run again."
}

if ($hostStarted -or (Get-ListeningProcess -Port 5173)) {
  if (Wait-ForPort -Port 5173 -TimeoutSeconds 40) {
    Open-Url "https://localhost:5173/"
    Start-Sideload -ManifestPath $manifestPath -DevServerPort 5173
    if (Test-Path $contentManifestPath) {
      Start-Sideload -ManifestPath $contentManifestPath -DevServerPort 5173 -NoSideload
    }
  }
}

if ($audienceStarted -or (Get-ListeningProcess -Port 5174)) {
  if (Wait-ForPort -Port 5174 -TimeoutSeconds 20) {
    Open-Url "http://localhost:5174/"
  }
}
