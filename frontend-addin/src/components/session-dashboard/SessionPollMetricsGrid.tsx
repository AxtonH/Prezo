import { SessionStatCard } from './SessionStatCard'

export interface SessionPollMetricsGridProps {
  /** Polls currently open (live). */
  openPollCount: number
  /** Sum of all option votes across polls in this session (audience selections). */
  pollVoteTotal: number
}

export function SessionPollMetricsGrid({ openPollCount, pollVoteTotal }: SessionPollMetricsGridProps) {
  return (
    <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 min-[480px]:items-stretch">
      <div className="min-w-0 flex min-h-0">
        <SessionStatCard
          title="Poll activities"
          value={openPollCount}
          description="Polls currently open and collecting responses."
        />
      </div>
      <div className="min-w-0 flex min-h-0">
        <SessionStatCard
          title="Poll interacts"
          value={pollVoteTotal}
          description="Total votes cast across all poll options in this session."
        />
      </div>
    </div>
  )
}
