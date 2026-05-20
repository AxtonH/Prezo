/**
 * Host-side handler for element-size changes inside the artifact iframe.
 *
 * The bridge script emits a `prezo-size-changed` message whenever the user
 * finishes resizing a selected element via the 8 handles painted around the
 * selection overlay. This module mirrors createArtifactPositionHandler so
 * the integration point in poll-game-gamified-app.js stays consistent:
 * construct once, route messages in, expose merged overrides + AI context.
 *
 * Size is stored as a scale factor (sx, sy) relative to the element's
 * natural rendered size, not as absolute pixels. That choice keeps the
 * override meaningful across AI rebuilds that change the element's base
 * dimensions: "20% bigger" stays correct even when the AI emits a
 * different default width.
 */

/**
 * @typedef {Object} ArtifactSizeOverride
 * @property {number} sx  Horizontal scale factor (1.0 = natural width).
 * @property {number} sy  Vertical scale factor (1.0 = natural height).
 * @property {string} [label]  Element label snapshot for re-match.
 * @property {string} [role]   Semantic kind snapshot.
 * @property {string} [optionId]  Owning option-row id, when applicable.
 * @property {string} [anchor]  Anchor selector for role:"element" rescue.
 */

/**
 * @param {Object} args
 * @param {(stableId: string, override: ArtifactSizeOverride, rawMessage: any) => void} [args.onSizeChange]
 */
export function createArtifactSizeHandler({ onSizeChange } = {}) {
  /** @type {Record<string, ArtifactSizeOverride>} */
  let pending = {}

  function handleSizeChanged(message) {
    const stableId = typeof message.stableId === 'string' ? message.stableId : ''
    if (!stableId) return
    const sx = Number(message.sx)
    const sy = Number(message.sy)
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) return
    if (sx <= 0 || sy <= 0) return
    const next = {
      sx,
      sy,
      label: typeof message.label === 'string' ? message.label : undefined,
      role: typeof message.role === 'string' ? message.role : undefined,
      optionId: typeof message.optionId === 'string' ? message.optionId : undefined,
      anchor: typeof message.anchor === 'string' && message.anchor ? message.anchor : undefined
    }
    pending[stableId] = next
    if (typeof onSizeChange === 'function') {
      onSizeChange(stableId, next, message)
    }
  }

  /** @returns {Record<string, ArtifactSizeOverride>} */
  function getPendingSizeOverrides() {
    return { ...pending }
  }

  function clearPendingSizeOverrides() {
    pending = {}
  }

  /**
   * Merge saved + pending overrides into a single map (pending wins).
   * @param {Record<string, ArtifactSizeOverride> | null | undefined} saved
   * @returns {Record<string, ArtifactSizeOverride>}
   */
  function getMergedSizeOverrides(saved) {
    const out = {}
    if (saved && typeof saved === 'object') {
      for (const [k, v] of Object.entries(saved)) {
        if (v && typeof v === 'object') out[k] = v
      }
    }
    for (const [k, v] of Object.entries(pending)) {
      out[k] = v
    }
    return out
  }

  /**
   * Serialize for the AI prompt context.
   * @param {Record<string, ArtifactSizeOverride>} overrides
   */
  function buildAiSizeContext(overrides) {
    if (!overrides || typeof overrides !== 'object') return []
    const out = []
    for (const [stableId, v] of Object.entries(overrides)) {
      if (!v || typeof v !== 'object') continue
      const sx = Number(v.sx)
      const sy = Number(v.sy)
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue
      if (sx === 1 && sy === 1) continue
      const entry = { stableId, sx, sy }
      if (typeof v.label === 'string' && v.label) entry.label = v.label
      if (typeof v.role === 'string' && v.role) entry.role = v.role
      if (typeof v.optionId === 'string' && v.optionId) entry.optionId = v.optionId
      out.push(entry)
    }
    return out
  }

  return {
    handleSizeChanged,
    getPendingSizeOverrides,
    clearPendingSizeOverrides,
    getMergedSizeOverrides,
    buildAiSizeContext
  }
}
