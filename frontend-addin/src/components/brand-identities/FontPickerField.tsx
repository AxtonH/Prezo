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

/** True when the query explicitly targets the "custom" row (typed `custom`…), not short prefixes like `c`/`cus`. */
function searchMatchesCustomLabel(q: string): boolean {
  return q.startsWith('custom')
}

function customRowMatchesSearch(family: string, search: string): boolean {
  const q = search.trim().toLowerCase()
  if (!q) {
    return true
  }
  return family.toLowerCase().includes(q) || searchMatchesCustomLabel(q)
}

/** Searchable Google Fonts list; upload + custom font live inside the dropdown panel. */
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

  const showCustomRow = isCustom && customRowMatchesSearch(value.family, search)

  useEffect(() => {
    if (open) {
      ensureGoogleFontCatalogLoaded()
      setSearch('')
      setUploadError(null)
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

  const selectCustomFont = useCallback(() => {
    if (!isCustom) {
      return
    }
    setOpen(false)
  }, [isCustom])

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

      <input
        ref={fileRef}
        type="file"
        accept=".woff2,.woff,.ttf,.otf,font/woff2,font/ttf,font/otf,application/octet-stream"
        className="hidden"
        onChange={(e) => void onPickFile(e)}
      />

      {open ? (
        <div
          className="absolute left-0 right-0 z-[100] mt-1 flex max-h-[min(70vh,26rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
          role="listbox"
        >
          {/* Upload — compact single row */}
          <div className="shrink-0 border-b border-slate-100">
            <button
              type="button"
              disabled={uploading}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation()
                fileRef.current?.click()
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-slate-50 disabled:opacity-60"
            >
              {uploading ? (
                <span className="material-symbols-outlined shrink-0 animate-spin text-base text-primary">
                  progress_activity
                </span>
              ) : (
                <span className="material-symbols-outlined shrink-0 text-base text-primary">upload</span>
              )}
              <span className="min-w-0 flex-1 truncate text-xs font-medium leading-tight text-primary">
                {uploading ? 'Uploading…' : 'Upload custom font…'}
              </span>
              <span className="shrink-0 whitespace-nowrap text-[10px] leading-tight text-slate-400">
                .woff2 / .ttf / .otf
              </span>
            </button>
            {uploadError ? (
              <p className="border-t border-slate-50 px-3 py-1.5 text-xs text-red-600" role="alert">
                {uploadError}
              </p>
            ) : null}
          </div>

          <div className="shrink-0 border-b border-slate-100 px-3 py-2">
            <div className="relative">
              <span className="material-symbols-outlined pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-base text-slate-400">
                search
              </span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search fonts…"
                className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                autoComplete="off"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          {/* Custom font + Google list — one scroll region; search filters both */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {showCustomRow ? (
              <button
                type="button"
                role="option"
                aria-selected={isCustom}
                onClick={() => selectCustomFont()}
                className={`flex w-full items-center justify-between gap-3 border-b border-slate-50 px-3 py-2.5 text-left transition hover:bg-slate-50 ${
                  isCustom ? 'bg-primary/5' : ''
                }`}
              >
                <span
                  className="min-w-0 truncate text-[15px] text-slate-900"
                  style={{ fontFamily: previewFamilyCss }}
                >
                  {value.family}
                </span>
                <span className="shrink-0 text-xs font-medium text-primary">custom</span>
              </button>
            ) : null}
            {filtered.length === 0 && !showCustomRow ? (
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
          This font came from your guidelines and isn’t in our list yet. Open the menu to pick a close match or upload
          your font file.
        </p>
      ) : null}
    </div>
  )
}
