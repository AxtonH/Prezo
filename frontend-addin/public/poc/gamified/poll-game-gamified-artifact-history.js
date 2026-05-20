/**
 * Host-side undo/redo for artifact mutations.
 *
 * Captures discrete, user-confirmed edits to the artifact:
 *   - position drags  (kind: 'position')
 *   - text content    (kind: 'text-content')
 *   - text styling    (kind: 'text-html')
 *
 * Each entry stores BOTH the "before" and "after" state so undo and redo
 * are symmetric — just apply the opposite snapshot. Same-target text-content
 * edits within a short window are coalesced into a single entry so the user
 * doesn't have to press Cmd+Z once per keystroke.
 *
 * Scope is per-artifact. The host clears the stacks on AI rebuilds and
 * artifact swaps because the DOM those entries targeted no longer exists.
 *
 * Mirrors the shape of the existing handler modules (textedit, select,
 * position) so the integration point in poll-game-gamified-app.js stays
 * consistent: construct once, route messages in, expose undo/redo to UI.
 */

/**
 * @typedef {Object} PositionState
 * @property {number} dx
 * @property {number} dy
 * @property {string} [label]
 * @property {string} [role]
 * @property {string} [optionId]
 */

/**
 * @typedef {Object} HistoryEntry
 * @property {'position' | 'size' | 'text-content' | 'text-html'} kind
 * @property {string} targetKey  Unique key for the target so we know when
 *   to coalesce. Position: stableId. Size: stableId. Text: `${field}:${optionId}`.
 * @property {*} before  Pre-action snapshot (depends on kind).
 * @property {*} after   Post-action snapshot (depends on kind).
 * @property {string} [label]  Human-readable description for telemetry / UI.
 * @property {number} ts  Wall-clock ms timestamp.
 */

const TEXT_COALESCE_WINDOW_MS = 1500
const MAX_HISTORY_ENTRIES = 100

/**
 * @param {Object} args
 * @param {(entry: HistoryEntry, direction: 'undo' | 'redo') => void} args.applyEntry
 *   Caller-supplied re-apply routine. Receives the entry and the direction,
 *   should produce the corresponding side-effects (iframe message, host
 *   override store update, etc.).
 * @param {(message: string) => void} [args.onStatus]
 *   Optional listener invoked with a short status string after each
 *   undo/redo/push. Useful for logging or a future toast.
 */
export function createArtifactHistoryHandler({ applyEntry, onStatus } = {}) {
  /** @type {HistoryEntry[]} */
  let undoStack = []
  /** @type {HistoryEntry[]} */
  let redoStack = []

  function status(message) {
    if (typeof onStatus === 'function') {
      try { onStatus(message) } catch {}
    }
  }

  function clear() {
    undoStack = []
    redoStack = []
  }

  function canUndo() { return undoStack.length > 0 }
  function canRedo() { return redoStack.length > 0 }

  /**
   * Push a new entry. Same-target text-content edits within the coalesce
   * window merge into the previous entry (so typing N characters is one
   * undo). Drags and style changes never coalesce.
   *
   * @param {HistoryEntry} entry
   */
  function push(entry) {
    if (!entry || !entry.kind) return
    redoStack = []  // any new edit invalidates redos
    const last = undoStack[undoStack.length - 1]
    const now = entry.ts || Date.now()
    const canCoalesce =
      entry.kind === 'text-content' &&
      last &&
      last.kind === 'text-content' &&
      last.targetKey === entry.targetKey &&
      now - last.ts <= TEXT_COALESCE_WINDOW_MS
    if (canCoalesce) {
      // Extend the prior entry: keep its "before", advance the "after" and ts.
      last.after = entry.after
      last.ts = now
      status(`coalesced ${entry.kind} on ${entry.targetKey}`)
      return
    }
    undoStack.push({ ...entry, ts: now })
    if (undoStack.length > MAX_HISTORY_ENTRIES) {
      undoStack.splice(0, undoStack.length - MAX_HISTORY_ENTRIES)
    }
    status(`push ${entry.kind} on ${entry.targetKey}`)
  }

  /**
   * Break any in-progress coalescing without committing a new entry.
   * Called when focus moves to a different field, or when a non-text action
   * occurs in the same flow, so the next text edit starts a new entry.
   */
  function breakCoalesce() {
    const last = undoStack[undoStack.length - 1]
    if (last) last.ts = 0
  }

  function undo() {
    if (undoStack.length === 0) return false
    const entry = undoStack.pop()
    try {
      applyEntry(entry, 'undo')
    } catch (e) {
      console.warn('[history] undo apply failed:', e)
      return false
    }
    redoStack.push(entry)
    if (redoStack.length > MAX_HISTORY_ENTRIES) {
      redoStack.splice(0, redoStack.length - MAX_HISTORY_ENTRIES)
    }
    status(`undo ${entry.kind} on ${entry.targetKey}`)
    return true
  }

  function redo() {
    if (redoStack.length === 0) return false
    const entry = redoStack.pop()
    try {
      applyEntry(entry, 'redo')
    } catch (e) {
      console.warn('[history] redo apply failed:', e)
      return false
    }
    undoStack.push(entry)
    if (undoStack.length > MAX_HISTORY_ENTRIES) {
      undoStack.splice(0, undoStack.length - MAX_HISTORY_ENTRIES)
    }
    status(`redo ${entry.kind} on ${entry.targetKey}`)
    return true
  }

  /**
   * Should we intercept this keydown event as an undo/redo trigger?
   * Returns 'undo' / 'redo' / null. Caller decides whether to preventDefault.
   *
   * Convention: Cmd/Ctrl+Z = undo; Cmd/Ctrl+Shift+Z = redo on Mac; Ctrl+Y = redo on Win.
   */
  function classifyKeyEvent(event) {
    if (!event || event.defaultPrevented) return null
    const mod = event.metaKey || event.ctrlKey
    if (!mod) return null
    const key = (event.key || '').toLowerCase()
    if (key === 'z') {
      return event.shiftKey ? 'redo' : 'undo'
    }
    if (key === 'y') {
      return 'redo'
    }
    return null
  }

  return {
    push,
    breakCoalesce,
    undo,
    redo,
    canUndo,
    canRedo,
    clear,
    classifyKeyEvent
  }
}
