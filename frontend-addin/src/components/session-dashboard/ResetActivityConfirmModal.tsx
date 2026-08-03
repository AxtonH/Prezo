import { createPortal } from 'react-dom'

export interface ResetActivityConfirmModalProps {
  open: boolean
  onCancel: () => void
  onConfirm: () => void | Promise<void>
  /** When true, primary button shows working state */
  busy?: boolean
  /** Shown after a failed reset attempt; cleared when the user cancels or retries */
  error?: string | null
}

/**
 * Confirmation for clearing an activity's responses (votes / questions /
 * answers) while keeping the activity itself. Portals to `document.body` for
 * the same containing-block reason as DeleteActivityConfirmModal.
 */
export function ResetActivityConfirmModal({
  open,
  onCancel,
  onConfirm,
  busy = false,
  error = null
}: ResetActivityConfirmModalProps) {
  if (!open || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        aria-hidden
        onClick={busy ? undefined : onCancel}
      />
      <div
        className="relative bg-white rounded-2xl shadow-[0_24px_60px_rgba(15,23,42,0.2)] w-full max-w-md overflow-hidden border border-slate-100"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-activity-title"
      >
        <div className="px-7 pt-7 pb-2">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center">
              <span className="material-symbols-outlined text-amber-600 text-xl">restart_alt</span>
            </div>
            <h2 id="reset-activity-title" className="text-lg font-bold text-slate-900 !m-0">
              Reset activity?
            </h2>
          </div>
          <p className="text-sm text-muted mt-2 leading-relaxed !m-0">
            Are you sure you want to reset this activity? All votes, questions, and answers
            collected so far will be removed — this action{' '}
            <span className="font-bold text-slate-900">cannot</span> be undone. The activity
            itself stays and keeps collecting new responses.
          </p>
          {error ? (
            <p className="text-danger text-sm mt-3 !mb-0" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="px-7 pb-7 flex flex-col gap-3 pt-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onConfirm()}
            className="!w-full !bg-amber-600 !text-white !py-3 !rounded-xl !text-sm !font-bold hover:!bg-amber-700 active:!scale-[0.98] !transition-all !shadow-sm !border-0 disabled:!opacity-50 disabled:!cursor-not-allowed"
          >
            {busy ? 'Resetting…' : 'Reset'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="!w-full !bg-transparent !border !border-slate-200 !text-slate-600 !py-3 !rounded-xl !text-sm !font-semibold hover:!bg-slate-50 !transition-all !shadow-none disabled:!opacity-50 disabled:!cursor-not-allowed"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
