import type { PollMode, Question } from '../../api/types'
import type { LinkedSlideRef } from '../../office/widgetShapes'
import { CollapsibleActivityPanelShell } from './CollapsibleActivityPanelShell'
import {
  ActivityActionsGrid,
  ActivityActionTile,
  controlModeShellVariant,
  LinkedSlidesBadge
} from './ControlModeUi'
import { formatRelativeTime } from './formatRelativeTime'

export interface ActiveQnaActivityCardProps {
  /** PowerPoint: deck slides hosting an unbound Q&amp;A widget. */
  linkedSlides?: LinkedSlideRef[]
  /** Audience Q&amp;A questions with status pending (newest first). */
  pendingQuestions: Question[]
  /** Audience Q&amp;A questions with status approved (newest first). */
  approvedQuestions: Question[]
  variant?: 'active' | 'inactive'
  /** Slide-driven vs pinned control of Q&amp;A (see PollMode semantics). */
  mode?: PollMode
  /** Open the Prezo editing station focused on the session Q&amp;A artifact. */
  onConfigure?: () => void
  onStop?: () => void
  onResume?: () => void
  onDelete?: () => void
  /** Clear all audience questions while keeping the Q&amp;A channel itself. */
  onReset?: () => void
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
  linkedSlides,
  pendingQuestions,
  approvedQuestions,
  variant = 'active',
  mode: modeProp,
  onConfigure,
  onStop,
  onResume,
  onDelete,
  onReset,
  onSetMode,
  onApproveQuestion,
  onHideQuestion
}: ActiveQnaActivityCardProps) {
  const pendingCount = pendingQuestions.length
  const approvedCount = approvedQuestions.length
  const questionTotal = pendingCount + approvedCount
  const expandByDefault = false
  const mode: PollMode = modeProp ?? 'auto'
  /** Actual open/closed state — drives the Live/Ended chip and which actions show. */
  const closed = variant === 'inactive'
  /**
   * Muted (ended) visual tone: closed AND not slide-driven. An auto-follow
   * activity is armed — it keeps the active look even while closed.
   */
  const inactive = closed && mode !== 'auto'

  const followSlidesTile =
    onSetMode && mode !== 'auto' ? (
      <ActivityActionTile
        icon="slideshow"
        label="Follow slides"
        tone="info"
        title="Let the slideshow control Q&A: it opens while a Q&A slide is presented and closes when the show moves on"
        onClick={() => void onSetMode('auto')}
      />
    ) : null

  const configureTile = onConfigure ? (
    <ActivityActionTile
      icon="edit"
      label="Designer"
      title="Open Prezo editing station for the session Q&A"
      onClick={onConfigure}
    />
  ) : null

  /**
   * Stop = pin closed. On a live card it closes now; on an off-air auto card
   * it disarms slide control so Q&amp;A won't go live with its slide.
   */
  const stopTile = (
    <ActivityActionTile
      icon="stop_circle"
      label="Stop Q&A"
      tone="danger"
      title={
        closed
          ? 'Keep closed even when the slideshow reaches a Q&A slide'
          : 'Close now and keep closed regardless of the slideshow'
      }
      onClick={() => onStop?.()}
    />
  )

  const pinOpenTile = (
    <ActivityActionTile
      icon="play_circle"
      label="Pin open"
      tone="success"
      title="Open now and keep open regardless of the slideshow"
      onClick={() => onResume?.()}
    />
  )

  const resetTile = onReset ? (
    <ActivityActionTile
      icon="restart_alt"
      label="Reset"
      tone="warn"
      title="Clear all audience questions — the Q&A channel stays"
      onClick={onReset}
    />
  ) : null

  const deleteTile = onDelete ? (
    <ActivityActionTile
      icon="delete"
      label="Delete"
      tone="destructive"
      title="Remove all audience questions and close the Q&A channel"
      onClick={onDelete}
    />
  ) : null

  return (
    <CollapsibleActivityPanelShell
      variant={controlModeShellVariant(mode)}
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
          <h4
            className={`font-semibold text-base leading-snug line-clamp-2 min-h-[2.75rem] ${
              inactive ? 'text-slate-700' : 'text-slate-900'
            }`}
          >
            Audience questions
          </h4>
        </div>
      }
      metaRow={
        <div
          className={`flex items-center gap-3 text-sm min-w-0 ${
            inactive ? 'text-slate-500' : 'text-slate-600'
          }`}
        >
            <span
              className={`shrink-0 whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium ${
                !closed || mode === 'auto'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-200 text-slate-700'
              }`}
              title={
                !closed
                  ? 'Visible on the audience screen right now'
                  : mode === 'auto'
                    ? 'Auto follow: live on the audience screen whenever a Q&A slide is presented'
                    : 'Closed by the host'
              }
            >
              {/* Auto follow reads as Live even while technically closed: it goes
                  live with its slide, and the dashboard shows the presenting state. */}
              {!closed || mode === 'auto' ? 'Live' : 'Ended'}
            </span>
            <span
              className="inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap"
              title={`${questionTotal} ${questionTotal === 1 ? 'question' : 'questions'}`}
            >
              <span
                className={`material-symbols-outlined text-[1.125rem] ${
                  inactive ? 'text-slate-400' : 'text-slate-500'
                }`}
                aria-hidden
              >
                group
              </span>
              <span>{questionTotal}</span>
            </span>
          <LinkedSlidesBadge slides={linkedSlides} inactive={inactive} />
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

        {!closed ? (
          <ActivityActionsGrid className="pt-1">
            {configureTile}
            {stopTile}
            {followSlidesTile}
            {resetTile}
            {deleteTile}
          </ActivityActionsGrid>
        ) : (
          <ActivityActionsGrid className="pt-1">
            {configureTile}
            {pinOpenTile}
            {mode === 'auto' && onStop ? stopTile : null}
            {followSlidesTile}
            {resetTile}
            {deleteTile}
          </ActivityActionsGrid>
        )}
      </div>
    </CollapsibleActivityPanelShell>
  )
}
