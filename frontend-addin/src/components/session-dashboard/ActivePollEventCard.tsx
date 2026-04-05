import type { Poll } from '../../api/types'
import { CollapsibleEventPanelShell } from './CollapsibleEventPanelShell'

export interface ActivePollEventCardProps {
  poll: Poll
  /** Stopped polls render at the bottom with inactive styling. */
  variant?: 'active' | 'inactive'
  onConfigure?: (pollId: string) => void
  onStop?: (pollId: string) => void
  /** Re-open a closed poll from the inactive panel. */
  onResume?: (pollId: string) => void
}

export function ActivePollEventCard({
  poll,
  variant = 'active',
  onConfigure,
  onStop,
  onResume
}: ActivePollEventCardProps) {
  const totalVotes = poll.options.reduce((sum, o) => sum + (o.votes ?? 0), 0)
  const inactive = variant === 'inactive'

  return (
    <CollapsibleEventPanelShell
      variant={inactive ? 'inactive' : 'active'}
      icon={
        <div
          className={
            inactive
              ? 'w-10 h-10 rounded-xl bg-slate-500/25 flex items-center justify-center text-slate-700 shrink-0'
              : 'w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0'
          }
        >
          <span className="material-symbols-outlined">bar_chart</span>
        </div>
      }
      titleBlock={
        <div className="min-w-0">
          <h4
            className={`font-bold text-base leading-snug line-clamp-3 ${
              inactive ? 'text-slate-700' : 'text-slate-900'
            }`}
          >
            {poll.question.trim() || 'Untitled poll'}
          </h4>
          <p className={`text-sm mt-1 ${inactive ? 'text-slate-600' : 'text-muted'}`}>Poll</p>
        </div>
      }
    >
      {poll.options.length > 0 ? (
        <div className="p-5 space-y-4">
          {poll.options.map((opt) => {
            const pct =
              totalVotes > 0 ? Math.round(((opt.votes ?? 0) / totalVotes) * 100) : 0
            return (
              <div key={opt.id}>
                <div className="flex justify-between text-sm mb-1.5 gap-2">
                  <span
                    className={`font-medium truncate ${inactive ? 'text-slate-700' : 'text-slate-800'}`}
                  >
                    {opt.label}
                  </span>
                  <span
                    className={`font-bold tabular-nums shrink-0 ${
                      inactive ? 'text-slate-700' : 'text-primary'
                    }`}
                  >
                    {pct}%
                  </span>
                </div>
                <div className={`h-2 rounded-full overflow-hidden ${inactive ? 'bg-slate-300/60' : 'bg-slate-100'}`}>
                  <div
                    className={`h-full rounded-full transition-[width] duration-500 ${
                      inactive ? 'bg-slate-600/70' : 'bg-primary/80'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
          {!inactive ? (
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onConfigure?.(poll.id)
                }}
                className="!px-4 !py-2 !rounded-lg !text-sm !font-semibold !bg-slate-100 !text-slate-800 !border-0 hover:!bg-slate-200 !transition-colors"
              >
                Configure
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onStop?.(poll.id)
                }}
                className="!px-4 !py-2 !rounded-lg !text-sm !font-semibold !bg-rose-50 !text-rose-700 !border !border-rose-200 hover:!bg-rose-100 !transition-colors"
              >
                Stop poll
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onResume?.(poll.id)
                }}
                className="!px-4 !py-2 !rounded-lg !text-sm !font-semibold !bg-emerald-50 !text-emerald-800 !border !border-emerald-200 hover:!bg-emerald-100 !transition-colors"
              >
                Resume poll
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="p-5 pt-0">
          <p className={`text-sm ${inactive ? 'text-slate-600' : 'text-muted'}`}>
            This poll has no options.
          </p>
          {inactive ? (
            <div className="flex flex-wrap gap-2 pt-4">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onResume?.(poll.id)
                }}
                className="!px-4 !py-2 !rounded-lg !text-sm !font-semibold !bg-emerald-50 !text-emerald-800 !border !border-emerald-200 hover:!bg-emerald-100 !transition-colors"
              >
                Resume poll
              </button>
            </div>
          ) : null}
        </div>
      )}
    </CollapsibleEventPanelShell>
  )
}
