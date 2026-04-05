import type { Poll, Question } from '../../api/types'

interface SessionActiveModulesPanelProps {
  openPoll: Poll | null
  /** Audience questions pending approval */
  pendingAudienceCount: number
  /** First pending question for preview */
  pendingPreview: Question | null
  qnaOpen: boolean
  onConfigurePoll?: () => void
  onStopPoll?: () => void
  onAddModule?: () => void
}

function formatRelativeTime(iso: string) {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const diff = Date.now() - t
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return `${h}h ago`
}

export function SessionActiveModulesPanel({
  openPoll,
  pendingAudienceCount,
  pendingPreview,
  qnaOpen,
  onConfigurePoll,
  onStopPoll,
  onAddModule
}: SessionActiveModulesPanelProps) {
  const totalVotes =
    openPoll?.options.reduce((sum, o) => sum + (o.votes ?? 0), 0) ?? 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-bold text-slate-900">Active modules</h3>
        <button
          type="button"
          onClick={onAddModule}
          disabled={!onAddModule}
          className="!inline-flex !items-center !gap-1.5 !text-sm !font-semibold !text-primary !bg-transparent !border-0 !p-0 !shadow-none hover:!underline disabled:!opacity-40 disabled:!cursor-not-allowed"
        >
          <span className="material-symbols-outlined text-lg">add</span>
          Add module
        </button>
      </div>

      {/* Live polling */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <span className="material-symbols-outlined">bar_chart</span>
            </div>
            <div className="min-w-0">
              <h4 className="font-bold text-slate-900">Live polling</h4>
              {openPoll ? (
                <p className="text-sm text-muted truncate">{openPoll.question}</p>
              ) : (
                <p className="text-sm text-muted">No poll is open right now.</p>
              )}
            </div>
          </div>
          {openPoll ? (
            <span className="bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-widest shrink-0">
              Active
            </span>
          ) : (
            <span className="bg-slate-100 text-muted px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-widest shrink-0">
              Idle
            </span>
          )}
        </div>
        {openPoll && openPoll.options.length > 0 ? (
          <div className="p-5 space-y-4">
            {openPoll.options.map((opt) => {
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
                onClick={onConfigurePoll}
                className="!px-4 !py-2 !rounded-lg !text-sm !font-semibold !bg-slate-100 !text-slate-800 !border-0 hover:!bg-slate-200 !transition-colors"
              >
                Configure
              </button>
              <button
                type="button"
                onClick={onStopPoll}
                className="!px-4 !py-2 !rounded-lg !text-sm !font-semibold !bg-rose-50 !text-rose-700 !border !border-rose-200 hover:!bg-rose-100 !transition-colors"
              >
                Stop poll
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 pt-0">
            <p className="text-sm text-muted">Start a poll from the moderation tools below.</p>
          </div>
        )}
      </div>

      {/* Q&A queue */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <span className="material-symbols-outlined">forum</span>
            </div>
            <div className="min-w-0">
              <h4 className="font-bold text-slate-900">Q&amp;A queue</h4>
              <p className="text-sm text-muted">
                {pendingAudienceCount} unanswered question{pendingAudienceCount === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <span
            className={`px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-widest shrink-0 ${
              qnaOpen ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-muted'
            }`}
          >
            {qnaOpen ? 'Active' : 'Closed'}
          </span>
        </div>
        <div className="p-5">
          {pendingPreview ? (
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
              <div className="flex items-center gap-2 text-xs text-muted mb-2">
                <span className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center">
                  <span className="material-symbols-outlined text-slate-500 text-sm">person</span>
                </span>
                <span>Audience</span>
                <span aria-hidden>•</span>
                <span>{formatRelativeTime(pendingPreview.created_at)}</span>
              </div>
              <p className="text-sm text-slate-800 leading-relaxed line-clamp-3">{pendingPreview.text}</p>
            </div>
          ) : (
            <p className="text-sm text-muted">No questions waiting for approval.</p>
          )}
        </div>
      </div>
    </div>
  )
}
