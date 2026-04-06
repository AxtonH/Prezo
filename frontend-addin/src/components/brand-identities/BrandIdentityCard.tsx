import type { BrandProfile } from '../../api/types'
import {
  extractAudienceLine,
  extractFontsLine,
  extractPaletteHex,
  extractTagline,
  extractTags,
  extractToneLine,
  formatBrandDate
} from '../../utils/brandIdentityDisplay'

type Props = {
  profile: BrandProfile
  onEdit: (name: string) => void
  onDelete: (name: string) => void
}

export function BrandIdentityCard({ profile, onEdit, onDelete }: Props) {
  const g = (profile.guidelines ?? {}) as Record<string, unknown>
  const palette = extractPaletteHex(g)
  const fonts = extractFontsLine(g)
  const tagline = extractTagline(g)
  const tone = extractToneLine(g)
  const tags = extractTags(g)
  const audience = extractAudienceLine(g)
  const initial = profile.name.trim().charAt(0).toUpperCase() || '?'
  const updated = formatBrandDate(profile.updated_at)

  const accentColors =
    palette.length >= 3
      ? [palette[0], palette[1], palette[2]]
      : palette.length === 2
        ? [palette[0], palette[1], '#e2e8f0']
        : palette.length === 1
          ? [palette[0], '#64748b', '#e2e8f0']
          : ['#6366f1', '#94a3b8', '#e2e8f0']

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex h-1.5 w-full">
        {accentColors.map((c, i) => (
          <div key={i} className="min-w-0 flex-1" style={{ backgroundColor: c }} />
        ))}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-white shadow-inner"
            style={{ backgroundColor: palette[0] ?? '#6366f1' }}
          >
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-semibold text-slate-900">{profile.name}</h3>
            {fonts ? (
              <p className="mt-0.5 text-sm text-slate-600">{fonts}</p>
            ) : (
              <p className="mt-0.5 text-sm text-slate-500">Brand profile</p>
            )}
            {updated ? (
              <p className="mt-1 text-xs text-slate-400">Updated {updated}</p>
            ) : null}
          </div>
        </div>

        {tagline ? (
          <p className="text-sm font-medium italic text-primary">&ldquo;{tagline}&rdquo;</p>
        ) : null}

        {tone ? <p className="text-sm text-slate-700">{tone}</p> : null}

        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <span
                key={t}
                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-700"
              >
                {t}
              </span>
            ))}
          </div>
        ) : null}

        {audience ? (
          <p className="text-sm text-slate-600">
            <span className="font-medium text-slate-800">Audience: </span>
            {audience}
          </p>
        ) : null}

        {palette.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3">
            {palette.slice(0, 8).map((hex) => (
              <div key={hex} className="flex items-center gap-1.5">
                <span
                  className="h-7 w-7 rounded-full border border-slate-200 shadow-inner"
                  style={{ backgroundColor: hex }}
                  title={hex}
                />
                <span className="font-mono text-[11px] text-slate-500">{hex}</span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={() => onEdit(profile.name)}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50"
          >
            <span className="material-symbols-outlined text-[1.1rem]">edit</span>
            Edit
          </button>
          <button
            type="button"
            onClick={() => onDelete(profile.name)}
            className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-red-50 p-2.5 text-red-700 transition hover:bg-red-100"
            title="Delete brand identity"
          >
            <span className="material-symbols-outlined text-[1.1rem]">delete</span>
          </button>
        </div>
      </div>
    </article>
  )
}
