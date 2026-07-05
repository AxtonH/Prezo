/**
 * Taskpane-side slideshow conductor for WIDGET (native shape) slides:
 * poll widgets, discussion widgets, and Q&A widgets.
 *
 * Embed slides drive their own polls (the content add-in webview reports
 * presence), but widgets are plain PowerPoint shapes — nothing lives on
 * the slide. The taskpane keeps running on the presenting machine during a
 * slideshow, so it conducts instead: while the deck is in "read" view it
 * tracks the presented slide via getSelectedDataAsync(SlideRange), maps it
 * through the widget slide tags (poll → poll id, discussion or
 * prompt-bound Q&A → prompt id, unbound Q&A → session Q&A), and reports
 * on-air/off-air to the presence endpoints. Auto-mode activities then
 * open/close; pinned ones ignore it (backend policy).
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
import {
  DISCUSSION_WIDGET_SLIDE_TAGS,
  isPowerPointShapeApiAvailable,
  POLL_WIDGET_SLIDE_TAGS,
  QNA_WIDGET_SLIDE_TAGS
} from './widgetShapes'

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
/** Numeric sheet id → bound discussion prompt id (discussion widgets and
 * prompt-bound Q&A widgets). */
let slidePromptMap = new Map<string, string>()
/** Sheet ids of unbound Q&A widget slides (drive session-level Q&A). */
let qnaSlideIds = new Set<string>()
let mapBuiltAt = 0
let mapBuiltForSession: string | null = null
/** What this conductor has reported on-air per channel. */
let reportedPollId: string | null = null
let reportedPromptId: string | null = null
let reportedQnaOnAir = false
let lastPollReportAt = 0
let lastPromptReportAt = 0
let lastQnaReportAt = 0

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

const rebuildSlideMaps = async (forSession: string): Promise<void> => {
  if (!isPowerPointShapeApiAvailable()) {
    slidePollMap = new Map()
    slidePromptMap = new Map()
    qnaSlideIds = new Set()
    mapBuiltAt = Date.now()
    mapBuiltForSession = forSession
    return
  }
  try {
    const nextPolls = new Map<string, string>()
    const nextPrompts = new Map<string, string>()
    const nextQna = new Set<string>()
    await runPowerPoint(async (context) => {
      const slides = context.presentation.slides
      slides.load('items/id')
      await context.sync()
      const infos = slides.items.map((slide) => {
        const tags = {
          pollSession: slide.tags.getItemOrNullObject(POLL_WIDGET_SLIDE_TAGS.sessionTag),
          pollBinding: slide.tags.getItemOrNullObject(POLL_WIDGET_SLIDE_TAGS.bindingTag),
          qnaSession: slide.tags.getItemOrNullObject(QNA_WIDGET_SLIDE_TAGS.sessionTag),
          qnaPromptBinding: slide.tags.getItemOrNullObject(QNA_WIDGET_SLIDE_TAGS.promptBindingTag),
          discussionSession: slide.tags.getItemOrNullObject(DISCUSSION_WIDGET_SLIDE_TAGS.sessionTag),
          discussionBinding: slide.tags.getItemOrNullObject(DISCUSSION_WIDGET_SLIDE_TAGS.bindingTag)
        }
        for (const tag of Object.values(tags)) {
          tag.load('value')
        }
        return { slide, tags }
      })
      await context.sync()
      const tagValue = (tag: PowerPoint.Tag): string | null =>
        tag.isNullObject || !tag.value ? null : tag.value
      for (const { slide, tags } of infos) {
        const sheetId = String(slide.id).split('#')[0]
        if (tagValue(tags.pollSession) === forSession && tagValue(tags.pollBinding)) {
          nextPolls.set(sheetId, tags.pollBinding.value)
        }
        if (tagValue(tags.discussionSession) === forSession && tagValue(tags.discussionBinding)) {
          nextPrompts.set(sheetId, tags.discussionBinding.value)
        }
        if (tagValue(tags.qnaSession) === forSession) {
          const boundPrompt = tagValue(tags.qnaPromptBinding)
          if (boundPrompt) {
            nextPrompts.set(sheetId, boundPrompt)
          } else {
            nextQna.add(sheetId)
          }
        }
      }
    })
    slidePollMap = nextPolls
    slidePromptMap = nextPrompts
    qnaSlideIds = nextQna
    mapBuiltAt = Date.now()
    mapBuiltForSession = forSession
  } catch {
    // Deck busy — keep the stale maps (if any) and retry on a later tick.
    const hasAnything =
      slidePollMap.size > 0 || slidePromptMap.size > 0 || qnaSlideIds.size > 0
    mapBuiltAt = hasAnything ? Date.now() - MAP_MAX_AGE_MS / 2 : 0
  }
}

const reportPoll = async (forSession: string, pollId: string, onAir: boolean): Promise<boolean> => {
  try {
    await api.reportPollPresence(forSession, pollId, onAir, null)
    reportedPollId = onAir ? pollId : null
    lastPollReportAt = Date.now()
    return true
  } catch {
    return false
  }
}

const reportPrompt = async (forSession: string, promptId: string, onAir: boolean): Promise<boolean> => {
  try {
    await api.reportPromptPresence(forSession, promptId, onAir)
    reportedPromptId = onAir ? promptId : null
    lastPromptReportAt = Date.now()
    return true
  } catch {
    return false
  }
}

const reportQna = async (forSession: string, onAir: boolean): Promise<boolean> => {
  try {
    await api.reportQnaPresence(forSession, onAir)
    reportedQnaOnAir = onAir
    lastQnaReportAt = Date.now()
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
    let activePromptId: string | null = null
    let qnaOnAir = false
    if (viewIsRead) {
      if (mapBuiltForSession !== forSession || now - mapBuiltAt > MAP_MAX_AGE_MS) {
        await rebuildSlideMaps(forSession)
      }
      const currentSheetId = await getCurrentSheetId()
      if (currentSheetId) {
        activePollId = slidePollMap.get(currentSheetId) ?? null
        activePromptId = slidePromptMap.get(currentSheetId) ?? null
        qnaOnAir = qnaSlideIds.has(currentSheetId)
      }
    }
    if (viewEpoch !== epochAtDecision || sessionId !== forSession) {
      return
    }
    // Polls
    if (activePollId && activePollId !== reportedPollId) {
      if (reportedPollId) {
        await reportPoll(forSession, reportedPollId, false)
      }
      await reportPoll(forSession, activePollId, true)
    } else if (!activePollId && reportedPollId) {
      await reportPoll(forSession, reportedPollId, false)
    } else if (
      activePollId &&
      reportedPollId === activePollId &&
      Date.now() - lastPollReportAt >= KEEPALIVE_MS
    ) {
      await reportPoll(forSession, activePollId, true)
    }
    // Discussion prompts (and prompt-bound Q&A widgets)
    if (activePromptId && activePromptId !== reportedPromptId) {
      if (reportedPromptId) {
        await reportPrompt(forSession, reportedPromptId, false)
      }
      await reportPrompt(forSession, activePromptId, true)
    } else if (!activePromptId && reportedPromptId) {
      await reportPrompt(forSession, reportedPromptId, false)
    } else if (
      activePromptId &&
      reportedPromptId === activePromptId &&
      Date.now() - lastPromptReportAt >= KEEPALIVE_MS
    ) {
      await reportPrompt(forSession, activePromptId, true)
    }
    // Session Q&A (unbound Q&A widget slides)
    if (qnaOnAir !== reportedQnaOnAir) {
      await reportQna(forSession, qnaOnAir)
    } else if (
      qnaOnAir &&
      Date.now() - lastQnaReportAt >= KEEPALIVE_MS
    ) {
      await reportQna(forSession, qnaOnAir)
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
  const previousPoll = reportedPollId
  const previousPrompt = reportedPromptId
  const previousQnaOnAir = reportedQnaOnAir
  sessionId = nextSessionId
  reportedPollId = null
  reportedPromptId = null
  reportedQnaOnAir = false
  mapBuiltAt = 0
  mapBuiltForSession = null
  if (previousSession) {
    // Release whatever we put on air under the old session.
    if (previousPoll) {
      void reportPoll(previousSession, previousPoll, false)
    }
    if (previousPrompt) {
      void reportPrompt(previousSession, previousPrompt, false)
    }
    if (previousQnaOnAir) {
      void reportQna(previousSession, false)
    }
  }
  if (nextSessionId) {
    startLoop()
  }
}
