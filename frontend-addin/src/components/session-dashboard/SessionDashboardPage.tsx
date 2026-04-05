import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import type { Poll, Question, QnaPrompt, Session } from '../../api/types'
import { readAudienceQnaOpenedAt } from '../../utils/audienceQnaOpenedAtStorage'
import { readHostQnaEngaged } from '../../utils/hostQnaInactiveStorage'
import { resolveJoinUrl } from '../../utils/joinUrl'
import { CreateActivityMenu } from './CreateActivityMenu'
import { SessionActiveActivitiesPanel } from './SessionActiveActivitiesPanel'
import { SessionAudienceAccessCard } from './SessionAudienceAccessCard'
import { SessionCoHostAccessRow } from './SessionCoHostAccessRow'
import { SessionDashboardHeader } from './SessionDashboardHeader'
import { SessionParticipantsCard } from './SessionParticipantsCard'

const LG_MEDIA = '(min-width: 1024px)'

function sortByCreatedAsc<T extends { created_at: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
}

export interface SessionDashboardPageProps {
  session: Session
  /** Incremented in the host app after a successful audience Q&A delete (clears the inactive Q&A card). */
  qnaDeletedEpoch?: number
  hostDisplayName: string
  hostAvatarUrl: string | null
  /** Live audience size when available; `null` shows a placeholder. */
  participantCount: number | null
  polls: Poll[]
  prompts: QnaPrompt[]
  /** All questions (used for discussion thread preview). */
  questions: Question[]
  /** Audience (non-prompt) questions for Q&A preview */
  audienceQuestions: Question[]
  onSetHostJoinAccess?: (allowHostJoin: boolean) => Promise<void>
  onConfigurePoll?: (pollId: string) => void
  onStopPoll?: (pollId: string) => void | Promise<void>
  onStopQna?: () => void | Promise<void>
  onStopDiscussion?: (promptId: string) => void | Promise<void>
  onResumePoll?: (pollId: string) => void | Promise<void>
  onResumeQna?: () => void | Promise<void>
  onResumeDiscussion?: (promptId: string) => void | Promise<void>
  onDeletePoll?: (pollId: string) => void | Promise<void>
  onDeleteQna?: () => void | Promise<void>
  onDeleteDiscussion?: (promptId: string) => void | Promise<void>
  onApproveDiscussionQuestion?: (questionId: string) => void | Promise<void>
  onHideDiscussionQuestion?: (questionId: string) => void | Promise<void>
  onApproveAudienceQuestion?: (questionId: string) => void | Promise<void>
  onHideAudienceQuestion?: (questionId: string) => void | Promise<void>
  onCreatePoll?: (
    question: string,
    options: string[],
    allowMultiple: boolean
  ) => Promise<void>
  onOpenAudienceQna?: () => Promise<void>
  onCreateDiscussionPrompt?: (prompt: string) => Promise<void>
}

export function SessionDashboardPage({
  session,
  qnaDeletedEpoch = 0,
  hostDisplayName,
  hostAvatarUrl,
  participantCount,
  polls,
  prompts,
  questions,
  audienceQuestions,
  onSetHostJoinAccess,
  onConfigurePoll,
  onStopPoll,
  onStopQna,
  onStopDiscussion,
  onResumePoll,
  onResumeQna,
  onResumeDiscussion,
  onDeletePoll,
  onDeleteQna,
  onDeleteDiscussion,
  onApproveDiscussionQuestion,
  onHideDiscussionQuestion,
  onApproveAudienceQuestion,
  onHideAudienceQuestion,
  onCreatePoll,
  onOpenAudienceQna,
  onCreateDiscussionPrompt
}: SessionDashboardPageProps) {
  const joinUrl = resolveJoinUrl(session)
  /** Audience + co-host column height — activities rail maxes to this on lg so panels scroll inside. */
  const audienceCoHostStackRef = useRef<HTMLDivElement>(null)
  const [activitiesRailMaxPx, setActivitiesRailMaxPx] = useState<number | null>(null)

  useLayoutEffect(() => {
    const stack = audienceCoHostStackRef.current
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

  const openPolls = useMemo(
    () => polls.filter((p) => p.status === 'open'),
    [polls]
  )

  const closedPolls = useMemo(
    () => sortByCreatedAsc(polls.filter((p) => p.status === 'closed')),
    [polls]
  )

  const openPrompts = useMemo(
    () => prompts.filter((p) => p.status === 'open'),
    [prompts]
  )

  const closedPrompts = useMemo(
    () => sortByCreatedAsc(prompts.filter((p) => p.status === 'closed')),
    [prompts]
  )

  const audiencePendingQuestions = useMemo(
    () => sortByCreatedAsc(audienceQuestions.filter((q) => q.status === 'pending')),
    [audienceQuestions]
  )

  const audienceApprovedQuestions = useMemo(
    () => sortByCreatedAsc(audienceQuestions.filter((q) => q.status === 'approved')),
    [audienceQuestions]
  )

  /**
   * Audience Q&A has no row `created_at`. Prefer the host’s open time (sessionStorage, set in App on
   * openQna); else earliest question; else last resort after all polls/prompts when still empty.
   */
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
    const times = [
      session.created_at,
      ...polls.map((p) => p.created_at),
      ...prompts.map((p) => p.created_at)
    ]
    const maxMs = Math.max(...times.map((t) => new Date(t).getTime()))
    return new Date(maxMs + 1).toISOString()
  }, [audienceQuestions, polls, prompts, session.created_at, session.id, session.qna_open])

  /** Tracks Q&amp;A being opened this session so we still show an inactive panel after close even with zero questions. */
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

  /** Ended Q&amp;A card: closed channel, plus audience history, in-session open, or persisted engagement after reload. */
  const showInactiveQna =
    !session.qna_open &&
    (audienceQuestions.length > 0 ||
      qnaWasOpenedThisSessionRef.current ||
      readHostQnaEngaged(session.id))

  return (
    <div className="space-y-6">
      <SessionDashboardHeader title={session.title ?? ''} hostLabel={hostDisplayName} />

      {/*
        lg: row 1 = audience+co-host (stack) | scrollable activities; row 2 = participants | empty.
      */}
      <div className="session-dashboard-body-grid grid grid-cols-1 gap-x-8 gap-y-6 lg:items-stretch">
        <div
          ref={audienceCoHostStackRef}
          className="min-w-0 space-y-5 lg:[grid-area:stack]"
        >
          <SessionAudienceAccessCard sessionCode={session.code} joinUrl={joinUrl} />
          <SessionCoHostAccessRow session={session} onSetHostJoinAccess={onSetHostJoinAccess} />
        </div>
        <div className="min-w-0 lg:[grid-area:participants]">
          <SessionParticipantsCard
            activeParticipantCount={participantCount}
            hostDisplayName={hostDisplayName}
            hostAvatarUrl={hostAvatarUrl}
          />
        </div>
        <div
          className="flex min-h-0 min-w-0 flex-col gap-5 overflow-hidden lg:[grid-area:activities]"
          style={
            activitiesRailMaxPx != null
              ? { maxHeight: activitiesRailMaxPx }
              : undefined
          }
        >
          <div className="shrink-0 space-y-4">
            {onCreatePoll && onOpenAudienceQna && onCreateDiscussionPrompt ? (
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="text-[0.65rem] font-bold uppercase tracking-widest text-muted">
                    Session activities
                  </p>
                  <p className="text-sm text-muted mt-1 max-w-xl">
                    Run polls, Q&amp;A, or a guided discussion — all in one place below.
                  </p>
                </div>
                <CreateActivityMenu
                  qnaOpen={session.qna_open}
                  onCreatePoll={onCreatePoll}
                  onOpenAudienceQna={onOpenAudienceQna}
                  onCreateDiscussionPrompt={onCreateDiscussionPrompt}
                />
              </div>
            ) : null}
          </div>
          <div
            data-session-activities-scroll
            className="min-h-0 overflow-x-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-card lg:flex-1 lg:overflow-y-auto lg:scroll-smooth session-list-scroll pr-2 [scrollbar-gutter:stable]"
          >
            <SessionActiveActivitiesPanel
              openPolls={openPolls}
              closedPolls={closedPolls}
              qnaOpen={session.qna_open}
              showInactiveQna={showInactiveQna}
              audienceQnaSortKey={audienceQnaSortKey}
              audiencePendingQuestions={audiencePendingQuestions}
              audienceApprovedQuestions={audienceApprovedQuestions}
              openPrompts={openPrompts}
              closedPrompts={closedPrompts}
              questions={questions}
              onConfigurePoll={onConfigurePoll}
              onStopPoll={onStopPoll}
              onStopQna={onStopQna}
              onStopDiscussion={onStopDiscussion}
              onResumePoll={onResumePoll}
              onResumeQna={onResumeQna}
              onResumeDiscussion={onResumeDiscussion}
              onDeletePoll={onDeletePoll}
              onDeleteQna={onDeleteQna}
              onDeleteDiscussion={onDeleteDiscussion}
              onApproveDiscussionQuestion={onApproveDiscussionQuestion}
              onHideDiscussionQuestion={onHideDiscussionQuestion}
              onApproveAudienceQuestion={onApproveAudienceQuestion}
              onHideAudienceQuestion={onHideAudienceQuestion}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
