import type { Poll } from '../../api/types'

export interface ActivePollEventCardProps {
  poll: Poll
  onConfigure?: (pollId: string) => void
  onStop?: (pollId: string) => void
}

export function ActivePollEventCard({ poll, onConfigure, onStop }: ActivePollEventCardProps) {
  const totalVotes = poll.options.reduce((sum, o) => sum + (o.votes ?? 0), 0)

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <span className="material-symbols-outlined">bar_chart</span>
          </div>
          <div className="min-w-0">
            <h4 className="font-bold text-slate-900 text-base leading-snug line-clamp-3">
              {poll.question.trim() || 'Untitled poll'}
            </h4>
            <p className="text-sm text-muted mt-1">Poll</p>
          </div>
        </div>
        <span className="bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-widest shrink-0">
          Active
        </span>
      </div>
      {poll.options.length > 0 ? (
        <div className="p-5 space-y-4">
          {poll.options.map((opt) => {
            const pct =
              totalVotes > 0 ? Math.round(((opt.votes ?? 0) / totalVotes) * 100) : 0
            return (
              <div key={opt.id}>
                <div className="flex justify-between text-sm mb-1.5 gap-2">
                  <span className="text-slate-800 font-medium truncate">{opt.label}</span>
                  <span className="text-primary font-bold tabular-nums shrink-0">{pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/80 transition-[width] duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={() => onConfigure?.(poll.id)}
              className="!px-4 !py-2 !rounded-lg !text-sm !font-semibold !bg-slate-100 !text-slate-800 !border-0 hover:!bg-slate-200 !transition-colors"
            >
              Configure
            </button>
            <button
              type="button"
              onClick={() => onStop?.(poll.id)}
              className="!px-4 !py-2 !rounded-lg !text-sm !font-semibold !bg-rose-50 !text-rose-700 !border !border-rose-200 hover:!bg-rose-100 !transition-colors"
            >
              Stop poll
            </button>
          </div>
        </div>
      ) : (
        <div className="p-5 pt-0">
          <p className="text-sm text-muted">This poll has no options.</p>
        </div>
      )}
    </div>
  )
}
