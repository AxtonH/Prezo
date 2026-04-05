import type { QnaPrompt, Question } from '../../api/types'
import { CollapsibleEventPanelShell } from './CollapsibleEventPanelShell'
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
    <CollapsibleEventPanelShell
      icon={
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
          <span className="material-symbols-outlined">forum</span>
        </div>
      }
      titleBlock={
        <div className="min-w-0">
          <h4 className="font-bold text-slate-900 text-base leading-snug line-clamp-3">
            {prompt.prompt.trim() || 'Discussion'}
          </h4>
          <p className="text-sm text-muted mt-1">Open discussion</p>
        </div>
      }
    >
      <div className="p-5">
        <p className="text-sm text-muted mb-3">
          {pendingCount} answer{pendingCount === 1 ? '' : 's'} awaiting moderation
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
          <p className="text-sm text-muted">No answers yet for this discussion.</p>
        )}
      </div>
    </CollapsibleEventPanelShell>
  )
}
