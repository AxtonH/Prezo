import { useCallback, useEffect, useState } from 'react'
import { getBrandProfile, saveBrandProfile } from '../../api/client'
import type { BrandProfile, BrandUiIdentity } from '../../api/types'
import { parseBrandUiIdentity } from '../../utils/brandUiIdentity'
import { FontPickerField } from './FontPickerField'
import { NewBrandIdentityModal } from './NewBrandIdentityModal'
import { ToneCalibrationPanel } from './ToneCalibrationPanel'

type Props = {
  /** Library profile name (URL key). */
  profileName: string
  onBack: () => void
  /** Called after save or re-extract so the parent list can refresh. */
  onUpdated?: () => void
}

function normalizeHex(raw: string): string {
  let s = raw.trim()
  if (!s.startsWith('#')) {
    s = `#${s}`
  }
  if (/^#[0-9A-Fa-f]{6}$/.test(s)) {
    return s.toUpperCase()
  }
  if (/^#[0-9A-Fa-f]{3}$/.test(s)) {
    const r = s[1]
    const g = s[2]
    const b = s[3]
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase()
  }
  return '#CCCCCC'
}

export function BrandIdentityDetailPage({ profileName, onBack, onUpdated }: Props) {
  const [profile, setProfile] = useState<BrandProfile | null>(null)
  const [ui, setUi] = useState<BrandUiIdentity>(() => parseBrandUiIdentity(undefined, profileName))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guidelinesModalOpen, setGuidelinesModalOpen] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const p = await getBrandProfile(profileName)
      setProfile(p)
      setUi(parseBrandUiIdentity(p.guidelines as Record<string, unknown>, p.name))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load brand.')
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }, [profileName])

  useEffect(() => {
    void load()
  }, [load])

  const updateColor = (index: number, patch: Partial<BrandUiIdentity['color_roles'][number]>) => {
    setUi((prev) => {
      const next = { ...prev, color_roles: [...prev.color_roles] }
      next.color_roles[index] = { ...next.color_roles[index], ...patch }
      return next
    })
  }

  const handleSave = async () => {
    if (!profile) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      const guidelines = {
        ...((profile.guidelines ?? {}) as Record<string, unknown>),
        ui_identity: ui
      }
      await saveBrandProfile(profile.name, {
        guidelines,
        source_type: profile.source_type,
        source_filename: profile.source_filename,
        raw_summary: profile.raw_summary
      })
      await load()
      onUpdated?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  const barFlexWeights = ui.color_roles.map((r) => Math.max(1, 7 - r.hierarchy_rank))

  if (loading && !profile) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 bg-slate-50">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
        <p className="text-sm text-slate-600">Loading brand…</p>
      </div>
    )
  }

  if (error && !profile) {
    return (
      <div className="bg-slate-50 px-6 py-10">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-primary"
        >
          <span className="material-symbols-outlined text-xl">arrow_back</span>
          Back
        </button>
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-6 py-5 md:px-10">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/90"
        >
          <span className="material-symbols-outlined text-xl">arrow_back</span>
          Brand identities
        </button>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {ui.brand_name.trim() || profileName}
          </h1>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setGuidelinesModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
            >
              <span className="material-symbols-outlined text-lg">upload</span>
              Update guidelines
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? (
                <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
              ) : null}
              Save changes
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl space-y-10 px-6 py-10 md:px-10">
        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
        ) : null}

        <section>
          <label className="mb-2 block text-sm font-semibold text-primary">
            Brand name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={ui.brand_name}
            onChange={(e) => setUi((u) => ({ ...u, brand_name: e.target.value.slice(0, 200) }))}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            autoComplete="off"
          />
        </section>

        <section>
          <div className="mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">palette</span>
            <h2 className="text-lg font-semibold text-slate-900">Color roles</h2>
          </div>
          <p className="mb-6 text-sm text-slate-600">
            Six roles from your guidelines. Lower hierarchy number = more dominant on a typical slide.
          </p>

          <div className="grid gap-6 md:grid-cols-2">
            {ui.color_roles.map((row, i) => (
              <div
                key={`${row.role}-${i}`}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="mb-3 flex items-start gap-3">
                  <div
                    className="mt-0.5 h-10 w-10 shrink-0 rounded-lg border border-slate-200 shadow-inner"
                    style={{ backgroundColor: row.hex }}
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <input
                      type="text"
                      value={row.role}
                      onChange={(e) => updateColor(i, { role: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-semibold text-slate-900"
                    />
                    <input
                      type="text"
                      value={row.usage}
                      onChange={(e) => updateColor(i, { usage: e.target.value })}
                      className="w-full rounded-lg border border-slate-100 bg-slate-50/80 px-2 py-1.5 text-xs text-slate-600"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={row.hex}
                        onChange={(e) => updateColor(i, { hex: normalizeHex(e.target.value) })}
                        className="w-28 rounded-lg border border-slate-200 px-2 py-1 font-mono text-xs text-slate-800"
                      />
                      <label className="flex items-center gap-1 text-xs text-slate-500">
                        Rank
                        <input
                          type="number"
                          min={1}
                          max={6}
                          value={row.hierarchy_rank}
                          onChange={(e) => {
                            const v = Number(e.target.value)
                            updateColor(i, {
                              hierarchy_rank: Number.isFinite(v) ? Math.min(6, Math.max(1, v)) : 3
                            })
                          }}
                          className="w-12 rounded border border-slate-200 px-1 py-0.5 text-center text-xs"
                        />
                      </label>
                      <select
                        value={row.surface}
                        onChange={(e) => updateColor(i, { surface: e.target.value })}
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700"
                      >
                        {['background', 'foreground', 'accent', 'fill', 'border', 'neutral'].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <p className="mb-2 px-2 text-xs font-medium text-slate-500">Relative visual weight (by hierarchy)</p>
            <div className="flex h-4 w-full overflow-hidden rounded-lg">
              {ui.color_roles.map((row, i) => (
                <div
                  key={`bar-${row.role}-${i}`}
                  title={`${row.role} (rank ${row.hierarchy_rank})`}
                  className="min-w-0"
                  style={{
                    flexGrow: barFlexWeights[i] ?? 1,
                    flexBasis: 0,
                    backgroundColor: row.hex
                  }}
                />
              ))}
            </div>
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">title</span>
            <h2 className="text-lg font-semibold text-slate-900">Typography</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {(
              [
                ['heading_1', 'Heading 1'] as const,
                ['heading_2', 'Heading 2'] as const,
                ['body', 'Body'] as const
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <FontPickerField
                  label={label}
                  slotKey={key}
                  value={ui.typography[key]}
                  onChange={(slot) =>
                    setUi((u) => ({
                      ...u,
                      typography: {
                        ...u.typography,
                        [key]: slot
                      }
                    }))
                  }
                />
              </div>
            ))}
          </div>
        </section>

        <section>
          <ToneCalibrationPanel
            value={ui.tone_calibration}
            onChange={(tone_calibration) => setUi((u) => ({ ...u, tone_calibration }))}
          />
        </section>
      </div>

      <NewBrandIdentityModal
        open={guidelinesModalOpen}
        mode="edit"
        existingName={profileName}
        onClose={() => setGuidelinesModalOpen(false)}
        onSaved={() => {
          setGuidelinesModalOpen(false)
          void load()
          onUpdated?.()
        }}
      />
    </div>
  )
}
