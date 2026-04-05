import { useState, type ReactNode } from 'react'

interface CollapsibleEventPanelShellProps {
  icon: ReactNode
  titleBlock: ReactNode
  children: ReactNode
  /** @default false — panels start collapsed */
  defaultExpanded?: boolean
}

/**
 * Clickable header toggles body visibility; used by poll / Q&A / discussion event cards.
 */
export function CollapsibleEventPanelShell({
  icon,
  titleBlock,
  children,
  defaultExpanded = false
}: CollapsibleEventPanelShellProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
      <button
        type="button"
        className={`w-full p-5 flex flex-wrap items-start justify-between gap-3 text-left hover:bg-slate-50/80 transition-colors ${
          expanded ? 'border-b border-slate-100' : ''
        }`}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {icon}
          {titleBlock}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-widest">
            Active
          </span>
          <span
            className={`material-symbols-outlined text-slate-500 transition-transform duration-200 ${
              expanded ? 'rotate-180' : ''
            }`}
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
