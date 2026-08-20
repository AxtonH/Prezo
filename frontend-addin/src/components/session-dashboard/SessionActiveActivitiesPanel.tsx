import { useMemo, useState } from 'react'

import type { Poll, PollMode, QnaPrompt, Question } from '../../api/types'
import type { WidgetSlideLinks } from '../../office/widgetShapes'
import { ActiveDiscussionActivityCard } from './ActiveDiscussionActivityCard'
import { ActivePollActivityCard } from './ActivePollActivityCard'
import { ActiveQnaActivityCard } from './ActiveQnaActivityCard'
import { DeleteActivityConfirmModal } from './DeleteActivityConfirmModal'
import { EditActivityModal, type EditActivityTarget, type PollEditUpdate } from './EditActivityModal'
import { ResetActivityConfirmModal } from './ResetActivityConfirmModal'

/** Dashboard toolbar sort. `newest` = creation time, newest on top (the default there). */
export type ActivitySortMode = 'newest' | 'title' | 'slide'

export interface SessionActiveActivitiesPanelProps {
  /** Filter rows by activity title or linked slide number (dashboard toolbar search). */
  searchQuery?: string
  /**
   * Toolbar sort, applied across the whole list — active and inactive cards
   * interleave. Omitted → legacy grouped, oldest-first order (scoped
   * workspace pages).
   */
  sortBy?: ActivitySortMode
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
  /** Open the editing station focused on the session Q&amp;A artifact. */
  onConfigureQna?: () => void
  /** Open the editing station focused on this discussion's artifact. */
  onConfigureDiscussion?: (promptId: string) => void
  onStopPoll?: (pollId: string) => void
  onStopQna?: () => void
  onStopDiscussion?: (promptId: string) => void
  onResumePoll?: (pollId: string) => void
  onResumeQna?: () => void
  onResumeDiscussion?: (promptId: string) => void
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
  /** Current control mode of session Q&A (for the card's chip). */
  qnaControlMode?: PollMode
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
  /** PowerPoint: bind the slide poll widget to this session poll (tags + text only). */
  onBindPollWidget?: (pollId: string) => Promise<void>
  /** PowerPoint: bind the slide open-discussion widget to this prompt (tags + text only). */
  onBindDiscussionWidget?: (promptId: string) => Promise<void>
  /** PowerPoint: deck slide numbers hosting a widget linked to each activity. */
  widgetSlideLinks?: WidgetSlideLinks
}

function sortByCreatedAsc<T extends { created_at: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
}

function sortKeyMs(iso: string): number {
  return new Date(iso).getTime()
}

/**
 * Toolbar search also matches activity-type words ("polls", "q&a",
 * "open discussion"), prefix-style, so partial typing narrows by kind too.
 */
const KIND_SEARCH_ALIASES: Record<'poll' | 'qna' | 'discussion', string[]> = {
  poll: ['poll', 'polls'],
  qna: ['qna', 'q&a', 'audience q&a', 'questions'],
  discussion: ['discussion', 'discussions', 'open discussion', 'open discussions']
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
  searchQuery,
  sortBy,
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
  qnaControlMode,
  onSetQnaMode,
  onSetDiscussionMode,
  onUpdatePoll,
  onUpdateDiscussion,
  onApproveDiscussionQuestion,
  onHideDiscussionQuestion,
  onApproveAudienceQuestion,
  onHideAudienceQuestion,
  onBindPollWidget,
  onBindDiscussionWidget,
  widgetSlideLinks
}: SessionActiveActivitiesPanelProps) {
  const [deleteTarget, setDeleteTarget] = useState<
    null | { kind: 'poll'; id: string } | { kind: 'qna' } | { kind: 'discussion'; id: string }
  >(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [resetTarget, setResetTarget] = useState<
    null | { kind: 'poll'; id: string } | { kind: 'qna' } | { kind: 'discussion'; id: string }
  >(null)
  const [resetBusy, setResetBusy] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<EditActivityTarget | null>(null)

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

  const rowTitle = (row: MergedActiveRow | MergedInactiveRow): string =>
    row.kind === 'poll'
      ? row.poll.question
      : row.kind === 'qna'
        ? 'Audience Q&A'
        : row.block.prompt.prompt

  const rowSlideNumbers = (row: MergedActiveRow | MergedInactiveRow): number[] => {
    const refs =
      row.kind === 'poll'
        ? widgetSlideLinks?.polls[row.poll.id]
        : row.kind === 'qna'
          ? widgetSlideLinks?.qna
          : widgetSlideLinks?.prompts[row.block.prompt.id]
    return (refs ?? []).map((r) => r.number)
  }

  /**
   * Toolbar search + sort. Sorting applies across the WHOLE list — active and
   * inactive cards interleave (a sort that only reordered within the status
   * blocks looked broken with one card per block). Without a sort, the legacy
   * order stands: active block first, oldest first within each.
   */
  type CombinedRow = { row: MergedActiveRow | MergedInactiveRow; active: boolean }

  const combinedRows: CombinedRow[] = [
    ...mergedActiveRows.map((row) => ({ row, active: true })),
    ...mergedInactiveRows.map((row) => ({ row, active: false }))
  ]

  const refineRows = (items: CombinedRow[]): CombinedRow[] => {
    let out = items
    const q = (searchQuery ?? '').trim().toLowerCase()
    if (q) {
      // "5" or "slide 5" matches activities linked to deck slide 5.
      const slideQ = q.replace(/^slide\s*/, '')
      out = out.filter(
        ({ row }) =>
          rowTitle(row).toLowerCase().includes(q) ||
          KIND_SEARCH_ALIASES[row.kind].some((alias) => alias.startsWith(q)) ||
          (slideQ !== '' && rowSlideNumbers(row).some((n) => String(n) === slideQ))
      )
    }
    if (!sortBy) {
      return out
    }
    const sorted = [...out]
    if (sortBy === 'newest') {
      sorted.sort((a, b) => sortKeyMs(b.row.sortAt) - sortKeyMs(a.row.sortAt))
    } else if (sortBy === 'title') {
      sorted.sort((a, b) =>
        rowTitle(a.row).localeCompare(rowTitle(b.row), undefined, { sensitivity: 'base' })
      )
    } else {
      // Slide order: first linked slide wins; unlinked activities sink, newest first.
      sorted.sort((a, b) => {
        const slidesA = rowSlideNumbers(a.row)
        const slidesB = rowSlideNumbers(b.row)
        const minA = slidesA.length > 0 ? Math.min(...slidesA) : Infinity
        const minB = slidesB.length > 0 ? Math.min(...slidesB) : Infinity
        if (minA !== minB) {
          return minA - minB
        }
        return sortKeyMs(b.row.sortAt) - sortKeyMs(a.row.sortAt)
      })
    }
    return sorted
  }

  const visibleRows = refineRows(combinedRows)

  const hasAnyActivity =
    mergedActiveRows.length > 0 || mergedInactiveRows.length > 0
  const searchHidesEverything = hasAnyActivity && visibleRows.length === 0

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

  const closeResetModal = () => {
    if (!resetBusy) {
      setResetTarget(null)
      setResetError(null)
    }
  }

  const confirmReset = async () => {
    if (!resetTarget) {
      return
    }
    setResetBusy(true)
    setResetError(null)
    try {
      if (resetTarget.kind === 'poll') {
        await onResetPoll?.(resetTarget.id)
      } else if (resetTarget.kind === 'qna') {
        await onResetQna?.()
      } else {
        await onResetDiscussion?.(resetTarget.id)
      }
      setResetTarget(null)
      setResetError(null)
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setResetBusy(false)
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
      <ResetActivityConfirmModal
        open={resetTarget !== null}
        onCancel={closeResetModal}
        onConfirm={confirmReset}
        busy={resetBusy}
        error={resetError}
      />
      <EditActivityModal
        target={editTarget}
        onCancel={() => setEditTarget(null)}
        onSavePoll={onUpdatePoll}
        onSaveDiscussion={onUpdateDiscussion}
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
      ) : searchHidesEverything ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center">
          <p className="text-sm text-muted">
            No activities match your search. Try another title or slide number.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visibleRows.map(({ row, active }) => {
            if (row.kind === 'poll') {
              return (
                <ActivePollActivityCard
                  key={`poll-${active ? 'open' : 'closed'}-${row.poll.id}`}
                  poll={row.poll}
                  linkedSlides={widgetSlideLinks?.polls[row.poll.id]}
                  variant={active ? 'active' : 'inactive'}
                  onConfigure={onConfigurePoll}
                  onEdit={
                    onUpdatePoll
                      ? () => setEditTarget({ kind: 'poll', poll: row.poll })
                      : undefined
                  }
                  onStop={onStopPoll}
                  onResume={active ? undefined : onResumePoll}
                  onDelete={() => setDeleteTarget({ kind: 'poll', id: row.poll.id })}
                  onReset={
                    onResetPoll
                      ? () => setResetTarget({ kind: 'poll', id: row.poll.id })
                      : undefined
                  }
                  onBindWidget={onBindPollWidget}
                  onSetMode={onSetPollMode}
                />
              )
            }
            if (row.kind === 'qna') {
              return (
                <ActiveQnaActivityCard
                  key={active ? 'qna-active' : 'qna-inactive'}
                  linkedSlides={widgetSlideLinks?.qna}
                  pendingQuestions={audiencePendingQuestions}
                  approvedQuestions={audienceApprovedQuestions}
                  variant={active ? 'active' : 'inactive'}
                  mode={qnaControlMode}
                  onConfigure={onConfigureQna}
                  onStop={onStopQna}
                  onResume={active ? undefined : onResumeQna}
                  onDelete={() => setDeleteTarget({ kind: 'qna' })}
                  onReset={onResetQna ? () => setResetTarget({ kind: 'qna' }) : undefined}
                  onSetMode={onSetQnaMode}
                  onApproveQuestion={onApproveAudienceQuestion}
                  onHideQuestion={onHideAudienceQuestion}
                />
              )
            }
            const { prompt, pendingQuestions, approvedQuestions } = row.block
            return (
              <ActiveDiscussionActivityCard
                key={`discussion-${active ? 'open' : 'closed'}-${prompt.id}`}
                prompt={prompt}
                linkedSlides={widgetSlideLinks?.prompts[prompt.id]}
                pendingQuestions={pendingQuestions}
                approvedQuestions={approvedQuestions}
                variant={active ? 'active' : 'inactive'}
                onConfigure={onConfigureDiscussion}
                onEdit={
                  onUpdateDiscussion
                    ? () => setEditTarget({ kind: 'discussion', prompt })
                    : undefined
                }
                onStop={onStopDiscussion}
                onResume={active ? undefined : onResumeDiscussion}
                onDelete={() => setDeleteTarget({ kind: 'discussion', id: prompt.id })}
                onReset={
                  onResetDiscussion
                    ? () => setResetTarget({ kind: 'discussion', id: prompt.id })
                    : undefined
                }
                onSetMode={onSetDiscussionMode}
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
