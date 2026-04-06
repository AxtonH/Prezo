import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  GOOGLE_FONT_CATALOG,
  ensureGoogleFontCatalogLoaded,
  isCatalogFontFamily,
  type GoogleFontEntry
} from '../../utils/googleFontCatalog'

type Props = {
  label: string
  value: string
  onChange: (family: string) => void
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

/** Searchable Google Fonts list; extraction may supply a name we don’t ship—user replaces it by picking from the list. */
export function FontPickerField({ label, value, onChange }: Props) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  const extractedNotInList = Boolean(value) && !isCatalogFontFamily(value)
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

  const pickFont = useCallback(
    (family: string) => {
      onChange(family.slice(0, 120))
      setOpen(false)
    },
    [onChange]
  )

  return (
    <div ref={rootRef} className="relative">
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
        <span style={{ fontFamily: `${value}, system-ui, sans-serif` }} className="min-w-0 truncate font-medium">
          {value || 'Select a font'}
        </span>
        <span className="material-symbols-outlined shrink-0 text-slate-500">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>

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
                  aria-selected={value === entry.family}
                  onClick={() => pickFont(entry.family)}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-slate-50 ${
                    value === entry.family ? 'bg-primary/5' : ''
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
        style={{ fontFamily: `${value}, system-ui, sans-serif` }}
      >
        The quick brown fox jumps over the lazy dog
      </p>

      {extractedNotInList && !open ? (
        <p className="mt-2 text-xs text-slate-500">
          This font came from your guidelines and isn’t in our list yet. Choose a close match above to use for
          previews and generation.
        </p>
      ) : null}
    </div>
  )
}
