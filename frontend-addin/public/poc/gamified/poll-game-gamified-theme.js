/**
 * Theme core for the gamified station: the default theme, the sanitizer that
 * every loaded/imported/AI-patched theme passes through, and the shared
 * color utilities.
 *
 * Extracted verbatim from the app.js closure (see
 * docs/gamified-station-modularization.md, Phase 6a-core). This module is
 * the PURE half of the theme engine — applyTheme / updateTheme /
 * syncThemeControls (the DOM half) remain in app.js until Phase 6a-dom.
 * The AI patch sanitizer takes the current theme as an argument instead of
 * reading the closure binding.
 */
import {
  AI_THEME_ALLOWED_KEYS,
  AI_THEME_COLOR_KEYS,
  AI_THEME_NUMBER_RANGES
} from './poll-game-gamified-constants.js'
import {
  ARTIFACT_LAYOUT_HORIZONTAL,
  ARTIFACT_VISUAL_MODE,
  sanitizeArtifactLayout
} from './poll-game-gamified-artifact-mode.js'
import { asText, clamp } from './poll-game-gamified-utils.js'

export const defaultTheme = Object.freeze({
  bgImageUrl: '',
  bgImageOpacity: 0,
  bgA: '#f4f8ff',
  bgB: '#dff0ff',
  overlayColor: '#eef5ff',
  overlayOpacity: 0.22,
  gridOpacity: 0.1,
  panelColor: '#ffffff',
  panelOpacity: 0.82,
  panelBorder: '#9bc5ef',
  textMain: '#16375e',
  textSub: '#55769d',
  trackColor: '#c7d8ea',
  trackOpacity: 0.58,
  fillA: '#64c8ff',
  fillB: '#4a89ff',
  barHeight: 24,
  barRadius: 999,
  questionSize: 62,
  labelSize: 24,
  visualMode: ARTIFACT_VISUAL_MODE,
  artifactLayout: ARTIFACT_LAYOUT_HORIZONTAL,
  logoUrl: '',
  logoWidth: 140,
  logoOpacity: 1,
  logoX: 88,
  logoY: 10,
  assetUrl: '',
  assetWidth: 320,
  assetOpacity: 0.38,
  assetX: 50,
  assetY: 50,
  panelX: 0,
  panelY: 0,
  panelScaleX: 1,
  panelScaleY: 1,
  bgImageX: 0,
  bgImageY: 0,
  bgOverlayX: 0,
  bgOverlayY: 0,
  gridX: 0,
  gridY: 0,
  bgImageScaleX: 1,
  bgImageScaleY: 1,
  bgOverlayScaleX: 1,
  bgOverlayScaleY: 1,
  gridScaleX: 1,
  gridScaleY: 1,
  eyebrowX: 0,
  eyebrowY: 0,
  eyebrowBoxWidth: null,
  eyebrowBoxHeight: null,
  questionX: 0,
  questionY: 0,
  questionBoxWidth: null,
  questionBoxHeight: null,
  metaX: 0,
  metaY: 0,
  metaBoxWidth: null,
  metaBoxHeight: null,
  metaScaleX: 1,
  metaScaleY: 1,
  optionsX: 0,
  optionsY: 0,
  footerX: 0,
  footerY: 0,
  footerBoxWidth: null,
  footerBoxHeight: null,
  footerScaleX: 1,
  footerScaleY: 1,
  logoScaleX: 1,
  logoScaleY: 1,
  assetScaleX: 1,
  assetScaleY: 1,
  optionOffsets: {},
  optionSizes: {},
  optionScales: {},
  optionAnchors: {},
  deletedObjects: {},
  fontFamily: '"Inter", "Segoe UI", "Trebuchet MS", sans-serif'
})

export function hasThemeValue(value) {
  return value !== undefined && value !== null && value !== ''
}

function migrateLegacyTitleThemeFields(theme) {
  const incoming = theme && typeof theme === 'object' ? theme : {}
  const migrated = { ...incoming }

  const legacyX = Number(incoming.titleX)
  if (Number.isFinite(legacyX)) {
    if (!Number.isFinite(Number(incoming.eyebrowX))) {
      migrated.eyebrowX = legacyX
    }
    if (!Number.isFinite(Number(incoming.questionX))) {
      migrated.questionX = legacyX
    }
  }

  const legacyY = Number(incoming.titleY)
  if (Number.isFinite(legacyY)) {
    if (!Number.isFinite(Number(incoming.eyebrowY))) {
      migrated.eyebrowY = legacyY
    }
    if (!Number.isFinite(Number(incoming.questionY))) {
      migrated.questionY = legacyY
    }
  }

  if (hasThemeValue(incoming.titleBoxWidth)) {
    if (!hasThemeValue(incoming.eyebrowBoxWidth)) {
      migrated.eyebrowBoxWidth = incoming.titleBoxWidth
    }
    if (!hasThemeValue(incoming.questionBoxWidth)) {
      migrated.questionBoxWidth = incoming.titleBoxWidth
    }
  }

  if (hasThemeValue(incoming.titleBoxHeight)) {
    if (!hasThemeValue(incoming.eyebrowBoxHeight)) {
      migrated.eyebrowBoxHeight = incoming.titleBoxHeight
    }
    if (!hasThemeValue(incoming.questionBoxHeight)) {
      migrated.questionBoxHeight = incoming.titleBoxHeight
    }
  }

  delete migrated.titleX
  delete migrated.titleY
  delete migrated.titleBoxWidth
  delete migrated.titleBoxHeight
  delete migrated.titleScaleX
  delete migrated.titleScaleY

  return migrated
}

export function sanitizeTheme(theme) {
  const incoming = migrateLegacyTitleThemeFields(theme)
  let gridOpacity = clamp(incoming.gridOpacity, 0, 0.5, defaultTheme.gridOpacity)
  if (incoming.gridVisible === false) {
    gridOpacity = 0
  }
  return {
    bgImageUrl: sanitizeUrl(incoming.bgImageUrl, defaultTheme.bgImageUrl),
    bgImageOpacity: clamp(incoming.bgImageOpacity, 0, 1, defaultTheme.bgImageOpacity),
    bgA: sanitizeHex(incoming.bgA, defaultTheme.bgA),
    bgB: sanitizeHex(incoming.bgB, defaultTheme.bgB),
    overlayColor: sanitizeHex(incoming.overlayColor, defaultTheme.overlayColor),
    overlayOpacity: clamp(incoming.overlayOpacity, 0, 1, defaultTheme.overlayOpacity),
    gridOpacity,
    panelColor: sanitizeHex(incoming.panelColor, defaultTheme.panelColor),
    panelOpacity: clamp(incoming.panelOpacity, 0, 1, defaultTheme.panelOpacity),
    panelBorder: sanitizeHex(incoming.panelBorder, defaultTheme.panelBorder),
    textMain: sanitizeHex(incoming.textMain, defaultTheme.textMain),
    textSub: sanitizeHex(incoming.textSub, defaultTheme.textSub),
    trackColor: sanitizeHex(incoming.trackColor, defaultTheme.trackColor),
    trackOpacity: clamp(incoming.trackOpacity, 0, 1, defaultTheme.trackOpacity),
    fillA: sanitizeHex(incoming.fillA, defaultTheme.fillA),
    fillB: sanitizeHex(incoming.fillB, defaultTheme.fillB),
    barHeight: clamp(incoming.barHeight, 8, 44, defaultTheme.barHeight),
    barRadius: clamp(incoming.barRadius, 0, 999, defaultTheme.barRadius),
    questionSize: clamp(incoming.questionSize, 42, 90, defaultTheme.questionSize),
    labelSize: clamp(incoming.labelSize, 14, 36, defaultTheme.labelSize),
    visualMode: sanitizeVisualMode(incoming.visualMode, defaultTheme.visualMode),
    artifactLayout: sanitizeArtifactLayout(incoming.artifactLayout, defaultTheme.artifactLayout),
    logoUrl: sanitizeUrl(incoming.logoUrl, defaultTheme.logoUrl),
    logoWidth: clamp(incoming.logoWidth, 40, 280, defaultTheme.logoWidth),
    logoOpacity: clamp(incoming.logoOpacity, 0, 1, defaultTheme.logoOpacity),
    logoX: clamp(incoming.logoX, 0, 100, defaultTheme.logoX),
    logoY: clamp(incoming.logoY, 0, 100, defaultTheme.logoY),
    assetUrl: sanitizeUrl(incoming.assetUrl, defaultTheme.assetUrl),
    assetWidth: clamp(incoming.assetWidth, 60, 720, defaultTheme.assetWidth),
    assetOpacity: clamp(incoming.assetOpacity, 0, 1, defaultTheme.assetOpacity),
    assetX: clamp(incoming.assetX, 0, 100, defaultTheme.assetX),
    assetY: clamp(incoming.assetY, 0, 100, defaultTheme.assetY),
    panelX: clamp(incoming.panelX, -2400, 2400, defaultTheme.panelX),
    panelY: clamp(incoming.panelY, -2400, 2400, defaultTheme.panelY),
    panelScaleX: clamp(incoming.panelScaleX, 0.35, 2.8, defaultTheme.panelScaleX),
    panelScaleY: clamp(incoming.panelScaleY, 0.35, 2.8, defaultTheme.panelScaleY),
    bgImageX: clamp(incoming.bgImageX, -2400, 2400, defaultTheme.bgImageX),
    bgImageY: clamp(incoming.bgImageY, -2400, 2400, defaultTheme.bgImageY),
    bgImageScaleX: clamp(incoming.bgImageScaleX, 0.35, 3.5, defaultTheme.bgImageScaleX),
    bgImageScaleY: clamp(incoming.bgImageScaleY, 0.35, 3.5, defaultTheme.bgImageScaleY),
    bgOverlayX: clamp(incoming.bgOverlayX, -2400, 2400, defaultTheme.bgOverlayX),
    bgOverlayY: clamp(incoming.bgOverlayY, -2400, 2400, defaultTheme.bgOverlayY),
    bgOverlayScaleX: clamp(
      incoming.bgOverlayScaleX,
      0.35,
      3.5,
      defaultTheme.bgOverlayScaleX
    ),
    bgOverlayScaleY: clamp(
      incoming.bgOverlayScaleY,
      0.35,
      3.5,
      defaultTheme.bgOverlayScaleY
    ),
    gridX: clamp(incoming.gridX, -2400, 2400, defaultTheme.gridX),
    gridY: clamp(incoming.gridY, -2400, 2400, defaultTheme.gridY),
    gridScaleX: clamp(incoming.gridScaleX, 0.35, 3.5, defaultTheme.gridScaleX),
    gridScaleY: clamp(incoming.gridScaleY, 0.35, 3.5, defaultTheme.gridScaleY),
    eyebrowX: clamp(incoming.eyebrowX, -2400, 2400, defaultTheme.eyebrowX),
    eyebrowY: clamp(incoming.eyebrowY, -2400, 2400, defaultTheme.eyebrowY),
    eyebrowBoxWidth: sanitizeOptionalDimension(
      incoming.eyebrowBoxWidth,
      60,
      1800,
      defaultTheme.eyebrowBoxWidth
    ),
    eyebrowBoxHeight: sanitizeOptionalDimension(
      incoming.eyebrowBoxHeight,
      14,
      420,
      defaultTheme.eyebrowBoxHeight
    ),
    questionX: clamp(incoming.questionX, -2400, 2400, defaultTheme.questionX),
    questionY: clamp(incoming.questionY, -2400, 2400, defaultTheme.questionY),
    questionBoxWidth: sanitizeOptionalDimension(
      incoming.questionBoxWidth,
      120,
      2200,
      defaultTheme.questionBoxWidth
    ),
    questionBoxHeight: sanitizeOptionalDimension(
      incoming.questionBoxHeight,
      40,
      1400,
      defaultTheme.questionBoxHeight
    ),
    metaX: clamp(incoming.metaX, -2400, 2400, defaultTheme.metaX),
    metaY: clamp(incoming.metaY, -2400, 2400, defaultTheme.metaY),
    metaBoxWidth: sanitizeOptionalDimension(
      incoming.metaBoxWidth,
      90,
      1000,
      defaultTheme.metaBoxWidth
    ),
    metaBoxHeight: sanitizeOptionalDimension(
      incoming.metaBoxHeight,
      28,
      220,
      defaultTheme.metaBoxHeight
    ),
    metaScaleX: clamp(incoming.metaScaleX, 0.45, 3.2, defaultTheme.metaScaleX),
    metaScaleY: clamp(incoming.metaScaleY, 0.45, 3.2, defaultTheme.metaScaleY),
    optionsX: clamp(incoming.optionsX, -2400, 2400, defaultTheme.optionsX),
    optionsY: clamp(incoming.optionsY, -2400, 2400, defaultTheme.optionsY),
    footerX: clamp(incoming.footerX, -2400, 2400, defaultTheme.footerX),
    footerY: clamp(incoming.footerY, -2400, 2400, defaultTheme.footerY),
    footerBoxWidth: sanitizeOptionalDimension(
      incoming.footerBoxWidth,
      120,
      2200,
      defaultTheme.footerBoxWidth
    ),
    footerBoxHeight: sanitizeOptionalDimension(
      incoming.footerBoxHeight,
      18,
      420,
      defaultTheme.footerBoxHeight
    ),
    footerScaleX: clamp(incoming.footerScaleX, 0.45, 3, defaultTheme.footerScaleX),
    footerScaleY: clamp(incoming.footerScaleY, 0.45, 3, defaultTheme.footerScaleY),
    logoScaleX: clamp(incoming.logoScaleX, 0.25, 5, defaultTheme.logoScaleX),
    logoScaleY: clamp(incoming.logoScaleY, 0.25, 5, defaultTheme.logoScaleY),
    assetScaleX: clamp(incoming.assetScaleX, 0.25, 5, defaultTheme.assetScaleX),
    assetScaleY: clamp(incoming.assetScaleY, 0.25, 5, defaultTheme.assetScaleY),
    optionOffsets: sanitizeOptionOffsets(incoming.optionOffsets, defaultTheme.optionOffsets),
    optionSizes: sanitizeOptionSizes(incoming.optionSizes, defaultTheme.optionSizes),
    optionScales: sanitizeOptionScales(incoming.optionScales, defaultTheme.optionScales),
    optionAnchors: sanitizeOptionAnchors(incoming.optionAnchors, defaultTheme.optionAnchors),
    deletedObjects: sanitizeDeletedObjects(incoming.deletedObjects, defaultTheme.deletedObjects),
    fontFamily: sanitizeFontFamily(incoming.fontFamily, defaultTheme.fontFamily)
  }
}

function sanitizeOptionOffsets(value, fallback) {
  const source = value && typeof value === 'object' ? value : fallback
  if (!source || typeof source !== 'object') {
    return {}
  }
  const sanitized = {}
  for (const [rawId, rawOffset] of Object.entries(source)) {
    const optionId = asText(rawId)
    if (!optionId || !rawOffset || typeof rawOffset !== 'object') {
      continue
    }
    sanitized[optionId] = {
      x: clamp(rawOffset.x, -2400, 2400, 0),
      y: clamp(rawOffset.y, -2400, 2400, 0)
    }
  }
  return sanitized
}

function sanitizeOptionScales(value, fallback) {
  const source = value && typeof value === 'object' ? value : fallback
  if (!source || typeof source !== 'object') {
    return {}
  }
  const sanitized = {}
  for (const [rawId, rawScale] of Object.entries(source)) {
    const optionId = asText(rawId)
    if (!optionId || !rawScale || typeof rawScale !== 'object') {
      continue
    }
    sanitized[optionId] = {
      x: clamp(rawScale.x, 0.25, 5, 1),
      y: clamp(rawScale.y, 0.25, 5, 1)
    }
  }
  return sanitized
}

function sanitizeOptionSizes(value, fallback) {
  const source = value && typeof value === 'object' ? value : fallback
  if (!source || typeof source !== 'object') {
    return {}
  }
  const sanitized = {}
  for (const [rawId, rawSize] of Object.entries(source)) {
    const optionId = asText(rawId)
    if (!optionId || !rawSize || typeof rawSize !== 'object') {
      continue
    }
    sanitized[optionId] = {
      width: sanitizeOptionalDimension(rawSize.width, 24, 2600, null),
      height: sanitizeOptionalDimension(rawSize.height, 18, 1400, null)
    }
  }
  return sanitized
}

function sanitizeOptionAnchors(value, fallback) {
  const source = value && typeof value === 'object' ? value : fallback
  if (!source || typeof source !== 'object') {
    return {}
  }
  const sanitized = {}
  for (const [rawId, rawAnchor] of Object.entries(source)) {
    const optionId = asText(rawId)
    if (!optionId || !rawAnchor || typeof rawAnchor !== 'object') {
      continue
    }
    const x = Number.isFinite(rawAnchor.x) ? clamp(rawAnchor.x, -2400, 2400, 0) : null
    const y = Number.isFinite(rawAnchor.y) ? clamp(rawAnchor.y, -2400, 2400, 0) : null
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue
    }
    sanitized[optionId] = { x, y }
  }
  return sanitized
}

function sanitizeDeletedObjects(value, fallback) {
  const source = value && typeof value === 'object' ? value : fallback
  if (!source || typeof source !== 'object') {
    return {}
  }
  const sanitized = {}
  for (const [rawKey, rawValue] of Object.entries(source)) {
    const key = asText(rawKey)
    if (!key || !rawValue) {
      continue
    }
    sanitized[key] = true
  }
  return sanitized
}

export function sanitizeFontFamily(value, fallback) {
  const text = asText(value)
  if (!text) {
    return fallback
  }
  return text.replace(/[{};]/g, '').slice(0, 120)
}

export function sanitizeVisualMode(value, fallback) {
  const mode = asText(value).toLowerCase()
  if (mode === 'classic' || mode === ARTIFACT_VISUAL_MODE) {
    return mode
  }
  return fallback
}

export function sanitizeUrl(value, fallback) {
  const text = asText(value)
  if (!text) {
    return fallback
  }
  return text
}

export function sanitizeHex(value, fallback) {
  const text = asText(value)
  if (!text) {
    return fallback
  }
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text)
  return match ? text : fallback
}

export function sanitizeOptionalDimension(value, min, max, fallback = null) {
  if (value == null) {
    return fallback
  }
  if (typeof value === 'string' && !value.trim()) {
    return fallback
  }
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return fallback
  }
  return Math.min(max, Math.max(min, numeric))
}

export function hexToRgba(hex, alpha) {
  const clean = sanitizeHex(hex, '#000000').replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((ch) => `${ch}${ch}`).join('') : clean
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  const a = clamp(alpha, 0, 1, 1)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

export function hexLuminance(hex) {
  const clean = sanitizeHex(hex, '').replace('#', '')
  if (!clean) {
    return null
  }
  const full = clean.length === 3 ? clean.split('').map((ch) => `${ch}${ch}`).join('') : clean
  const r = parseInt(full.slice(0, 2), 16) / 255
  const g = parseInt(full.slice(2, 4), 16) / 255
  const b = parseInt(full.slice(4, 6), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function sanitizeInlineColorValue(value) {
  const hex = sanitizeHex(value, '')
  if (hex) {
    return hex.toLowerCase()
  }
  const funcMatch = /^rgba?\(\s*([^)]+)\s*\)$/i.exec(asText(value))
  if (!funcMatch) {
    return ''
  }

  let channelText = funcMatch[1].trim()
  if (!channelText) {
    return ''
  }
  if (channelText.includes('/')) {
    channelText = channelText.split('/')[0].trim()
  }
  const parts = channelText.includes(',')
    ? channelText
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
    : channelText.split(/\s+/).filter(Boolean)
  if (parts.length < 3) {
    return ''
  }

  const channels = []
  for (let index = 0; index < 3; index += 1) {
    const part = parts[index]
    if (!part) {
      return ''
    }
    let channelValue = Number.parseFloat(part)
    if (!Number.isFinite(channelValue)) {
      return ''
    }
    if (part.endsWith('%')) {
      channelValue = (channelValue / 100) * 255
    }
    channels.push(clamp(Math.round(channelValue), 0, 255, 0))
  }

  const [r, g, b] = channels
  return `rgb(${r}, ${g}, ${b})`
}

export function normalizeColorToHex(colorText) {
  const directHex = sanitizeHex(colorText, '')
  if (directHex) {
    return directHex.toLowerCase()
  }
  const rgbMatch = /rgba?\(([^)]+)\)/i.exec(asText(colorText))
  if (!rgbMatch) {
    return '#16375e'
  }
  const channels = rgbMatch[1]
    .split(',')
    .map((entry) => Number.parseFloat(entry.trim()))
    .filter((entry, index) => Number.isFinite(entry) && index < 3)
  if (channels.length < 3) {
    return '#16375e'
  }
  const r = clamp(Math.round(channels[0]), 0, 255, 0)
  const g = clamp(Math.round(channels[1]), 0, 255, 0)
  const b = clamp(Math.round(channels[2]), 0, 255, 0)
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`
}

function toHexByte(value) {
  return Number(value).toString(16).padStart(2, '0')
}

/** Normalize an AI edit-plan theme patch: unknown keys dropped, colors and
    ranges validated against the CURRENT theme's values as fallbacks. Pure —
    the current theme arrives as an argument. */
export function sanitizeAiThemePatch(rawTheme, currentTheme) {
  if (!rawTheme || typeof rawTheme !== 'object') {
    return {}
  }
  const patch = {}
  for (const [rawKey, rawValue] of Object.entries(rawTheme)) {
    const key = asText(rawKey)
    if (!AI_THEME_ALLOWED_KEYS.has(key)) {
      continue
    }
    const normalized = sanitizeAiThemeValue(key, rawValue, currentTheme)
    if (normalized == null && normalized !== 0 && normalized !== false) {
      continue
    }
    patch[key] = normalized
  }
  return patch
}

function sanitizeAiThemeValue(key, value, currentTheme) {
  if (AI_THEME_COLOR_KEYS.has(key)) {
    return sanitizeHex(asText(value), currentTheme[key])
  }
  if (Object.prototype.hasOwnProperty.call(AI_THEME_NUMBER_RANGES, key)) {
    const [min, max] = AI_THEME_NUMBER_RANGES[key]
    return clamp(value, min, max, currentTheme[key])
  }
  if (key === 'visualMode') {
    return sanitizeVisualMode(value, currentTheme.visualMode)
  }
  if (key === 'artifactLayout') {
    return sanitizeArtifactLayout(value, currentTheme.artifactLayout)
  }
  if (key === 'fontFamily') {
    return sanitizeFontFamily(value, currentTheme.fontFamily)
  }
  if (key === 'bgImageUrl' || key === 'logoUrl' || key === 'assetUrl') {
    return sanitizeUrl(value, currentTheme[key])
  }
  return null
}
