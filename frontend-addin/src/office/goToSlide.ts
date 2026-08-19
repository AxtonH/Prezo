/**
 * Navigate the open deck to a slide by its numeric sheet id — the same id
 * bridge embedWarmup and the conductors use (goToByIdAsync takes the numeric
 * sheet id, not the PowerPoint.js "sheetId#creationId" form).
 *
 * Resolves false (never throws) when the host can't navigate: outside
 * PowerPoint, API missing, host busy past the timeout, or a stale id whose
 * slide was deleted.
 */

const HOST_CALL_TIMEOUT_MS = 4000

export const goToDeckSlide = (sheetId: string): Promise<boolean> =>
  new Promise((resolve) => {
    let settled = false
    const finish = (ok: boolean) => {
      if (!settled) {
        settled = true
        resolve(ok)
      }
    }
    try {
      if (
        typeof Office === 'undefined' ||
        !Office.context?.document ||
        typeof Office.context.document.goToByIdAsync !== 'function' ||
        !Office.GoToType
      ) {
        finish(false)
        return
      }
      window.setTimeout(() => finish(false), HOST_CALL_TIMEOUT_MS)
      Office.context.document.goToByIdAsync(
        Number(sheetId),
        Office.GoToType.Slide,
        (result) => {
          finish(result?.status === Office.AsyncResultStatus.Succeeded)
        }
      )
    } catch {
      finish(false)
    }
  })
