<#
.SYNOPSIS
Strips the baked-in embedId from a game-slide seed deck, producing the
shippable template public/game-slide.pptx.

.DESCRIPTION
When the seed deck is authored in PowerPoint, the live Prezo Game embed
mints an embedId into its webextension settings and PowerPoint saves it
into the file. Shipping that id would make every inserted copy of the
slide share one identity (cross-deck state collisions until the runtime
fork logic happens to catch them concurrently).

With the id removed, each inserted slide mints a fresh uuid on first
load (embed-identity.js resolve()), so the persistent-embed tagging
system behaves exactly like a brand-new manual insert.

.NOTES
Regenerate the seed (see seed/README.md) whenever the content add-in's
registration channel changes (developer registry vs centralized
deployment) or the embed URL/domain changes — the saved webextension
reference records both.

.EXAMPLE
powershell -ExecutionPolicy Bypass -File scripts/sanitize-game-slide.ps1
#>
param(
  [string]$Source = (Join-Path $PSScriptRoot "..\seed\game-slide.source.pptx"),
  [string]$Destination = (Join-Path $PSScriptRoot "..\public\game-slide.pptx"),
  # Replaces the embed's snapshot image (what PowerPoint paints in the frame
  # during slide transitions and on machines without the add-in). The seed's
  # own snapshot captures whatever the embed showed at authoring time — often
  # the near-white signed-out screen, which reads as a white flash mid-
  # transition. Skipped when the file doesn't exist.
  [string]$SnapshotImage = (Join-Path $PSScriptRoot "..\seed\snapshot-placeholder.png")
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$Source = [System.IO.Path]::GetFullPath($Source)
$Destination = [System.IO.Path]::GetFullPath($Destination)

if (-not (Test-Path $Source)) {
  throw "Seed file not found: $Source`nCreate it in PowerPoint: new deck -> Home > Add-ins > Developer Add-ins > Prezo Game Surface -> wait for the embed to appear -> save as frontend-addin\seed\game-slide.source.pptx"
}

Copy-Item $Source $Destination -Force

$gameAddinId = '0885b291-af1d-4808-a2f8-6a3ee4c61e5e'
$removedCount = 0
$sawGameReference = $false
$webExtensionEntries = 0
$snapshotsReplaced = 0
$replaceSnapshot = (Test-Path $SnapshotImage)

$zip = [System.IO.Compression.ZipFile]::Open($Destination, [System.IO.Compression.ZipArchiveMode]::Update)
try {
  # PowerPoint writes the folder as lowercase 'webextensions'; -like is
  # case-insensitive in PowerShell, but match both spellings explicitly.
  $entries = @($zip.Entries | Where-Object {
    $_.FullName -like 'ppt/webextensions/*.xml' -or $_.FullName -like 'ppt/webExtensions/*.xml'
  })
  foreach ($entry in $entries) {
    $webExtensionEntries++

    $reader = New-Object System.IO.StreamReader($entry.Open(), [System.Text.Encoding]::UTF8)
    $xml = $reader.ReadToEnd()
    $reader.Dispose()

    if ($xml -match [regex]::Escape($gameAddinId)) {
      $sawGameReference = $true
    }

    # Office serializes settings as <we:property name="..." value="..."/>;
    # handle both self-closing and paired forms, any attribute order.
    $patterns = @(
      '<we:property\b[^>]*\bname="embedId"[^>]*/>',
      '<we:property\b[^>]*\bname="embedId"[^>]*>[\s\S]*?</we:property>'
    )
    $updated = $xml
    foreach ($pattern in $patterns) {
      $found = [regex]::Matches($updated, $pattern)
      if ($found.Count -gt 0) {
        $removedCount += $found.Count
        $updated = [regex]::Replace($updated, $pattern, '')
      }
    }

    if ($updated -ne $xml) {
      $stream = $entry.Open()
      $stream.SetLength(0)
      $writer = New-Object System.IO.StreamWriter($stream, (New-Object System.Text.UTF8Encoding($false)))
      $writer.Write($updated)
      $writer.Dispose()
    }

    if ($replaceSnapshot) {
      # Resolve the snapshot media part via the webextension's relationships:
      # <we:snapshot r:embed="rIdX"/> -> _rels/<part>.rels -> Target.
      $snapshotMatch = [regex]::Match($updated, '<we:snapshot\b[^>]*r:embed="([^"]+)"')
      if ($snapshotMatch.Success) {
        $relId = $snapshotMatch.Groups[1].Value
        $partDir = [System.IO.Path]::GetDirectoryName($entry.FullName).Replace('\', '/')
        $partName = [System.IO.Path]::GetFileName($entry.FullName)
        $relsEntry = $zip.Entries | Where-Object { $_.FullName -eq "$partDir/_rels/$partName.rels" }
        if ($relsEntry) {
          $relsReader = New-Object System.IO.StreamReader($relsEntry.Open(), [System.Text.Encoding]::UTF8)
          $relsXml = $relsReader.ReadToEnd()
          $relsReader.Dispose()
          $targetMatch = [regex]::Match(
            $relsXml,
            ('<Relationship\b[^>]*Id="' + [regex]::Escape($relId) + '"[^>]*Target="([^"]+)"|<Relationship\b[^>]*Target="([^"]+)"[^>]*Id="' + [regex]::Escape($relId) + '"')
          )
          $target = if ($targetMatch.Groups[1].Value) { $targetMatch.Groups[1].Value } else { $targetMatch.Groups[2].Value }
          if ($target) {
            $mediaPath = if ($target.StartsWith('/')) {
              $target.TrimStart('/')
            } else {
              # Targets are relative to the part's folder, e.g. ../media/image1.png
              $combined = "$partDir/$target"
              while ($combined -match '[^/]+/\.\./') {
                $combined = $combined -replace '[^/]+/\.\./', ''
              }
              $combined
            }
            $mediaEntry = $zip.Entries | Where-Object { $_.FullName -eq $mediaPath }
            if ($mediaEntry) {
              $bytes = [System.IO.File]::ReadAllBytes($SnapshotImage)
              $mediaStream = $mediaEntry.Open()
              $mediaStream.SetLength(0)
              $mediaStream.Write($bytes, 0, $bytes.Length)
              $mediaStream.Dispose()
              $snapshotsReplaced++
            } else {
              Write-Warning "Snapshot media part not found in archive: $mediaPath"
            }
          }
        }
      }
    }
  }
}
finally {
  $zip.Dispose()
}

if ($webExtensionEntries -eq 0) {
  Write-Warning 'No webextension parts found: the seed does not contain a content add-in. Did the embed finish loading before you saved?'
} elseif (-not $sawGameReference) {
  Write-Warning "No reference to the Prezo Game add-in id ($gameAddinId) found. Double-check the seed was made with the right add-in."
}

Write-Output "Sanitized template written: $Destination"
Write-Output "Webextension parts scanned: $webExtensionEntries | embedId properties removed: $removedCount | snapshots replaced: $snapshotsReplaced"
if ($replaceSnapshot -and $snapshotsReplaced -eq 0 -and $webExtensionEntries -gt 0) {
  Write-Warning 'Snapshot placeholder provided but no snapshot reference was found to replace.'
}
if ($removedCount -eq 0 -and $webExtensionEntries -gt 0) {
  Write-Output '(No embedId found. That is fine if the embed never persisted one before the save; inserted copies mint their own id on first load either way.)'
}
