export interface SessionQnaBuilderCardProps {
  /** True when audience Q&amp;A is currently accepting questions. */
  qnaOpen: boolean
  /** Open the Q&amp;A channel for this session (audience can submit). */
  onOpenQna: () => Promise<void> | void
  /** Close the Q&amp;A channel. Existing questions remain visible to the host. */
  onCloseQna: () => Promise<void> | void
  /** Disabled while a related operation is in flight. */
  isBusy?: boolean
}

/**
 * Q&A counterpart to SessionDiscussionBuilderCard. Q&A is a single per-session
 * channel rather than multiple prompts, so the "builder" is really just a
 * toggle: open the channel, then moderate audience submissions on the right.
 */
export function SessionQnaBuilderCard({
  qnaOpen,
  onOpenQna,
  onCloseQna,
  isBusy = false
}: SessionQnaBuilderCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-card">
      <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted mb-4">
        Q&amp;A channel
      </p>

      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${
                qnaOpen ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-600'
              }`}
            >
              <span className="material-symbols-outlined text-[1.25rem]">chat_bubble</span>
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">
                {qnaOpen ? 'Q&A is live' : 'Q&A is closed'}
              </p>
              <p className="text-xs text-muted leading-snug">
                {qnaOpen
                  ? 'Audience members can submit questions you can approve or hide.'
                  : 'Open the channel so audience members can submit questions.'}
              </p>
            </div>
          </div>
        </div>

        {qnaOpen ? (
          <button
            type="button"
            onClick={() => void onCloseQna()}
            disabled={isBusy}
            className="!w-full !inline-flex !items-center !justify-center !gap-2 !rounded-xl !bg-rose-50 !text-rose-700 !py-3 !text-sm !font-bold !border !border-rose-200 hover:!bg-rose-100 active:!scale-[0.99] !transition-all disabled:!opacity-50"
          >
            <span className="material-symbols-outlined text-lg">stop_circle</span>
            Stop Q&amp;A
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void onOpenQna()}
            disabled={isBusy}
            className="!w-full !inline-flex !items-center !justify-center !gap-2 !rounded-xl !bg-primary !text-white !py-3 !text-sm !font-bold !border-0 !shadow-sm hover:!bg-primary-dark active:!scale-[0.99] !transition-all disabled:!opacity-50"
          >
            {isBusy ? (
              'Opening…'
            ) : (
              <>
                <span className="material-symbols-outlined text-lg">forum</span>
                Open Q&amp;A
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
