import { useLayoutEffect, useMemo, useRef, useState } from 'react'

import type { QnaPrompt, Question, Session } from '../../api/types'
import { SessionActiveActivitiesPanel } from './SessionActiveActivitiesPanel'
import { SessionDashboardHeader } from './SessionDashboardHeader'
import { SessionDiscussionBuilderCard } from './SessionDiscussionBuilderCard'
import { SessionDiscussionMetricsGrid } from './SessionDiscussionMetricsGrid'

const LG_MEDIA = '(min-width: 1024px)'

function sortByCreatedAsc<T extends { created_at: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
}

export interface SessionDiscussionDashboardPageProps {
  session: Session
  hostDisplayName: string
  prompts: QnaPrompt[]
  questions: Question[]
  onStopDiscussion?: (promptId: string) => void | Promise<void>
  onResumeDiscussion?: (promptId: string) => void | Promise<void>
  onDeleteDiscussion?: (promptId: string) => void | Promise<void>
  onApproveDiscussionQuestion?: (questionId: string) => void | Promise<void>
  onHideDiscussionQuestion?: (questionId: string) => void | Promise<void>
  onCreateDiscussion: (prompt: string) => Promise<void>
  /** PowerPoint add-in: bind slide open-discussion widget to a prompt. */
  onBindDiscussionWidget?: (promptId: string) => Promise<void>
}

export function SessionDiscussionDashboardPage({
  session,
  hostDisplayName,
  prompts,
  questions,
  onStopDiscussion,
  onResumeDiscussion,
  onDeleteDiscussion,
  onApproveDiscussionQuestion,
  onHideDiscussionQuestion,
  onCreateDiscussion,
  onBindDiscussionWidget
}: SessionDiscussionDashboardPageProps) {
  const builderStackRef = useRef<HTMLDivElement>(null)
  const [activitiesRailMaxPx, setActivitiesRailMaxPx] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)

  useLayoutEffect(() => {
    const stack = builderStackRef.current
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

  const openPrompts = useMemo(
    () => prompts.filter((p) => p.status === 'open'),
    [prompts]
  )

  const closedPrompts = useMemo(
    () => sortByCreatedAsc(prompts.filter((p) => p.status === 'closed')),
    [prompts]
  )

  const openDiscussionCount = openPrompts.length

  const discussionMessageCount = useMemo(
    () => questions.filter((q) => q.prompt_id != null && q.prompt_id !== '').length,
    [questions]
  )

  const handleCreate = async (text: string) => {
    setCreating(true)
    try {
      await onCreateDiscussion(text)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-4 lg:space-y-5">
      <SessionDashboardHeader title={session.title ?? ''} hostLabel={hostDisplayName} />

      <div className="space-y-2 lg:space-y-3">
        <div className="session-dashboard-body-grid grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-2 lg:items-start">
          <div ref={builderStackRef} className="min-w-0 space-y-4 lg:[grid-area:stack]">
            <SessionDiscussionBuilderCard onCreateDiscussion={handleCreate} isBusy={creating} />
          </div>
          <div className="min-w-0 w-full lg:[grid-area:participants]">
            <SessionDiscussionMetricsGrid
              openDiscussionCount={openDiscussionCount}
              discussionMessageCount={discussionMessageCount}
            />
          </div>
          <div
            className="flex min-h-0 min-w-0 flex-col lg:[grid-area:activities]"
            style={
              activitiesRailMaxPx != null ? { maxHeight: activitiesRailMaxPx } : undefined
            }
          >
            <div className="relative isolate flex min-h-0 h-full min-w-0 w-full flex-col">
              <div
                className="pointer-events-none absolute inset-0 rounded-2xl shadow-card"
                aria-hidden
              />
              <div className="relative z-[1] flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div
                  data-session-activities-scroll
                  className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-white p-3 pb-10 pr-2 [scrollbar-gutter:stable] lg:scroll-smooth session-list-scroll"
                >
                  <SessionActiveActivitiesPanel
                    activitiesScope="discussions-only"
                    openPolls={[]}
                    closedPolls={[]}
                    qnaOpen={false}
                    showInactiveQna={false}
                    audienceQnaSortKey={session.created_at}
                    audiencePendingQuestions={[]}
                    audienceApprovedQuestions={[]}
                    openPrompts={openPrompts}
                    closedPrompts={closedPrompts}
                    questions={questions}
                    onConfigurePoll={undefined}
                    onStopPoll={undefined}
                    onStopQna={undefined}
                    onStopDiscussion={onStopDiscussion}
                    onResumePoll={undefined}
                    onResumeQna={undefined}
                    onResumeDiscussion={onResumeDiscussion}
                    onDeletePoll={undefined}
                    onDeleteQna={undefined}
                    onDeleteDiscussion={onDeleteDiscussion}
                    onApproveDiscussionQuestion={onApproveDiscussionQuestion}
                    onHideDiscussionQuestion={onHideDiscussionQuestion}
                    onApproveAudienceQuestion={undefined}
                    onHideAudienceQuestion={undefined}
                    onBindDiscussionWidget={onBindDiscussionWidget}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
