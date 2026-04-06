import { useRef, useState } from 'react'
import { resolveBrandAssetUrl, uploadBrandLogo } from '../../api/client'
import type { BrandLogoRef } from '../../api/types'

const ACCEPT =
  'image/png,image/svg+xml,image/jpeg,image/jpg,image/webp,image/gif,.png,.svg,.jpg,.jpeg,.webp,.gif'

type Props = {
  value: BrandLogoRef | null
  onChange: (logo: BrandLogoRef | null) => void
}

export function LogoPanel({ value, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const previewSrc = value?.url ? resolveBrandAssetUrl(value.url) : ''

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) {
      return
    }
    setError(null)
    setUploading(true)
    try {
      const res = await uploadBrandLogo(file)
      onChange({ url: res.url, source: 'upload' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary">image</span>
        <h2 className="text-lg font-semibold text-slate-900">Logo</h2>
      </div>
      <p className="mb-4 text-sm text-slate-600">
        We try to pick the primary logo from embedded images in your file. PDFs that use vector-only logos
        may not yield a separate image — use upload below. Remove a bad match and upload PNG, SVG, JPEG,
        WebP, or GIF.
      </p>

      {/* Programmatic click only — do not use <label htmlFor>; activating a label focuses the input and scrolls it into view. */}
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        onChange={onPickFile}
      />

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {previewSrc ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex max-h-40 min-h-[5rem] max-w-full items-center justify-center rounded-xl border border-slate-100 bg-slate-50/80 p-4">
              <img
                src={previewSrc}
                alt=""
                className="max-h-32 max-w-full object-contain"
              />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-xs text-slate-500">
                Source:{' '}
                <span className="font-medium text-slate-700">
                  {value?.source === 'extracted' ? 'Extracted from guidelines' : 'Uploaded'}
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onChange(null)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
                >
                  <span className="material-symbols-outlined text-lg">delete</span>
                  Remove logo
                </button>
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                  aria-label="Replace logo with an uploaded file"
                  className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
                >
                  {uploading ? (
                    <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
                  ) : (
                    <span className="material-symbols-outlined text-lg">upload</span>
                  )}
                  Replace with upload
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              aria-label="Upload logo file"
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-lg">add_photo_alternate</span>
              {uploading ? 'Uploading…' : 'Upload logo'}
            </button>
            <p className="text-xs text-slate-500">PNG, SVG, JPEG, WebP, or GIF (max 10 MB)</p>
          </div>
        )}

        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      </div>
    </section>
  )
}
