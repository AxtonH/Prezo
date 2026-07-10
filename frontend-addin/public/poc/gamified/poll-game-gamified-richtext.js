/**
 * Rich-text core for the gamified station: the override-key vocabulary
 * (poll:/chrome: text keys and their predicates), the localStorage override
 * map, and the HTML/inline-style sanitizers that gate everything a
 * contenteditable host can persist.
 *
 * Extracted verbatim from the app.js closure (see
 * docs/gamified-station-modularization.md, Phase 7). Everything here is a
 * pure function over its arguments plus localStorage — the selection/editor
 * engine (toolbar, commands, hosts) stays in app.js and imports from here.
 *
 * sanitizeRichTextHtml intentionally parses with a real DOM
 * (document.createElement + innerHTML): the allowlist is enforced by
 * rebuilding nodes, never by regex.
 */
import { TEXT_OVERRIDES_KEY } from './poll-game-gamified-constants.js'
import { sanitizeFontFamily, sanitizeInlineColorValue } from './poll-game-gamified-theme.js'
import {
  asText,
  escapeHtml,
  extractPlainTextFromHtml,
  normalizeWhitespace,
  safeJsonParse,
  safeStorageGet
} from './poll-game-gamified-utils.js'

export function loadTextOverrides() {
  const parsed = safeJsonParse(safeStorageGet(TEXT_OVERRIDES_KEY))
  return sanitizeTextOverridesMap(parsed)
}

export function sanitizeTextOverridesMap(value) {
  if (!value || typeof value !== 'object') {
    return {}
  }
  const overrides = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string' || !key) {
      continue
    }
    overrides[key] = sanitizeRichTextHtml(entry)
  }
  return overrides
}

export function saveTextOverrides(overrides) {
  try {
    localStorage.setItem(TEXT_OVERRIDES_KEY, JSON.stringify(overrides))
  } catch {}
}

export function textToRichHtml(text) {
  const normalized = asText(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  return escapeHtml(normalized).replace(/\n/g, '<br>')
}

export function sanitizeRichTextHtml(input) {
  const container = document.createElement('div')
  container.innerHTML = typeof input === 'string' ? input : ''

  const fragment = document.createDocumentFragment()
  for (const child of [...container.childNodes]) {
    appendSanitizedNode(fragment, child)
  }

  const clean = document.createElement('div')
  clean.appendChild(fragment)
  return clean.innerHTML
}

function appendSanitizedNode(parent, node) {
  if (node.nodeType === Node.TEXT_NODE) {
    parent.appendChild(document.createTextNode(node.textContent || ''))
    return
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return
  }
  const element = node
  const tag = element.tagName.toUpperCase()
  if (tag === 'BR') {
    parent.appendChild(document.createElement('br'))
    return
  }

  if (tag === 'SPAN') {
    const safeStyle = sanitizeInlineTextStyle(asText(element.getAttribute('style')))
    if (!safeStyle) {
      for (const child of [...element.childNodes]) {
        appendSanitizedNode(parent, child)
      }
      return
    }
    const safeSpan = document.createElement('span')
    safeSpan.setAttribute('style', safeStyle)
    for (const child of [...element.childNodes]) {
      appendSanitizedNode(safeSpan, child)
    }
    parent.appendChild(safeSpan)
    return
  }

  const allowedTag = tag === 'B' || tag === 'STRONG' || tag === 'I' || tag === 'EM' || tag === 'U'
  if (!allowedTag) {
    for (const child of [...element.childNodes]) {
      appendSanitizedNode(parent, child)
    }
    return
  }

  const safe = document.createElement(tag.toLowerCase())
  for (const child of [...element.childNodes]) {
    appendSanitizedNode(safe, child)
  }
  parent.appendChild(safe)
}

export function sanitizeInlineTextStyle(styleText) {
  if (!styleText) {
    return ''
  }

  const cleanParts = []
  const declarations = styleText.split(';')
  for (const declaration of declarations) {
    const separator = declaration.indexOf(':')
    if (separator < 0) {
      continue
    }
    const rawProp = declaration.slice(0, separator).trim().toLowerCase()
    const rawValue = declaration.slice(separator + 1).trim()
    if (!rawProp || !rawValue) {
      continue
    }
    const lowerValue = rawValue.toLowerCase()

    if (rawProp === 'font-weight') {
      const value = sanitizeFontWeightValue(lowerValue)
      if (value) {
        cleanParts.push(`font-weight: ${value}`)
      }
      continue
    }
    if (rawProp === 'font-style') {
      const value = sanitizeFontStyleValue(lowerValue)
      if (value) {
        cleanParts.push(`font-style: ${value}`)
      }
      continue
    }
    if (rawProp === 'text-decoration' || rawProp === 'text-decoration-line') {
      const value = sanitizeTextDecorationValue(lowerValue)
      if (value) {
        cleanParts.push(`text-decoration: ${value}`)
      }
      continue
    }
    if (rawProp === 'font-family') {
      const value = sanitizeInlineFontFamilyValue(rawValue)
      if (value) {
        cleanParts.push(`font-family: ${value}`)
      }
      continue
    }
    if (rawProp === 'font-size') {
      const value = sanitizeInlineFontSizeValue(lowerValue)
      if (value) {
        cleanParts.push(`font-size: ${value}`)
      }
      continue
    }
    if (rawProp === 'color') {
      const value = sanitizeInlineColorValue(lowerValue)
      if (value) {
        cleanParts.push(`color: ${value}`)
      }
    }
  }

  if (cleanParts.length === 0) {
    return ''
  }
  return cleanParts.join('; ')
}

export function sanitizeFontWeightValue(value) {
  if (value === 'normal' || value === 'bold') {
    return value
  }
  if (/^[1-9]00$/.test(value)) {
    return value
  }
  return ''
}

export function sanitizeFontStyleValue(value) {
  if (value === 'normal' || value === 'italic') {
    return value
  }
  return ''
}

export function sanitizeTextDecorationValue(value) {
  if (value.includes('underline')) {
    return 'underline'
  }
  if (value.includes('none')) {
    return 'none'
  }
  return ''
}

export function sanitizeInlineFontFamilyValue(value) {
  const sanitized = sanitizeFontFamily(value, '')
  if (!sanitized) {
    return ''
  }
  const parts = sanitized
    .split(',')
    .map((part) => part.trim().replace(/^["']|["']$/g, ''))
    .filter((part) => /^[a-z0-9 .\-]+$/i.test(part))
  if (parts.length === 0) {
    return ''
  }
  return parts.map((part) => (/\s/.test(part) ? `"${part}"` : part)).join(', ')
}

export function sanitizeInlineFontSizeValue(value) {
  const match = /^([0-9]+(?:\.[0-9]+)?)(pt|px|em|rem|%)$/.exec(value)
  if (!match) {
    return ''
  }
  const amount = Number(match[1])
  if (!Number.isFinite(amount) || amount <= 0) {
    return ''
  }
  const clamped = Math.min(300, Math.max(4, amount))
  const printable = Number.isInteger(clamped) ? String(clamped) : String(clamped)
  return `${printable}${match[2]}`
}

export function getQuestionTextKey(poll) {
  const pollId = asText(poll?.id) || 'unknown'
  return `poll:${pollId}:question`
}

export function getQuestionStateTextKey(stateKey) {
  const normalizedStateKey = asText(stateKey) || 'default'
  return `chrome:question-state:${normalizedStateKey}`
}

export function getEyebrowTextKey() {
  return 'chrome:eyebrow'
}

export function getStatusTextKey() {
  return 'chrome:status'
}

export function getVotesTextKey() {
  return 'chrome:votes'
}

export function getFooterTextKey() {
  return 'chrome:footer'
}

export function getOptionTextKey(poll, option, index) {
  const pollId = asText(poll?.id) || 'unknown'
  const optionId = asText(option?.id) || `index-${index}`
  return `poll:${pollId}:option:${optionId}`
}

export function getOptionStatsTextKey(poll, option, index) {
  const pollId = asText(poll?.id) || 'unknown'
  const optionId = asText(option?.id) || `index-${index}`
  return `poll:${pollId}:option:${optionId}:stats`
}

export function getOptionsStateTextKey(stateKey) {
  const normalizedStateKey = asText(stateKey) || 'default'
  return `chrome:options-state:${normalizedStateKey}`
}

export function isLiveBoundTextKey(textKey) {
  const key = asText(textKey)
  if (!key) {
    return false
  }
  if (key === 'chrome:status' || key === 'chrome:votes' || key === 'chrome:footer') {
    return true
  }
  return /^poll:[^:]+:option:[^:]+:stats$/i.test(key)
}

export function isPollQuestionTextKey(textKey) {
  return /^poll:[^:]+:question$/i.test(asText(textKey))
}

export function isStaleQuestionOverride(html) {
  const plain = normalizeWhitespace(extractPlainTextFromHtml(html)).toLowerCase()
  return (
    plain === 'waiting for poll data...' ||
    plain === 'missing required query param' ||
    plain === 'unable to load poll data'
  )
}
