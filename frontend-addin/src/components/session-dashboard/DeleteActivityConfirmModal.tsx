export interface DeleteActivityConfirmModalProps {
  open: boolean
  onCancel: () => void
  onConfirm: () => void | Promise<void>
  /** When true, primary button shows working state */
  busy?: boolean
  /** Shown after a failed delete attempt; cleared when the user cancels or retries */
  error?: string | null
}

export function DeleteActivityConfirmModal({
  open,
  onCancel,
  onConfirm,
  busy = false,
  error = null
}: DeleteActivityConfirmModalProps) {
  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/45 backdrop-blur-sm"
        aria-hidden
        onClick={busy ? undefined : onCancel}
      />
      <div
        className="relative bg-white rounded-2xl shadow-[0_24px_60px_rgba(15,23,42,0.2)] w-full max-w-md overflow-hidden border border-slate-100"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-activity-title"
      >
        <div className="px-7 pt-7 pb-2">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 bg-rose-50 rounded-xl flex items-center justify-center">
              <span className="material-symbols-outlined text-rose-600 text-xl">delete_forever</span>
            </div>
            <h2 id="delete-activity-title" className="text-lg font-bold text-slate-900 !m-0">
              Delete activity?
            </h2>
          </div>
          <p className="text-sm text-muted mt-2 leading-relaxed !m-0">
            Are you sure you want to delete this activity, this action{' '}
            <span className="font-bold text-slate-900">cannot</span> be undone.
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
            className="!w-full !bg-red-600 !text-white !py-3 !rounded-xl !text-sm !font-bold hover:!bg-red-700 active:!scale-[0.98] !transition-all !shadow-sm !border-0 disabled:!opacity-50 disabled:!cursor-not-allowed"
          >
            {busy ? 'Deleting…' : 'Delete'}
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
    </div>
  )
}
