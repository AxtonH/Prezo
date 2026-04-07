/**
 * Derive human-readable snippets from stored `BrandProfile.guidelines` (legacy + semantic shapes).
 */

const HEX_IN_STRING = /#[0-9a-fA-F]{3,8}\b/g

function safeStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/** Truncate at a word boundary so we never end mid-word (e.g. "arroga…"). */
function truncateAtWord(text: string, maxLen: number): string {
  const t = text.trim()
  if (t.length <= maxLen) {
    return t
  }
  const slice = t.slice(0, maxLen)
  const lastSpace = slice.lastIndexOf(' ')
  if (lastSpace > maxLen * 0.55) {
    return `${slice.slice(0, lastSpace).trimEnd()}…`
  }
  return `${slice.trimEnd()}…`
}

const MAX_TONE_CHARS = 320

function takeFirstWords(text: string, wordCount: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (!words.length) {
    return ''
  }
  return words.slice(0, wordCount).join(' ')
}

/**
 * Turn one key_principles line into short keyword(s) for card chips (not full manifestos).
 */
function splitPrincipleToKeywords(raw: string): string[] {
  const s = raw.trim()
  if (!s) {
    return []
  }

  const colon = s.indexOf(':')
  if (colon !== -1) {
    const label = s.slice(0, colon).trim()
    const after = s.slice(colon + 1).trim()
    if (after.includes(',')) {
      const parts = after
        .split(',')
        .map((x) => x.trim())
        .map((x) => x.replace(/\.$/, ''))
        .filter(Boolean)
      if (parts.length > 1) {
        return parts.map((p) => (p.length > 44 ? takeFirstWords(p, 6) : p))
      }
    }
    const parenIdx = after.indexOf('(')
    const head = (parenIdx === -1 ? after : after.slice(0, parenIdx)).trim()
    const one = head.length > 48 ? takeFirstWords(head, 7) : head
    return one ? [one] : label ? [label] : []
  }

  if (s.includes('—') || s.includes('–')) {
    const sep = s.includes('—') ? '—' : '–'
    const [a, b] = s.split(sep).map((x) => x.trim())
    const left = a.replace(/^[("']+/, '').trim()
    const right = (b || '').replace(/\)[.,]?$/, '').trim()
    const candidates = [right, left].filter(Boolean)
    const short = candidates.find((c) => c.length >= 8 && c.length <= 52)
    if (short) {
      return [short]
    }
    const pick = left.length <= right.length ? left : right
    return [pick.length > 48 ? takeFirstWords(pick, 6) : pick]
  }

  if (s.length <= 44) {
    return [s]
  }
  const dot = s.indexOf('.')
  if (dot > 12 && dot < 90) {
    const first = s.slice(0, dot + 1).trim()
    if (first.length >= 12 && first.length <= 88) {
      return [first]
    }
  }
  return [takeFirstWords(s, 6)]
}

export function extractKeywordsForCard(guidelines: Record<string, unknown>, max = 8): string[] {
  const kp = guidelines.key_principles
  if (!Array.isArray(kp)) {
    return []
  }
  const out: string[] = []
  for (const item of kp) {
    if (typeof item !== 'string' || out.length >= max) {
      break
    }
    for (const kw of splitPrincipleToKeywords(item)) {
      if (out.length >= max) {
        break
      }
      const t = kw.trim()
      if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) {
        out.push(t)
      }
    }
  }
  return out
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
    return t.length > MAX_TONE_CHARS ? truncateAtWord(t, MAX_TONE_CHARS) : t
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
  return extractKeywordsForCard(guidelines, max)
}

export function extractAudienceLine(guidelines: Record<string, unknown>): string {
  const v = guidelines.target_audience ?? guidelines.audience
  if (typeof v === 'string' && v.trim()) {
    const trimmed = v.trim()
    return trimmed.length > 120 ? truncateAtWord(trimmed, 120) : trimmed
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
