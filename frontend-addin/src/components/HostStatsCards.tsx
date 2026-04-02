import type { HostDashboardStats } from '../api/types'

const CARDS: {
  key: keyof HostDashboardStats
  label: string
  icon: string
  hint?: string
}[] = [
  { key: 'active_sessions', label: 'Active sessions', icon: 'event_available' },
  {
    key: 'active_events',
    label: 'Active events',
    icon: 'bolt',
    hint: 'Open Q&A, polls, and prompts across your sessions'
  },
  {
    key: 'unique_participants',
    label: 'Participants',
    icon: 'groups',
    hint: 'Distinct audience members (by device) across your sessions'
  }
]

function formatCount(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

export function HostStatsCards(props: {
  stats: HostDashboardStats | null
  isLoading: boolean
}) {
  const { stats, isLoading } = props

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 w-full">
      {CARDS.map(({ key, label, icon, hint }) => (
        <div
          key={key}
          className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm flex flex-col gap-2 min-h-[108px] justify-center"
          title={hint ?? label}
        >
          <div className="flex items-center gap-2 text-muted">
            <span className="material-symbols-outlined text-lg text-primary/80">{icon}</span>
            <span className="text-[0.65rem] font-bold uppercase tracking-[0.14em]">{label}</span>
          </div>
          {isLoading ? (
            <div className="h-9 w-20 rounded-lg bg-slate-100 animate-pulse" aria-hidden />
          ) : (
            <p className="text-3xl font-extrabold tracking-tight text-slate-900 tabular-nums">
              {formatCount(stats?.[key] ?? 0)}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
