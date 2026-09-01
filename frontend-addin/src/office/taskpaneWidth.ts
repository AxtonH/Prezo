/**
 * Taskpane widening: PowerPoint opens taskpanes fairly narrow and users
 * rarely discover the drag handle, so the pane is grown ~40% via
 * Office.extensionLifeCycle.taskpane.setWidth (TaskPaneApi 1.1 — PowerPoint
 * on Windows desktop 2507+ and Mac 16.100.4+; absent or inert on PowerPoint
 * web and older hosts, where this is a silent no-op).
 *
 * Field-tested behavior (19/08/2026): PowerPoint does NOT persist a
 * programmatic width across pane reopens or app restarts — every open comes
 * back at the default width. So a run-once flag is the wrong model; instead
 * the TARGET width is computed once (1.4x the first-seen default, clamped)
 * and remembered, and every boot re-applies it when the pane comes up
 * narrower. The pane is never shrunk: a user who drags wider than the
 * target stays wider for their session.
 *
 * NOTE: index.html carries an inline ES5 copy of this logic that fires as
 * soon as office.js is ready — before the app bundle has even parsed — so
 * the pane expands near-instantly on open instead of stuttering. The
 * constants and clamp/slack rules there MUST match this file; change both
 * together. This module remains the pre-first-paint render gate and the
 * fallback when the early script did not run.
 */

const TARGET_KEY = 'prezo.taskpaneTargetWidthPx'
const WIDEN_FACTOR = 1.4
const MIN_TARGET_PX = 360
const MAX_TARGET_PX = 680
/** innerWidth can jitter by a scrollbar; only apply when meaningfully narrower. */
const APPLY_SLACK_PX = 20

type TaskPaneRuntime = { setWidth?: (width: number) => void }

const clampTarget = (value: number): number =>
  Math.min(Math.max(Math.round(value), MIN_TARGET_PX), MAX_TARGET_PX)

/** Returns true when a resize was actually requested from the host. */
export function ensureTaskpaneWidth(): boolean {
  const taskpane = (
    typeof Office !== 'undefined'
      ? (Office as unknown as { extensionLifeCycle?: { taskpane?: TaskPaneRuntime } })
          .extensionLifeCycle?.taskpane
      : undefined
  ) as TaskPaneRuntime | undefined
  if (!taskpane || typeof taskpane.setWidth !== 'function') {
    return false
  }
  const current = Math.round(window.innerWidth)
  if (!Number.isFinite(current) || current <= 0) {
    return false
  }
  let storage: Storage | null = null
  try {
    storage = window.localStorage
  } catch {
    storage = null
  }
  let target = 0
  const stored = storage ? parseInt(storage.getItem(TARGET_KEY) || '', 10) : NaN
  if (Number.isFinite(stored) && stored >= MIN_TARGET_PX && stored <= MAX_TARGET_PX) {
    target = stored
  } else {
    // First boot with this policy: the pane is at (or near) PowerPoint's
    // default width, so 1.4x of what we see now is the lasting target.
    target = clampTarget(current * WIDEN_FACTOR)
    try {
      storage?.setItem(TARGET_KEY, String(target))
    } catch {
      // Not persistable — recomputed next boot from the default width again.
    }
  }
  if (current >= target - APPLY_SLACK_PX) {
    return false
  }
  try {
    // Out-of-range widths (beyond 50% of the client window) are silently
    // ignored by the host — acceptable: the pane just keeps its size.
    taskpane.setWidth(target)
    return true
  } catch {
    // Host refused the call (old build) — nothing to do until Office updates.
    return false
  }
}

/**
 * Shared-runtime reopen path. The manifest gives the taskpane a
 * lifetime="long" shared runtime, so closing the pane hides this runtime
 * instead of destroying it and reopening re-attaches to the already-rendered
 * app — no webview boot, no bundle, no office.js fetch. The host still
 * re-shows the pane chrome at its default (narrow) width, so re-apply the
 * remembered target the moment visibility flips back; with Office already
 * initialized this lands within a frame or two instead of after a full cold
 * boot. Office.addin only exists under a shared runtime — on classic
 * (per-open) runtimes this registers nothing and boot behaves as before.
 */
export function watchTaskpaneVisibilityForWidth(): void {
  const addin = (
    typeof Office !== 'undefined'
      ? (
          Office as unknown as {
            addin?: {
              onVisibilityModeChanged?: (
                handler: (message: { visibilityMode?: string }) => void
              ) => Promise<unknown>
            }
          }
        ).addin
      : undefined
  )
  if (!addin || typeof addin.onVisibilityModeChanged !== 'function') {
    return
  }
  try {
    void addin
      .onVisibilityModeChanged((message) => {
        const mode = String(message?.visibilityMode || '').toLowerCase()
        if (mode && mode !== 'hidden') {
          ensureTaskpaneWidth()
        }
      })
      .catch(() => {
        // Host refused the registration (unsupported build) — reopen then
        // falls back to whatever width the host chooses.
      })
  } catch {
    // Same fallback: never let width plumbing break boot.
  }
}

/**
 * Boot-time variant: widen BEFORE the app's first paint and hold rendering
 * until the host has applied the width (first resize event) or a short
 * timeout passes. Painting first and resizing after is what made the pane
 * visibly flicker on open — the UI laid out at the narrow default width and
 * then reflowed. setWidth gives no completion signal, so the resize event is
 * the applied-width cue; the timeout covers hosts that silently ignore the
 * call (out-of-range width, older builds).
 */
export function settleTaskpaneWidthBeforeFirstPaint(timeoutMs = 400): Promise<void> {
  if (!ensureTaskpaneWidth()) {
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) {
        return
      }
      settled = true
      window.removeEventListener('resize', finish)
      // One frame so layout at the new width is committed before React paints.
      requestAnimationFrame(() => resolve())
    }
    window.addEventListener('resize', finish)
    window.setTimeout(finish, timeoutMs)
  })
}
