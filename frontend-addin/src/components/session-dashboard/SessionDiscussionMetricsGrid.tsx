import { SessionStatCard } from './SessionStatCard'

export interface SessionDiscussionMetricsGridProps {
  /** Discussion prompts currently open. */
  openDiscussionCount: number
  /** Audience questions posted in discussion threads (linked to a prompt). */
  discussionMessageCount: number
}

export function SessionDiscussionMetricsGrid({
  openDiscussionCount,
  discussionMessageCount
}: SessionDiscussionMetricsGridProps) {
  return (
    <div className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 sm:items-stretch">
      <div className="min-w-0 w-full">
        <SessionStatCard
          title="Discussion activities"
          value={openDiscussionCount}
          description="Open discussions accepting new thread messages."
          className="w-full min-h-[7.5rem] sm:min-h-[8rem]"
        />
      </div>
      <div className="min-w-0 w-full">
        <SessionStatCard
          title="Discussion interacts"
          value={discussionMessageCount}
          description="Questions posted in open discussion threads for this session."
          className="w-full min-h-[7.5rem] sm:min-h-[8rem]"
        />
      </div>
    </div>
  )
}
