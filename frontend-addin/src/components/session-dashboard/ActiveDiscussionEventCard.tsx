import type { QnaPrompt, Question } from '../../api/types'
import { CollapsibleEventPanelShell } from './CollapsibleEventPanelShell'
import { formatRelativeTime } from './formatRelativeTime'

export interface ActiveDiscussionEventCardProps {
  prompt: QnaPrompt
  pendingCount: number
  pendingPreview: Question | null
  variant?: 'active' | 'inactive'
  onStop?: (promptId: string) => void
  onResume?: (promptId: string) => void
}

export function ActiveDiscussionEventCard({
  prompt,
  pendingCount,
  pendingPreview,
  variant = 'active',
  onStop,
  onResume
}: ActiveDiscussionEventCardProps) {
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
          <span className="material-symbols-outlined">forum</span>
        </div>
      }
      titleBlock={
        <div className="min-w-0">
          <h4
            className={`font-bold text-base leading-snug line-clamp-3 ${
              inactive ? 'text-slate-700' : 'text-slate-900'
            }`}
          >
            {prompt.prompt.trim() || 'Discussion'}
          </h4>
          <p className={`text-sm mt-1 ${inactive ? 'text-slate-600' : 'text-muted'}`}>
            Open discussion
          </p>
        </div>
      }
    >
      <div className="p-5">
        <p className={`text-sm mb-3 ${inactive ? 'text-slate-600' : 'text-muted'}`}>
          {pendingCount} answer{pendingCount === 1 ? '' : 's'} awaiting moderation
        </p>
        {pendingPreview ? (
          <div
            className={`rounded-xl p-4 border ${
              inactive ? 'bg-slate-300/40 border-slate-400/40' : 'bg-slate-50 border-slate-100'
            }`}
          >
            <div className={`flex items-center gap-2 text-xs mb-2 ${inactive ? 'text-slate-600' : 'text-muted'}`}>
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
          <p className={`text-sm ${inactive ? 'text-slate-600' : 'text-muted'}`}>
            No answers yet for this discussion.
          </p>
        )}
        {!inactive ? (
          <div className="flex flex-wrap gap-2 pt-4">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onStop?.(prompt.id)
              }}
              className="!px-4 !py-2 !rounded-lg !text-sm !font-semibold !bg-rose-50 !text-rose-700 !border !border-rose-200 hover:!bg-rose-100 !transition-colors"
            >
              Stop discussion
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 pt-4">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onResume?.(prompt.id)
              }}
              className="!px-4 !py-2 !rounded-lg !text-sm !font-semibold !bg-emerald-50 !text-emerald-800 !border !border-emerald-200 hover:!bg-emerald-100 !transition-colors"
            >
              Resume discussion
            </button>
          </div>
        )}
      </div>
    </CollapsibleEventPanelShell>
  )
}
