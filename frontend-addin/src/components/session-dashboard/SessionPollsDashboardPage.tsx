import { useLayoutEffect, useMemo, useRef, useState } from 'react'

import type { Poll, Session } from '../../api/types'
import { SessionActiveActivitiesPanel } from './SessionActiveActivitiesPanel'
import { SessionDashboardHeader } from './SessionDashboardHeader'
import { SessionPollBuilderCard } from './SessionPollBuilderCard'
import { SessionPollMetricsGrid } from './SessionPollMetricsGrid'

const LG_MEDIA = '(min-width: 1024px)'

function sortByCreatedAsc<T extends { created_at: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
}

export interface SessionPollsDashboardPageProps {
  session: Session
  hostDisplayName: string
  polls: Poll[]
  onConfigurePoll?: (pollId: string) => void
  onStopPoll?: (pollId: string) => void | Promise<void>
  onResumePoll?: (pollId: string) => void | Promise<void>
  onDeletePoll?: (pollId: string) => void | Promise<void>
  onCreatePoll: (question: string, options: string[], allowMultiple: boolean) => Promise<void>
}

export function SessionPollsDashboardPage({
  session,
  hostDisplayName,
  polls,
  onConfigurePoll,
  onStopPoll,
  onResumePoll,
  onDeletePoll,
  onCreatePoll
}: SessionPollsDashboardPageProps) {
  const pollBuilderStackRef = useRef<HTMLDivElement>(null)
  const [activitiesRailMaxPx, setActivitiesRailMaxPx] = useState<number | null>(null)
  const [creatingPoll, setCreatingPoll] = useState(false)

  useLayoutEffect(() => {
    const stack = pollBuilderStackRef.current
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

  const openPolls = useMemo(
    () => polls.filter((p) => p.status === 'open'),
    [polls]
  )

  const closedPolls = useMemo(
    () => sortByCreatedAsc(polls.filter((p) => p.status === 'closed')),
    [polls]
  )

  const openPollCount = openPolls.length

  const pollVoteTotal = useMemo(
    () =>
      polls.reduce(
        (sum, poll) => sum + poll.options.reduce((s, opt) => s + opt.votes, 0),
        0
      ),
    [polls]
  )

  const handleCreatePoll = async (question: string, options: string[], allowMultiple: boolean) => {
    setCreatingPoll(true)
    try {
      await onCreatePoll(question, options, allowMultiple)
    } finally {
      setCreatingPoll(false)
    }
  }

  return (
    <div className="space-y-4 lg:space-y-5">
      <SessionDashboardHeader title={session.title ?? ''} hostLabel={hostDisplayName} />

      <div className="space-y-2 lg:space-y-3">
        <div className="session-dashboard-body-grid grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-2 lg:items-start">
          <div ref={pollBuilderStackRef} className="min-w-0 space-y-4 lg:[grid-area:stack]">
            <SessionPollBuilderCard onCreatePoll={handleCreatePoll} isBusy={creatingPoll} />
          </div>
          <div className="min-w-0 w-full lg:[grid-area:participants]">
            <SessionPollMetricsGrid openPollCount={openPollCount} pollVoteTotal={pollVoteTotal} />
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
                    activitiesScope="polls-only"
                    openPolls={openPolls}
                    closedPolls={closedPolls}
                    qnaOpen={false}
                    showInactiveQna={false}
                    audienceQnaSortKey={session.created_at}
                    audiencePendingQuestions={[]}
                    audienceApprovedQuestions={[]}
                    openPrompts={[]}
                    closedPrompts={[]}
                    questions={[]}
                    onConfigurePoll={onConfigurePoll}
                    onStopPoll={onStopPoll}
                    onStopQna={undefined}
                    onStopDiscussion={undefined}
                    onResumePoll={onResumePoll}
                    onResumeQna={undefined}
                    onResumeDiscussion={undefined}
                    onDeletePoll={onDeletePoll}
                    onDeleteQna={undefined}
                    onDeleteDiscussion={undefined}
                    onApproveDiscussionQuestion={undefined}
                    onHideDiscussionQuestion={undefined}
                    onApproveAudienceQuestion={undefined}
                    onHideAudienceQuestion={undefined}
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
