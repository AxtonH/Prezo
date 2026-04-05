import { useMemo } from 'react'

import type { Poll, Question, Session } from '../../api/types'
import { resolveJoinUrl } from '../../utils/joinUrl'
import { SessionActiveModulesPanel } from './SessionActiveModulesPanel'
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
  /** Audience (non-prompt) questions for Q&A preview */
  audienceQuestions: Question[]
  onSetHostJoinAccess?: (allowHostJoin: boolean) => Promise<void>
  onConfigurePoll?: () => void
  onStopPoll?: (pollId: string) => void | Promise<void>
}

export function SessionDashboardPage({
  session,
  hostDisplayName,
  hostAvatarUrl,
  participantCount,
  polls,
  audienceQuestions,
  onSetHostJoinAccess,
  onConfigurePoll,
  onStopPoll
}: SessionDashboardPageProps) {
  const joinUrl = resolveJoinUrl(session)

  const openPoll = useMemo(
    () => polls.find((p) => p.status === 'open') ?? null,
    [polls]
  )

  const pendingAudience = useMemo(
    () => audienceQuestions.filter((q) => q.status === 'pending'),
    [audienceQuestions]
  )

  const pendingPreview = pendingAudience[0] ?? null

  return (
    <div className="space-y-8">
      <SessionDashboardHeader title={session.title ?? ''} hostLabel={hostDisplayName} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
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
          <SessionActiveModulesPanel
            openPoll={openPoll}
            pendingAudienceCount={pendingAudience.length}
            pendingPreview={pendingPreview}
            qnaOpen={session.qna_open}
            onConfigurePoll={onConfigurePoll}
            onStopPoll={openPoll && onStopPoll ? () => void onStopPoll(openPoll.id) : undefined}
          />
        </div>
      </div>
    </div>
  )
}
