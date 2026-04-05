import { useState, type ReactNode } from 'react'

interface CollapsibleEventPanelShellProps {
  icon: ReactNode
  titleBlock: ReactNode
  children: ReactNode
  /** @default false — panels start collapsed */
  defaultExpanded?: boolean
  /** Stopped/closed events use a darker, muted treatment and an Inactive badge. */
  variant?: 'active' | 'inactive'
}

/**
 * Clickable header toggles body visibility; used by poll / Q&A / discussion event cards.
 */
export function CollapsibleEventPanelShell({
  icon,
  titleBlock,
  children,
  defaultExpanded = false,
  variant = 'active'
}: CollapsibleEventPanelShellProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const inactive = variant === 'inactive'

  return (
    <div
      className={
        inactive
          ? 'bg-slate-200/60 rounded-2xl border border-slate-400/50 shadow-sm overflow-hidden ring-1 ring-slate-400/20'
          : 'bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden'
      }
    >
      <button
        type="button"
        className={`w-full p-5 flex flex-wrap items-start justify-between gap-3 text-left transition-colors ${
          inactive ? 'hover:bg-slate-300/40' : 'hover:bg-slate-50/80'
        } ${expanded ? (inactive ? 'border-b border-slate-400/30' : 'border-b border-slate-100') : ''}`}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {icon}
          {titleBlock}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={
              inactive
                ? 'bg-slate-600/90 text-slate-100 px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-widest'
                : 'bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-widest'
            }
          >
            {inactive ? 'Inactive' : 'Active'}
          </span>
          <span
            className={`material-symbols-outlined transition-transform duration-200 ${
              inactive ? 'text-slate-600' : 'text-slate-500'
            } ${expanded ? 'rotate-180' : ''}`}
            aria-hidden
          >
            expand_more
          </span>
        </div>
      </button>
      {expanded ? children : null}
    </div>
  )
}
