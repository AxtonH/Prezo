; ============================================================================
; prezo-installer.iss — Main Inno Setup script.
;
; Per-user, no-admin installer that registers the Prezo PowerPoint add-in
; via Office's TrustedCatalogs registry mechanism. End-user flow: download,
; run, click Install, restart PowerPoint, find Prezo in the Home tab.
;
; All tunable values live in config.iss. Section files (files, registry,
; code) are kept separate so the main script stays a thin orchestrator.
;
; To compile manually:  ISCC.exe /D"AppVersion=1.0.0.1" prezo-installer.iss
; To compile end-to-end: see ../build.ps1
; ============================================================================

#include "config.iss"

[Setup]
AppId={#AppId}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppSupportURL}
AppUpdatesURL={#AppURL}

; Per-user install: no admin, no UAC, no Program Files write.
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog

; Hide directory and group pickers — there is nothing useful for the user
; to choose. Defaults to %LOCALAPPDATA%\Prezo.
DefaultDirName={localappdata}\{#AppName}
DisableDirPage=yes
DisableProgramGroupPage=yes
DefaultGroupName={#AppName}

; Output the compiled installer alongside this src tree (one level up).
OutputDir=..\dist
OutputBaseFilename={#AppExeBaseName}-{#AppVersion}

Compression=lzma2
SolidCompression=yes
WizardStyle=modern

; Icon is optional during early development. SetupIconFile errors if the file
; is missing, so we only set it when present (build.ps1 handles this case).
#if FileExists(AddBackslash(SourcePath) + "..\assets\" + IconFileName)
  SetupIconFile=..\assets\{#IconFileName}
  UninstallDisplayIcon={app}\{#IconFileName}
#endif

UninstallDisplayName={#AppName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

#include "files.iss"
#include "manifests.iss"
#include "code.iss"
