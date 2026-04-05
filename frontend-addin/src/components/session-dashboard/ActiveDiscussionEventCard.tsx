import type { QnaPrompt, Question } from '../../api/types'
import { formatRelativeTime } from './formatRelativeTime'

export interface ActiveDiscussionEventCardProps {
  prompt: QnaPrompt
  pendingCount: number
  pendingPreview: Question | null
}

export function ActiveDiscussionEventCard({
  prompt,
  pendingCount,
  pendingPreview
}: ActiveDiscussionEventCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <span className="material-symbols-outlined">forum</span>
          </div>
          <div className="min-w-0">
            <h4 className="font-bold text-slate-900">Open discussion</h4>
            <p className="text-sm text-muted line-clamp-2">{prompt.prompt}</p>
          </div>
        </div>
        <span className="bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-widest shrink-0">
          Active
        </span>
      </div>
      <div className="p-5">
        <p className="text-sm text-muted mb-3">
          {pendingCount} question{pendingCount === 1 ? '' : 's'} awaiting moderation
        </p>
        {pendingPreview ? (
          <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
            <div className="flex items-center gap-2 text-xs text-muted mb-2">
              <span className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center">
                <span className="material-symbols-outlined text-slate-500 text-sm">person</span>
              </span>
              <span>Participant</span>
              <span aria-hidden>•</span>
              <span>{formatRelativeTime(pendingPreview.created_at)}</span>
            </div>
            <p className="text-sm text-slate-800 leading-relaxed line-clamp-3">{pendingPreview.text}</p>
          </div>
        ) : (
          <p className="text-sm text-muted">No questions yet for this discussion.</p>
        )}
      </div>
    </div>
  )
}
