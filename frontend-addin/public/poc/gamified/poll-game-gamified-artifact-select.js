/**
 * Host-side handler for element-selection messages from the artifact iframe.
 *
 * The bridge script (in poll-game-gamified-artifact-textstyle.js) classifies
 * the clicked element into a semantic group (background, foreground, poll
 * question, option row, etc.) and posts `prezo-element-selected` messages
 * back to the host. This module:
 *
 *  1. Tracks the currently selected element descriptor.
 *  2. Exposes accessors so other host code (toolbars, panels, future
 *     move/resize controls) can read what's selected.
 *  3. Forwards selection changes to an optional listener so the host UI
 *     can react without this module knowing about UI specifics.
 *
 * Mirrors the shape of createArtifactTextEditHandler so the integration
 * point in poll-game-gamified-app.js stays consistent.
 */

/**
 * @typedef {Object} ArtifactSelection
 * @property {string} kind  One of: 'scene', 'background', 'foreground',
 *   'poll-question', 'poll-subtitle', 'poll-footer', 'options-container',
 *   'option-row', 'option-label', 'option-votes', 'option-percentage',
 *   'option-rank', 'text', 'element'.
 * @property {string} id  Stable identifier for the selection target:
 *   data-option-id, data-prezo-text-id, or a DOM-path hash for arbitrary
 *   elements. Empty string for singleton groups (background/foreground/scene).
 * @property {string} label  Human-readable label for UI display.
 * @property {{ x: number, y: number, w: number, h: number } | null} rect
 *   Bounding rect in iframe-local CSS pixels at message time. Null when
 *   the element is gone (deselect).
 * @property {string} optionId  For option-* kinds, the parent row's id.
 */

/**
 * Create the host-side selection handler.
 *
 * @param {Object} args
 * @param {(selection: ArtifactSelection | null) => void} [args.onSelectionChange]
 *   Optional listener invoked whenever selection changes.
 */
export function createArtifactSelectionHandler({ onSelectionChange } = {}) {
  /** @type {ArtifactSelection | null} */
  let currentSelection = null

  /**
   * Entry point called from handleArtifactFrameMessage when the message
   * type is `prezo-element-selected`. A null/empty selection clears state.
   */
  function handleElementSelected(message) {
    const kind = typeof message.kind === 'string' ? message.kind : ''
    if (!kind) {
      setSelection(null)
      return
    }
    const next = {
      kind,
      id: typeof message.id === 'string' ? message.id : '',
      label: typeof message.label === 'string' ? message.label : kind,
      rect: normalizeRect(message.rect),
      optionId: typeof message.optionId === 'string' ? message.optionId : ''
    }
    setSelection(next)
  }

  function setSelection(next) {
    if (selectionsEqual(currentSelection, next)) {
      // Rect-only changes (resize / pan) should still fan out so a host
      // overlay can follow.
      if (currentSelection && next && !rectsEqual(currentSelection.rect, next.rect)) {
        currentSelection = next
        if (typeof onSelectionChange === 'function') onSelectionChange(currentSelection)
      }
      return
    }
    currentSelection = next
    if (typeof onSelectionChange === 'function') onSelectionChange(currentSelection)
  }

  /** Clear the host-side selection without telling the iframe. */
  function clearSelection() {
    setSelection(null)
  }

  /**
   * Returns the most recently received selection descriptor, or null.
   * @returns {ArtifactSelection | null}
   */
  function getCurrentSelection() {
    return currentSelection
  }

  return {
    handleElementSelected,
    clearSelection,
    getCurrentSelection
  }
}

function normalizeRect(rect) {
  if (!rect || typeof rect !== 'object') return null
  const x = Number(rect.x)
  const y = Number(rect.y)
  const w = Number(rect.w)
  const h = Number(rect.h)
  if (![x, y, w, h].every(Number.isFinite)) return null
  return { x, y, w, h }
}

function selectionsEqual(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  return a.kind === b.kind && a.id === b.id && a.optionId === b.optionId
}

function rectsEqual(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
}
