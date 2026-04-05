import { useMemo } from 'react'

import type { Poll, QnaPrompt, Question } from '../../api/types'
import { ActiveDiscussionEventCard } from './ActiveDiscussionEventCard'
import { ActivePollEventCard } from './ActivePollEventCard'
import { ActiveQnaEventCard } from './ActiveQnaEventCard'

export interface SessionActiveEventsPanelProps {
  openPolls: Poll[]
  /** Stopped polls — shown at the bottom, inactive styling. */
  closedPolls: Poll[]
  qnaOpen: boolean
  /** When Q&amp;A was closed but had audience activity — show inactive card at bottom. */
  showInactiveQna: boolean
  pendingAudienceCount: number
  pendingPreview: Question | null
  openPrompts: QnaPrompt[]
  closedPrompts: QnaPrompt[]
  questions: Question[]
  onConfigurePoll?: (pollId: string) => void
  onStopPoll?: (pollId: string) => void
  onStopQna?: () => void
  onStopDiscussion?: (promptId: string) => void
  onResumePoll?: (pollId: string) => void
  onResumeQna?: () => void
  onResumeDiscussion?: (promptId: string) => void
}

function sortByCreatedDesc<T extends { created_at: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}

export function SessionActiveEventsPanel({
  openPolls,
  closedPolls,
  qnaOpen,
  showInactiveQna,
  pendingAudienceCount,
  pendingPreview,
  openPrompts,
  closedPrompts,
  questions,
  onConfigurePoll,
  onStopPoll,
  onStopQna,
  onStopDiscussion,
  onResumePoll,
  onResumeQna,
  onResumeDiscussion
}: SessionActiveEventsPanelProps) {
  const sortedOpenPolls = useMemo(() => sortByCreatedDesc(openPolls), [openPolls])
  const sortedClosedPolls = useMemo(() => sortByCreatedDesc(closedPolls), [closedPolls])
  const sortedOpenPrompts = useMemo(() => sortByCreatedDesc(openPrompts), [openPrompts])
  const sortedClosedPrompts = useMemo(() => sortByCreatedDesc(closedPrompts), [closedPrompts])

  const discussionBlocks = useMemo(() => {
    return sortedOpenPrompts.map((prompt) => {
      const pending = questions.filter(
        (q) => q.prompt_id === prompt.id && q.status === 'pending'
      )
      return {
        prompt,
        pendingCount: pending.length,
        pendingPreview: pending[0] ?? null
      }
    })
  }, [sortedOpenPrompts, questions])

  const discussionBlocksInactive = useMemo(() => {
    return sortedClosedPrompts.map((prompt) => {
      const pending = questions.filter(
        (q) => q.prompt_id === prompt.id && q.status === 'pending'
      )
      return {
        prompt,
        pendingCount: pending.length,
        pendingPreview: pending[0] ?? null
      }
    })
  }, [sortedClosedPrompts, questions])

  const hasAnyEvent =
    sortedOpenPolls.length > 0 ||
    qnaOpen ||
    discussionBlocks.length > 0 ||
    sortedClosedPolls.length > 0 ||
    showInactiveQna ||
    discussionBlocksInactive.length > 0

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
          {sortedOpenPolls.map((poll) => (
            <ActivePollEventCard
              key={poll.id}
              poll={poll}
              variant="active"
              onConfigure={onConfigurePoll}
              onStop={onStopPoll}
            />
          ))}

          {qnaOpen ? (
            <ActiveQnaEventCard
              pendingCount={pendingAudienceCount}
              pendingPreview={pendingPreview}
              variant="active"
              onStop={onStopQna}
            />
          ) : null}

          {discussionBlocks.map(({ prompt, pendingCount, pendingPreview: discPreview }) => (
            <ActiveDiscussionEventCard
              key={prompt.id}
              prompt={prompt}
              pendingCount={pendingCount}
              pendingPreview={discPreview}
              variant="active"
              onStop={onStopDiscussion}
            />
          ))}

          {sortedClosedPolls.map((poll) => (
            <ActivePollEventCard
              key={poll.id}
              poll={poll}
              variant="inactive"
              onResume={onResumePoll}
            />
          ))}

          {showInactiveQna ? (
            <ActiveQnaEventCard
              pendingCount={pendingAudienceCount}
              pendingPreview={pendingPreview}
              variant="inactive"
              onResume={onResumeQna}
            />
          ) : null}

          {discussionBlocksInactive.map(({ prompt, pendingCount, pendingPreview: discPreview }) => (
            <ActiveDiscussionEventCard
              key={prompt.id}
              prompt={prompt}
              pendingCount={pendingCount}
              pendingPreview={discPreview}
              variant="inactive"
              onResume={onResumeDiscussion}
            />
          ))}
        </div>
      )}
    </>
  )
}
