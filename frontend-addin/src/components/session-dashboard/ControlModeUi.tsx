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

/** "Configure" → open the Prezo editing station for this activity's artifact. */
export function ConfigureActivityButton({
  title,
  onConfigure
}: {
  /** Tooltip phrased for the specific activity. */
  title: string
  onConfigure?: () => void
}) {
  if (!onConfigure) {
    return null
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onConfigure()
      }}
      title={title}
      className="!px-4 !py-2 !rounded-lg !text-sm !font-semibold !bg-slate-100 !text-slate-800 !border-0 hover:!bg-slate-200 !transition-colors"
    >
      Configure
    </button>
  )
}

export function FollowSlidesButton({
  mode,
  title,
  onFollow
}: {
  mode: PollMode
  /** Tooltip phrased for the specific activity. */
  title: string
  onFollow?: () => void | Promise<void>
}) {
  if (!onFollow || mode === 'auto') {
    return null
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        void onFollow()
      }}
      title={title}
      className="!px-4 !py-2 !rounded-lg !text-sm !font-semibold !bg-sky-50 !text-sky-800 !border !border-sky-200 hover:!bg-sky-100 !transition-colors"
    >
      Follow slides
    </button>
  )
}
