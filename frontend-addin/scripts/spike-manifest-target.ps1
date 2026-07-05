<#
.SYNOPSIS
Points the installed Prezo Game content add-in at localhost (or back at the
deployed page) for the slideshow-lifecycle spike.

The .pptx webextension part stores only the add-in id (store="developer"
storeType="Registry"), so PowerPoint resolves the frame URL from the catalog
manifest at load time: repointing the manifest redirects every existing
embed. The first run backs the manifest up next to itself
(manifest-content.xml.spike-backup); -Target railway restores that backup.

PowerPoint reads dev-registry manifests at startup, so it must be closed
when this runs, and restarted afterwards.

.EXAMPLE
powershell -ExecutionPolicy Bypass -File scripts/spike-manifest-target.ps1 -Target localhost
powershell -ExecutionPolicy Bypass -File scripts/spike-manifest-target.ps1 -Target railway
#>
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("localhost", "railway")]
  [string]$Target,
  [int]$Port = 3000,
  # Optional query string (without leading ?) appended to the localhost
  # SourceLocation, e.g. "sessionId=X&pollId=Y&apiBase=http://localhost:8000".
  # The embed page reads sessionId/pollId/apiBase from its URL, so this
  # pre-binds every embed instance for scripted end-to-end runs.
  [string]$Query = ""
)

$ErrorActionPreference = "Stop"

$manifestPath = Join-Path $env:LOCALAPPDATA "Prezo\Catalog\manifest-content.xml"
if (-not (Test-Path $manifestPath)) { throw "Installed content manifest not found: $manifestPath" }

$running = Get-Process POWERPNT -ErrorAction SilentlyContinue
if ($running) { throw "PowerPoint is running. Close it first; the manifest is read at startup." }

$backupPath = "$manifestPath.spike-backup"

if ($Target -eq "railway") {
  if (-not (Test-Path $backupPath)) { throw "No backup found at $backupPath; nothing to restore." }
  Copy-Item $backupPath $manifestPath -Force
  Write-Host "Restored original manifest from backup."
} else {
  if (-not (Test-Path $backupPath)) { Copy-Item $manifestPath $backupPath }
  $xml = Get-Content $backupPath -Raw
  $localBase = "http://localhost:$Port"
  $localSource = "$localBase/embed/poll-game-content"
  if ($Query) {
    $localSource = "$localSource" + "?" + [System.Security.SecurityElement]::Escape($Query)
  }
  $xml = $xml -replace 'https://prezo-addin\.up\.railway\.app/embed/poll-game-content', $localSource
  if ($xml -notmatch [regex]::Escape("<AppDomain>$localBase</AppDomain>")) {
    $xml = $xml -replace '<AppDomains>', "<AppDomains>`r`n    <AppDomain>$localBase</AppDomain>"
  }
  Set-Content -Path $manifestPath -Value $xml -Encoding UTF8
  Write-Host "Repointed content add-in at $localBase (backup at $backupPath)."
}

$sourceLine = (Get-Content $manifestPath | Select-String "SourceLocation").Line.Trim()
Write-Host "SourceLocation now: $sourceLine"
Write-Host "Restart PowerPoint for the change to take effect."
