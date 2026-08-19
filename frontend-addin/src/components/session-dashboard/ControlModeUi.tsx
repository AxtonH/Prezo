import type { ReactNode } from 'react'

import type { PollMode } from '../../api/types'
import { goToDeckSlide } from '../../office/goToSlide'
import type { LinkedSlideRef } from '../../office/widgetShapes'

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
 * cleanly when the card expands or the pane resizes. A lone tile in the last
 * row (typically Delete) is centered in 3-column layout and stretched
 * full-width in 2-column layout instead of hanging off the left edge.
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
      className={`grid grid-cols-2 min-[420px]:grid-cols-3 auto-rows-fr gap-2 max-[419px]:[&>*:nth-child(2n+1):last-child]:col-span-2 min-[420px]:[&>*:nth-child(3n+1):last-child]:col-start-2 ${className}`}
    >
      {children}
    </div>
  )
}

/**
 * "Slide 1, 5" chip for the card meta row: which deck slides host a widget
 * linked to this activity (PowerPoint add-in only). One activity can be
 * linked from several slides, so every number is listed — each number is a
 * button that navigates the deck to that slide (goToByIdAsync via the
 * ref's stable sheet id, so it survives reorders between scans).
 */
export function LinkedSlidesBadge({
  slides,
  inactive = false
}: {
  slides?: LinkedSlideRef[]
  inactive?: boolean
}) {
  if (!slides || slides.length === 0) {
    return null
  }
  const noun = slides.length === 1 ? 'slide' : 'slides'
  const numbers = slides.map((slide) => slide.number).join(', ')
  return (
    <span
      className="inline-flex items-center gap-1.5 min-w-0 overflow-hidden"
      title={`Linked to a widget on ${noun} ${numbers} of this presentation — click a number to jump there`}
    >
      <span
        className={`material-symbols-outlined text-[1.125rem] shrink-0 ${
          inactive ? 'text-slate-400' : 'text-slate-500'
        }`}
        aria-hidden
      >
        link
      </span>
      <span className="shrink-0">{slides.length === 1 ? 'Slide' : 'Slides'}</span>
      <span className="inline-flex items-center gap-1 min-w-0 overflow-hidden whitespace-nowrap">
        {slides.map((slide, index) => (
          <span key={slide.sheetId || slide.number} className="inline-flex items-center">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                void goToDeckSlide(slide.sheetId)
              }}
              title={`Go to slide ${slide.number}`}
              className="!bg-transparent !border-0 !p-0 !shadow-none !transform-none !rounded-none !font-semibold !text-inherit underline decoration-dotted underline-offset-2 hover:!text-primary cursor-pointer"
            >
              {slide.number}
            </button>
            {index < slides.length - 1 ? <span aria-hidden>,</span> : null}
          </span>
        ))}
      </span>
    </span>
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
