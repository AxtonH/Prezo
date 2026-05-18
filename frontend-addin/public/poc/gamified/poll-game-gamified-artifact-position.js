/**
 * Host-side handler for element-position changes inside the artifact iframe.
 *
 * The bridge script (in poll-game-gamified-artifact-textstyle.js) emits a
 * `prezo-position-changed` message whenever the user finishes dragging a
 * selected element. This module:
 *
 *  1. Tracks pending position overrides keyed by stableId.
 *  2. Merges them with the artifact's saved overrides for inclusion in
 *     `meta.positionOverrides` on the next payload push and in the saved
 *     style_overrides on the next library save.
 *  3. Exposes a snapshot for the AI editor context so artifact edits know
 *     the current layout.
 *
 * Mirrors the shape of createArtifactSelectionHandler and
 * createArtifactTextEditHandler so the integration point in
 * poll-game-gamified-app.js stays consistent.
 */

/**
 * @typedef {Object} ArtifactPositionOverride
 * @property {number} dx
 * @property {number} dy
 * @property {string} [label]
 * @property {string} [role]
 * @property {string} [optionId]
 */

/**
 * @param {Object} args
 * @param {(stableId: string, override: ArtifactPositionOverride) => void} [args.onPositionChange]
 *   Invoked when the host should persist the change (push to bridge style_overrides
 *   storage, save, etc.).
 */
export function createArtifactPositionHandler({ onPositionChange } = {}) {
  /** @type {Record<string, ArtifactPositionOverride>} */
  let pending = {}

  function handlePositionChanged(message) {
    const stableId = typeof message.stableId === 'string' ? message.stableId : ''
    if (!stableId) return
    const dx = Number(message.dx)
    const dy = Number(message.dy)
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return
    const next = {
      dx,
      dy,
      label: typeof message.label === 'string' ? message.label : undefined,
      role: typeof message.role === 'string' ? message.role : undefined,
      optionId: typeof message.optionId === 'string' ? message.optionId : undefined
    }
    pending[stableId] = next
    if (typeof onPositionChange === 'function') {
      onPositionChange(stableId, next)
    }
  }

  /** @returns {Record<string, ArtifactPositionOverride>} */
  function getPendingPositionOverrides() {
    return { ...pending }
  }

  function clearPendingPositionOverrides() {
    pending = {}
  }

  /**
   * Merge saved + pending overrides into a single map (pending wins).
   * @param {Record<string, ArtifactPositionOverride> | null | undefined} saved
   * @returns {Record<string, ArtifactPositionOverride>}
   */
  function getMergedPositionOverrides(saved) {
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
   * Serialize the position overrides for the AI prompt context. Returns a
   * compact array shape that's friendlier to LLMs than the keyed map.
   * @param {Record<string, ArtifactPositionOverride>} overrides
   * @returns {Array<{ stableId: string, dx: number, dy: number, label?: string, role?: string, optionId?: string }>}
   */
  function buildAiPositionContext(overrides) {
    if (!overrides || typeof overrides !== 'object') return []
    const out = []
    for (const [stableId, v] of Object.entries(overrides)) {
      if (!v || typeof v !== 'object') continue
      const dx = Number(v.dx)
      const dy = Number(v.dy)
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) continue
      if (dx === 0 && dy === 0) continue
      const entry = { stableId, dx, dy }
      if (typeof v.label === 'string' && v.label) entry.label = v.label
      if (typeof v.role === 'string' && v.role) entry.role = v.role
      if (typeof v.optionId === 'string' && v.optionId) entry.optionId = v.optionId
      out.push(entry)
    }
    return out
  }

  return {
    handlePositionChanged,
    getPendingPositionOverrides,
    clearPendingPositionOverrides,
    getMergedPositionOverrides,
    buildAiPositionContext
  }
}
