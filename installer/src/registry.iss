; ============================================================================
; registry.iss — Office TrustedCatalogs entry that registers the local
; manifest folder as a valid sideload source for PowerPoint.
;
; Office reads HKCU\Software\Microsoft\Office\<ver>\WEF\TrustedCatalogs on
; launch. Each catalog GUID points to a folder; Office scans that folder for
; manifest.xml files and exposes them via Insert -> My Add-ins -> Shared Folder.
;
; Flags = 1 makes the catalog visible in the UI. Url is the catalog folder
; path (we point it at {app}\Catalog where files.iss drops manifest.xml).
;
; All keys are scoped to HKCU so no admin rights or UAC prompt are required.
; uninsdeletekey on the parent key removes the whole subtree on uninstall.
; ============================================================================

[Registry]
Root: HKCU; \
  Subkey: "Software\Microsoft\Office\{#OfficeVersion}\WEF\TrustedCatalogs\{#CatalogGuid}"; \
  ValueType: string; ValueName: "Id"; ValueData: "{#CatalogGuid}"; \
  Flags: uninsdeletekey

Root: HKCU; \
  Subkey: "Software\Microsoft\Office\{#OfficeVersion}\WEF\TrustedCatalogs\{#CatalogGuid}"; \
  ValueType: string; ValueName: "Url"; ValueData: "{app}\Catalog"

Root: HKCU; \
  Subkey: "Software\Microsoft\Office\{#OfficeVersion}\WEF\TrustedCatalogs\{#CatalogGuid}"; \
  ValueType: dword;  ValueName: "Flags"; ValueData: "1"
