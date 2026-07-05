<#
.SYNOPSIS
Drives PowerPoint through the embed slideshow-lifecycle spike protocol.

Builds a 5-slide test deck from the sanitized seed (slides 2 and 4 carry the
Prezo Game embed, 1/3/5 are plain), then walks it in edit view and in a
slideshow while posting timeline markers to the spike collector. Correlate
the markers with the probe events (spike-lifecycle-probe.js) in the viewer
at <backend>/spike or in backend data/spike/embed-lifecycle.jsonl.

Prereqs (see docs/spike-embed-lifecycle.md):
- backend on http://localhost:8000  (backend: python -m uvicorn app.main:app --port 8000)
- probed dist on http://localhost:3000  (frontend-addin: npm run build; npm start)
- catalog manifest repointed at localhost (scripts/spike-manifest-target.ps1 -Target localhost)
  and PowerPoint restarted afterwards.

.EXAMPLE
powershell -ExecutionPolicy Bypass -File scripts/spike-slideshow-driver.ps1
#>
param(
  [string]$Backend = "http://localhost:8000",
  [string]$SeedDeck = "",
  [string]$OutDeck = "",
  [int]$HoldSeconds = 10,
  [switch]$LeaveOpen,
  # Cold-show mode: reuse the deck built by a previous run, skip the
  # edit-view pass, and go straight into the slideshow with embeds that have
  # never booted this session. Answers "does the webview boot when the show
  # reaches its slide with no prior edit-view visit?"
  [switch]$ColdShow
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $SeedDeck) { $SeedDeck = Join-Path $scriptDir "..\public\game-slide.pptx" }
$SeedDeck = [System.IO.Path]::GetFullPath($SeedDeck)
if (-not $OutDeck) { $OutDeck = Join-Path $env:TEMP "prezo-spike-deck.pptx" }
if (-not (Test-Path $SeedDeck)) { throw "Seed deck not found: $SeedDeck" }

function Send-Marker([string]$Label) {
  $body = @{ event = "marker"; label = $Label } | ConvertTo-Json -Compress
  try {
    Invoke-RestMethod -Method Post -Uri "$Backend/spike/lifecycle" -ContentType "application/json" -Body $body | Out-Null
  } catch {
    Write-Warning "marker failed ($Label): $($_.Exception.Message)"
  }
  Write-Host "[marker] $Label"
}

# --- Preflight -------------------------------------------------------------
try {
  Invoke-RestMethod -Uri "$Backend/health" | Out-Null
} catch {
  throw "Spike collector unreachable at $Backend. Start the backend first."
}

$manifestPath = Join-Path $env:LOCALAPPDATA "Prezo\Catalog\manifest-content.xml"
if (Test-Path $manifestPath) {
  $manifestText = Get-Content $manifestPath -Raw
  if ($manifestText -notmatch "localhost") {
    Write-Warning "Catalog manifest still points at the deployed page. Probe events will NOT arrive."
    Write-Warning "Run scripts/spike-manifest-target.ps1 -Target localhost (PowerPoint closed), then retry."
  }
}

Send-Marker "driver: start (seed=$SeedDeck hold=${HoldSeconds}s coldShow=$ColdShow)"

$pp = New-Object -ComObject PowerPoint.Application
try { $pp.Visible = $true } catch { }

if ($ColdShow) {
  if (-not (Test-Path $OutDeck)) { throw "Cold-show mode needs the deck from a previous run at $OutDeck" }
  Send-Marker "cold: opening prebuilt deck read-only, straight to slideshow"
  $pres = $pp.Presentations.Open($OutDeck, -1, 0, -1)   # ReadOnly=msoTrue
  if (-not $pres) {
    $deadline = (Get-Date).AddSeconds(20)
    while (-not $pres -and (Get-Date) -lt $deadline) {
      Start-Sleep -Milliseconds 500
      if ($pp.Presentations.Count -ge 1) {
        $pres = $pp.Presentations.Item($pp.Presentations.Count)
      }
    }
  }
  if (-not $pres) { throw "Could not obtain the opened presentation from PowerPoint." }
  $pres.Windows.Item(1).View.GotoSlide(1)
  Send-Marker "cold: parked on slide 1; settling (no embed should have booted)"
  Start-Sleep -Seconds 8
} else {

# --- Build the 5-slide test deck -------------------------------------------
Send-Marker "deck: opening seed as untitled copy (embed webview may boot now)"
# Open(FileName, ReadOnly, Untitled, WithWindow); msoFalse=0, msoTrue=-1.
# Late binding sometimes fails to marshal Open's return value back to
# PowerShell even though the open succeeded, so fall back to the collection.
$pres = $pp.Presentations.Open($SeedDeck, 0, -1, -1)
if (-not $pres) {
  $deadline = (Get-Date).AddSeconds(20)
  while (-not $pres -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
    if ($pp.Presentations.Count -ge 1) {
      $pres = $pp.Presentations.Item($pp.Presentations.Count)
    }
  }
}
if (-not $pres) { throw "Could not obtain the opened presentation from PowerPoint." }

$ppLayoutBlank = 12

function Add-Label($slide, [string]$Text, [int]$Big) {
  $height = 80
  if ($Big -eq 1) { $height = 160 }
  $box = $slide.Shapes.AddTextbox(1, 40, 40, 840, $height)
  $box.TextFrame.TextRange.Text = $Text
  if ($Big -eq 1) { $box.TextFrame.TextRange.Font.Size = 60 } else { $box.TextFrame.TextRange.Font.Size = 28 }
  $box.TextFrame.TextRange.Font.Bold = -1
}

Send-Marker "deck: construction start"
$embedA = $pres.Slides.Item(1)
$s1 = $pres.Slides.Add(1, $ppLayoutBlank)          # embed slide becomes 2
Add-Label $s1 "SLIDE 1 - no embed" 1
$s3 = $pres.Slides.Add(3, $ppLayoutBlank)
Add-Label $s3 "SLIDE 3 - no embed" 1
$dup = $embedA.Duplicate()                          # lands at 3, pushes blank to 4
$dup.MoveTo(4)                                      # order: 1 blank, 2 embed A, 3 blank, 4 embed B
$s5 = $pres.Slides.Add(5, $ppLayoutBlank)
Add-Label $s5 "SLIDE 5 - no embed" 1
Add-Label $pres.Slides.Item(2) "EMBED A (slide 2)" 0
Add-Label $pres.Slides.Item(4) "EMBED B (slide 4)" 0

# Kill transitions everywhere: the known frame-blanking variable stays out
# of this experiment (see seed/README.md behavior notes).
foreach ($slide in @($pres.Slides)) {
  $slide.SlideShowTransition.EntryEffect = 0        # ppEffectNone
}

if (Test-Path $OutDeck) { Remove-Item $OutDeck -Force }
$pres.SaveAs($OutDeck, 24)                          # ppSaveAsOpenXMLPresentation
Send-Marker "deck: built and saved ($OutDeck)"

# --- Edit-view identification pass ------------------------------------------
# Visit each embed slide in edit view so every instance boots once and mints
# its identity; the boot timing here tells us when EDIT view instantiates
# webviews (and whether non-visible slides instantiate too).
$editView = $pres.Windows.Item(1).View

Send-Marker "edit: goto slide 1 (blank)"
$editView.GotoSlide(1)
Start-Sleep -Seconds 5

Send-Marker "edit: goto slide 2 (EMBED A) - expect boot if edit instantiates on display"
$editView.GotoSlide(2)
Start-Sleep -Seconds $HoldSeconds

Send-Marker "edit: goto slide 3 (blank)"
$editView.GotoSlide(3)
Start-Sleep -Seconds 5

Send-Marker "edit: goto slide 4 (EMBED B)"
$editView.GotoSlide(4)
Start-Sleep -Seconds $HoldSeconds

Send-Marker "edit: back to slide 1; settling before slideshow"
$editView.GotoSlide(1)
Start-Sleep -Seconds 6

}

# --- Slideshow pass ----------------------------------------------------------
Send-Marker "SHOW: starting slideshow at slide 1"
$pres.SlideShowSettings.ShowType = 1                # ppShowTypeSpeaker
$pres.SlideShowSettings.RangeType = 1               # ppShowAll
$pres.SlideShowSettings.Run() | Out-Null
Start-Sleep -Seconds $HoldSeconds
$showView = $pp.SlideShowWindows.Item(1).View

Send-Marker "SHOW: advance to slide 2 (EMBED A) - expect show-instance boot"
$showView.Next()
Start-Sleep -Seconds $HoldSeconds

Send-Marker "SHOW: advance to slide 3 (blank) - watch embed A teardown"
$showView.Next()
Start-Sleep -Seconds $HoldSeconds

Send-Marker "SHOW: advance to slide 4 (EMBED B)"
$showView.Next()
Start-Sleep -Seconds $HoldSeconds

Send-Marker "SHOW: advance to slide 5 (blank) - watch embed B teardown"
$showView.Next()
Start-Sleep -Seconds $HoldSeconds

Send-Marker "SHOW: jump back to slide 2 (EMBED A) - fresh instance or reuse?"
$showView.GotoSlide(2)
Start-Sleep -Seconds $HoldSeconds

Send-Marker "SHOW: exiting slideshow"
$showView.Exit()
Start-Sleep -Seconds 6

Send-Marker "post-show: observing for 12s (which instances survive?)"
Start-Sleep -Seconds 12

# --- Wrap up ------------------------------------------------------------------
if (-not $LeaveOpen) {
  $pres.Saved = -1
  $pres.Close()
  Send-Marker "driver: presentation closed"
  Start-Sleep -Seconds 4
}
Send-Marker "driver: complete"
Write-Host ""
Write-Host "Done. Review $Backend/spike or backend data/spike/embed-lifecycle.jsonl"
