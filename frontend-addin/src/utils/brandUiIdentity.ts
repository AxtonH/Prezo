import type {
  BrandUiIdentity,
  BrandColorRole,
  BrandToneCalibration,
  BrandVisualStyle,
  BrandDesignElements
} from '../api/types'

const DEFAULT_ROLES: Omit<BrandColorRole, 'hex'>[] = [
  { role: 'Slide Background', usage: 'Main slide background', hierarchy_rank: 1, surface: 'background' },
  { role: 'Headline Text', usage: 'Titles and headings', hierarchy_rank: 2, surface: 'foreground' },
  { role: 'Accent & Highlights', usage: 'Buttons, icons, callouts', hierarchy_rank: 3, surface: 'accent' },
  { role: 'Card & Panel Fill', usage: 'Cards, boxes, containers', hierarchy_rank: 4, surface: 'fill' },
  { role: 'Body Text', usage: 'Paragraphs and captions', hierarchy_rank: 5, surface: 'foreground' },
  { role: 'Borders & Dividers', usage: 'Lines, separators', hierarchy_rank: 6, surface: 'border' }
]

const DEFAULT_TONE: BrandToneCalibration = {
  serious_playful: 50,
  formal_casual: 50,
  respectful_irreverent: 50,
  matter_of_fact_enthusiastic: 50
}

const KEYWORD_MAX = 40
const KEYWORD_LEN_MAX = 120

const EMPTY_DESIGN_ELEMENTS: BrandDesignElements = {
  patterns_textures: [],
  icon_style: [],
  image_treatment: [],
  decorative_elements: []
}

const EMPTY_VISUAL_STYLE: BrandVisualStyle = {
  visual_mood_aesthetic: [],
  style_guidelines: [],
  design_elements: { ...EMPTY_DESIGN_ELEMENTS }
}

function parseKeywordList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    const seen = new Set<string>()
    const out: string[] = []
    for (const x of raw) {
      const s = typeof x === 'string' ? x.trim().slice(0, KEYWORD_LEN_MAX) : String(x).trim().slice(0, KEYWORD_LEN_MAX)
      if (!s) {
        continue
      }
      const k = s.toLowerCase()
      if (seen.has(k)) {
        continue
      }
      seen.add(k)
      out.push(s)
      if (out.length >= KEYWORD_MAX) {
        break
      }
    }
    return out
  }
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (!s) {
      return []
    }
    const parts = s.split(/[,;\n]+/).map((p) => p.trim()).filter(Boolean)
    return parseKeywordList(parts)
  }
  return []
}

function parseVisualStyle(raw: unknown): BrandVisualStyle {
  const o = asRecord(raw)
  if (!o) {
    return { ...EMPTY_VISUAL_STYLE, design_elements: { ...EMPTY_DESIGN_ELEMENTS } }
  }
  const deIn = asRecord(o.design_elements)
  const de: BrandDesignElements = { ...EMPTY_DESIGN_ELEMENTS }
  if (deIn) {
    for (const k of Object.keys(EMPTY_DESIGN_ELEMENTS) as (keyof BrandDesignElements)[]) {
      de[k] = parseKeywordList(deIn[k])
    }
  }
  return {
    visual_mood_aesthetic: parseKeywordList(o.visual_mood_aesthetic),
    style_guidelines: parseKeywordList(o.style_guidelines),
    design_elements: de
  }
}

function clampTone(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) {
    return 50
  }
  return Math.min(100, Math.max(0, Math.round(v)))
}

function parseToneCalibration(raw: unknown): BrandToneCalibration {
  const o = asRecord(raw)
  if (!o) {
    return { ...DEFAULT_TONE }
  }
  return {
    serious_playful: clampTone(o.serious_playful),
    formal_casual: clampTone(o.formal_casual),
    respectful_irreverent: clampTone(o.respectful_irreverent),
    matter_of_fact_enthusiastic: clampTone(o.matter_of_fact_enthusiastic)
  }
}

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
    },
    tone_calibration: { ...DEFAULT_TONE },
    visual_style: {
      ...EMPTY_VISUAL_STYLE,
      design_elements: { ...EMPTY_DESIGN_ELEMENTS }
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

  const tone_calibration = parseToneCalibration(ui.tone_calibration)
  const visual_style = parseVisualStyle(ui.visual_style)

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
      typography,
      tone_calibration,
      visual_style
    }
  }

  const sorted = [...roles].sort((a, b) => a.hierarchy_rank - b.hierarchy_rank).slice(0, 6)
  return {
    brand_name: name,
    color_roles: sorted,
    typography,
    tone_calibration,
    visual_style
  }
}

/** Visual weight for hierarchy bar: lower rank = larger share. */
export function colorRoleBarWeights(roles: BrandColorRole[]): number[] {
  const raw = roles.map((r) => Math.max(0, 7 - r.hierarchy_rank))
  const sum = raw.reduce((a, b) => a + b, 0) || 1
  return raw.map((w) => (w / sum) * 100)
}
