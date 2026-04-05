import type { Question } from '../../api/types'
import { CollapsibleEventPanelShell } from './CollapsibleEventPanelShell'
import { formatRelativeTime } from './formatRelativeTime'

export interface ActiveQnaEventCardProps {
  pendingCount: number
  pendingPreview: Question | null
  onStop?: () => void
}

export function ActiveQnaEventCard({ pendingCount, pendingPreview, onStop }: ActiveQnaEventCardProps) {
  return (
    <CollapsibleEventPanelShell
      icon={
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
          <span className="material-symbols-outlined">chat_bubble</span>
        </div>
      }
      titleBlock={
        <div className="min-w-0">
          <h4 className="font-bold text-slate-900 text-base leading-snug">Audience questions</h4>
          <p className="text-sm text-muted mt-1">Q&amp;A</p>
        </div>
      }
    >
      <div className="p-5">
        <p className="text-sm text-muted mb-3">
          {pendingCount} unanswered question{pendingCount === 1 ? '' : 's'}
        </p>
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
        <div className="flex flex-wrap gap-2 pt-4">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onStop?.()
            }}
            className="!px-4 !py-2 !rounded-lg !text-sm !font-semibold !bg-rose-50 !text-rose-700 !border !border-rose-200 hover:!bg-rose-100 !transition-colors"
          >
            Stop Q&amp;A
          </button>
        </div>
      </div>
    </CollapsibleEventPanelShell>
  )
}
