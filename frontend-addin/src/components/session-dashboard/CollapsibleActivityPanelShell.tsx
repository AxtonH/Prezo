import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

import { scrollPanelIntoOverflowParent } from '../../utils/scrollPanelIntoOverflowParent'

interface CollapsibleActivityPanelShellProps {
  icon: ReactNode
  titleBlock: ReactNode
  children: ReactNode
  /** @default false — panels start collapsed */
  defaultExpanded?: boolean
  /** Stopped/closed activities use a darker, muted treatment and an Inactive badge. */
  variant?: 'active' | 'inactive'
}

/**
 * Clickable header toggles body visibility; used by poll / Q&A / discussion activity cards.
 */
export function CollapsibleActivityPanelShell({
  icon,
  titleBlock,
  children,
  defaultExpanded = false,
  variant = 'active'
}: CollapsibleActivityPanelShellProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const inactive = variant === 'inactive'
  const rootRef = useRef<HTMLDivElement>(null)
  const prevExpandedRef = useRef<boolean | null>(null)

  useLayoutEffect(() => {
    const scrollExpandedPanelIntoView = () => {
      const el = rootRef.current
      if (!el) {
        return
      }
      const scrollParent = el.closest(
        '[data-session-activities-scroll]'
      ) as HTMLElement | null
      if (
        !scrollParent ||
        scrollParent.scrollHeight <= scrollParent.clientHeight + 1
      ) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        return
      }
      scrollPanelIntoOverflowParent(el, scrollParent, 'smooth')
    }

    const scheduleScroll = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(scrollExpandedPanelIntoView)
      })
    }

    if (prevExpandedRef.current === null) {
      prevExpandedRef.current = expanded
      /** Pre-expanded panels (`defaultExpanded`) can start off-screen; align once on mount. */
      if (expanded) {
        scheduleScroll()
      }
      return
    }

    const wasCollapsed = !prevExpandedRef.current
    prevExpandedRef.current = expanded
    if (!expanded || !wasCollapsed) {
      return
    }
    scheduleScroll()
  }, [expanded])

  return (
    <div
      ref={rootRef}
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
