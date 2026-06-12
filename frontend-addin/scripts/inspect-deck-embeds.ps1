<#
.SYNOPSIS
Forensic report on the Prezo Game content add-in instances inside a .pptx:
which slides carry webextension frames, frame geometry, fallback picture
wiring, webextension references/properties, and snapshot media.

Use to diff a manually-inserted embed against an insertSlidesFromBase64-
inserted one when they behave differently in slideshow.

.EXAMPLE
powershell -ExecutionPolicy Bypass -File scripts/inspect-deck-embeds.ps1 -Deck "C:\path\to\deck.pptx"
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$Deck
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$Deck = [System.IO.Path]::GetFullPath($Deck)
if (-not (Test-Path $Deck)) { throw "File not found: $Deck" }

function Read-Entry($zip, $name) {
  $entry = $zip.Entries | Where-Object { $_.FullName -eq $name }
  if (-not $entry) { return $null }
  $reader = New-Object System.IO.StreamReader($entry.Open(), [System.Text.Encoding]::UTF8)
  $text = $reader.ReadToEnd()
  $reader.Dispose()
  return $text
}

$zip = [System.IO.Compression.ZipFile]::Open($Deck, [System.IO.Compression.ZipArchiveMode]::Read)
try {
  $slides = @($zip.Entries | Where-Object { $_.FullName -match '^ppt/slides/slide\d+\.xml$' } | Sort-Object FullName)
  Write-Output "Deck: $Deck"
  Write-Output "Slides: $($slides.Count)"
  Write-Output ''

  foreach ($slide in $slides) {
    $xml = Read-Entry $zip $slide.FullName
    if ($xml -notmatch 'webextensionref') { continue }

    Write-Output "=== $($slide.FullName) ==="

    # Frame geometry (EMU; full 16:9 slide is 12192000 x 6858000)
    $frames = [regex]::Matches($xml, '<p:graphicFrame>.*?</p:graphicFrame>', 'Singleline')
    foreach ($frame in $frames) {
      if ($frame.Value -notmatch 'webextensionref') { continue }
      $off = [regex]::Match($frame.Value, '<a:off x="(\d+)" y="(\d+)"/>')
      $ext = [regex]::Match($frame.Value, '<a:ext cx="(\d+)" cy="(\d+)"/>')
      $refId = [regex]::Match($frame.Value, 'webextensionref[^>]*r:id="([^"]+)"').Groups[1].Value
      Write-Output ("frame: off=({0},{1}) ext=({2},{3}) webext-rel={4}" -f $off.Groups[1].Value, $off.Groups[2].Value, $ext.Groups[1].Value, $ext.Groups[2].Value, $refId)
    }

    # Fallback picture (what non-we renderers draw)
    $fallbackBlip = [regex]::Match($xml, '<mc:Fallback>.*?<a:blip r:embed="([^"]+)"', 'Singleline').Groups[1].Value
    Write-Output "fallback-pic rel: $(if ($fallbackBlip) { $fallbackBlip } else { 'MISSING' })"

    # Resolve slide rels
    $slideName = [System.IO.Path]::GetFileName($slide.FullName)
    $rels = Read-Entry $zip "ppt/slides/_rels/$slideName.rels"
    if ($rels) {
      foreach ($rel in [regex]::Matches($rels, '<Relationship[^>]*/>')) {
        $id = [regex]::Match($rel.Value, 'Id="([^"]+)"').Groups[1].Value
        $type = [regex]::Match($rel.Value, 'Type="[^"]*/(\w+)"').Groups[1].Value
        $target = [regex]::Match($rel.Value, 'Target="([^"]+)"').Groups[1].Value
        if ($type -in @('webextension', 'image')) {
          $resolved = $target -replace '^\.\./', 'ppt/'
          $exists = [bool]($zip.Entries | Where-Object { $_.FullName -eq $resolved })
          Write-Output ("rel {0} -> {1} ({2}) exists={3}" -f $id, $target, $type, $exists)
        }
      }
    } else {
      Write-Output 'slide rels: MISSING'
    }
    Write-Output ''
  }

  # All webextension parts
  $parts = @($zip.Entries | Where-Object { $_.FullName -match '^ppt/webextensions/webextension\d+\.xml$' } | Sort-Object FullName)
  foreach ($part in $parts) {
    $xml = Read-Entry $zip $part.FullName
    Write-Output "=== $($part.FullName) ==="
    $ref = [regex]::Match($xml, '<we:reference[^>]*/>').Value
    Write-Output "reference: $ref"
    $props = [regex]::Matches($xml, '<we:property[^>]*name="([^"]+)"') | ForEach-Object { $_.Groups[1].Value }
    Write-Output "properties: $(if ($props) { $props -join ', ' } else { '(none)' })"
    $snapshotRel = [regex]::Match($xml, '<we:snapshot[^>]*r:embed="([^"]+)"').Groups[1].Value
    if ($snapshotRel) {
      $partName = [System.IO.Path]::GetFileName($part.FullName)
      $rels = Read-Entry $zip "ppt/webextensions/_rels/$partName.rels"
      $target = [regex]::Match($rels, ('Id="' + [regex]::Escape($snapshotRel) + '"[^>]*Target="([^"]+)"')).Groups[1].Value
      if (-not $target) {
        $target = [regex]::Match($rels, ('Target="([^"]+)"[^>]*Id="' + [regex]::Escape($snapshotRel) + '"')).Groups[1].Value
      }
      $resolved = $target -replace '^\.\./', 'ppt/'
      $media = $zip.Entries | Where-Object { $_.FullName -eq $resolved }
      Write-Output ("snapshot: rel={0} target={1} mediaBytes={2}" -f $snapshotRel, $target, $(if ($media) { $media.Length } else { 'MISSING' }))
    } else {
      Write-Output 'snapshot: NONE'
    }
    Write-Output ''
  }
}
finally {
  $zip.Dispose()
}
