import { SessionStatCard } from './SessionStatCard'

export interface SessionPollMetricsGridProps {
  /** Polls currently open (live). */
  openPollCount: number
  /** Sum of all option votes across polls in this session (audience selections). */
  pollVoteTotal: number
}

export function SessionPollMetricsGrid({ openPollCount, pollVoteTotal }: SessionPollMetricsGridProps) {
  return (
    <div className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 sm:items-stretch">
      <div className="min-w-0 w-full">
        <SessionStatCard
          title="Poll activities"
          value={openPollCount}
          description="Polls currently open and collecting responses."
          className="w-full min-h-[7.5rem] sm:min-h-[8rem]"
        />
      </div>
      <div className="min-w-0 w-full">
        <SessionStatCard
          title="Poll interacts"
          value={pollVoteTotal}
          description="Total votes cast across all poll options in this session."
          className="w-full min-h-[7.5rem] sm:min-h-[8rem]"
        />
      </div>
    </div>
  )
}
