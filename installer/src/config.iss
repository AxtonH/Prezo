; ============================================================================
; config.iss — Single source of truth for installer metadata.
;
; Edit values here, never inline elsewhere. Version is injected by build.ps1
; via /D"AppVersion=x.y.z" so we do not hand-edit it.
; ============================================================================

#define AppName            "Prezo"
#define AppPublisher       "Prezlab"
#define AppURL             "https://prezo-frontend-addin-production.up.railway.app/"
#define AppSupportURL      "https://prezo-frontend-addin-production.up.railway.app/"
#define AppExeBaseName     "PrezoSetup"

; AppId — stable per-product GUID. Inno uses it to detect upgrades vs fresh installs.
; Do NOT change this between releases or upgrades will break.
;
; The leading "{{" is Inno Setup's escape for a literal "{". The runtime value
; resolves to "{B0E3C1A2-...}" once parsed; without the escape Inno tries to
; interpret the GUID as a constant like {app} and aborts.
#define AppId              "{{B0E3C1A2-4D5F-4A2B-9F8E-7E6D3C2B1A0F}"

; Manifests are discovered at build time and registered via the auto-generated
; manifests.iss. There is no manifest list in this file by design — adding a
; new add-in surface should require zero edits here.

#define IconFileName       "prezo-icon.ico"

; Office major version — 16.0 covers Office 2016, 2019, 2021, and Microsoft 365.
; Earlier versions (15.0 and below) do not support task pane add-ins.
#define OfficeVersion      "16.0"

; AppVersion is set at compile time by build.ps1. Provide a fallback for direct
; ISCC runs so the script still compiles standalone during local debugging.
#ifndef AppVersion
  #define AppVersion       "0.0.0-dev"
#endif
