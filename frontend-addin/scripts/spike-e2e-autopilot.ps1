<#
.SYNOPSIS
End-to-end proof for auto poll view control: drives a real PowerPoint
slideshow and verifies (via the audience WebSocket watcher) that the bound
poll opens when the show reaches an embed slide and closes when it leaves.

Prereqs:
- e2e dev server on :8000  (backend: .venv\Scripts\python run_spike_e2e_server.py)
- audience watcher running (backend: .venv\Scripts\python spike_ws_watcher.py)
- probed dist on :3000     (frontend-addin: npm run build; npm start)
- manifest repointed WITH the seed binding (this script does it if PowerPoint
  is closed), using the deck built earlier by spike-slideshow-driver.ps1.

Everything lands on one timeline: markers (this script), embed probe events,
and audience 'poll_opened/poll_closed' events from the watcher. Review at
http://localhost:8000/spike or in backend/data/spike/embed-lifecycle.jsonl.
#>
param(
  [string]$Backend = "http://localhost:8000",
  [string]$Deck = "",
  [int]$HoldSeconds = 10,
  [switch]$SkipManifestRepoint,
  # Use the presentation already open in a running PowerPoint (e.g. after a
  # previous attempt opened the deck but lost its COM reference) instead of
  # opening the deck file again.
  [switch]$AttachExisting,
  [switch]$LeaveOpen
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $Deck) { $Deck = Join-Path $env:TEMP "prezo-spike-deck.pptx" }
if (-not (Test-Path $Deck)) { throw "Deck not found: $Deck (run spike-slideshow-driver.ps1 once to build it)" }

$seedPath = Join-Path $scriptDir "..\..\backend\data\spike\e2e-seed.json"
$seedPath = [System.IO.Path]::GetFullPath($seedPath)
if (-not (Test-Path $seedPath)) { throw "Seed not found: $seedPath (start run_spike_e2e_server.py first)" }
$seed = Get-Content $seedPath -Raw | ConvertFrom-Json

function Send-Marker([string]$Label) {
  $body = @{ event = "marker"; label = $Label } | ConvertTo-Json -Compress
  try {
    Invoke-RestMethod -Method Post -Uri "$Backend/spike/lifecycle" -ContentType "application/json" -Body $body | Out-Null
  } catch {
    Write-Warning "marker failed ($Label): $($_.Exception.Message)"
  }
  Write-Host "[marker] $Label"
}

# Retry a COM call through transient RPC_E_CALL_REJECTED while PowerPoint is busy.
function Invoke-Com([scriptblock]$Action, [int]$Attempts = 8) {
  for ($n = 1; $n -le $Attempts; $n += 1) {
    try { return & $Action } catch {
      if ($n -eq $Attempts) { throw }
      Start-Sleep -Milliseconds 750
    }
  }
}

Invoke-RestMethod -Uri "$Backend/health" | Out-Null

if (-not $SkipManifestRepoint) {
  $query = "sessionId=$($seed.session_id)&pollId=$($seed.poll_id)&apiBase=$($seed.api_base)"
  powershell -ExecutionPolicy Bypass -File (Join-Path $scriptDir "spike-manifest-target.ps1") -Target localhost -Query $query
  if ($LASTEXITCODE -ne 0) { throw "Manifest repoint failed (is PowerPoint closed?)" }
}

Send-Marker "e2e: start (session=$($seed.session_id) poll=$($seed.poll_id))"

# Office COM rejects calls (RPC_E_CALL_REJECTED) while the app is starting
# or busy; PowerShell has no IMessageFilter, so retry with backoff instead.
$pp = $null
for ($attempt = 1; $attempt -le 6 -and -not $pp; $attempt += 1) {
  try {
    $pp = New-Object -ComObject PowerPoint.Application
  } catch {
    Write-Host "PowerPoint COM busy (attempt $attempt): $($_.Exception.Message)"
    Start-Sleep -Seconds 5
  }
}
if (-not $pp) { throw "PowerPoint COM unavailable after retries." }
# Let a cold-launched app settle before automating it — the first calls
# after CreateObject are the most likely to be rejected.
Start-Sleep -Seconds 3
for ($i = 1; $i -le 5; $i += 1) { try { $pp.Visible = $true; break } catch { Start-Sleep -Seconds 2 } }

if ($AttachExisting) {
  Send-Marker "e2e: attaching to already-open presentation"
} else {
  Send-Marker "e2e: opening deck"
  # Open NON-untitled (the deck is a throwaway temp copy). Don't trust the
  # marshaled return value — re-resolve from the collection below.
  try { $pp.Presentations.Open($Deck, 0, 0, -1) | Out-Null } catch { }
}
$pres = $null
$deadline = (Get-Date).AddSeconds(90)
while (-not $pres -and (Get-Date) -lt $deadline) {
  try {
    if ($pp.Presentations.Count -ge 1) {
      $candidate = $pp.Presentations.Item($pp.Presentations.Count)
      $null = $candidate.Slides.Count   # throws until fully loaded
      $pres = $candidate
    }
  } catch { }
  if (-not $pres) { Start-Sleep -Seconds 2 }
}
if (-not $pres) { throw "Could not obtain a ready presentation from PowerPoint." }
Send-Marker "e2e: presentation ready ($(Invoke-Com { $pres.Name }))"

# Auth note: PowerPoint content add-ins cannot read customXmlParts (Word-
# only common API), so token delivery works like production — the probe
# fetches GET /spike/e2e-token from the seeded dev server and writes the
# shared-origin localStorage key the wrapper polls. Nothing to inject here.

$editView = Invoke-Com { $pres.Windows.Item(1).View }

Send-Marker "e2e edit: goto slide 2 (EMBED A boots, localizes, binds)"
Invoke-Com { $editView.GotoSlide(2) }
Start-Sleep -Seconds 14

Send-Marker "e2e edit: goto slide 4 (EMBED B boots, localizes, binds)"
Invoke-Com { $editView.GotoSlide(4) }
Start-Sleep -Seconds 14

Send-Marker "e2e edit: back to slide 1"
Invoke-Com { $editView.GotoSlide(1) }
Start-Sleep -Seconds 5

Send-Marker "SHOW: start at slide 1 (blank) - poll must stay closed"
Invoke-Com { $pres.SlideShowSettings.ShowType = 1 }
Invoke-Com { $pres.SlideShowSettings.RangeType = 1 }
Invoke-Com { $pres.SlideShowSettings.Run() } | Out-Null
Start-Sleep -Seconds $HoldSeconds
$showView = Invoke-Com { $pp.SlideShowWindows.Item(1).View }

Send-Marker "SHOW: advance to slide 2 (EMBED A) - EXPECT poll_opened"
Invoke-Com { $showView.Next() }
Start-Sleep -Seconds $HoldSeconds

Send-Marker "SHOW: advance to slide 3 (blank) - EXPECT poll_closed"
Invoke-Com { $showView.Next() }
Start-Sleep -Seconds $HoldSeconds

Send-Marker "SHOW: advance to slide 4 (EMBED B) - EXPECT poll_opened"
Invoke-Com { $showView.Next() }
Start-Sleep -Seconds $HoldSeconds

Send-Marker "SHOW: advance to slide 5 (blank) - EXPECT poll_closed"
Invoke-Com { $showView.Next() }
Start-Sleep -Seconds $HoldSeconds

Send-Marker "SHOW: jump back to slide 2 - EXPECT poll_opened"
Invoke-Com { $showView.GotoSlide(2) }
Start-Sleep -Seconds $HoldSeconds

Send-Marker "SHOW: exit slideshow - EXPECT poll_closed"
Invoke-Com { $showView.Exit() }
Start-Sleep -Seconds 8

if (-not $LeaveOpen) {
  $pres.Saved = -1
  $pres.Close()
}
Send-Marker "e2e: complete"
Write-Host ""
Write-Host "Done. Timeline: $Backend/spike or backend/data/spike/embed-lifecycle.jsonl"
