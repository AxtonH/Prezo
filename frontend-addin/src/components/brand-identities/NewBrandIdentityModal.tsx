import { useCallback, useEffect, useState } from 'react'
import { extractBrandProfile, saveBrandProfile } from '../../api/client'
import type { BrandProfileUpsert } from '../../api/types'

type Mode = 'create' | 'edit'

type Props = {
  open: boolean
  mode: Mode
  /** When editing, the existing profile name (cannot change). */
  existingName?: string
  onClose: () => void
  /** Called after a successful extract + save with the library profile name. */
  onSaved?: (savedName: string) => void
}

function normalizeName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 64)
}

export function NewBrandIdentityModal({ open, mode, existingName, onClose, onSaved }: Props) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reset = useCallback(() => {
    setName(mode === 'edit' && existingName ? existingName : '')
    setUrl('')
    setFile(null)
    setError(null)
    setBusy(false)
  }, [mode, existingName])

  useEffect(() => {
    if (open) {
      setName(mode === 'edit' && existingName ? existingName : '')
      setUrl('')
      setFile(null)
      setError(null)
      setBusy(false)
    }
  }, [open, mode, existingName])

  const handleClose = useCallback(() => {
    if (busy) {
      return
    }
    reset()
    onClose()
  }, [busy, onClose, reset])

  if (!open) {
    return null
  }

  const displayName = mode === 'edit' && existingName ? existingName : normalizeName(name)
  const canSubmit =
    displayName.length > 0 && (Boolean(file) || url.trim().length > 0) && !busy

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const n = mode === 'edit' && existingName ? existingName : normalizeName(name)
    if (!n) {
      setError('Enter a name for this brand identity.')
      return
    }
    if (!file && !url.trim()) {
      setError('Upload a PDF or image, or paste a URL to your guidelines.')
      return
    }

    setBusy(true)
    try {
      const extracted = await extractBrandProfile({
        file: file ?? undefined,
        url: file ? undefined : url.trim() || undefined,
        purpose: 'full'
      })

      const body: BrandProfileUpsert = {
        guidelines: extracted.guidelines,
        raw_summary: extracted.raw_summary ?? null,
        source_type: extracted.source_type,
        source_filename: extracted.source_filename ?? file?.name ?? null
      }

      await saveBrandProfile(n, body)
      reset()
      onSaved?.(n)
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save brand identity.'
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={handleClose}
        aria-label="Close"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="brand-identity-modal-title"
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 id="brand-identity-modal-title" className="text-lg font-semibold text-slate-900">
            {mode === 'edit' ? 'Update brand identity' : 'New brand identity'}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[1.25rem]">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          {mode === 'edit' && existingName ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Name</label>
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                {existingName}
              </p>
            </div>
          ) : (
            <div>
              <label htmlFor="brand-name" className="mb-1 block text-sm font-medium text-slate-700">
                Name
              </label>
              <input
                id="brand-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. PrezLab"
                disabled={busy}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-slate-50"
                autoComplete="off"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Guidelines</label>
            <p className="mb-2 text-xs text-slate-500">
              Upload a PDF or image, or paste a link. We extract colors, fonts, and voice for reuse
              across Prezo.
            </p>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 transition hover:border-primary/40 hover:bg-slate-50">
              <span className="material-symbols-outlined text-4xl text-slate-400">upload</span>
              <span className="text-sm font-medium text-slate-700">
                {file ? file.name : 'Choose file'}
              </span>
              <span className="text-xs text-slate-500">PDF, PNG, JPG up to your server limit</span>
              <input
                type="file"
                accept=".pdf,image/*"
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null)
                  setError(null)
                }}
              />
            </label>
          </div>

          <div>
            <label htmlFor="brand-url" className="mb-1 block text-sm font-medium text-slate-700">
              Or URL
            </label>
            <input
              id="brand-url"
              type="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value)
                setError(null)
              }}
              placeholder="https://…"
              disabled={busy || Boolean(file)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-slate-50"
            />
            {file ? (
              <p className="mt-1 text-xs text-slate-500">Clear the file above to use a URL instead.</p>
            ) : null}
          </div>

          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={busy}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
                  Extracting…
                </>
              ) : (
                'Extract & save'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
