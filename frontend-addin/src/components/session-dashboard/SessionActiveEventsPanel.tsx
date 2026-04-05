import { useMemo, useState } from 'react'

import type { Poll, QnaPrompt, Question } from '../../api/types'
import { ActiveDiscussionEventCard } from './ActiveDiscussionEventCard'
import { ActivePollEventCard } from './ActivePollEventCard'
import { ActiveQnaEventCard } from './ActiveQnaEventCard'
import { DeleteEventConfirmModal } from './DeleteEventConfirmModal'

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
  onDeletePoll?: (pollId: string) => void | Promise<void>
  onDeleteQna?: () => void | Promise<void>
  onDeleteDiscussion?: (promptId: string) => void | Promise<void>
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
  onResumeDiscussion,
  onDeletePoll,
  onDeleteQna,
  onDeleteDiscussion
}: SessionActiveEventsPanelProps) {
  const [deleteTarget, setDeleteTarget] = useState<
    null | { kind: 'poll'; id: string } | { kind: 'qna' } | { kind: 'discussion'; id: string }
  >(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
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

  const closeDeleteModal = () => {
    if (!deleteBusy) {
      setDeleteTarget(null)
      setDeleteError(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) {
      return
    }
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      if (deleteTarget.kind === 'poll') {
        await onDeletePoll?.(deleteTarget.id)
      } else if (deleteTarget.kind === 'qna') {
        await onDeleteQna?.()
      } else {
        await onDeleteDiscussion?.(deleteTarget.id)
      }
      setDeleteTarget(null)
      setDeleteError(null)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <>
      <DeleteEventConfirmModal
        open={deleteTarget !== null}
        onCancel={closeDeleteModal}
        onConfirm={confirmDelete}
        busy={deleteBusy}
        error={deleteError}
      />
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
              onDelete={() => setDeleteTarget({ kind: 'poll', id: poll.id })}
            />
          ))}

          {qnaOpen ? (
            <ActiveQnaEventCard
              pendingCount={pendingAudienceCount}
              pendingPreview={pendingPreview}
              variant="active"
              onStop={onStopQna}
              onDelete={() => setDeleteTarget({ kind: 'qna' })}
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
              onDelete={() => setDeleteTarget({ kind: 'discussion', id: prompt.id })}
            />
          ))}

          {sortedClosedPolls.map((poll) => (
            <ActivePollEventCard
              key={poll.id}
              poll={poll}
              variant="inactive"
              onResume={onResumePoll}
              onDelete={() => setDeleteTarget({ kind: 'poll', id: poll.id })}
            />
          ))}

          {showInactiveQna ? (
            <ActiveQnaEventCard
              pendingCount={pendingAudienceCount}
              pendingPreview={pendingPreview}
              variant="inactive"
              onResume={onResumeQna}
              onDelete={() => setDeleteTarget({ kind: 'qna' })}
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
              onDelete={() => setDeleteTarget({ kind: 'discussion', id: prompt.id })}
            />
          ))}
        </div>
      )}
    </>
  )
}
