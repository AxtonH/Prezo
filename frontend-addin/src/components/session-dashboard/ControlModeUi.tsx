import type { PollMode } from '../../api/types'

/**
 * Shared UI for slide-driven (auto) vs pinned control, used by the poll,
 * Q&A, and discussion activity cards so the three stay visually and
 * behaviorally identical.
 */

export function ControlModeChip({
  mode,
  autoTitle
}: {
  mode: PollMode
  /** Tooltip for the auto state, phrased for the specific activity. */
  autoTitle: string
}) {
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
        mode === 'auto' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-800'
      }`}
      title={
        mode === 'auto'
          ? autoTitle
          : mode === 'open'
            ? 'Pinned by the host: stays open regardless of the slideshow'
            : 'Pinned by the host: stays closed regardless of the slideshow'
      }
    >
      {mode === 'auto' ? 'Auto · follows slides' : mode === 'open' ? 'Pinned open' : 'Pinned closed'}
    </span>
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
