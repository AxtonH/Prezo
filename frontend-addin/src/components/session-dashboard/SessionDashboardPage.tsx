import { useEffect, useMemo, useRef, useState } from 'react'

import type { Poll, PollMode, Question, QnaPrompt, Session, SessionSessionStats } from '../../api/types'
import type { WidgetSlideLinks } from '../../office/widgetShapes'
import { readAudienceQnaOpenedAt } from '../../utils/audienceQnaOpenedAtStorage'
import { readHostQnaEngaged } from '../../utils/hostQnaInactiveStorage'
import { resolveJoinUrl } from '../../utils/joinUrl'
import { CreateActivityMenu } from './CreateActivityMenu'
import type { PollEditUpdate } from './EditActivityModal'
import {
  SessionActiveActivitiesPanel,
  type ActivitySortMode
} from './SessionActiveActivitiesPanel'
import { SessionAudienceAccessCard } from './SessionAudienceAccessCard'
import { SessionCoHostAccessRow } from './SessionCoHostAccessRow'
import { SessionDashboardHeader } from './SessionDashboardHeader'
import { SessionEventStatsCard } from './SessionEventStatsCard'

function sortByCreatedAsc<T extends { created_at: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
}

const ACTIVITY_SORT_OPTIONS: { id: ActivitySortMode; label: string }[] = [
  { id: 'newest', label: 'Newest first' },
  { id: 'title', label: 'Title (A–Z)' },
  { id: 'slide', label: 'Slide order' }
]

export interface SessionDashboardPageProps {
  session: Session
  /** Incremented in the host app after a successful audience Q&A delete (clears the inactive Q&A card). */
  qnaDeletedEpoch?: number
  hostDisplayName: string
  /** Per-session engagement from the API; `null` until loaded. */
  sessionStats: SessionSessionStats | null
  polls: Poll[]
  prompts: QnaPrompt[]
  /** All questions (used for discussion thread preview). */
  questions: Question[]
  /** Audience (non-prompt) questions for Q&A preview */
  audienceQuestions: Question[]
  onSetHostJoinAccess?: (allowHostJoin: boolean) => Promise<void>
  onConfigurePoll?: (pollId: string) => void
  /** Open the editing station focused on the session Q&amp;A artifact. */
  onConfigureQna?: () => void
  /** Open the editing station focused on this discussion's artifact. */
  onConfigureDiscussion?: (promptId: string) => void
  onStopPoll?: (pollId: string) => void | Promise<void>
  onStopQna?: () => void | Promise<void>
  onStopDiscussion?: (promptId: string) => void | Promise<void>
  onResumePoll?: (pollId: string) => void | Promise<void>
  onResumeQna?: () => void | Promise<void>
  onResumeDiscussion?: (promptId: string) => void | Promise<void>
  onDeletePoll?: (pollId: string) => void | Promise<void>
  onDeleteQna?: () => void | Promise<void>
  onDeleteDiscussion?: (promptId: string) => void | Promise<void>
  /** Clear all votes for a poll while keeping the poll itself. */
  onResetPoll?: (pollId: string) => void | Promise<void>
  /** Clear all audience questions while keeping the Q&amp;A channel itself. */
  onResetQna?: () => void | Promise<void>
  /** Clear all responses for a discussion while keeping the prompt itself. */
  onResetDiscussion?: (promptId: string) => void | Promise<void>
  /** Switch a poll between auto (slide-driven) and pinned control. */
  onSetPollMode?: (pollId: string, mode: PollMode) => void | Promise<void>
  /** Switch session Q&A between auto and pinned control. */
  onSetQnaMode?: (mode: PollMode) => void | Promise<void>
  /** Switch a discussion prompt between auto and pinned control. */
  onSetDiscussionMode?: (promptId: string, mode: PollMode) => void | Promise<void>
  /** Save a poll reconfiguration from the edit dialog. */
  onUpdatePoll?: (pollId: string, update: PollEditUpdate) => Promise<void>
  /** Save a discussion prompt change from the edit dialog. */
  onUpdateDiscussion?: (promptId: string, prompt: string) => Promise<void>
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
  /** PowerPoint add-in: bind slide widget to a poll. */
  onBindPollWidget?: (pollId: string) => Promise<void>
  /** PowerPoint add-in: bind slide open-discussion widget to a prompt. */
  onBindDiscussionWidget?: (promptId: string) => Promise<void>
  /** PowerPoint: deck slide numbers hosting a widget linked to each activity. */
  widgetSlideLinks?: WidgetSlideLinks
}

export function SessionDashboardPage({
  session,
  qnaDeletedEpoch = 0,
  hostDisplayName,
  sessionStats,
  polls,
  prompts,
  questions,
  audienceQuestions,
  onSetHostJoinAccess,
  onConfigurePoll,
  onConfigureQna,
  onConfigureDiscussion,
  onStopPoll,
  onStopQna,
  onStopDiscussion,
  onResumePoll,
  onResumeQna,
  onResumeDiscussion,
  onDeletePoll,
  onDeleteQna,
  onDeleteDiscussion,
  onResetPoll,
  onResetQna,
  onResetDiscussion,
  onSetPollMode,
  onSetQnaMode,
  onSetDiscussionMode,
  onUpdatePoll,
  onUpdateDiscussion,
  onApproveDiscussionQuestion,
  onHideDiscussionQuestion,
  onApproveAudienceQuestion,
  onHideAudienceQuestion,
  onCreatePoll,
  onOpenAudienceQna,
  onCreateDiscussionPrompt,
  onBindPollWidget,
  onBindDiscussionWidget,
  widgetSlideLinks
}: SessionDashboardPageProps) {
  const joinUrl = resolveJoinUrl(session)

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

  const activityCount = useMemo(() => {
    const audienceSlot =
      session.qna_open || audienceQuestions.length > 0 || showInactiveQna
    return polls.length + prompts.length + (audienceSlot ? 1 : 0)
  }, [
    session.qna_open,
    audienceQuestions.length,
    showInactiveQna,
    polls.length,
    prompts.length
  ])

  const hasAnyActivity = activityCount > 0
  const [activitySearch, setActivitySearch] = useState('')
  const [activitySort, setActivitySort] = useState<ActivitySortMode>('newest')
  const [sortMenuOpen, setSortMenuOpen] = useState(false)

  useEffect(() => {
    if (!sortMenuOpen) {
      return
    }
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (t?.closest?.('[data-activity-sort-menu]')) {
        return
      }
      setSortMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSortMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [sortMenuOpen])

  const activeSortLabel =
    ACTIVITY_SORT_OPTIONS.find((o) => o.id === activitySort)?.label ?? 'Sort'

  return (
    <div className="space-y-8">
      <SessionDashboardHeader title={session.title ?? ''} hostLabel={hostDisplayName} />

      {onCreatePoll && onOpenAudienceQna && onCreateDiscussionPrompt ? (
        hasAnyActivity ? (
          /* With activities in the list, the big dashed CTA collapses into a
             toolbar: compact add button + search + sort. */
          <div className="flex items-center gap-2">
            <CreateActivityMenu
              variant="compact"
              qnaOpen={session.qna_open}
              onCreatePoll={onCreatePoll}
              onOpenAudienceQna={onOpenAudienceQna}
              onCreateDiscussionPrompt={onCreateDiscussionPrompt}
            />
            <div className="relative min-w-0 flex-1">
              <span
                className="material-symbols-outlined pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-slate-400"
                aria-hidden
              >
                search
              </span>
              <input
                type="search"
                value={activitySearch}
                onChange={(e) => setActivitySearch(e.target.value)}
                placeholder="Search by title or slide"
                aria-label="Search activities by title or slide"
                className="!h-9 !w-full !rounded-xl !border !border-slate-200 !bg-slate-50 !pl-8 !pr-3 !py-0 !text-sm focus:!border-primary focus:!ring-2 focus:!ring-primary/20 !outline-none !transition-all"
              />
            </div>
            <div className="relative shrink-0" data-activity-sort-menu>
              <button
                type="button"
                onClick={() => setSortMenuOpen((v) => !v)}
                className="!inline-flex !h-9 !w-9 !items-center !justify-center !rounded-xl !border !border-slate-200 !bg-white !p-0 !text-slate-600 hover:!border-primary/40 hover:!text-primary !shadow-none !transition-all"
                title={`Sort activities (${activeSortLabel})`}
                aria-label="Sort activities"
                aria-expanded={sortMenuOpen}
              >
                <span className="material-symbols-outlined text-lg" aria-hidden>
                  sort
                </span>
              </button>
              {sortMenuOpen ? (
                <div className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                  {ACTIVITY_SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setActivitySort(opt.id)
                        setSortMenuOpen(false)
                      }}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50 ${
                        opt.id === activitySort
                          ? 'font-semibold text-primary'
                          : 'text-slate-700'
                      }`}
                    >
                      {opt.label}
                      {opt.id === activitySort ? (
                        <span className="material-symbols-outlined text-base" aria-hidden>
                          check
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <CreateActivityMenu
            variant="dashed"
            qnaOpen={session.qna_open}
            onCreatePoll={onCreatePoll}
            onOpenAudienceQna={onOpenAudienceQna}
            onCreateDiscussionPrompt={onCreateDiscussionPrompt}
          />
        )
      ) : null}

      <div className="min-w-0 space-y-3">
        <SessionActiveActivitiesPanel
          searchQuery={activitySearch}
          sortBy={activitySort}
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
          onConfigureQna={onConfigureQna}
          onConfigureDiscussion={onConfigureDiscussion}
          onStopPoll={onStopPoll}
          onStopQna={onStopQna}
          onStopDiscussion={onStopDiscussion}
          onResumePoll={onResumePoll}
          onResumeQna={onResumeQna}
          onResumeDiscussion={onResumeDiscussion}
          onDeletePoll={onDeletePoll}
          onDeleteQna={onDeleteQna}
          onDeleteDiscussion={onDeleteDiscussion}
          onResetPoll={onResetPoll}
          onResetQna={onResetQna}
          onResetDiscussion={onResetDiscussion}
          onSetPollMode={onSetPollMode}
          qnaControlMode={session.qna_control_mode}
          onSetQnaMode={onSetQnaMode}
          onSetDiscussionMode={onSetDiscussionMode}
          onUpdatePoll={onUpdatePoll}
          onUpdateDiscussion={onUpdateDiscussion}
          onApproveDiscussionQuestion={onApproveDiscussionQuestion}
          onHideDiscussionQuestion={onHideDiscussionQuestion}
          onApproveAudienceQuestion={onApproveAudienceQuestion}
          onHideAudienceQuestion={onHideAudienceQuestion}
          onBindPollWidget={onBindPollWidget}
          onBindDiscussionWidget={onBindDiscussionWidget}
          widgetSlideLinks={widgetSlideLinks}
        />
      </div>

      <SessionAudienceAccessCard sessionCode={session.code} joinUrl={joinUrl} />

      <SessionCoHostAccessRow session={session} onSetHostJoinAccess={onSetHostJoinAccess} />

      <SessionEventStatsCard
        activityCount={activityCount}
        uniqueParticipants={sessionStats?.unique_participants ?? null}
        status={session.status}
      />
    </div>
  )
}
