; ============================================================================
; files.iss — Files staged onto the user's machine.
;
; The Catalog\ subfolder holds the manifest XML; Office reads it from there
; via the TrustedCatalogs entry in registry.iss. The icon is optional (kept
; alongside the install for the Add/Remove Programs entry).
;
; build.ps1 copies the manifest from frontend-addin/manifest/manifest.xml
; into installer/assets/ before compilation, so the asset path here is stable.
; ============================================================================

[Files]
Source: "..\assets\{#ManifestFileName}"; \
  DestDir: "{app}\Catalog"; \
  Flags: ignoreversion

Source: "..\assets\{#IconFileName}"; \
  DestDir: "{app}"; \
  Flags: ignoreversion skipifsourcedoesntexist
