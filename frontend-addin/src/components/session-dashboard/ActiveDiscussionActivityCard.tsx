import type { QnaPrompt, Question } from '../../api/types'
import { CollapsibleActivityPanelShell } from './CollapsibleActivityPanelShell'
import { formatRelativeTime } from './formatRelativeTime'

export interface ActiveDiscussionActivityCardProps {
  prompt: QnaPrompt
  /** Pending answers for this prompt (newest first). */
  pendingQuestions: Question[]
  /** Approved answers for this prompt (newest first). */
  approvedQuestions: Question[]
  variant?: 'active' | 'inactive'
  onStop?: (promptId: string) => void
  onResume?: (promptId: string) => void
  onDelete?: () => void
  onApproveQuestion?: (questionId: string) => void | Promise<void>
  onHideQuestion?: (questionId: string) => void | Promise<void>
}

function DiscussionAnswerRow({
  question,
  inactive,
  showApprove,
  onApprove,
  onHide
}: {
  question: Question
  inactive: boolean
  showApprove: boolean
  onApprove?: (questionId: string) => void | Promise<void>
  onHide?: (questionId: string) => void | Promise<void>
}) {
  return (
    <div
      className={`rounded-xl p-3 border ${
        inactive ? 'bg-slate-300/40 border-slate-400/40' : 'bg-slate-50 border-slate-100'
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className={`flex items-center gap-2 text-xs mb-1.5 ${inactive ? 'text-slate-600' : 'text-muted'}`}>
            <span className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-slate-500 text-sm">person</span>
            </span>
            <span>Participant</span>
            <span aria-hidden>•</span>
            <span>{formatRelativeTime(question.created_at)}</span>
          </div>
          <p className={`text-sm leading-relaxed ${inactive ? 'text-slate-800' : 'text-slate-800'}`}>
            {question.text}
          </p>
          <p className={`text-xs mt-1 ${inactive ? 'text-slate-600' : 'text-muted'}`}>
            {question.votes} vote{question.votes === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {showApprove && onApprove ? (
            <button
              type="button"
              onClick={() => void onApprove(question.id)}
              className="!px-3 !py-1.5 !rounded-lg !text-xs !font-semibold !bg-primary !text-white !border-0 hover:!bg-primary-dark !transition-colors"
            >
              Approve
            </button>
          ) : null}
          {onHide ? (
            <button
              type="button"
              onClick={() => void onHide(question.id)}
              className="!px-3 !py-1.5 !rounded-lg !text-xs !font-semibold !bg-white !text-slate-800 !border !border-slate-200 hover:!bg-slate-50 !transition-colors"
            >
              Hide
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function ActiveDiscussionActivityCard({
  prompt,
  pendingQuestions,
  approvedQuestions,
  variant = 'active',
  onStop,
  onResume,
  onDelete,
  onApproveQuestion,
  onHideQuestion
}: ActiveDiscussionActivityCardProps) {
  const inactive = variant === 'inactive'
  const pendingCount = pendingQuestions.length
  const approvedCount = approvedQuestions.length
  const expandByDefault = pendingCount > 0 || approvedCount > 0

  return (
    <CollapsibleActivityPanelShell
      variant={inactive ? 'inactive' : 'active'}
      defaultExpanded={expandByDefault}
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
      <div className="p-5 space-y-5">
        <p className={`text-sm ${inactive ? 'text-slate-600' : 'text-muted'}`}>
          {pendingCount} answer{pendingCount === 1 ? '' : 's'} awaiting moderation
          {approvedCount > 0 ? (
            <>
              {' '}
              · {approvedCount} approved
            </>
          ) : null}
        </p>

        {pendingCount === 0 && approvedCount === 0 ? (
          <p className={`text-sm ${inactive ? 'text-slate-600' : 'text-muted'}`}>
            No answers yet for this discussion.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-3">
              <p
                className={`text-[0.65rem] font-bold uppercase tracking-widest ${
                  inactive ? 'text-slate-600' : 'text-muted'
                }`}
              >
                Pending
              </p>
              {pendingQuestions.length === 0 ? (
                <p className={`text-sm ${inactive ? 'text-slate-600' : 'text-muted'}`}>
                  No answers waiting for approval.
                </p>
              ) : (
                <ul className="space-y-2">
                  {pendingQuestions.map((q) => (
                    <li key={q.id}>
                      <DiscussionAnswerRow
                        question={q}
                        inactive={inactive}
                        showApprove={Boolean(onApproveQuestion)}
                        onApprove={onApproveQuestion}
                        onHide={onHideQuestion}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="space-y-3">
              <p
                className={`text-[0.65rem] font-bold uppercase tracking-widest ${
                  inactive ? 'text-slate-600' : 'text-muted'
                }`}
              >
                Approved
              </p>
              {approvedQuestions.length === 0 ? (
                <p className={`text-sm ${inactive ? 'text-slate-600' : 'text-muted'}`}>
                  No approved answers yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {approvedQuestions.map((q) => (
                    <li key={q.id}>
                      <DiscussionAnswerRow
                        question={q}
                        inactive={inactive}
                        showApprove={false}
                        onApprove={onApproveQuestion}
                        onHide={onHideQuestion}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {!inactive ? (
          <div className="flex flex-wrap gap-2 pt-1">
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
            {onDelete ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                }}
                className="!px-4 !py-2 !rounded-lg !text-sm !font-semibold !bg-red-600 !text-white !border-0 hover:!bg-red-700 !transition-colors"
              >
                Delete
              </button>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 pt-1">
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
            {onDelete ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                }}
                className="!px-4 !py-2 !rounded-lg !text-sm !font-semibold !bg-red-600 !text-white !border-0 hover:!bg-red-700 !transition-colors"
              >
                Delete
              </button>
            ) : null}
          </div>
        )}
      </div>
    </CollapsibleActivityPanelShell>
  )
}
