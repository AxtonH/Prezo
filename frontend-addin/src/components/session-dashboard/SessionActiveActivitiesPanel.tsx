import { useMemo, useState } from 'react'

import type { Poll, QnaPrompt, Question } from '../../api/types'
import { ActiveDiscussionActivityCard } from './ActiveDiscussionActivityCard'
import { ActivePollActivityCard } from './ActivePollActivityCard'
import { ActiveQnaActivityCard } from './ActiveQnaActivityCard'
import { DeleteActivityConfirmModal } from './DeleteActivityConfirmModal'

export interface SessionActiveActivitiesPanelProps {
  /**
   * `'polls-only'` — polls workspace; `'discussions-only'` — open discussion
   * workspace; `'qna-only'` — Q&amp;A workspace (audience questions only).
   * Default: full activity mix.
   */
  activitiesScope?: 'all' | 'polls-only' | 'discussions-only' | 'qna-only'
  openPolls: Poll[]
  /** Stopped polls — shown in the inactive block, oldest first when merged. */
  closedPolls: Poll[]
  qnaOpen: boolean
  /**
   * When Q&amp;A was closed but had audience activity — show inactive card in the inactive block.
   * Must be false while `qnaOpen` is true (parent normally guarantees this; the panel also guards).
   */
  showInactiveQna: boolean
  /** ISO time for merging audience Q&amp;A with polls/discussions (earliest question or synthetic). */
  audienceQnaSortKey: string
  /** Audience Q&amp;A (no prompt) — pending, oldest first. */
  audiencePendingQuestions: Question[]
  /** Audience Q&amp;A (no prompt) — approved, oldest first. */
  audienceApprovedQuestions: Question[]
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
  onApproveDiscussionQuestion?: (questionId: string) => void | Promise<void>
  onHideDiscussionQuestion?: (questionId: string) => void | Promise<void>
  onApproveAudienceQuestion?: (questionId: string) => void | Promise<void>
  onHideAudienceQuestion?: (questionId: string) => void | Promise<void>
  /** PowerPoint: bind the slide poll widget to this session poll (tags + text only). */
  onBindPollWidget?: (pollId: string) => Promise<void>
  /** PowerPoint: bind the slide open-discussion widget to this prompt (tags + text only). */
  onBindDiscussionWidget?: (promptId: string) => Promise<void>
}

function sortByCreatedAsc<T extends { created_at: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
}

function sortKeyMs(iso: string): number {
  return new Date(iso).getTime()
}

type DiscussionBlock = {
  prompt: QnaPrompt
  pendingQuestions: Question[]
  approvedQuestions: Question[]
}

type MergedActiveRow =
  | { kind: 'poll'; sortAt: string; poll: Poll }
  | { kind: 'qna'; sortAt: string }
  | { kind: 'discussion'; sortAt: string; block: DiscussionBlock }

type MergedInactiveRow =
  | { kind: 'poll'; sortAt: string; poll: Poll }
  | { kind: 'qna'; sortAt: string }
  | { kind: 'discussion'; sortAt: string; block: DiscussionBlock }

export function SessionActiveActivitiesPanel({
  activitiesScope = 'all',
  openPolls,
  closedPolls,
  qnaOpen,
  showInactiveQna,
  audienceQnaSortKey,
  audiencePendingQuestions,
  audienceApprovedQuestions,
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
  onDeleteDiscussion,
  onApproveDiscussionQuestion,
  onHideDiscussionQuestion,
  onApproveAudienceQuestion,
  onHideAudienceQuestion,
  onBindPollWidget,
  onBindDiscussionWidget
}: SessionActiveActivitiesPanelProps) {
  const [deleteTarget, setDeleteTarget] = useState<
    null | { kind: 'poll'; id: string } | { kind: 'qna' } | { kind: 'discussion'; id: string }
  >(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const sortedOpenPolls = useMemo(() => sortByCreatedAsc(openPolls), [openPolls])
  const sortedClosedPolls = useMemo(() => sortByCreatedAsc(closedPolls), [closedPolls])
  const sortedOpenPrompts = useMemo(() => sortByCreatedAsc(openPrompts), [openPrompts])
  const sortedClosedPrompts = useMemo(() => sortByCreatedAsc(closedPrompts), [closedPrompts])

  const discussionBlockFor = (prompt: QnaPrompt): DiscussionBlock => {
    const forPrompt = questions.filter((q) => q.prompt_id === prompt.id)
    const pendingQuestions = sortByCreatedAsc(
      forPrompt.filter((q) => q.status === 'pending')
    )
    const approvedQuestions = sortByCreatedAsc(
      forPrompt.filter((q) => q.status === 'approved')
    )
    return { prompt, pendingQuestions, approvedQuestions }
  }

  const mergedActiveRows = useMemo((): MergedActiveRow[] => {
    const rows: MergedActiveRow[] = []
    if (activitiesScope !== 'discussions-only') {
      for (const poll of sortedOpenPolls) {
        rows.push({ kind: 'poll', sortAt: poll.created_at, poll })
      }
    }
    if (activitiesScope === 'polls-only') {
      rows.sort((a, b) => sortKeyMs(a.sortAt) - sortKeyMs(b.sortAt))
      return rows
    }
    if (activitiesScope === 'discussions-only') {
      for (const prompt of sortedOpenPrompts) {
        rows.push({
          kind: 'discussion',
          sortAt: prompt.created_at,
          block: discussionBlockFor(prompt)
        })
      }
      rows.sort((a, b) => sortKeyMs(a.sortAt) - sortKeyMs(b.sortAt))
      return rows
    }
    if (activitiesScope === 'qna-only') {
      if (qnaOpen) {
        rows.push({ kind: 'qna', sortAt: audienceQnaSortKey })
      }
      return rows
    }
    if (qnaOpen) {
      rows.push({ kind: 'qna', sortAt: audienceQnaSortKey })
    }
    for (const prompt of sortedOpenPrompts) {
      rows.push({
        kind: 'discussion',
        sortAt: prompt.created_at,
        block: discussionBlockFor(prompt)
      })
    }
    rows.sort((a, b) => sortKeyMs(a.sortAt) - sortKeyMs(b.sortAt))
    return rows
  }, [
    activitiesScope,
    sortedOpenPolls,
    sortedOpenPrompts,
    qnaOpen,
    audienceQnaSortKey,
    questions
  ])

  const mergedInactiveRows = useMemo((): MergedInactiveRow[] => {
    const rows: MergedInactiveRow[] = []
    if (activitiesScope !== 'discussions-only') {
      for (const poll of sortedClosedPolls) {
        rows.push({ kind: 'poll', sortAt: poll.created_at, poll })
      }
    }
    if (activitiesScope === 'polls-only') {
      rows.sort((a, b) => sortKeyMs(a.sortAt) - sortKeyMs(b.sortAt))
      return rows
    }
    if (activitiesScope === 'discussions-only') {
      for (const prompt of sortedClosedPrompts) {
        rows.push({
          kind: 'discussion',
          sortAt: prompt.created_at,
          block: discussionBlockFor(prompt)
        })
      }
      rows.sort((a, b) => sortKeyMs(a.sortAt) - sortKeyMs(b.sortAt))
      return rows
    }
    if (activitiesScope === 'qna-only') {
      if (showInactiveQna && !qnaOpen) {
        rows.push({ kind: 'qna', sortAt: audienceQnaSortKey })
      }
      return rows
    }
    /** Never show inactive Q&amp;A while the channel is open — avoids duplicating the same question lists. */
    if (showInactiveQna && !qnaOpen) {
      rows.push({ kind: 'qna', sortAt: audienceQnaSortKey })
    }
    for (const prompt of sortedClosedPrompts) {
      rows.push({
        kind: 'discussion',
        sortAt: prompt.created_at,
        block: discussionBlockFor(prompt)
      })
    }
    rows.sort((a, b) => sortKeyMs(a.sortAt) - sortKeyMs(b.sortAt))
    return rows
  }, [
    activitiesScope,
    sortedClosedPolls,
    sortedClosedPrompts,
    showInactiveQna,
    qnaOpen,
    audienceQnaSortKey,
    questions
  ])

  const hasAnyActivity =
    mergedActiveRows.length > 0 || mergedInactiveRows.length > 0

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
      <DeleteActivityConfirmModal
        open={deleteTarget !== null}
        onCancel={closeDeleteModal}
        onConfirm={confirmDelete}
        busy={deleteBusy}
        error={deleteError}
      />
      {!hasAnyActivity ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center">
          <p className="text-sm text-muted">
            {activitiesScope === 'polls-only'
              ? 'No polls yet. Create one with the poll builder on the left.'
              : activitiesScope === 'discussions-only'
                ? 'No discussions yet. Create one with the discussion builder on the left.'
                : activitiesScope === 'qna-only'
                  ? 'Q&A is not open yet. Use the panel on the left to start collecting audience questions.'
                  : 'No active activities right now. Open a poll, Q&A, or discussion from the moderation tools below.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {mergedActiveRows.map((row) => {
            if (row.kind === 'poll') {
              return (
                <ActivePollActivityCard
                  key={`poll-open-${row.poll.id}`}
                  poll={row.poll}
                  variant="active"
                  onConfigure={onConfigurePoll}
                  onStop={onStopPoll}
                  onDelete={() => setDeleteTarget({ kind: 'poll', id: row.poll.id })}
                  onBindWidget={onBindPollWidget}
                />
              )
            }
            if (row.kind === 'qna') {
              return (
                <ActiveQnaActivityCard
                  key="qna-active"
                  pendingQuestions={audiencePendingQuestions}
                  approvedQuestions={audienceApprovedQuestions}
                  variant="active"
                  onStop={onStopQna}
                  onDelete={() => setDeleteTarget({ kind: 'qna' })}
                  onApproveQuestion={onApproveAudienceQuestion}
                  onHideQuestion={onHideAudienceQuestion}
                />
              )
            }
            const { prompt, pendingQuestions, approvedQuestions } = row.block
            return (
              <ActiveDiscussionActivityCard
                key={`discussion-open-${prompt.id}`}
                prompt={prompt}
                pendingQuestions={pendingQuestions}
                approvedQuestions={approvedQuestions}
                variant="active"
                onStop={onStopDiscussion}
                onDelete={() => setDeleteTarget({ kind: 'discussion', id: prompt.id })}
                onApproveQuestion={onApproveDiscussionQuestion}
                onHideQuestion={onHideDiscussionQuestion}
                onBindWidget={onBindDiscussionWidget}
              />
            )
          })}

          {mergedInactiveRows.map((row) => {
            if (row.kind === 'poll') {
              return (
                <ActivePollActivityCard
                  key={`poll-closed-${row.poll.id}`}
                  poll={row.poll}
                  variant="inactive"
                  onResume={onResumePoll}
                  onDelete={() => setDeleteTarget({ kind: 'poll', id: row.poll.id })}
                  onBindWidget={onBindPollWidget}
                />
              )
            }
            if (row.kind === 'qna') {
              return (
                <ActiveQnaActivityCard
                  key="qna-inactive"
                  pendingQuestions={audiencePendingQuestions}
                  approvedQuestions={audienceApprovedQuestions}
                  variant="inactive"
                  onResume={onResumeQna}
                  onDelete={() => setDeleteTarget({ kind: 'qna' })}
                  onApproveQuestion={onApproveAudienceQuestion}
                  onHideQuestion={onHideAudienceQuestion}
                />
              )
            }
            const { prompt, pendingQuestions, approvedQuestions } = row.block
            return (
              <ActiveDiscussionActivityCard
                key={`discussion-closed-${prompt.id}`}
                prompt={prompt}
                pendingQuestions={pendingQuestions}
                approvedQuestions={approvedQuestions}
                variant="inactive"
                onResume={onResumeDiscussion}
                onDelete={() => setDeleteTarget({ kind: 'discussion', id: prompt.id })}
                onApproveQuestion={onApproveDiscussionQuestion}
                onHideQuestion={onHideDiscussionQuestion}
                onBindWidget={onBindDiscussionWidget}
              />
            )
          })}
        </div>
      )}
    </>
  )
}
