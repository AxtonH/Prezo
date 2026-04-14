/**
 * Derive human-readable snippets from stored `BrandProfile.guidelines` (legacy + semantic shapes).
 */

import type { BrandProfile } from '../api/types'

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

/**
 * Prefer ending at a full sentence (. ! ?) before maxLen; then paragraph break; then word boundary.
 * Avoids mid-sentence ellipsis on brand cards.
 */
export function truncateAtSentences(text: string, maxLen: number): string {
  const t = text.trim()
  if (t.length <= maxLen) {
    return t
  }
  const slice = t.slice(0, maxLen + 1)
  let best = -1
  const re = /[.!?][\s\u00a0\n]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(slice)) !== null) {
    const end = m.index + 1
    if (end <= maxLen && end >= 24) {
      best = end
    }
  }
  if (best >= 0) {
    return t.slice(0, best).trim()
  }
  const para = slice.lastIndexOf('\n\n')
  if (para >= 40 && para <= maxLen) {
    return t.slice(0, para).trim()
  }
  return truncateAtWord(t, maxLen)
}

const MAX_TONE_CHARS = 280
const MAX_AUDIENCE_CHARS = 120

function takeFirstWords(text: string, wordCount: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (!words.length) {
    return ''
  }
  return words.slice(0, wordCount).join(' ')
}

/** Single-word chips that only make sense after "for …", "including …", etc. */
const TYPO_LAYOUT_TAIL_WORDS = new Set([
  'subtitles',
  'subtitle',
  'titles',
  'title',
  'headers',
  'header',
  'headings',
  'heading',
  'body',
  'copy',
  'text',
  'captions',
  'caption',
  'labels',
  'label',
  'slides',
  'slide',
  'callouts',
  'callout',
  'footnotes',
  'footnote',
  'margins',
  'padding',
  'spacing'
])

/** Trailing words that leave a chip grammatically incomplete. */
function trimTrailingDanglingWords(s: string): string {
  let t = s.trim()
  let guard = 0
  while (guard < 8 && t.length >= 12) {
    guard += 1
    const m =
      /\s+(for|and|or|with|including|like|from|between|among|to|of|in|on|at|by|as|vs|via|per|the|a|an)$/i.exec(
        t
      )
    if (!m || m.index <= 0) {
      break
    }
    const next = t.slice(0, m.index).trim()
    if (next.length < 12) {
      break
    }
    t = next
  }
  return t
}

function clipChipPhrase(p: string, maxWords = 12): string {
  const trimmed = p.trim()
  if (!trimmed) {
    return ''
  }
  const clipped = trimmed.length > 56 ? takeFirstWords(trimmed, maxWords) : trimmed
  return trimTrailingDanglingWords(clipped)
}

/** Principle ends with a phrase that expects more words after it (comma list or next clause). */
function endsWithIncompletePhrase(s: string): boolean {
  return /\b(for|such as|including|like|e\.g\.?|i\.e\.?)\s*,?\s*$/i.test(s.trim())
}

/** Stitch "… for" + "subtitles" style comma splits into one chip. */
function stitchCommaFragments(parts: string[]): string[] {
  const out: string[] = []
  for (const raw of parts) {
    const p = raw.trim().replace(/\.$/, '')
    if (!p) {
      continue
    }
    if (out.length === 0) {
      out.push(p)
      continue
    }
    const prev = out[out.length - 1]
    const pw = p.split(/\s+/).filter(Boolean)
    const orphanTail =
      pw.length === 1 &&
      TYPO_LAYOUT_TAIL_WORDS.has(pw[0].toLowerCase().replace(/[^a-z]/gi, ''))
    const mergeForIncomplete =
      endsWithIncompletePhrase(prev) ||
      /\b(for|such as|including)\s+$/i.test(prev) ||
      orphanTail
    if (mergeForIncomplete) {
      if (orphanTail) {
        out[out.length - 1] = /\bfor\s*$/i.test(prev.trim())
          ? `${prev.trimEnd()} ${p}`
          : `${prev} for ${p}`
      } else if (endsWithIncompletePhrase(prev)) {
        out[out.length - 1] = `${prev} ${p}`
      } else {
        out[out.length - 1] = `${prev}, ${p}`
      }
    } else {
      out.push(p)
    }
  }
  return out
}

function isUnhelpfulStandaloneChip(s: string): boolean {
  const w = s.trim().split(/\s+/).filter(Boolean)
  if (w.length !== 1) {
    return false
  }
  const key = w[0].toLowerCase().replace(/[^a-z]/gi, '')
  return TYPO_LAYOUT_TAIL_WORDS.has(key)
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
        const stitched = stitchCommaFragments(parts)
        return stitched
          .map((p) => clipChipPhrase(p))
          .filter((p) => p.length >= 8 && !isUnhelpfulStandaloneChip(p))
      }
    }
    const parenIdx = after.indexOf('(')
    const head = (parenIdx === -1 ? after : after.slice(0, parenIdx)).trim()
    const oneRaw = head.length > 52 ? takeFirstWords(head, 10) : head
    const one = clipChipPhrase(oneRaw)
    if (one && !isUnhelpfulStandaloneChip(one)) {
      return [one]
    }
    return label && !isUnhelpfulStandaloneChip(label) ? [label] : []
  }

  if (s.includes('—') || s.includes('–')) {
    const sep = s.includes('—') ? '—' : '–'
    const [a, b] = s.split(sep).map((x) => x.trim())
    const left = a.replace(/^[("']+/, '').trim()
    const right = (b || '').replace(/\)[.,]?$/, '').trim()
    const candidates = [right, left].filter(Boolean)
    const short = candidates.find((c) => c.length >= 8 && c.length <= 52)
    if (short) {
      return [clipChipPhrase(short)]
    }
    const pick = left.length <= right.length ? left : right
    const clipped = clipChipPhrase(pick.length > 52 ? takeFirstWords(pick, 10) : pick)
    return clipped && !isUnhelpfulStandaloneChip(clipped) ? [clipped] : []
  }

  if (s.length <= 44) {
    return isUnhelpfulStandaloneChip(s) ? [] : [s]
  }
  const dot = s.indexOf('.')
  if (dot > 12 && dot < 90) {
    const first = s.slice(0, dot + 1).trim()
    if (first.length >= 12 && first.length <= 88) {
      return [first]
    }
  }
  const clipped = clipChipPhrase(takeFirstWords(s, 10))
  return clipped && !isUnhelpfulStandaloneChip(clipped) ? [clipped] : []
}

function appendKeywordChip(out: string[], candidate: string, max: number): void {
  const t = clipChipPhrase(candidate)
  if (!t || t.length < 8 || out.length >= max) {
    return
  }
  if (out.some((x) => x.toLowerCase() === t.toLowerCase())) {
    return
  }

  if (out.length > 0) {
    const last = out[out.length - 1]
    if (endsWithIncompletePhrase(last) || /\bfor\s+$/i.test(last)) {
      const merged = clipChipPhrase(`${last} ${t}`)
      if (merged.length >= 8) {
        out[out.length - 1] = merged
        return
      }
    }
    if (isUnhelpfulStandaloneChip(t) && last.length > 16) {
      const tailKey = t
        .trim()
        .toLowerCase()
        .replace(/[^a-z]/gi, '')
      const glue =
        TYPO_LAYOUT_TAIL_WORDS.has(tailKey) && !/\b(for|on|with)\s+$/i.test(last) ? ' for ' : ' '
      out[out.length - 1] = clipChipPhrase(`${last}${glue}${t}`)
      return
    }
  }

  if (isUnhelpfulStandaloneChip(t)) {
    return
  }

  out.push(t)
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
      appendKeywordChip(out, kw, max)
    }
  }
  return out
}

function normalizeHexToken(raw: string): string | null {
  const s = raw.trim()
  if (!s) {
    return null
  }
  const withHash = s.startsWith('#') ? s : `#${s}`
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?([0-9a-f]{2})?$/i.test(withHash)) {
    return withHash
  }
  return null
}

function pushHexUnique(out: string[], hex: string): void {
  const n = normalizeHexToken(hex)
  if (!n) {
    return
  }
  if (!out.some((x) => x.toLowerCase() === n.toLowerCase())) {
    out.push(n)
  }
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
        'border',
        'primary',
        'secondary'
      ]
      const out: string[] = []
      for (const k of keys) {
        const hex = safeStr(colors[k])
        if (hex) {
          pushHexUnique(out, hex)
        }
      }
      if (!out.length) {
        for (const v of Object.values(colors)) {
          const hex = safeStr(v as string)
          if (hex) {
            pushHexUnique(out, hex)
          }
          if (out.length >= 8) {
            break
          }
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
      const matches = s.match(HEX_IN_STRING)
      if (matches) {
        for (const h of matches) {
          pushHexUnique(out, h)
          if (out.length >= 8) {
            return out
          }
        }
      }
    }
    return out
  }
  return []
}

/** Merges guidelines-based extraction with `brand_facts` and LLM briefs so cards always get real colors when stored anywhere. */
export function extractPaletteHexFromProfile(profile: BrandProfile): string[] {
  const g = profile.guidelines as Record<string, unknown>
  const out: string[] = [...extractPaletteHex(g)]

  const factsColors = profile.brand_facts?.colors
  if (Array.isArray(factsColors) && factsColors.length) {
    const sorted = [...factsColors].sort(
      (a, b) => (a.hierarchy_rank ?? 999) - (b.hierarchy_rank ?? 999)
    )
    for (const c of sorted) {
      if (c?.hex) {
        pushHexUnique(out, c.hex)
      }
      if (out.length >= 12) {
        break
      }
    }
  }

  if (out.length < 3) {
    const blob = [profile.prompt_brand_guidelines, profile.raw_summary].filter(Boolean).join('\n')
    const found = blob.match(HEX_IN_STRING)
    if (found) {
      for (const h of found) {
        pushHexUnique(out, h)
        if (out.length >= 8) {
          break
        }
      }
    }
  }

  return out.slice(0, 8)
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
    return t.length > MAX_TONE_CHARS ? truncateAtSentences(t, MAX_TONE_CHARS) : t
  }
  const sem = guidelines.semantic
  if (sem && typeof sem === 'object') {
    const voice = (sem as { voice?: Record<string, string> }).voice
    if (voice && typeof voice === 'object') {
      const parts = [safeStr(voice.tone_summary), safeStr(voice.formality)].filter(Boolean)
      if (parts.length) {
        const joined = parts.join(' · ')
        return joined.length > MAX_TONE_CHARS
          ? truncateAtSentences(joined, MAX_TONE_CHARS)
          : joined
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
    return trimmed.length > MAX_AUDIENCE_CHARS
      ? truncateAtSentences(trimmed, MAX_AUDIENCE_CHARS)
      : trimmed
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
