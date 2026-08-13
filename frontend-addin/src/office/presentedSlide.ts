/**
 * Sheet id (numeric portion of PowerPoint.Slide.id "sheetId#creationId") of
 * the slide currently presented or selected, via the common API. Mirrors the
 * slideShowConductor's private reader (kept separate: the conductor imports
 * widgetShapes, so widgetShapes cannot import the conductor back).
 *
 * Used by updatePollWidget to animate bars only on the slide the audience is
 * actually looking at — off-screen widgets snap instead, saving ~20 host
 * round trips per widget per pass during slideshows.
 */

const PRESENTED_SLIDE_TIMEOUT_MS = 2000

export const getPresentedSheetId = (): Promise<string | null> =>
  new Promise((resolve) => {
    let settled = false
    const finish = (value: string | null) => {
      if (!settled) {
        settled = true
        resolve(value)
      }
    }
    window.setTimeout(() => finish(null), PRESENTED_SLIDE_TIMEOUT_MS)
    try {
      if (
        typeof Office === 'undefined' ||
        !Office.context?.document ||
        typeof Office.context.document.getSelectedDataAsync !== 'function'
      ) {
        finish(null)
        return
      }
      Office.context.document.getSelectedDataAsync(
        Office.CoercionType.SlideRange,
        (result) => {
          if (result?.status === Office.AsyncResultStatus.Succeeded) {
            const slide = (result.value as { slides?: Array<{ id?: unknown }> })
              ?.slides?.[0]
            finish(
              slide?.id !== undefined && slide?.id !== null
                ? String(slide.id).split('#')[0]
                : null
            )
          } else {
            finish(null)
          }
        }
      )
    } catch {
      finish(null)
    }
  })
