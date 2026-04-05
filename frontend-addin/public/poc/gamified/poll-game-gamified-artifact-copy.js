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

/** @param {string} field */
export function isArtifactCopyField(field) {
  return field === 'subtitle' || field === 'footer'
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
 * @returns {{ subtitle: string | undefined, footerSuffix: string | undefined }}
 */
export function extractCopyFromStyleOverrides(styleOverrides) {
  if (!styleOverrides || typeof styleOverrides !== 'object') {
    return { subtitle: undefined, footerSuffix: undefined }
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

  return { subtitle, footerSuffix }
}

/**
 * Merge pending copy edits into a style-overrides object (immutably).
 *
 * @param {Record<string, unknown>} styleOverrides
 * @param {{ subtitle?: string, footerSuffix?: string } | null | undefined} pending
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

  return next
}

/**
 * After an AI artifact edit, drop manual HTML/style overrides for poll fields so the
 * new base artifact wins, but keep subtitle/footer copy keys (namespaced).
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
  return next
}
