import { useMemo } from 'react'

import type { Poll, QnaPrompt, Question } from '../../api/types'
import { ActiveDiscussionEventCard } from './ActiveDiscussionEventCard'
import { ActivePollEventCard } from './ActivePollEventCard'
import { ActiveQnaEventCard } from './ActiveQnaEventCard'

export interface SessionActiveEventsPanelProps {
  openPolls: Poll[]
  qnaOpen: boolean
  pendingAudienceCount: number
  pendingPreview: Question | null
  openPrompts: QnaPrompt[]
  questions: Question[]
  onConfigurePoll?: (pollId: string) => void
  onStopPoll?: (pollId: string) => void
  onStopQna?: () => void
  onStopDiscussion?: (promptId: string) => void
}

function sortByCreatedDesc<T extends { created_at: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}

export function SessionActiveEventsPanel({
  openPolls,
  qnaOpen,
  pendingAudienceCount,
  pendingPreview,
  openPrompts,
  questions,
  onConfigurePoll,
  onStopPoll,
  onStopQna,
  onStopDiscussion
}: SessionActiveEventsPanelProps) {
  const sortedPolls = useMemo(() => sortByCreatedDesc(openPolls), [openPolls])
  const sortedPrompts = useMemo(() => sortByCreatedDesc(openPrompts), [openPrompts])

  const discussionBlocks = useMemo(() => {
    return sortedPrompts.map((prompt) => {
      const pending = questions.filter(
        (q) => q.prompt_id === prompt.id && q.status === 'pending'
      )
      return {
        prompt,
        pendingCount: pending.length,
        pendingPreview: pending[0] ?? null
      }
    })
  }, [sortedPrompts, questions])

  const hasAnyEvent =
    sortedPolls.length > 0 || qnaOpen || discussionBlocks.length > 0

  return (
    <>
      {!hasAnyEvent ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center">
          <p className="text-sm text-muted">
            No active events right now. Open a poll, Q&amp;A, or discussion from the moderation tools
            below.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {sortedPolls.map((poll) => (
            <ActivePollEventCard
              key={poll.id}
              poll={poll}
              onConfigure={onConfigurePoll}
              onStop={onStopPoll}
            />
          ))}

          {qnaOpen ? (
            <ActiveQnaEventCard
              pendingCount={pendingAudienceCount}
              pendingPreview={pendingPreview}
              onStop={onStopQna}
            />
          ) : null}

          {discussionBlocks.map(({ prompt, pendingCount, pendingPreview: discPreview }) => (
            <ActiveDiscussionEventCard
              key={prompt.id}
              prompt={prompt}
              pendingCount={pendingCount}
              pendingPreview={discPreview}
              onStop={onStopDiscussion}
            />
          ))}
        </div>
      )}
    </>
  )
}
