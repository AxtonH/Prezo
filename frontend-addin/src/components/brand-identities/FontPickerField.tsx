import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { API_BASE_URL, uploadBrandFont } from '../../api/client'
import type { BrandTypographySlot } from '../../api/types'
import {
  GOOGLE_FONT_CATALOG,
  ensureGoogleFontCatalogLoaded,
  isCatalogFontFamily,
  type GoogleFontEntry
} from '../../utils/googleFontCatalog'

type SlotKey = 'heading_1' | 'heading_2' | 'body'

type Props = {
  label: string
  slotKey: SlotKey
  value: BrandTypographySlot
  onChange: (slot: BrandTypographySlot) => void
}

function filterFonts(query: string, list: GoogleFontEntry[]): GoogleFontEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) {
    return list
  }
  return list.filter(
    (f) =>
      f.family.toLowerCase().includes(q) ||
      f.category.toLowerCase().includes(q)
  )
}

function fontFormatFromUrl(url: string): string {
  const u = url.toLowerCase()
  if (u.endsWith('.woff2')) {
    return 'woff2'
  }
  if (u.endsWith('.woff')) {
    return 'woff'
  }
  if (u.endsWith('.otf')) {
    return 'opentype'
  }
  if (u.endsWith('.ttf')) {
    return 'truetype'
  }
  return 'woff2'
}

function familyFromFilename(name: string): string {
  const base = name.replace(/\.[^/.]+$/, '')
  const t = base.replace(/[-_]+/g, ' ').trim()
  return t.slice(0, 120) || 'Custom font'
}

function resolveFontUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return pathOrUrl
  }
  const base = API_BASE_URL.replace(/\/$/, '')
  const p = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`
  return `${base}${p}`
}

/** Searchable Google Fonts list + optional custom upload for @font-face. */
export function FontPickerField({ label, slotKey, value, onChange }: Props) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const faceName = `__prezoBrand_${slotKey.replace(/[^a-z0-9_]/gi, '_')}`
  const previewUrl = value.custom_url ? resolveFontUrl(value.custom_url) : ''

  const isCustom = value.source === 'custom' && Boolean(value.custom_url)
  const extractedNotInList =
    value.source !== 'custom' && Boolean(value.family) && !isCatalogFontFamily(value.family)

  const filtered = useMemo(() => filterFonts(search, GOOGLE_FONT_CATALOG), [search])

  useEffect(() => {
    if (open) {
      ensureGoogleFontCatalogLoaded()
      setSearch('')
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const pickGoogleFont = useCallback(
    (family: string) => {
      onChange({
        family: family.slice(0, 120),
        source: 'google',
        custom_url: null
      })
      setOpen(false)
    },
    [onChange]
  )

  const clearCustom = useCallback(() => {
    onChange({ family: 'Inter', source: 'google', custom_url: null })
  }, [onChange])

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) {
      return
    }
    setUploadError(null)
    setUploading(true)
    try {
      const res = await uploadBrandFont(file)
      const displayFamily = familyFromFilename(file.name)
      onChange({
        family: displayFamily,
        source: 'custom',
        custom_url: res.custom_url
      })
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const previewFamilyCss = isCustom ? `'${faceName}', system-ui, sans-serif` : `${value.family}, system-ui, sans-serif`

  return (
    <div ref={rootRef} className="relative">
      {isCustom && previewUrl ? (
        <style>
          {`@font-face{font-family:'${faceName}';src:url(${JSON.stringify(previewUrl)}) format('${fontFormatFromUrl(previewUrl)}');font-display:swap;}`}
        </style>
      ) : null}

      <label htmlFor={`${id}-trigger`} className="mb-2 block text-sm font-semibold text-primary">
        {label}
      </label>

      <button
        id={`${id}-trigger`}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="mb-3 flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm text-slate-900 shadow-sm transition hover:border-slate-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      >
        <span style={{ fontFamily: previewFamilyCss }} className="min-w-0 truncate font-medium">
          {value.family || 'Select a font'}
          {isCustom ? (
            <span className="ml-2 text-xs font-normal text-primary">· Custom file</span>
          ) : null}
        </span>
        <span className="material-symbols-outlined shrink-0 text-slate-500">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      <div className="mb-3 rounded-xl border border-slate-100 bg-slate-50/90 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="material-symbols-outlined text-lg text-primary">upload</span>
          <span className="text-sm font-medium text-primary">Upload custom font</span>
          <span className="text-[11px] text-slate-500">.woff2 · .woff · .ttf · .otf · max 5 MB</span>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".woff2,.woff,.ttf,.otf,font/woff2,font/ttf,font/otf,application/octet-stream"
          className="hidden"
          onChange={(e) => void onPickFile(e)}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="mt-2 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          {uploading ? (
            <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
          ) : (
            <span className="material-symbols-outlined text-base">upload_file</span>
          )}
          {uploading ? 'Uploading…' : 'Choose file'}
        </button>
        {uploadError ? (
          <p className="mt-2 text-xs text-red-600" role="alert">
            {uploadError}
          </p>
        ) : null}
      </div>

      {isCustom ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="text-xs text-slate-600">
            Font name
            <input
              type="text"
              value={value.family}
              onChange={(e) =>
                onChange({
                  ...value,
                  family: e.target.value.slice(0, 120)
                })
              }
              className="ml-2 rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-900"
            />
          </label>
          <button
            type="button"
            onClick={clearCustom}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Use Google list instead
          </button>
        </div>
      ) : null}

      {open ? (
        <div
          className="absolute left-0 right-0 z-[100] mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
          role="listbox"
        >
          <div className="border-b border-slate-100 px-3 py-2">
            <div className="relative">
              <span className="material-symbols-outlined pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-lg text-slate-400">
                search
              </span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search fonts…"
                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto overscroll-contain">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-500">No fonts match your search.</p>
            ) : (
              filtered.map((entry) => (
                <button
                  key={entry.family}
                  type="button"
                  role="option"
                  aria-selected={value.source === 'google' && value.family === entry.family}
                  onClick={() => pickGoogleFont(entry.family)}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-slate-50 ${
                    value.source === 'google' && value.family === entry.family ? 'bg-primary/5' : ''
                  }`}
                >
                  <span
                    className="min-w-0 truncate text-[15px] text-slate-900"
                    style={{ fontFamily: `${entry.family}, system-ui, sans-serif` }}
                  >
                    {entry.family}
                  </span>
                  <span className="shrink-0 text-[11px] capitalize text-slate-400">{entry.category}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}

      <p
        className="text-sm leading-relaxed text-slate-700"
        style={{ fontFamily: previewFamilyCss }}
      >
        The quick brown fox jumps over the lazy dog
      </p>

      {extractedNotInList && !open ? (
        <p className="mt-2 text-xs text-slate-500">
          This font came from your guidelines and isn’t in our list yet. Choose a close match above, or upload your
          font file.
        </p>
      ) : null}
    </div>
  )
}
