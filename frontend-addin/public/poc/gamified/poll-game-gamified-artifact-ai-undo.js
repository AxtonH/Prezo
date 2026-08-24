/**
 * AI-edit undo/redo for the gamified station's artifact editor.
 *
 * Pure snapshot stack — no DOM, no rendering. A snapshot is the complete
 * pre-edit visual state of the artifact:
 *   { html, package, styleOverrides }
 * where styleOverrides is the MERGED map (saved + pendings) as it was before
 * the AI edit's reconciliation ran, so undoing restores manual drags / hides /
 * text styling exactly as the user last saw them.
 *
 * The composition root (app.js) owns applying snapshots back through
 * applyArtifactMarkup(..., { requestKind: 'rollback' }); this module only
 * manages the stacks:
 *   - pushSnapshot(pre-edit state) on every applied AI edit (clears redo)
 *   - undo(currentState)  -> snapshot to restore (current goes to redo stack)
 *   - redo(currentState)  -> snapshot to restore (current goes to undo stack)
 *   - discardLast() when an edit is rolled back by the render-health guard
 *     (the edit never stuck, so its snapshot must not linger)
 *   - clear() on fresh builds and artifact swaps
 *
 * Snapshots are deep-cloned on the way in AND out (packages/overrides are
 * plain JSON data), so later state mutations can never corrupt history.
 */

export const ARTIFACT_AI_UNDO_MAX_DEPTH = 10

export function createArtifactAiUndo(options = {}) {
  const maxDepth =
    Number.isInteger(options.maxDepth) && options.maxDepth > 0
      ? options.maxDepth
      : ARTIFACT_AI_UNDO_MAX_DEPTH
  /** @type {Array<{ html: string, package: object | null, styleOverrides: Record<string, unknown> }>} */
  const undoStack = []
  /** @type {Array<{ html: string, package: object | null, styleOverrides: Record<string, unknown> }>} */
  const redoStack = []

  function cloneSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return null
    const html = typeof snapshot.html === 'string' ? snapshot.html : ''
    if (!html.trim()) return null
    let pkg = null
    let overrides = {}
    try {
      pkg =
        snapshot.package && typeof snapshot.package === 'object'
          ? JSON.parse(JSON.stringify(snapshot.package))
          : null
      overrides =
        snapshot.styleOverrides && typeof snapshot.styleOverrides === 'object'
          ? JSON.parse(JSON.stringify(snapshot.styleOverrides))
          : {}
    } catch {
      return null
    }
    return { html, package: pkg, styleOverrides: overrides }
  }

  /** Record the pre-edit state of an applied AI edit. Clears the redo stack. */
  function pushSnapshot(snapshot) {
    const cloned = cloneSnapshot(snapshot)
    if (!cloned) return false
    undoStack.push(cloned)
    while (undoStack.length > maxDepth) {
      undoStack.shift()
    }
    redoStack.length = 0
    return true
  }

  /**
   * Pop the most recent pre-edit snapshot. `currentState` (the post-edit
   * state being left) is stored for redo. Returns null when there is nothing
   * to undo or the current state can't be captured (nothing is popped then).
   */
  function undo(currentState) {
    if (!undoStack.length) return null
    const current = cloneSnapshot(currentState)
    if (!current) return null
    const snapshot = undoStack.pop()
    redoStack.push(current)
    return cloneSnapshot(snapshot)
  }

  /** Inverse of undo. `currentState` goes back onto the undo stack. */
  function redo(currentState) {
    if (!redoStack.length) return null
    const current = cloneSnapshot(currentState)
    if (!current) return null
    const snapshot = redoStack.pop()
    undoStack.push(current)
    while (undoStack.length > maxDepth) {
      undoStack.shift()
    }
    return cloneSnapshot(snapshot)
  }

  /**
   * Drop the most recent snapshot without restoring it — used when the
   * render-health guard rolls an edit back automatically, so the failed
   * edit's snapshot doesn't leave a duplicate undo step.
   */
  function discardLast() {
    undoStack.pop()
  }

  /** Reset both stacks — fresh build or artifact swap. */
  function clear() {
    undoStack.length = 0
    redoStack.length = 0
  }

  function canUndo() {
    return undoStack.length > 0
  }

  function canRedo() {
    return redoStack.length > 0
  }

  return { pushSnapshot, undo, redo, discardLast, clear, canUndo, canRedo }
}
