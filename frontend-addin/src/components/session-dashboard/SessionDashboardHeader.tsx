interface SessionDashboardHeaderProps {
  title: string
  hostLabel: string
  /** Optional; when backend supports ending a session from the console. */
  onFinalizeSession?: () => void
  finalizeDisabled?: boolean
  finalizeLabel?: string
}

export function SessionDashboardHeader({
  title,
  hostLabel,
  onFinalizeSession,
  finalizeDisabled = true,
  finalizeLabel = 'Finalize session'
}: SessionDashboardHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between gap-y-3 mb-8">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full text-[0.65rem] font-bold uppercase tracking-widest inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" aria-hidden />
            Active session
          </span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 break-words">
          {title || 'Untitled session'}
        </h2>
        <p className="text-sm text-muted mt-2">
          Hosted by <span className="text-slate-700 font-medium">{hostLabel}</span>
        </p>
      </div>
      <button
        type="button"
        onClick={() => onFinalizeSession?.()}
        disabled={finalizeDisabled || !onFinalizeSession}
        title={!onFinalizeSession ? 'Coming soon' : undefined}
        className="!shrink-0 !self-start !px-5 !py-2.5 !rounded-xl !text-sm !font-bold !bg-primary !text-white !border-0 !shadow-sm hover:!bg-primary-dark disabled:!opacity-50 disabled:!cursor-not-allowed !transition-all"
      >
        {finalizeLabel}
      </button>
    </div>
  )
}
