/**
 * Pure helpers shared across the gamified station modules.
 *
 * Extracted verbatim from the app.js closure (see
 * docs/gamified-station-modularization.md, Phase 1). Leaf module: may import
 * constants, never a subsystem module.
 *
 * NOTE: artifact-package.js and artifact-runtime.js keep their own local
 * `asText` on purpose — theirs does NOT trim, and markup handling relies on
 * that. Only the trimming variant lives here.
 */
import { DEFAULT_POLL_SELECTOR } from './poll-game-gamified-constants.js'

export function asText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function clamp(value, min, max, fallback) {
  const num = Number(value)
  if (!Number.isFinite(num)) {
    return fallback
  }
  return Math.min(max, Math.max(min, num))
}

export function toInt(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) {
    return 0
  }
  return Math.max(0, Math.round(num))
}

export function normalizeApiBase(value) {
  const text = asText(value)
  if (!text) {
    return ''
  }
  return text.replace(/\/+$/, '')
}

export function toWsBase(apiBase) {
  try {
    const parsed = new URL(apiBase)
    const protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${parsed.host}`
  } catch {
    return ''
  }
}

export function normalizeCode(value) {
  const text = asText(value)
  return text ? text.toUpperCase() : ''
}

export function normalizeThemeName(value) {
  const text = asText(value)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64)
  return text
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

export function safeJsonParse(value) {
  if (!value) {
    return null
  }
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export function safeStorageGet(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function errorToMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return 'Unexpected error'
}

export function extractApiErrorMessage(payload, status) {
  const directDetail = asText(payload?.detail)
  if (directDetail) {
    return directDetail
  }
  if (Array.isArray(payload?.detail) && payload.detail.length > 0) {
    const first = payload.detail[0]
    const parts = [
      asText(first?.msg),
      Array.isArray(first?.loc) ? first.loc.join('.') : ''
    ].filter(Boolean)
    if (parts.length > 0) {
      return parts.join(' [')
        .replace(/\[$/, '')
        .replace(/^(.+?) \[(.+)$/, '$1 [$2]')
    }
  }
  return asText(payload?.error?.message) || `Request failed (${status})`
}

export function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function normalizeWhitespace(text) {
  return asText(text).replace(/\s+/g, ' ')
}

/** Browser-only: relies on document for HTML parsing. */
export function extractPlainTextFromHtml(html) {
  const container = document.createElement('div')
  container.innerHTML = typeof html === 'string' ? html : ''
  return container.textContent || ''
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = 45000) {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => {
    controller.abort()
  }, timeoutMs)
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Request timed out for ${url}.`)
    }
    throw new Error(`Unable to reach ${url}: ${errorToMessage(error)}`)
  } finally {
    window.clearTimeout(timeoutId)
  }
}

/** Poll binding selector from a `pollId` URL param: explicit id or a
    latest/open fallback descriptor. */
export const parsePollSelector = (raw) => {
  const value = asText(raw)
  if (!value) {
    return { mode: 'latestOpen', descriptor: DEFAULT_POLL_SELECTOR, explicitId: '' }
  }
  const lower = value.toLowerCase()
  if (lower === 'latest/open' || lower === 'open/latest' || lower === 'latestopen') {
    return { mode: 'latestOpen', descriptor: 'latest/open', explicitId: '' }
  }
  if (lower === 'latest') {
    return { mode: 'latest', descriptor: 'latest', explicitId: '' }
  }
  if (lower === 'open') {
    return { mode: 'open', descriptor: 'open', explicitId: '' }
  }
  return { mode: 'id', descriptor: value, explicitId: value }
}

// Discussion binding mirrors the poll selector: an explicit prompt id, or
// latest-open fallback when the embed has not been configured yet.
export const parsePromptSelector = (raw) => {
  const value = asText(raw)
  if (!value) {
    return { mode: 'latestOpen', descriptor: 'latest/open', explicitId: '' }
  }
  return { mode: 'id', descriptor: value, explicitId: value }
}
