import type { PollMode, Question } from '../../api/types'
import { CollapsibleActivityPanelShell } from './CollapsibleActivityPanelShell'
import { formatRelativeTime } from './formatRelativeTime'

export interface ActiveQnaActivityCardProps {
  /** Audience Q&amp;A questions with status pending (newest first). */
  pendingQuestions: Question[]
  /** Audience Q&amp;A questions with status approved (newest first). */
  approvedQuestions: Question[]
  variant?: 'active' | 'inactive'
  /** Slide-driven vs pinned control of Q&amp;A (see PollMode semantics). */
  mode?: PollMode
  onStop?: () => void
  onResume?: () => void
  onDelete?: () => void
  /** Hand control back to the slideshow (auto) or pin. */
  onSetMode?: (mode: PollMode) => void | Promise<void>
  onApproveQuestion?: (questionId: string) => void | Promise<void>
  onHideQuestion?: (questionId: string) => void | Promise<void>
}

function AudienceQuestionRow({
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
            <span>Audience</span>
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

export function ActiveQnaActivityCard({
  pendingQuestions,
  approvedQuestions,
  variant = 'active',
  mode: modeProp,
  onStop,
  onResume,
  onDelete,
  onSetMode,
  onApproveQuestion,
  onHideQuestion
}: ActiveQnaActivityCardProps) {
  const inactive = variant === 'inactive'
  const pendingCount = pendingQuestions.length
  const approvedCount = approvedQuestions.length
  const questionTotal = pendingCount + approvedCount
  const expandByDefault = false
  const mode: PollMode = modeProp ?? 'auto'

  const followSlidesButton =
    onSetMode && mode !== 'auto' ? (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          void onSetMode('auto')
        }}
        title="Let the slideshow control Q&A: it opens while a Q&A slide is presented and closes when the show moves on"
        className="!px-4 !py-2 !rounded-lg !text-sm !font-semibold !bg-sky-50 !text-sky-800 !border !border-sky-200 hover:!bg-sky-100 !transition-colors"
      >
        Follow slides
      </button>
    ) : null

  return (
    <CollapsibleActivityPanelShell
      variant={inactive ? 'inactive' : 'active'}
      defaultExpanded={expandByDefault}
      icon={
        <div
          className={
            inactive
              ? 'size-12 shrink-0 rounded-lg bg-slate-400/35 flex items-center justify-center text-slate-700'
              : 'size-12 shrink-0 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600'
          }
        >
          <span className="material-symbols-outlined text-[1.5rem]">chat_bubble</span>
        </div>
      }
      titleBlock={
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Q&amp;A</p>
          <h4 className={`font-semibold text-base leading-snug ${inactive ? 'text-slate-700' : 'text-slate-900'}`}>
            Audience questions
          </h4>
          <div
            className={`flex flex-wrap items-center gap-4 text-sm mt-2 ${
              inactive ? 'text-slate-500' : 'text-slate-600'
            }`}
          >
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                inactive ? 'bg-slate-200 text-slate-700' : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {inactive ? 'Ended' : 'Live'}
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                mode === 'auto' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-800'
              }`}
              title={
                mode === 'auto'
                  ? 'Slide-driven: opens while a Q&A slide is presented, closes when the show moves on'
                  : mode === 'open'
                    ? 'Pinned by the host: stays open regardless of the slideshow'
                    : 'Pinned by the host: stays closed regardless of the slideshow'
              }
            >
              {mode === 'auto' ? 'Auto · follows slides' : mode === 'open' ? 'Pinned open' : 'Pinned closed'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className={`material-symbols-outlined text-[1.125rem] ${
                  inactive ? 'text-slate-400' : 'text-slate-500'
                }`}
                aria-hidden
              >
                group
              </span>
              <span>
                {questionTotal} {questionTotal === 1 ? 'question' : 'questions'}
              </span>
            </span>
          </div>
        </div>
      }
    >
      <div className="p-5 space-y-5">
        <p className={`text-sm ${inactive ? 'text-slate-600' : 'text-muted'}`}>
          {pendingCount} question{pendingCount === 1 ? '' : 's'} awaiting moderation
          {approvedCount > 0 ? (
            <>
              {' '}
              · {approvedCount} approved
            </>
          ) : null}
        </p>

        {pendingCount === 0 && approvedCount === 0 ? (
          <p className={`text-sm ${inactive ? 'text-slate-600' : 'text-muted'}`}>
            No audience questions yet.
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
                  No questions waiting for approval.
                </p>
              ) : (
                <ul className="space-y-2">
                  {pendingQuestions.map((q) => (
                    <li key={q.id}>
                      <AudienceQuestionRow
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
                  Approved questions will appear here.
                </p>
              ) : (
                <ul className="space-y-2">
                  {approvedQuestions.map((q) => (
                    <li key={q.id}>
                      <AudienceQuestionRow
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
                onStop?.()
              }}
              title="Close now and keep closed regardless of the slideshow"
              className="!px-4 !py-2 !rounded-lg !text-sm !font-semibold !bg-rose-50 !text-rose-700 !border !border-rose-200 hover:!bg-rose-100 !transition-colors"
            >
              Stop Q&amp;A
            </button>
            {followSlidesButton}
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
                onResume?.()
              }}
              title="Open now and keep open regardless of the slideshow"
              className="!px-4 !py-2 !rounded-lg !text-sm !font-semibold !bg-emerald-50 !text-emerald-800 !border !border-emerald-200 hover:!bg-emerald-100 !transition-colors"
            >
              Resume Q&amp;A
            </button>
            {followSlidesButton}
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
