/**
 * One-time taskpane widening: PowerPoint opens taskpanes fairly narrow and
 * users rarely discover the drag handle, so on the very first open we grow
 * the pane ~20% via Office.extensionLifeCycle.taskpane.setWidth (TaskPaneApi
 * 1.1 — PowerPoint on Windows desktop 2507+ and Mac 16.100.4+; absent on
 * PowerPoint web and older hosts, where this is a silent no-op).
 *
 * Once per machine only (localStorage flag): after the first nudge the pane
 * width belongs to the user — Office remembers their drag, and re-applying
 * 1.2x every boot would compound and fight them. On hosts without the API
 * the flag stays unset, so a later Office update applies the nudge once.
 */

const WIDEN_DONE_KEY = 'prezo.taskpaneWidenedV1'
const WIDEN_FACTOR = 1.2
/** Don't grow past this even if the user starts from an already-wide pane. */
const MAX_TARGET_PX = 600

type TaskPaneRuntime = { setWidth?: (width: number) => void }

export function widenTaskpaneOnce(): void {
  let storage: Storage | null = null
  try {
    storage = window.localStorage
  } catch {
    return
  }
  if (!storage || storage.getItem(WIDEN_DONE_KEY)) {
    return
  }
  const taskpane = (
    typeof Office !== 'undefined'
      ? (Office as unknown as { extensionLifeCycle?: { taskpane?: TaskPaneRuntime } })
          .extensionLifeCycle?.taskpane
      : undefined
  ) as TaskPaneRuntime | undefined
  if (!taskpane || typeof taskpane.setWidth !== 'function') {
    return
  }
  const current = Math.round(window.innerWidth)
  if (!Number.isFinite(current) || current <= 0) {
    return
  }
  const target = Math.min(Math.round(current * WIDEN_FACTOR), MAX_TARGET_PX)
  if (target <= current) {
    return
  }
  try {
    // Out-of-range widths (beyond 50% of the client window) are silently
    // ignored by the host — acceptable: the pane just keeps its size.
    taskpane.setWidth(target)
    storage.setItem(WIDEN_DONE_KEY, new Date().toISOString())
  } catch {
    // Host refused the call — leave the flag unset and retry next boot.
  }
}
