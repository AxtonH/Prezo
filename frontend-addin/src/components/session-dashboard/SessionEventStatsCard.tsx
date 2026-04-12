import type { SessionStatus } from '../../api/types'

export interface SessionEventStatsCardProps {
  activityCount: number
  uniqueParticipants: number | null
  status: SessionStatus
}

export function SessionEventStatsCard({
  activityCount,
  uniqueParticipants,
  status
}: SessionEventStatsCardProps) {
  const isLive = status === 'active'

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
      <h3 className="font-semibold text-slate-900 mb-4">Event stats</h3>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-slate-600">Activities</span>
          <span className="font-semibold text-slate-900 tabular-nums">{activityCount}</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-slate-600">Participants</span>
          <span className="font-semibold text-slate-900 tabular-nums">
            {uniqueParticipants === null ? '—' : uniqueParticipants}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-slate-600">Status</span>
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              isLive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {isLive ? 'Live' : 'Ended'}
          </span>
        </div>
      </div>
    </div>
  )
}
