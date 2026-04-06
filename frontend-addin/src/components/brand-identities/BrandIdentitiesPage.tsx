import { useCallback, useEffect, useState } from 'react'
import { deleteBrandProfile, listBrandProfiles } from '../../api/client'
import type { BrandProfile } from '../../api/types'
import { BrandIdentityCard } from './BrandIdentityCard'
import { BrandIdentityDetailPage } from './BrandIdentityDetailPage'
import { NewBrandIdentityModal } from './NewBrandIdentityModal'

export function BrandIdentitiesPage() {
  const [profiles, setProfiles] = useState<BrandProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [detailName, setDetailName] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const list = await listBrandProfiles()
      setProfiles(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load brand identities.')
      setProfiles([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openCreate = () => {
    setModalOpen(true)
  }

  const handleDelete = async (name: string) => {
    if (!window.confirm(`Delete brand identity “${name}”? This cannot be undone.`)) {
      return
    }
    try {
      await deleteBrandProfile(name)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete.')
    }
  }

  if (detailName) {
    return (
      <BrandIdentityDetailPage
        profileName={detailName}
        onBack={() => setDetailName(null)}
        onUpdated={() => void load()}
      />
    )
  }

  return (
    <div className="flex flex-col bg-slate-50">
      <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-6 md:px-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-slate-900">
              <span className="material-symbols-outlined text-3xl text-primary" aria-hidden>
                palette
              </span>
              <h1 className="text-2xl font-bold tracking-tight">Brand identity</h1>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Reusable brand profiles for consistent generation. Upload guidelines once; we extract
              colors, typography, and voice.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90"
          >
            <span className="material-symbols-outlined text-lg">add</span>
            New brand identity
          </button>
        </div>
      </div>

      <div className="px-6 py-8 md:px-10">
        {error ? (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-500">
            <span className="material-symbols-outlined animate-spin text-4xl text-primary">
              progress_activity
            </span>
            <p className="text-sm">Loading brand identities…</p>
          </div>
        ) : profiles.length === 0 ? (
          <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-slate-200 bg-white px-8 py-14 text-center shadow-sm">
            <span className="material-symbols-outlined mx-auto block text-5xl text-slate-300">
              palette
            </span>
            <h2 className="mt-4 text-lg font-semibold text-slate-900">No brand identities yet</h2>
            <p className="mt-2 text-sm text-slate-600">
              Create your first profile by uploading a PDF or image of your brand guidelines, or
              paste a link.
            </p>
            <button
              type="button"
              onClick={openCreate}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90"
            >
              <span className="material-symbols-outlined text-lg">add</span>
              New brand identity
            </button>
          </div>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {profiles.map((p) => (
              <li key={p.name}>
                <BrandIdentityCard profile={p} onOpen={setDetailName} onDelete={handleDelete} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <NewBrandIdentityModal
        open={modalOpen}
        mode="create"
        onClose={() => setModalOpen(false)}
        onSaved={(savedName) => {
          void load()
          setDetailName(savedName)
        }}
      />
    </div>
  )
}
