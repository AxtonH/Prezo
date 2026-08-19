/**
 * One-time taskpane widening: PowerPoint opens taskpanes fairly narrow and
 * users rarely discover the drag handle, so on the very first open we grow
 * the pane ~40% via Office.extensionLifeCycle.taskpane.setWidth (TaskPaneApi
 * 1.1 — PowerPoint on Windows desktop 2507+ and Mac 16.100.4+; absent or
 * inert on PowerPoint web and older hosts).
 *
 * The done-flag is only written after OBSERVING the pane actually grow —
 * hosts that ignore the call (old build, out-of-range width) leave the flag
 * unset, so the nudge retries next boot and kicks in once the user's Office
 * updates. After one observed success the width belongs to the user: Office
 * remembers their drag, and re-applying every boot would compound and fight
 * them. The flag key is versioned — bumping the factor re-nudges once.
 */

const WIDEN_DONE_KEY = 'prezo.taskpaneWidenedV2'
const WIDEN_FACTOR = 1.4
/** Don't grow past this even if the user starts from an already-wide pane. */
const MAX_TARGET_PX = 680
/** The host resizes asynchronously; measure after this settle delay. */
const VERIFY_DELAY_MS = 1500
/** innerWidth can jitter by a scrollbar; require real growth to call it done. */
const MIN_OBSERVED_GROWTH_PX = 20

type TaskPaneRuntime = { setWidth?: (width: number) => void }

export function widenTaskpaneOnce(): void {
  let storage: Storage | null = null
  try {
    storage = window.localStorage
  } catch {
    return
  }
  if (!storage) {
    return
  }
  const doneStorage = storage
  if (doneStorage.getItem(WIDEN_DONE_KEY)) {
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
  const before = Math.round(window.innerWidth)
  if (!Number.isFinite(before) || before <= 0) {
    return
  }
  const target = Math.min(Math.round(before * WIDEN_FACTOR), MAX_TARGET_PX)
  if (target <= before) {
    // Already at or past the cap — nothing to do, and nothing to retry.
    doneStorage.setItem(WIDEN_DONE_KEY, new Date().toISOString())
    return
  }
  try {
    taskpane.setWidth(target)
  } catch {
    // Host refused the call — leave the flag unset and retry next boot.
    return
  }
  window.setTimeout(() => {
    if (Math.round(window.innerWidth) - before >= MIN_OBSERVED_GROWTH_PX) {
      try {
        doneStorage.setItem(WIDEN_DONE_KEY, new Date().toISOString())
      } catch {
        // Flag write failed — worst case the nudge re-runs next boot.
      }
    }
    // No growth observed: the host ignored the call (old build, web, or an
    // out-of-range width). Leave the flag unset so the next boot retries.
  }, VERIFY_DELAY_MS)
}
