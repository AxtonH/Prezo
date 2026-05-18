/**
 * Utility functions for artifact "copy" fields — subtitle and footer text
 * that live outside the poll data model (question / options).
 *
 * Copy overrides are stored alongside style overrides using namespaced keys
 * that cannot collide with the `field:optionId` convention used for HTML
 * style overrides.
 *
 * Footer text is persisted as a *suffix* (e.g. "TOTAL VOTES") because the
 * leading vote count changes on every render.  The bridge recombines
 * `String(totalVotes) + ' ' + suffix` after each render cycle.
 */

export const ARTIFACT_COPY_FIELDS = /** @type {const} */ (['subtitle', 'footer'])

export const PREZO_COPY_STYLE_KEYS = /** @type {const} */ ({
  subtitle: '__prezo_copy_subtitle',
  footerSuffix: '__prezo_copy_footer_suffix',
  footerLegacy: '__prezo_copy_footer'
})

// Generic text-override keys are namespaced as "__prezo_copy_text:<stableId>"
// so they share the style-overrides map with subtitle/footer without colliding
// with the "field:optionId" convention used for question/option-label HTML.
export const PREZO_TEXT_OVERRIDE_PREFIX = '__prezo_copy_text:'

// Position overrides live in the same style-overrides map under a separate
// prefix. Value is JSON-encoded {dx, dy, label?, role?} so we can carry
// hints that help re-match the override after an AI rebuild.
export const PREZO_POSITION_OVERRIDE_PREFIX = '__prezo_pos:'

/** @param {string} field */
export function isArtifactCopyField(field) {
  return field === 'subtitle' || field === 'footer' || isArtifactTextField(field)
}

/**
 * Generic-text fields are encoded as "text:<stableId>" on the wire.
 * @param {string} field
 */
export function isArtifactTextField(field) {
  return typeof field === 'string' && field.indexOf('text:') === 0
}

/** @param {string} field */
export function getArtifactTextFieldId(field) {
  if (!isArtifactTextField(field)) return ''
  return field.slice('text:'.length)
}

/** @param {string} stableId */
export function buildArtifactTextOverrideKey(stableId) {
  return `${PREZO_TEXT_OVERRIDE_PREFIX}${stableId}`
}

/** @param {string} stableId */
export function buildArtifactPositionOverrideKey(stableId) {
  return `${PREZO_POSITION_OVERRIDE_PREFIX}${stableId}`
}

/**
 * @typedef {Object} ArtifactPositionOverride
 * @property {number} dx  Translation offset in CSS pixels (px), relative to the
 *   element's natural layout-flow position.
 * @property {number} dy
 * @property {string} [label]  Optional human-readable label snapshot (e.g. "Poll
 *   Question", "Option Row 1"). Used to re-match after an AI rebuild changes the
 *   DOM-path hash.
 * @property {string} [role]  Optional semantic kind snapshot (e.g. "option-row",
 *   "poll-question"). Used as a fallback re-match key.
 * @property {string} [optionId]  For option-row positions, the row's data-option-id
 *   so we can re-attach even if the row's sibling index changed.
 */

/**
 * Serialize a position override into the string value stored in style_overrides.
 * @param {ArtifactPositionOverride} pos
 * @returns {string}
 */
export function serializeArtifactPositionOverride(pos) {
  if (!pos || typeof pos !== 'object') return ''
  const dx = Number(pos.dx)
  const dy = Number(pos.dy)
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return ''
  const out = { dx, dy }
  if (typeof pos.label === 'string' && pos.label) out.label = pos.label
  if (typeof pos.role === 'string' && pos.role) out.role = pos.role
  if (typeof pos.optionId === 'string' && pos.optionId) out.optionId = pos.optionId
  return JSON.stringify(out)
}

/** @param {unknown} raw */
function parseArtifactPositionOverride(raw) {
  if (typeof raw !== 'string' || !raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const dx = Number(parsed.dx)
    const dy = Number(parsed.dy)
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null
    return {
      dx,
      dy,
      label: typeof parsed.label === 'string' ? parsed.label : undefined,
      role: typeof parsed.role === 'string' ? parsed.role : undefined,
      optionId: typeof parsed.optionId === 'string' ? parsed.optionId : undefined
    }
  } catch {
    return null
  }
}

/**
 * Strip leading digits (and optional whitespace) from footer text so we
 * store only the human-readable suffix.
 *
 *   "8 TOTAL VOTES"  → "TOTAL VOTES"
 *   "TOTAL VOTES"    → "TOTAL VOTES"
 *   "42"             → ""
 *
 * @param {string} raw
 * @returns {string}
 */
export function normalizeFooterTextToSuffix(raw) {
  if (typeof raw !== 'string') return ''
  return raw.replace(/^\d+\s*/, '').trim()
}

/**
 * Read copy values out of a merged style-overrides object.
 *
 * @param {Record<string, unknown> | null | undefined} styleOverrides
 * @returns {{ subtitle: string | undefined, footerSuffix: string | undefined, textOverrides: Record<string, string>, positionOverrides: Record<string, ArtifactPositionOverride> }}
 */
export function extractCopyFromStyleOverrides(styleOverrides) {
  if (!styleOverrides || typeof styleOverrides !== 'object') {
    return { subtitle: undefined, footerSuffix: undefined, textOverrides: {}, positionOverrides: {} }
  }

  const subtitle =
    typeof styleOverrides[PREZO_COPY_STYLE_KEYS.subtitle] === 'string'
      ? styleOverrides[PREZO_COPY_STYLE_KEYS.subtitle]
      : undefined

  let footerSuffix
  if (typeof styleOverrides[PREZO_COPY_STYLE_KEYS.footerSuffix] === 'string') {
    footerSuffix = styleOverrides[PREZO_COPY_STYLE_KEYS.footerSuffix]
  } else if (typeof styleOverrides[PREZO_COPY_STYLE_KEYS.footerLegacy] === 'string') {
    footerSuffix = normalizeFooterTextToSuffix(styleOverrides[PREZO_COPY_STYLE_KEYS.footerLegacy])
  }

  const textOverrides = {}
  const positionOverrides = {}
  for (const key of Object.keys(styleOverrides)) {
    if (key.indexOf(PREZO_TEXT_OVERRIDE_PREFIX) === 0) {
      const value = styleOverrides[key]
      if (typeof value !== 'string') continue
      const stableId = key.slice(PREZO_TEXT_OVERRIDE_PREFIX.length)
      if (stableId) textOverrides[stableId] = value
      continue
    }
    if (key.indexOf(PREZO_POSITION_OVERRIDE_PREFIX) === 0) {
      const parsed = parseArtifactPositionOverride(styleOverrides[key])
      if (!parsed) continue
      const stableId = key.slice(PREZO_POSITION_OVERRIDE_PREFIX.length)
      if (stableId) positionOverrides[stableId] = parsed
      continue
    }
  }

  return { subtitle, footerSuffix, textOverrides, positionOverrides }
}

/**
 * Merge pending copy edits into a style-overrides object (immutably).
 *
 * @param {Record<string, unknown>} styleOverrides
 * @param {{ subtitle?: string, footerSuffix?: string, textOverrides?: Record<string, string>, positionOverrides?: Record<string, ArtifactPositionOverride> } | null | undefined} pending
 * @returns {Record<string, unknown>}
 */
export function mergeCopyIntoStyleOverrides(styleOverrides, pending) {
  const next = { ...styleOverrides }

  if (pending && typeof pending.subtitle === 'string') {
    next[PREZO_COPY_STYLE_KEYS.subtitle] = pending.subtitle
  }
  if (pending && typeof pending.footerSuffix === 'string') {
    next[PREZO_COPY_STYLE_KEYS.footerSuffix] = pending.footerSuffix
    delete next[PREZO_COPY_STYLE_KEYS.footerLegacy]
  }
  if (pending && pending.textOverrides && typeof pending.textOverrides === 'object') {
    for (const [stableId, value] of Object.entries(pending.textOverrides)) {
      if (!stableId || typeof value !== 'string') continue
      next[buildArtifactTextOverrideKey(stableId)] = value
    }
  }
  if (pending && pending.positionOverrides && typeof pending.positionOverrides === 'object') {
    for (const [stableId, pos] of Object.entries(pending.positionOverrides)) {
      if (!stableId) continue
      const key = buildArtifactPositionOverrideKey(stableId)
      // Allow null/undefined to mean "delete this override" so the host can
      // clear a position after a reset.
      if (pos === null || pos === undefined) {
        delete next[key]
        continue
      }
      const serialized = serializeArtifactPositionOverride(pos)
      if (serialized) next[key] = serialized
    }
  }

  return next
}

/**
 * Keep only namespaced subtitle/footer copy keys from a merged style-overrides object.
 * (The artifact host may instead merge saved + pending + copy and prune stale
 * question/option-label entries against the live poll after an AI edit so unsaved
 * manual rich-text still applies when the underlying copy still matches.)
 *
 * @param {Record<string, unknown> | null | undefined} styleOverrides
 * @returns {Record<string, string>}
 */
export function rebuildStyleOverridesKeepingCopyOnly(styleOverrides) {
  const copy = extractCopyFromStyleOverrides(styleOverrides || {})
  const next = {}
  if (copy.subtitle !== undefined) {
    next[PREZO_COPY_STYLE_KEYS.subtitle] = copy.subtitle
  }
  if (copy.footerSuffix !== undefined) {
    next[PREZO_COPY_STYLE_KEYS.footerSuffix] = copy.footerSuffix
  }
  for (const [stableId, value] of Object.entries(copy.textOverrides || {})) {
    if (stableId && typeof value === 'string') {
      next[buildArtifactTextOverrideKey(stableId)] = value
    }
  }
  for (const [stableId, pos] of Object.entries(copy.positionOverrides || {})) {
    if (!stableId) continue
    const serialized = serializeArtifactPositionOverride(pos)
    if (serialized) next[buildArtifactPositionOverrideKey(stableId)] = serialized
  }
  return next
}
