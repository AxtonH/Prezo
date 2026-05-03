# Prezo Windows Installer

Per-user, no-admin installer that registers Prezo as a PowerPoint task pane add-in via Office's `TrustedCatalogs` registry mechanism. Replaces the manual sideload + Trust Center flow.

## End-user flow

1. Download `PrezoSetup-x.y.z.exe` from the Prezo site.
2. Double-click to run. SmartScreen will warn ("unidentified developer") because the binary is unsigned. Click **More info -> Run anyway**.
3. Welcome -> Install -> Finish. No admin prompt.
4. Restart PowerPoint. Prezo appears under the **Home** tab.

## Layout

```
installer/
  build.ps1              One-command build script
  README.md              This file
  src/
    prezo-installer.iss  Main script (orchestrates includes)
    config.iss           All tunable metadata (app id, version fallback, GUIDs)
    files.iss            [Files] section — manifest + icon staging
    registry.iss         [Registry] section — TrustedCatalogs entry
    code.iss             [Code] section — PowerPoint detection & restart hint
  assets/
    manifest.xml         Staged from frontend-addin/manifest at build time
    prezo-icon.ico       Optional — installer + uninstall icon
  dist/                  Build output (gitignored)
```

Each `.iss` file owns one concern. `config.iss` is the only file you should ever edit between releases for routine changes.

## Prerequisites

- Windows
- [Inno Setup 6](https://jrsoftware.org/isdl.php) (free)
- PowerShell 5.1 or newer (built into Windows)

## Build

From the repo root or anywhere:

```powershell
cd installer
.\build.ps1
```

Output: `installer/dist/PrezoSetup-<version>.exe`

The version is read from `<Version>` in `frontend-addin/manifest/manifest.xml`. To override:

```powershell
.\build.ps1 -Version 1.2.0
```

If ISCC is not auto-detected:

```powershell
.\build.ps1 -Iscc "C:\Path\To\Inno Setup 6\ISCC.exe"
```

## How it works

The installer drops `manifest.xml` into `%LOCALAPPDATA%\Prezo\Catalog\` and writes three values under `HKCU\Software\Microsoft\Office\16.0\WEF\TrustedCatalogs\{GUID}`:

| Value | Type   | Data                          | Purpose                               |
|-------|--------|-------------------------------|---------------------------------------|
| Id    | REG_SZ | `{GUID}` (matches subkey name)| Catalog identifier                    |
| Url   | REG_SZ | `%LOCALAPPDATA%\Prezo\Catalog`| Folder Office scans for manifest XMLs |
| Flags | DWORD  | `1`                           | Show in PowerPoint UI                 |

On next PowerPoint launch, Office reads the catalog and offers Prezo via Insert -> My Add-ins -> Shared Folder. The pinned ribbon button comes from the manifest's `VersionOverrides` section.

The Prezo web app itself stays on Railway. The installer ships only the manifest and a few KB of registry metadata, so users get fresh React code on every PowerPoint launch with no installer update needed.

## Test

After a build:

1. Run `installer\dist\PrezoSetup-<version>.exe` on a clean Windows machine (or VM).
2. Verify install completes without UAC prompt.
3. Open `regedit` and confirm `HKCU\Software\Microsoft\Office\16.0\WEF\TrustedCatalogs\{D4F2E1A0-...}` exists with the three values.
4. Open PowerPoint -> Home tab. Prezo button should be visible.
5. Click Prezo -> task pane should load the Railway app.
6. Uninstall via Settings -> Apps. Confirm the registry key and `%LOCALAPPDATA%\Prezo` are both gone.

## Limits and known issues

- **No code signing.** SmartScreen warning on first run is expected. Acceptable for the internal phase; add an EV certificate before the public launch.
- **Windows only.** Mac users still need a separate `.pkg` installer (not yet built).
- **Locked-down corporate environments.** Some Group Policies block writes to `HKCU\Software\Microsoft\Office\16.0\WEF`. The installer will succeed but Prezo will not appear. There is no client-side fix; ask client IT to deploy via M365 Integrated Apps.
- **Office Web.** PowerPoint in the browser cannot use installer-based registration. AppSource or admin Centralized Deployment are the only options there.

## Release checklist

1. Bump `<Version>` in `frontend-addin/manifest/manifest.xml`.
2. Run `.\build.ps1` from `installer/`.
3. Smoke-test the resulting `.exe` on a clean machine (see Test section).
4. Upload to the Prezo download page.
