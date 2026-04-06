import type { BrandUiIdentity, BrandColorRole } from '../api/types'

const DEFAULT_ROLES: Omit<BrandColorRole, 'hex'>[] = [
  { role: 'Slide Background', usage: 'Main slide background', hierarchy_rank: 1, surface: 'background' },
  { role: 'Headline Text', usage: 'Titles and headings', hierarchy_rank: 2, surface: 'foreground' },
  { role: 'Accent & Highlights', usage: 'Buttons, icons, callouts', hierarchy_rank: 3, surface: 'accent' },
  { role: 'Card & Panel Fill', usage: 'Cards, boxes, containers', hierarchy_rank: 4, surface: 'fill' },
  { role: 'Body Text', usage: 'Paragraphs and captions', hierarchy_rank: 5, surface: 'foreground' },
  { role: 'Borders & Dividers', usage: 'Lines, separators', hierarchy_rank: 6, surface: 'border' }
]

export function defaultBrandUiIdentity(fallbackName = 'Brand'): BrandUiIdentity {
  return {
    brand_name: fallbackName,
    color_roles: DEFAULT_ROLES.map((r, i) => ({
      ...r,
      hex: ['#FFFFFF', '#1e1e1e', '#6366f1', '#f1f5f9', '#334155', '#e2e8f0'][i] ?? '#CCCCCC'
    })),
    typography: {
      heading_1: { family: 'Inter', source: 'google' },
      heading_2: { family: 'Inter', source: 'google' },
      body: { family: 'Inter', source: 'google' }
    }
  }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

/** Parse `guidelines.ui_identity` with safe defaults. */
export function parseBrandUiIdentity(
  guidelines: Record<string, unknown> | undefined,
  profileName: string
): BrandUiIdentity {
  const raw = guidelines?.ui_identity
  const base = defaultBrandUiIdentity(profileName)
  const ui = asRecord(raw)
  if (!ui) {
    return base
  }

  const name = typeof ui.brand_name === 'string' && ui.brand_name.trim() ? ui.brand_name.trim() : base.brand_name

  const typo = asRecord(ui.typography)
  const typography = { ...base.typography }
  if (typo) {
    for (const key of ['heading_1', 'heading_2', 'body'] as const) {
      const slot = asRecord(typo[key])
      if (!slot) {
        continue
      }
      const fam = typeof slot.family === 'string' ? slot.family.trim() : ''
      if (fam) {
        const url = typeof slot.custom_url === 'string' ? slot.custom_url.trim() : ''
        const wantsCustom = slot.source === 'custom'
        if (wantsCustom && url) {
          typography[key] = {
            family: fam.slice(0, 120),
            source: 'custom',
            custom_url: url.slice(0, 2048)
          }
        } else {
          typography[key] = { family: fam.slice(0, 120), source: 'google' }
        }
      }
    }
  }

  const rolesIn = ui.color_roles
  const roles: BrandColorRole[] = []
  if (Array.isArray(rolesIn)) {
    for (const item of rolesIn) {
      const row = asRecord(item)
      if (!row) {
        continue
      }
      const rank = Number(row.hierarchy_rank)
      roles.push({
        role: typeof row.role === 'string' ? row.role : 'Color',
        usage: typeof row.usage === 'string' ? row.usage : '',
        hex: typeof row.hex === 'string' ? row.hex : '#CCCCCC',
        hierarchy_rank: Number.isFinite(rank) ? Math.min(6, Math.max(1, rank)) : 3,
        surface: typeof row.surface === 'string' ? row.surface : 'neutral'
      })
    }
  }

  if (roles.length < 6) {
    return {
      brand_name: name,
      color_roles: base.color_roles.map((b, i) => roles[i] ?? b),
      typography
    }
  }

  const sorted = [...roles].sort((a, b) => a.hierarchy_rank - b.hierarchy_rank).slice(0, 6)
  return {
    brand_name: name,
    color_roles: sorted,
    typography
  }
}

/** Visual weight for hierarchy bar: lower rank = larger share. */
export function colorRoleBarWeights(roles: BrandColorRole[]): number[] {
  const raw = roles.map((r) => Math.max(0, 7 - r.hierarchy_rank))
  const sum = raw.reduce((a, b) => a + b, 0) || 1
  return raw.map((w) => (w / sum) * 100)
}
