import { useMemo } from 'react'

import type { Poll, Question, QnaPrompt, Session } from '../../api/types'
import { resolveJoinUrl } from '../../utils/joinUrl'
import { SessionActiveEventsPanel } from './SessionActiveEventsPanel'
import { SessionAudienceAccessCard } from './SessionAudienceAccessCard'
import { SessionCoHostAccessRow } from './SessionCoHostAccessRow'
import { SessionDashboardHeader } from './SessionDashboardHeader'
import { SessionParticipantsCard } from './SessionParticipantsCard'

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
  onStopDiscussion
}: SessionDashboardPageProps) {
  const joinUrl = resolveJoinUrl(session)

  const openPolls = useMemo(
    () => polls.filter((p) => p.status === 'open'),
    [polls]
  )

  const openPrompts = useMemo(
    () => prompts.filter((p) => p.status === 'open'),
    [prompts]
  )

  const pendingAudience = useMemo(
    () => audienceQuestions.filter((q) => q.status === 'pending'),
    [audienceQuestions]
  )

  const pendingPreview = pendingAudience[0] ?? null

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
            qnaOpen={session.qna_open}
            pendingAudienceCount={pendingAudience.length}
            pendingPreview={pendingPreview}
            openPrompts={openPrompts}
            questions={questions}
            onConfigurePoll={onConfigurePoll}
            onStopPoll={onStopPoll}
            onStopQna={onStopQna}
            onStopDiscussion={onStopDiscussion}
          />
        </div>
      </div>
    </div>
  )
}
