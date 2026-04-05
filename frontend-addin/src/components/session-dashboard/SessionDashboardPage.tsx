import { useEffect, useMemo, useRef } from 'react'

import type { Poll, Question, QnaPrompt, Session } from '../../api/types'
import { readHostQnaEngaged } from '../../utils/hostQnaInactiveStorage'
import { resolveJoinUrl } from '../../utils/joinUrl'
import { SessionActiveEventsPanel } from './SessionActiveEventsPanel'
import { SessionAudienceAccessCard } from './SessionAudienceAccessCard'
import { SessionCoHostAccessRow } from './SessionCoHostAccessRow'
import { SessionDashboardHeader } from './SessionDashboardHeader'
import { SessionParticipantsCard } from './SessionParticipantsCard'

function sortByCreatedDesc<T extends { created_at: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}

export interface SessionDashboardPageProps {
  session: Session
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
}

export function SessionDashboardPage({
  session,
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
  onHideDiscussionQuestion
}: SessionDashboardPageProps) {
  const joinUrl = resolveJoinUrl(session)

  const openPolls = useMemo(
    () => polls.filter((p) => p.status === 'open'),
    [polls]
  )

  const closedPolls = useMemo(
    () => sortByCreatedDesc(polls.filter((p) => p.status === 'closed')),
    [polls]
  )

  const openPrompts = useMemo(
    () => prompts.filter((p) => p.status === 'open'),
    [prompts]
  )

  const closedPrompts = useMemo(
    () => sortByCreatedDesc(prompts.filter((p) => p.status === 'closed')),
    [prompts]
  )

  const pendingAudience = useMemo(
    () => audienceQuestions.filter((q) => q.status === 'pending'),
    [audienceQuestions]
  )

  const pendingPreview = pendingAudience[0] ?? null

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

  /** Ended Q&amp;A card: closed channel, plus audience history, in-session open, or persisted engagement after reload. */
  const showInactiveQna =
    !session.qna_open &&
    (audienceQuestions.length > 0 ||
      qnaWasOpenedThisSessionRef.current ||
      readHostQnaEngaged(session.id))

  return (
    <div className="space-y-6">
      <SessionDashboardHeader title={session.title ?? ''} hostLabel={hostDisplayName} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-8 gap-y-6 items-start">
        <div className="lg:col-span-4 space-y-5">
          <SessionAudienceAccessCard sessionCode={session.code} joinUrl={joinUrl} />
          <SessionParticipantsCard
            activeParticipantCount={participantCount}
            hostDisplayName={hostDisplayName}
            hostAvatarUrl={hostAvatarUrl}
          />
          <SessionCoHostAccessRow session={session} onSetHostJoinAccess={onSetHostJoinAccess} />
        </div>
        <div className="lg:col-span-8">
          <SessionActiveEventsPanel
            openPolls={openPolls}
            closedPolls={closedPolls}
            qnaOpen={session.qna_open}
            showInactiveQna={showInactiveQna}
            pendingAudienceCount={pendingAudience.length}
            pendingPreview={pendingPreview}
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
          />
        </div>
      </div>
    </div>
  )
}
