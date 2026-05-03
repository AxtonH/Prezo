#requires -Version 5.1
<#
.SYNOPSIS
    Builds the Prezo Windows installer (PrezoSetup-<version>.exe).

.DESCRIPTION
    Stages the latest manifest from frontend-addin/manifest into
    installer/assets, reads the version out of the manifest XML,
    then invokes Inno Setup's compiler (ISCC.exe) to produce a
    single self-contained .exe in installer/dist.

    Run from anywhere; paths are resolved relative to this script.

.PARAMETER Version
    Optional. Override the version string used by the installer.
    Defaults to the <Version> element in manifest.xml.

.PARAMETER Iscc
    Optional. Full path to ISCC.exe. Auto-detected from common Inno
    Setup install locations if not provided.

.EXAMPLE
    .\build.ps1
    .\build.ps1 -Version 1.2.0
#>

[CmdletBinding()]
param(
    [string]$Version,
    [string]$Iscc
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Path setup — everything relative to this script so it works from any cwd.
# ---------------------------------------------------------------------------
$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RepoRoot    = Split-Path -Parent $ScriptDir
$SrcManifest = Join-Path $RepoRoot 'frontend-addin\manifest\manifest.xml'
$AssetsDir   = Join-Path $ScriptDir 'assets'
$SrcDir      = Join-Path $ScriptDir 'src'
$DistDir     = Join-Path $ScriptDir 'dist'
$IssEntry    = Join-Path $SrcDir   'prezo-installer.iss'

# ---------------------------------------------------------------------------
# Step 1: Stage manifest. Single source of truth lives in frontend-addin;
# we copy it next to the installer so ISCC can bundle it. Anything else
# under assets/ (icon, etc.) is left untouched.
# ---------------------------------------------------------------------------
if (-not (Test-Path $SrcManifest)) {
    throw "Manifest not found at: $SrcManifest"
}

if (-not (Test-Path $AssetsDir)) {
    New-Item -ItemType Directory -Path $AssetsDir | Out-Null
}

Copy-Item -Path $SrcManifest -Destination (Join-Path $AssetsDir 'manifest.xml') -Force
Write-Host "Staged manifest -> assets\manifest.xml"

# ---------------------------------------------------------------------------
# Step 2: Resolve the version. Caller override wins; otherwise read from
# the staged manifest.xml. Inno requires a numeric x.y.z[.w] for AppVersion.
# ---------------------------------------------------------------------------
if (-not $Version) {
    [xml]$manifestXml = Get-Content (Join-Path $AssetsDir 'manifest.xml')
    $Version = $manifestXml.OfficeApp.Version
    if (-not $Version) {
        throw "Could not read <Version> from manifest.xml"
    }
}
Write-Host "Building Prezo installer version: $Version"

# ---------------------------------------------------------------------------
# Step 3: Locate ISCC.exe (Inno Setup compiler). We check the common install
# paths so devs do not have to add it to PATH.
# ---------------------------------------------------------------------------
if (-not $Iscc) {
    $candidates = @(
        "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
        "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
        "$env:ProgramFiles\Inno Setup 5\ISCC.exe",
        "${env:ProgramFiles(x86)}\Inno Setup 5\ISCC.exe"
    )
    $Iscc = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}

if (-not $Iscc -or -not (Test-Path $Iscc)) {
    throw @"
Inno Setup compiler (ISCC.exe) not found.
Install Inno Setup 6 from https://jrsoftware.org/isdl.php
or pass -Iscc <full path to ISCC.exe>.
"@
}
Write-Host "Using ISCC: $Iscc"

# ---------------------------------------------------------------------------
# Step 4: Ensure dist/ exists and run ISCC. AppVersion is passed as a /D
# preprocessor define so config.iss does not need editing per release.
# ---------------------------------------------------------------------------
if (-not (Test-Path $DistDir)) {
    New-Item -ItemType Directory -Path $DistDir | Out-Null
}

& $Iscc "/DAppVersion=$Version" $IssEntry
if ($LASTEXITCODE -ne 0) {
    throw "ISCC failed with exit code $LASTEXITCODE"
}

$Output = Join-Path $DistDir "PrezoSetup-$Version.exe"
if (Test-Path $Output) {
    Write-Host ""
    Write-Host "Build succeeded: $Output"
} else {
    Write-Warning "ISCC reported success but expected output not found at $Output"
}
