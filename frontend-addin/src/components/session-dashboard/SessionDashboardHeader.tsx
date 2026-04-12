interface SessionDashboardHeaderProps {
  title: string
  hostLabel: string
  /** Defaults to a short product line for the session workspace. */
  subtitle?: string
}

export function SessionDashboardHeader({
  title,
  hostLabel,
  subtitle = 'Build interactive activities for your audience'
}: SessionDashboardHeaderProps) {
  return (
    <div className="mb-8">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full text-[0.65rem] font-bold uppercase tracking-widest inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" aria-hidden />
          Live
        </span>
      </div>
      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 break-words">
        {title || 'Untitled session'}
      </h2>
      <p className="text-slate-600 mt-2 text-base leading-relaxed max-w-2xl">{subtitle}</p>
      <p className="text-sm text-muted mt-2">
        Hosted by <span className="text-slate-700 font-medium">{hostLabel}</span>
      </p>
    </div>
  )
}
