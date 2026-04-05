import { ProfileAvatar } from '../ProfileAvatar'

import { SessionStatCard } from './SessionStatCard'

const PLACEHOLDER_RINGS: { bg: string; z: string }[] = [
  { bg: 'bg-slate-200', z: 'z-[25]' },
  { bg: 'bg-slate-300', z: 'z-[20]' },
  { bg: 'bg-slate-200', z: 'z-[15]' }
]

export interface SessionSessionMetricsGridProps {
  /** Distinct audience clients with at least one vote; null when stats are not loaded yet. */
  uniqueParticipants: number | null
  /** Submissions, upvotes, and poll selections; null when stats are not loaded yet. */
  totalInteractions: number | null
  /** Polls + discussion prompts + audience Q&amp;A slot when that channel exists or existed. */
  activityCount: number
  hostDisplayName: string
  hostAvatarUrl: string | null
}

export function SessionSessionMetricsGrid({
  uniqueParticipants,
  totalInteractions,
  activityCount,
  hostDisplayName,
  hostAvatarUrl
}: SessionSessionMetricsGridProps) {
  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-card">
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">
            Participants
          </p>
          <span className="text-lg font-bold text-primary tabular-nums">
            {uniqueParticipants === null ? '—' : String(uniqueParticipants)}
          </span>
        </div>
        <p className="text-xs text-muted mb-4">
          {uniqueParticipants === null
            ? 'Live counts load when you open the dashboard.'
            : 'Unique people who joined in (tracked via votes and poll responses).'}
        </p>
        <div className="flex items-center -space-x-2">
          <div className="relative z-[30] ring-2 ring-white rounded-full" title={hostDisplayName}>
            <ProfileAvatar avatarUrl={hostAvatarUrl} displayName={hostDisplayName} sizeClass="w-9 h-9" />
          </div>
          {PLACEHOLDER_RINGS.map(({ bg, z }, i) => (
            <div
              key={i}
              className={`relative ${z} h-9 w-9 rounded-full ${bg} ring-2 ring-white`}
              aria-hidden
            />
          ))}
          {typeof uniqueParticipants === 'number' && uniqueParticipants > 4 ? (
            <div
              className="relative z-0 flex h-9 min-w-[2.25rem] items-center justify-center rounded-full bg-primary text-[0.65rem] font-bold text-white ring-2 ring-white px-1.5"
              title="Additional participants"
            >
              +{uniqueParticipants - 4}
            </div>
          ) : null}
        </div>
      </div>

      <SessionStatCard
        title="Interacts"
        value={totalInteractions}
        description={
          totalInteractions === null
            ? 'Total interactions load with session stats.'
            : 'Messages, poll answers, and question upvotes — one person can add many.'
        }
      />

      <SessionStatCard
        title="Activity"
        value={activityCount}
        description="Polls, discussion prompts, and audience Q&amp;A (when present)."
      />
    </div>
  )
}
