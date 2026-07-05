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

/**
 * One reporting channel keyed by an activity id (polls, prompts): applies
 * on-air transitions with a hand-off (old activity off-air first), sends a
 * keepalive while on air so the backend's stale sweep leaves us alone, and
 * keeps its reported state for retry when a send fails.
 */
class IdPresenceChannel {
  private reportedId: string | null = null
  private lastReportAt = 0
  private readonly send: (sessionId: string, id: string, onAir: boolean) => Promise<unknown>

  constructor(send: (sessionId: string, id: string, onAir: boolean) => Promise<unknown>) {
    this.send = send
  }

  async apply(sessionId: string, activeId: string | null): Promise<void> {
    if (activeId && activeId !== this.reportedId) {
      if (this.reportedId) {
        await this.report(sessionId, this.reportedId, false)
      }
      await this.report(sessionId, activeId, true)
    } else if (!activeId && this.reportedId) {
      await this.report(sessionId, this.reportedId, false)
    } else if (
      activeId &&
      this.reportedId === activeId &&
      Date.now() - this.lastReportAt >= KEEPALIVE_MS
    ) {
      await this.report(sessionId, activeId, true)
    }
  }

  /** Best-effort off-air for a session we are leaving; resets local state. */
  release(sessionId: string | null): void {
    const previous = this.reportedId
    this.reportedId = null
    if (sessionId && previous) {
      void this.send(sessionId, previous, false).catch(() => undefined)
    }
  }

  private async report(sessionId: string, id: string, onAir: boolean): Promise<void> {
    try {
      await this.send(sessionId, id, onAir)
      this.reportedId = onAir ? id : null
      this.lastReportAt = Date.now()
    } catch {
      // keep state so the next tick retries the same transition
    }
  }
}

/** Boolean variant for session-level Q&A. */
class FlagPresenceChannel {
  private reportedOnAir = false
  private lastReportAt = 0
  private readonly send: (sessionId: string, onAir: boolean) => Promise<unknown>

  constructor(send: (sessionId: string, onAir: boolean) => Promise<unknown>) {
    this.send = send
  }

  async apply(sessionId: string, onAir: boolean): Promise<void> {
    if (onAir !== this.reportedOnAir) {
      await this.report(sessionId, onAir)
    } else if (onAir && Date.now() - this.lastReportAt >= KEEPALIVE_MS) {
      await this.report(sessionId, onAir)
    }
  }

  release(sessionId: string | null): void {
    const wasOnAir = this.reportedOnAir
    this.reportedOnAir = false
    if (sessionId && wasOnAir) {
      void this.send(sessionId, false).catch(() => undefined)
    }
  }

  private async report(sessionId: string, onAir: boolean): Promise<void> {
    try {
      await this.send(sessionId, onAir)
      this.reportedOnAir = onAir
      this.lastReportAt = Date.now()
    } catch {
      // keep state so the next tick retries
    }
  }
}

const pollChannel = new IdPresenceChannel((sid, id, onAir) =>
  api.reportPollPresence(sid, id, onAir, null)
)
const promptChannel = new IdPresenceChannel((sid, id, onAir) =>
  api.reportPromptPresence(sid, id, onAir)
)
const qnaChannel = new FlagPresenceChannel((sid, onAir) =>
  api.reportQnaPresence(sid, onAir)
)

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
    await pollChannel.apply(forSession, activePollId)
    await promptChannel.apply(forSession, activePromptId)
    await qnaChannel.apply(forSession, qnaOnAir)
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
  sessionId = nextSessionId
  mapBuiltAt = 0
  mapBuiltForSession = null
  // Release whatever we put on air under the old session.
  pollChannel.release(previousSession)
  promptChannel.release(previousSession)
  qnaChannel.release(previousSession)
  if (nextSessionId) {
    startLoop()
  }
}
