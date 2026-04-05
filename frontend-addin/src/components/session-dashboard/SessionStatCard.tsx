export interface SessionStatCardProps {
  title: string
  /** When null, shows an em dash (loading or unavailable). */
  value: number | null
  description: string
  className?: string
}

export function SessionStatCard({ title, value, description, className }: SessionStatCardProps) {
  const countLabel = value === null ? '—' : String(value)

  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-card h-full flex flex-col min-h-0 ${className ?? ''}`}
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">{title}</p>
        <span className="text-lg font-bold text-primary tabular-nums">{countLabel}</span>
      </div>
      <p className="text-xs text-muted">{description}</p>
    </div>
  )
}
