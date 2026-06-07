/**
 * Host-side handler for element-delete (hide) messages from the artifact
 * iframe.
 *
 * "Delete" in the manual editor is non-destructive: the bridge script sets the
 * selected element to display:none and posts a `prezo-element-deleted` message.
 * This module mirrors createArtifactSizeHandler so the integration point in
 * poll-game-gamified-app.js stays consistent: construct once, route messages
 * in, expose merged overrides + AI context.
 *
 * The delete is stored as a hidden override ({hidden:true}) in the same
 * style_overrides map as position/size, keyed by stableId. Because it's an
 * override rather than an HTML mutation, it re-applies on render, persists to
 * the library, survives an AI rebuild when it still re-matches, and is
 * undo-able exactly like a move or resize.
 */

/**
 * @typedef {Object} ArtifactHiddenOverride
 * @property {boolean} hidden  Whether the element is hidden (deleted).
 * @property {string} [label]  Element label snapshot for re-match.
 * @property {string} [role]   Semantic kind snapshot.
 * @property {string} [optionId]  Owning option-row id, when applicable.
 * @property {string} [anchor]  Anchor selector for role:"element" rescue.
 */

/**
 * @param {Object} args
 * @param {(stableId: string, override: ArtifactHiddenOverride, rawMessage: any) => void} [args.onDelete]
 */
export function createArtifactDeleteHandler({ onDelete } = {}) {
  /** @type {Record<string, ArtifactHiddenOverride>} */
  let pending = {}

  function handleElementDeleted(message) {
    const stableId = typeof message.stableId === 'string' ? message.stableId : ''
    if (!stableId) return
    const hidden = message.hidden !== false
    const next = {
      hidden,
      label: typeof message.label === 'string' ? message.label : undefined,
      role: typeof message.role === 'string' ? message.role : undefined,
      optionId: typeof message.optionId === 'string' ? message.optionId : undefined,
      anchor: typeof message.anchor === 'string' && message.anchor ? message.anchor : undefined
    }
    pending[stableId] = next
    if (typeof onDelete === 'function') {
      onDelete(stableId, next, message)
    }
  }

  /** @returns {Record<string, ArtifactHiddenOverride>} */
  function getPendingHiddenOverrides() {
    return { ...pending }
  }

  function clearPendingHiddenOverrides() {
    pending = {}
  }

  /**
   * Merge saved + pending overrides into a single map (pending wins). A
   * pending {hidden:false} entry shadows a saved {hidden:true} so an un-delete
   * (undo) wins over a previously-persisted delete.
   * @param {Record<string, ArtifactHiddenOverride> | null | undefined} saved
   * @returns {Record<string, ArtifactHiddenOverride>}
   */
  function getMergedHiddenOverrides(saved) {
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
   * Serialize for the AI prompt context — only the still-hidden entries, so a
   * later AI edit knows which elements the user deleted and can omit them.
   * @param {Record<string, ArtifactHiddenOverride>} overrides
   */
  function buildAiHiddenContext(overrides) {
    if (!overrides || typeof overrides !== 'object') return []
    const out = []
    for (const [stableId, v] of Object.entries(overrides)) {
      if (!v || typeof v !== 'object') continue
      if (v.hidden !== true) continue
      const entry = { stableId, hidden: true }
      if (typeof v.label === 'string' && v.label) entry.label = v.label
      if (typeof v.role === 'string' && v.role) entry.role = v.role
      if (typeof v.optionId === 'string' && v.optionId) entry.optionId = v.optionId
      out.push(entry)
    }
    return out
  }

  return {
    handleElementDeleted,
    getPendingHiddenOverrides,
    clearPendingHiddenOverrides,
    getMergedHiddenOverrides,
    buildAiHiddenContext
  }
}
