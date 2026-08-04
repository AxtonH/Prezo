import type { ReactNode } from 'react'

import type { PollMode } from '../../api/types'

/**
 * Shared UI for slide-driven (auto) vs pinned control, used by the poll,
 * Q&A, and discussion activity cards so the three stay visually and
 * behaviorally identical.
 */

/**
 * Control mode → card shell variant: the whole card carries the state
 * (green "Auto follow", yellow "Pinned", grey "Inactive") instead of a
 * separate chip.
 */
export function controlModeShellVariant(
  mode: PollMode
): 'auto' | 'pinned' | 'inactive' {
  return mode === 'auto' ? 'auto' : mode === 'open' ? 'pinned' : 'inactive'
}

export type ActivityActionTone =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warn'
  | 'danger'
  | 'destructive'

/**
 * Every tile shares the same quiet white surface — the action's semantics
 * live in the icon color and the hover tint, so a full set of actions reads
 * as one symmetric palette instead of seven competing pills.
 */
const ACTION_TILE_TONES: Record<
  ActivityActionTone,
  { icon: string; label: string; hover: string }
> = {
  neutral: {
    icon: 'text-slate-500',
    label: 'text-slate-800',
    hover: 'hover:!bg-slate-50 hover:!border-slate-300'
  },
  info: {
    icon: 'text-sky-600',
    label: 'text-slate-800',
    hover: 'hover:!bg-sky-50 hover:!border-sky-300'
  },
  success: {
    icon: 'text-emerald-600',
    label: 'text-slate-800',
    hover: 'hover:!bg-emerald-50 hover:!border-emerald-300'
  },
  warn: {
    icon: 'text-amber-600',
    label: 'text-slate-800',
    hover: 'hover:!bg-amber-50 hover:!border-amber-300'
  },
  danger: {
    icon: 'text-rose-600',
    label: 'text-slate-800',
    hover: 'hover:!bg-rose-50 hover:!border-rose-300'
  },
  destructive: {
    icon: 'text-red-600',
    label: 'text-red-700',
    hover: 'hover:!bg-red-50 hover:!border-red-300'
  }
}

/**
 * Uniform grid for the card action tiles: 3 per row (2 on narrow taskpanes),
 * equal-height rows, so the set stays symmetric at any width and reflows
 * cleanly when the card expands or the pane resizes.
 */
export function ActivityActionsGrid({
  children,
  className = ''
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`grid grid-cols-2 min-[420px]:grid-cols-3 auto-rows-fr gap-2 ${className}`}
    >
      {children}
    </div>
  )
}

/** One action tile: icon over a short label, long explanation in the tooltip. */
export function ActivityActionTile({
  icon,
  label,
  title,
  tone = 'neutral',
  onClick,
  disabled = false
}: {
  /** Material Symbols name. */
  icon: string
  label: string
  /** Tooltip phrased for the specific activity. */
  title?: string
  tone?: ActivityActionTone
  onClick?: () => void
  disabled?: boolean
}) {
  const toneClasses = ACTION_TILE_TONES[tone]
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      title={title}
      className={`!flex !flex-col !items-center !justify-center !gap-1 !rounded-xl !border !border-slate-200 !bg-white !px-2 !py-2.5 !shadow-none !transition-colors disabled:!opacity-60 disabled:!cursor-not-allowed ${toneClasses.hover}`}
    >
      <span
        className={`material-symbols-outlined text-[1.25rem] leading-none ${toneClasses.icon}`}
        aria-hidden
      >
        {icon}
      </span>
      <span className={`text-xs font-semibold leading-tight text-center ${toneClasses.label}`}>
        {label}
      </span>
    </button>
  )
}
