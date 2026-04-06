/**
 * Derive human-readable snippets from stored `BrandProfile.guidelines` (legacy + semantic shapes).
 */

const HEX_IN_STRING = /#[0-9a-fA-F]{3,8}\b/g

function safeStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

export function extractPaletteHex(guidelines: Record<string, unknown>): string[] {
  const semantic = guidelines.semantic
  if (semantic && typeof semantic === 'object') {
    const colors = (semantic as { colors?: Record<string, string> }).colors
    if (colors && typeof colors === 'object') {
      const keys = [
        'background',
        'surface',
        'accent',
        'text_primary',
        'text_body',
        'border'
      ]
      const out: string[] = []
      for (const k of keys) {
        const hex = safeStr(colors[k])
        if (hex && /^#/.test(hex)) {
          out.push(hex.startsWith('#') ? hex : `#${hex}`)
        }
      }
      if (out.length) {
        return out.slice(0, 8)
      }
    }
  }
  const primary = guidelines.primary_colors
  if (Array.isArray(primary)) {
    const out: string[] = []
    for (const line of primary) {
      const s = String(line)
      const m = s.match(HEX_IN_STRING)
      if (m?.[0]) {
        out.push(m[0])
      }
      if (out.length >= 8) {
        break
      }
    }
    return out
  }
  return []
}

export function extractFontsLine(guidelines: Record<string, unknown>): string {
  const semantic = guidelines.semantic
  if (semantic && typeof semantic === 'object') {
    const fonts = (semantic as { fonts?: Record<string, { family?: string }> }).fonts
    if (fonts && typeof fonts === 'object') {
      const h = safeStr(fonts.heading?.family)
      const b = safeStr(fonts.body?.family)
      if (h && b) {
        return `${h} / ${b}`
      }
      if (h) {
        return h
      }
      if (b) {
        return b
      }
    }
  }
  const raw = guidelines.fonts
  if (Array.isArray(raw)) {
    const names = raw
      .map((f) => {
        if (typeof f === 'string') {
          return f
        }
        if (f && typeof f === 'object' && 'family' in f) {
          return safeStr((f as { family?: string }).family)
        }
        return ''
      })
      .filter(Boolean)
    if (names.length) {
      return names.slice(0, 3).join(' · ')
    }
  }
  return ''
}

export function extractTagline(guidelines: Record<string, unknown>): string {
  const sem = guidelines.semantic
  if (sem && typeof sem === 'object') {
    const id = (sem as { identity?: { tagline?: string } }).identity
    const t = safeStr(id?.tagline)
    if (t) {
      return t
    }
  }
  return ''
}

export function extractToneLine(guidelines: Record<string, unknown>): string {
  const t = safeStr(guidelines.tone_of_voice)
  if (t) {
    return t.length > 160 ? `${t.slice(0, 157)}…` : t
  }
  const sem = guidelines.semantic
  if (sem && typeof sem === 'object') {
    const voice = (sem as { voice?: Record<string, string> }).voice
    if (voice && typeof voice === 'object') {
      const parts = [safeStr(voice.tone_summary), safeStr(voice.formality)].filter(Boolean)
      if (parts.length) {
        return parts.join(' · ')
      }
    }
  }
  return ''
}

export function extractTags(guidelines: Record<string, unknown>, max = 6): string[] {
  const kp = guidelines.key_principles
  if (Array.isArray(kp)) {
    return kp
      .map((x) => (typeof x === 'string' ? x.trim() : ''))
      .filter(Boolean)
      .slice(0, max)
  }
  return []
}

export function extractAudienceLine(guidelines: Record<string, unknown>): string {
  const v = guidelines.target_audience ?? guidelines.audience
  if (typeof v === 'string' && v.trim()) {
    return v.length > 120 ? `${v.trim().slice(0, 117)}…` : v.trim()
  }
  return ''
}

export function formatBrandDate(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) {
      return ''
    }
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}
