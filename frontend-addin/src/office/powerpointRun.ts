/**
 * Serializes every `PowerPoint.run` batch for this task pane.
 * Win32 PowerPoint often returns `RichApi.GeneralException` when multiple batches overlap
 * (e.g. Q&A refresh, poll refresh, and bind tags racing on the same user action).
 *
 * Stall guard: Office host calls can hang forever (see the slideshow
 * conductor's hardening history), and a single hung batch used to freeze this
 * chain — and with it every widget update — until the taskpane reloaded. A
 * new batch now waits at most PREDECESSOR_TIMEOUT_MS for its predecessor,
 * then proceeds anyway: a rare overlapping-batch GeneralException (which
 * callers already survive) beats a permanent silent freeze.
 */

import { logWidgetDebug } from './widgetDebugLog'

const PREDECESSOR_TIMEOUT_MS = 30000

const STALL_SENTINEL = Symbol('ppt-run-predecessor-stalled')

let runTail: Promise<unknown> = Promise.resolve()
let runSeq = 0

export async function runPowerPoint<T>(
  batch: (context: PowerPoint.RequestContext) => Promise<T>
): Promise<T> {
  runSeq += 1
  const id = runSeq
  const predecessor = runTail
  const gate = Promise.race([
    predecessor.then(
      () => undefined,
      () => undefined
    ),
    new Promise<typeof STALL_SENTINEL>((resolve) => {
      const timer = window.setTimeout(() => resolve(STALL_SENTINEL), PREDECESSOR_TIMEOUT_MS)
      /** Don't keep the webview alive for a timer nobody needs once the
       * predecessor settles. */
      void predecessor.finally(() => window.clearTimeout(timer)).catch(() => undefined)
    })
  ]).then((value) => {
    if (value === STALL_SENTINEL) {
      logWidgetDebug('ppt-run-predecessor-stalled', { batchId: id })
    }
  })

  const job = gate.then(() => PowerPoint.run(batch))
  runTail = job.then(
    () => undefined,
    () => undefined
  )
  return job
}
