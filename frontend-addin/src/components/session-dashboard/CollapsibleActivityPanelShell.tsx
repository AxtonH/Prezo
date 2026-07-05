import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

import { scrollPanelIntoOverflowParent } from '../../utils/scrollPanelIntoOverflowParent'

interface CollapsibleActivityPanelShellProps {
  icon: ReactNode
  titleBlock: ReactNode
  children: ReactNode
  /** @default false — panels start collapsed */
  defaultExpanded?: boolean
  /**
   * Visual state of the whole card (hue + corner badge):
   * - auto: slide-driven (green, "Auto follow")
   * - pinned: host-pinned open (yellow, "Pinned")
   * - inactive: closed / pinned closed (grey, "Inactive")
   * - active: legacy open state without a control mode (white, "Active")
   */
  variant?: 'active' | 'inactive' | 'auto' | 'pinned'
}

const VARIANT_STYLES = {
  active: {
    container: 'border-slate-200 bg-white shadow-sm hover:border-slate-300 hover:shadow-md',
    headerHover: 'hover:bg-slate-50/80',
    expandedBorder: 'border-b border-slate-100',
    badge: 'bg-emerald-50 text-emerald-700',
    badgeLabel: 'Active',
    chevron: 'text-slate-500'
  },
  inactive: {
    container:
      'border-slate-300/80 bg-slate-200/60 shadow-sm ring-1 ring-slate-400/15 hover:border-slate-400/90',
    headerHover: 'hover:bg-slate-300/40',
    expandedBorder: 'border-b border-slate-400/30',
    badge: 'bg-slate-600/90 text-slate-100',
    badgeLabel: 'Inactive',
    chevron: 'text-slate-600'
  },
  auto: {
    container:
      'border-emerald-200 bg-emerald-50/60 shadow-sm hover:border-emerald-300 hover:shadow-md',
    headerHover: 'hover:bg-emerald-50',
    expandedBorder: 'border-b border-emerald-100',
    badge: 'bg-emerald-600/90 text-emerald-50',
    badgeLabel: 'Auto follow',
    chevron: 'text-emerald-700'
  },
  pinned: {
    container:
      'border-amber-200 bg-amber-50/70 shadow-sm hover:border-amber-300 hover:shadow-md',
    headerHover: 'hover:bg-amber-100/50',
    expandedBorder: 'border-b border-amber-200/60',
    badge: 'bg-amber-500/90 text-white',
    badgeLabel: 'Pinned',
    chevron: 'text-amber-700'
  }
} as const

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
  const styles = VARIANT_STYLES[variant]
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
      className={`group overflow-hidden rounded-xl border transition-all ${styles.container}`}
    >
      <button
        type="button"
        className={`w-full p-5 flex flex-wrap items-start justify-between gap-3 text-left transition-colors ${
          styles.headerHover
        } ${expanded ? styles.expandedBorder : ''}`}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded="false"
        /* aria-expanded via ref: the Edge Tools axe linter rejects JSX
           expressions for ARIA values (same workaround as HostSearchBar). */
        ref={(node) => {
          node?.setAttribute('aria-expanded', expanded ? 'true' : 'false')
        }}
      >
        <div className="flex items-start gap-4 min-w-0 flex-1">
          {icon}
          {titleBlock}
        </div>
        <div className="flex items-start gap-2 shrink-0 pt-0.5">
          <span
            className={`${styles.badge} px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-widest`}
          >
            {styles.badgeLabel}
          </span>
          <span
            className={`material-symbols-outlined transition-transform duration-200 ${
              styles.chevron
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
