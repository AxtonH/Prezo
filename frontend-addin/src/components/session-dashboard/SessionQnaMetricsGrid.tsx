import { SessionStatCard } from './SessionStatCard'

export interface SessionQnaMetricsGridProps {
  /** Audience Q&amp;A questions still awaiting host moderation. */
  pendingCount: number
  /** Audience Q&amp;A questions approved and visible to the audience. */
  approvedCount: number
}

export function SessionQnaMetricsGrid({
  pendingCount,
  approvedCount
}: SessionQnaMetricsGridProps) {
  return (
    <div className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 sm:items-stretch">
      <div className="min-w-0 w-full">
        <SessionStatCard
          title="Pending questions"
          value={pendingCount}
          description="Audience questions awaiting your approval."
          className="w-full min-h-[7.5rem] sm:min-h-[8rem]"
        />
      </div>
      <div className="min-w-0 w-full">
        <SessionStatCard
          title="Approved questions"
          value={approvedCount}
          description="Questions live on audience devices, ready to be upvoted."
          className="w-full min-h-[7.5rem] sm:min-h-[8rem]"
        />
      </div>
    </div>
  )
}
