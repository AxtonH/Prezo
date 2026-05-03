; ============================================================================
; files.iss — Static assets that ship with the installer regardless of which
; manifests are present (icon today; license, readme, dlls in the future).
;
; Manifest XML files are NOT here. They are discovered by build.ps1 and
; emitted into the auto-generated manifests.iss include alongside their
; matching [Registry] entries.
; ============================================================================

[Files]
Source: "..\assets\{#IconFileName}"; \
  DestDir: "{app}"; \
  Flags: ignoreversion skipifsourcedoesntexist
