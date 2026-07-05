/**
 * Taskpane-side slideshow conductor for WIDGET (native shape) poll slides.
 *
 * Embed slides drive their own polls (the content add-in webview reports
 * presence), but a poll widget is plain PowerPoint shapes — nothing lives
 * on the slide. The taskpane keeps running on the presenting machine
 * during a slideshow, so it conducts instead: while the deck is in "read"
 * view it tracks the presented slide via getSelectedDataAsync(SlideRange),
 * maps it to a bound poll through the PrezoPollWidget slide tags, and
 * reports on-air/off-air to the same presence endpoint the embeds use.
 * Auto-mode polls then open/close; pinned polls ignore it (backend policy).
 *
 * Slide identity bridging: the common API returns the numeric sheet id;
 * the PowerPoint.js Slide.id is "sheetId#creationId" — we key the map by
 * the sheet id portion (same bridge function-file.js uses for
 * insertSlidesFromBase64 targets).
 *
 * Hardening mirrors the embed conductor (docs/spike-embed-lifecycle.md):
 * every host await has a timeout, the tick guard self-clears, and a view
 * epoch discards verdicts whose reads straddled a view flip.
 */

import { api } from '../api/client'
import { runPowerPoint } from './powerpointRun'
import { isPowerPointShapeApiAvailable, POLL_WIDGET_SLIDE_TAGS } from './widgetShapes'

const TICK_READ_MS = 500
const TICK_EDIT_MS = 2000
const VIEW_RECHECK_TICKS = 6
const HOST_CALL_TIMEOUT_MS = 4000
const TICK_STALL_MS = 6000
const KEEPALIVE_MS = 5000
const MAP_MAX_AGE_MS = 30000

let sessionId: string | null = null
let loopStarted = false
let viewIsRead = false
let viewKnown = false
let viewEpoch = 0
let ticksSinceViewCheck = 0
let tickBusySince = 0
/** Numeric sheet id → bound poll id, for the current session's widget slides. */
let slidePollMap = new Map<string, string>()
let mapBuiltAt = 0
let mapBuiltForSession: string | null = null
/** Poll this conductor has reported on-air (null when nothing is on air). */
let reportedPollId: string | null = null
let lastReportAt = 0

const officeDocReady = (): boolean =>
  typeof Office !== 'undefined' && Boolean(Office.context?.document)

const withTimeout = <T>(
  run: (finish: (value: T) => void) => void,
  fallback: T
): Promise<T> =>
  new Promise((resolve) => {
    let settled = false
    const finish = (value: T) => {
      if (!settled) {
        settled = true
        resolve(value)
      }
    }
    window.setTimeout(() => finish(fallback), HOST_CALL_TIMEOUT_MS)
    try {
      run(finish)
    } catch {
      finish(fallback)
    }
  })

const getActiveView = (): Promise<string> =>
  withTimeout<string>((finish) => {
    if (!officeDocReady() || typeof Office.context.document.getActiveViewAsync !== 'function') {
      finish('')
      return
    }
    Office.context.document.getActiveViewAsync((result) => {
      finish(
        result?.status === Office.AsyncResultStatus.Succeeded
          ? String(result.value || '')
          : ''
      )
    })
  }, '')

/** Sheet id (numeric portion) of the slide currently presented/selected. */
const getCurrentSheetId = (): Promise<string | null> =>
  withTimeout<string | null>((finish) => {
    if (!officeDocReady() || typeof Office.context.document.getSelectedDataAsync !== 'function') {
      finish(null)
      return
    }
    Office.context.document.getSelectedDataAsync(
      Office.CoercionType.SlideRange,
      (result) => {
        if (result?.status === Office.AsyncResultStatus.Succeeded) {
          const slide = (result.value as { slides?: Array<{ id?: unknown }> })?.slides?.[0]
          finish(slide?.id !== undefined && slide?.id !== null ? String(slide.id) : null)
        } else {
          finish(null)
        }
      }
    )
  }, null)

const setViewIsRead = (isRead: boolean) => {
  if (isRead !== viewIsRead || !viewKnown) {
    viewEpoch += 1
  }
  if (isRead && !viewIsRead) {
    // Fresh show: re-read the widget map so bindings changed since the
    // last show are picked up.
    mapBuiltAt = 0
  }
  viewIsRead = isRead
  viewKnown = true
}

const rebuildSlidePollMap = async (forSession: string): Promise<void> => {
  if (!isPowerPointShapeApiAvailable()) {
    slidePollMap = new Map()
    mapBuiltAt = Date.now()
    mapBuiltForSession = forSession
    return
  }
  try {
    const next = new Map<string, string>()
    await runPowerPoint(async (context) => {
      const slides = context.presentation.slides
      slides.load('items/id')
      await context.sync()
      const infos = slides.items.map((slide) => {
        const sessionTag = slide.tags.getItemOrNullObject(POLL_WIDGET_SLIDE_TAGS.sessionTag)
        const bindingTag = slide.tags.getItemOrNullObject(POLL_WIDGET_SLIDE_TAGS.bindingTag)
        sessionTag.load('value')
        bindingTag.load('value')
        return { slide, sessionTag, bindingTag }
      })
      await context.sync()
      for (const info of infos) {
        if (info.sessionTag.isNullObject || info.sessionTag.value !== forSession) {
          continue
        }
        if (info.bindingTag.isNullObject || !info.bindingTag.value) {
          continue
        }
        next.set(String(info.slide.id).split('#')[0], info.bindingTag.value)
      }
    })
    slidePollMap = next
    mapBuiltAt = Date.now()
    mapBuiltForSession = forSession
  } catch {
    // Deck busy — keep the stale map (if any) and retry on a later tick.
    mapBuiltAt = slidePollMap.size > 0 ? Date.now() - MAP_MAX_AGE_MS / 2 : 0
  }
}

const report = async (forSession: string, pollId: string, onAir: boolean): Promise<boolean> => {
  try {
    await api.reportPollPresence(forSession, pollId, onAir, null)
    reportedPollId = onAir ? pollId : null
    lastReportAt = Date.now()
    return true
  } catch {
    return false
  }
}

const tick = async (): Promise<void> => {
  const now = Date.now()
  if (tickBusySince && now - tickBusySince < TICK_STALL_MS) {
    return
  }
  tickBusySince = now
  try {
    const forSession = sessionId
    if (!forSession) {
      return
    }
    if (!viewKnown || ticksSinceViewCheck >= VIEW_RECHECK_TICKS) {
      ticksSinceViewCheck = 0
      const view = await getActiveView()
      if (view) {
        setViewIsRead(view === 'read')
      }
    } else {
      ticksSinceViewCheck += 1
    }
    const epochAtDecision = viewEpoch
    let activePollId: string | null = null
    if (viewIsRead) {
      if (mapBuiltForSession !== forSession || now - mapBuiltAt > MAP_MAX_AGE_MS) {
        await rebuildSlidePollMap(forSession)
      }
      const currentSheetId = await getCurrentSheetId()
      if (currentSheetId) {
        activePollId = slidePollMap.get(currentSheetId) ?? null
      }
    }
    if (viewEpoch !== epochAtDecision || sessionId !== forSession) {
      return
    }
    if (activePollId && activePollId !== reportedPollId) {
      if (reportedPollId) {
        await report(forSession, reportedPollId, false)
      }
      await report(forSession, activePollId, true)
    } else if (!activePollId && reportedPollId) {
      await report(forSession, reportedPollId, false)
    } else if (
      activePollId &&
      reportedPollId === activePollId &&
      Date.now() - lastReportAt >= KEEPALIVE_MS
    ) {
      await report(forSession, activePollId, true)
    }
  } finally {
    tickBusySince = 0
  }
}

const startLoop = () => {
  if (loopStarted) {
    return
  }
  loopStarted = true
  if (
    officeDocReady() &&
    typeof Office.context.document.addHandlerAsync === 'function' &&
    Office.EventType
  ) {
    try {
      Office.context.document.addHandlerAsync(
        Office.EventType.ActiveViewChanged,
        (args: { activeView?: unknown }) => {
          setViewIsRead(String(args?.activeView || '').toLowerCase() === 'read')
          // Show start/exit must not wait behind an in-flight tick (its
          // verdict is discarded by the epoch guard anyway).
          tickBusySince = 0
          void tick()
        },
        () => undefined
      )
    } catch {
      // the tick's periodic view re-check covers it
    }
  }
  const loop = async () => {
    await tick()
    window.setTimeout(() => {
      void loop()
    }, viewIsRead ? TICK_READ_MS : TICK_EDIT_MS)
  }
  window.setTimeout(() => {
    void loop()
  }, TICK_READ_MS)
}

/**
 * Point the conductor at the active session (or null to stop reporting).
 * Idempotent; safe to call from a React effect on every session change.
 */
export function setConductorSession(nextSessionId: string | null): void {
  if (nextSessionId === sessionId) {
    if (nextSessionId) {
      startLoop()
    }
    return
  }
  const previousSession = sessionId
  const previousReported = reportedPollId
  sessionId = nextSessionId
  reportedPollId = null
  mapBuiltAt = 0
  mapBuiltForSession = null
  if (previousSession && previousReported) {
    // Release the poll we put on air under the old session.
    void report(previousSession, previousReported, false)
  }
  if (nextSessionId) {
    startLoop()
  }
}
