import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import type { Question, Session } from '../../api/types'
import { readAudienceQnaOpenedAt } from '../../utils/audienceQnaOpenedAtStorage'
import { readHostQnaEngaged } from '../../utils/hostQnaInactiveStorage'
import { SessionActiveActivitiesPanel } from './SessionActiveActivitiesPanel'
import { SessionDashboardHeader } from './SessionDashboardHeader'
import { SessionQnaBuilderCard } from './SessionQnaBuilderCard'
import { SessionQnaMetricsGrid } from './SessionQnaMetricsGrid'

const LG_MEDIA = '(min-width: 1024px)'

function sortByCreatedAsc<T extends { created_at: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
}

export interface SessionQnaDashboardPageProps {
  session: Session
  hostDisplayName: string
  /**
   * All questions for this session — both Q&amp;A (no prompt_id) and
   * discussion (with prompt_id). The page filters audience Q&amp;A internally.
   */
  questions: Question[]
  /**
   * Bumped after a successful audience Q&amp;A delete so the inactive card is
   * cleared from the activities panel.
   */
  qnaDeletedEpoch?: number
  onOpenQna: () => Promise<void> | void
  onStopQna: () => Promise<void> | void
  onResumeQna?: () => Promise<void> | void
  onDeleteQna?: () => void | Promise<void>
  onApproveAudienceQuestion?: (questionId: string) => void | Promise<void>
  onHideAudienceQuestion?: (questionId: string) => void | Promise<void>
}

export function SessionQnaDashboardPage({
  session,
  hostDisplayName,
  questions,
  qnaDeletedEpoch = 0,
  onOpenQna,
  onStopQna,
  onResumeQna,
  onDeleteQna,
  onApproveAudienceQuestion,
  onHideAudienceQuestion
}: SessionQnaDashboardPageProps) {
  const builderStackRef = useRef<HTMLDivElement>(null)
  const [activitiesRailMaxPx, setActivitiesRailMaxPx] = useState<number | null>(null)
  const [openInFlight, setOpenInFlight] = useState(false)

  // Audience Q&A is the subset of questions with no prompt_id.
  const audienceQuestions = useMemo(
    () => questions.filter((q) => !q.prompt_id),
    [questions]
  )

  // Mirror SessionDashboardPage's logic: keep the inactive Q&A card visible
  // after the channel closes if there's still moderation context for the
  // host (existing questions, prior open in this session, or persisted flag).
  const qnaWasOpenedThisSessionRef = useRef(false)
  const lastSessionIdRef = useRef(session.id)
  if (lastSessionIdRef.current !== session.id) {
    lastSessionIdRef.current = session.id
    qnaWasOpenedThisSessionRef.current = false
  }
  useEffect(() => {
    if (session.qna_open) {
      qnaWasOpenedThisSessionRef.current = true
    }
  }, [session.qna_open])

  const [, qnaInactiveRerender] = useState(0)
  useEffect(() => {
    if (qnaDeletedEpoch > 0) {
      qnaWasOpenedThisSessionRef.current = false
      qnaInactiveRerender((n) => n + 1)
    }
  }, [qnaDeletedEpoch])

  const showInactiveQna =
    !session.qna_open &&
    (audienceQuestions.length > 0 ||
      qnaWasOpenedThisSessionRef.current ||
      readHostQnaEngaged(session.id))

  const audienceQnaSortKey = useMemo(() => {
    const openedAt = readAudienceQnaOpenedAt(session.id)
    if (openedAt) {
      return openedAt
    }
    if (audienceQuestions.length > 0) {
      return audienceQuestions.reduce(
        (earliest, q) => (q.created_at < earliest ? q.created_at : earliest),
        audienceQuestions[0].created_at
      )
    }
    return session.created_at
  }, [audienceQuestions, session.created_at, session.id, session.qna_open])

  useLayoutEffect(() => {
    const stack = builderStackRef.current
    if (!stack) {
      return
    }
    const measure = () => {
      if (typeof window === 'undefined' || !window.matchMedia(LG_MEDIA).matches) {
        setActivitiesRailMaxPx(null)
        return
      }
      setActivitiesRailMaxPx(stack.getBoundingClientRect().height)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(stack)
    window.addEventListener('resize', measure)
    const mq = window.matchMedia(LG_MEDIA)
    mq.addEventListener('change', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
      mq.removeEventListener('change', measure)
    }
  }, [session.id])

  const audiencePendingQuestions = useMemo(
    () => sortByCreatedAsc(audienceQuestions.filter((q) => q.status === 'pending')),
    [audienceQuestions]
  )

  const audienceApprovedQuestions = useMemo(
    () => sortByCreatedAsc(audienceQuestions.filter((q) => q.status === 'approved')),
    [audienceQuestions]
  )

  const handleOpenQna = async () => {
    setOpenInFlight(true)
    try {
      await onOpenQna()
    } finally {
      setOpenInFlight(false)
    }
  }

  const handleStopQna = async () => {
    setOpenInFlight(true)
    try {
      await onStopQna()
    } finally {
      setOpenInFlight(false)
    }
  }

  return (
    <div className="space-y-4 lg:space-y-5">
      <SessionDashboardHeader title={session.title ?? ''} hostLabel={hostDisplayName} />

      <div className="space-y-2 lg:space-y-3">
        <div className="session-dashboard-body-grid grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-2 lg:items-start">
          <div ref={builderStackRef} className="min-w-0 space-y-4 lg:[grid-area:stack]">
            <SessionQnaBuilderCard
              qnaOpen={session.qna_open}
              onOpenQna={handleOpenQna}
              onCloseQna={handleStopQna}
              isBusy={openInFlight}
            />
          </div>
          <div className="min-w-0 w-full lg:[grid-area:participants]">
            <SessionQnaMetricsGrid
              pendingCount={audiencePendingQuestions.length}
              approvedCount={audienceApprovedQuestions.length}
            />
          </div>
          <div
            className="flex min-h-0 min-w-0 flex-col lg:[grid-area:activities]"
            style={
              activitiesRailMaxPx != null ? { maxHeight: activitiesRailMaxPx } : undefined
            }
          >
            <div className="relative isolate flex min-h-0 h-full min-w-0 w-full flex-col">
              <div
                className="pointer-events-none absolute inset-0 rounded-2xl shadow-card"
                aria-hidden
              />
              <div className="relative z-[1] flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div
                  data-session-activities-scroll
                  className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-white p-3 pb-10 pr-2 [scrollbar-gutter:stable] lg:scroll-smooth session-list-scroll"
                >
                  <SessionActiveActivitiesPanel
                    activitiesScope="qna-only"
                    openPolls={[]}
                    closedPolls={[]}
                    qnaOpen={session.qna_open}
                    showInactiveQna={showInactiveQna}
                    audienceQnaSortKey={audienceQnaSortKey}
                    audiencePendingQuestions={audiencePendingQuestions}
                    audienceApprovedQuestions={audienceApprovedQuestions}
                    openPrompts={[]}
                    closedPrompts={[]}
                    questions={questions}
                    onConfigurePoll={undefined}
                    onStopPoll={undefined}
                    onStopQna={() => void handleStopQna()}
                    onStopDiscussion={undefined}
                    onResumePoll={undefined}
                    onResumeQna={onResumeQna ? () => void onResumeQna() : undefined}
                    onResumeDiscussion={undefined}
                    onDeletePoll={undefined}
                    onDeleteQna={onDeleteQna}
                    onDeleteDiscussion={undefined}
                    onApproveDiscussionQuestion={undefined}
                    onHideDiscussionQuestion={undefined}
                    onApproveAudienceQuestion={onApproveAudienceQuestion}
                    onHideAudienceQuestion={onHideAudienceQuestion}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
