import { useState } from 'react'

import type { Poll, PollMode } from '../../api/types'
import { CollapsibleActivityPanelShell } from './CollapsibleActivityPanelShell'
import {
  ActivityActionsGrid,
  ActivityActionTile,
  controlModeShellVariant,
  LinkedSlidesBadge
} from './ControlModeUi'

export interface ActivePollActivityCardProps {
  poll: Poll
  /** PowerPoint: deck slide numbers hosting a widget linked to this poll. */
  linkedSlides?: number[]
  /** Stopped polls render at the bottom with inactive styling. */
  variant?: 'active' | 'inactive'
  onConfigure?: (pollId: string) => void
  /** Open the edit dialog to reconfigure this poll's question and options. */
  onEdit?: () => void
  onStop?: (pollId: string) => void
  /** Re-open a closed poll from the inactive panel. */
  onResume?: (pollId: string) => void
  /** Permanently remove this poll from the session. */
  onDelete?: () => void
  /** Clear all votes for this poll while keeping the poll itself. */
  onReset?: () => void
  /**
   * PowerPoint only: link the poll widget on the selected slide to this poll (updates tags + text only).
   */
  onBindWidget?: (pollId: string) => Promise<void>
  /**
   * Change how the poll is controlled. Stop/Resume pin it closed/open; this
   * is the way back to auto (slide-driven) control.
   */
  onSetMode?: (pollId: string, mode: PollMode) => void | Promise<void>
}

export function ActivePollActivityCard({
  poll,
  linkedSlides,
  variant = 'active',
  onConfigure,
  onEdit,
  onStop,
  onResume,
  onDelete,
  onReset,
  onBindWidget,
  onSetMode
}: ActivePollActivityCardProps) {
  const [bindBusy, setBindBusy] = useState(false)
  const [bindMessage, setBindMessage] = useState<string | null>(null)
  const [bindError, setBindError] = useState<string | null>(null)

  const totalVotes = poll.options.reduce((sum, o) => sum + (o.votes ?? 0), 0)
  const mode: PollMode = poll.mode ?? 'auto'
  /** Actual open/closed state — drives the Live/Ended chip and which actions show. */
  const closed = variant === 'inactive'
  /**
   * Muted (ended) visual tone: closed AND not slide-driven. An auto-follow
   * activity is armed — it keeps the active look even while closed.
   */
  const inactive = closed && mode !== 'auto'

  const followSlidesTile =
    onSetMode && mode !== 'auto' ? (
      <ActivityActionTile
        icon="slideshow"
        label="Follow slides"
        tone="info"
        title="Let the slideshow control this poll: it opens when its slide is presented and closes when the show moves on"
        onClick={() => void onSetMode(poll.id, 'auto')}
      />
    ) : null

  const configureTile = onConfigure ? (
    <ActivityActionTile
      icon="edit"
      label="Designer"
      title="Open Prezo editing station for this poll"
      onClick={() => onConfigure(poll.id)}
    />
  ) : null

  const editTile = onEdit ? (
    <ActivityActionTile
      icon="tune"
      label="Edit"
      title="Change the question and answer options — slides and screens update immediately"
      onClick={onEdit}
    />
  ) : null

  /**
   * Stop = pin closed. On a live card it closes now; on an off-air auto card
   * it disarms slide control so the poll won't go live with its slide.
   */
  const stopTile = (
    <ActivityActionTile
      icon="stop_circle"
      label="Stop poll"
      tone="danger"
      title={
        closed
          ? 'Keep closed even when the slideshow reaches its slide'
          : 'Close now and keep closed regardless of the slideshow'
      }
      onClick={() => onStop?.(poll.id)}
    />
  )

  const pinOpenTile = (
    <ActivityActionTile
      icon="play_circle"
      label="Pin open"
      tone="success"
      title="Open now and keep open regardless of the slideshow"
      onClick={() => onResume?.(poll.id)}
    />
  )

  const resetTile = onReset ? (
    <ActivityActionTile
      icon="restart_alt"
      label="Reset"
      tone="warn"
      title="Clear all votes for this poll — the poll itself stays"
      onClick={onReset}
    />
  ) : null

  const deleteTile = onDelete ? (
    <ActivityActionTile
      icon="delete"
      label="Delete"
      tone="destructive"
      title="Permanently remove this poll from the session"
      onClick={onDelete}
    />
  ) : null

  const bindTile = onBindWidget ? (
    <ActivityActionTile
      icon="link"
      label={bindBusy ? 'Linking…' : 'Link widget'}
      title="Link the poll widget on the selected PowerPoint slide to this poll"
      onClick={() => void handleBindWidget()}
      disabled={bindBusy}
    />
  ) : null

  const handleBindWidget = async () => {
    if (!onBindWidget) {
      return
    }
    setBindBusy(true)
    setBindMessage(null)
    setBindError(null)
    try {
      await onBindWidget(poll.id)
      setBindMessage('Slide widget linked to this poll.')
    } catch (err) {
      setBindError(err instanceof Error ? err.message : 'Could not link widget.')
    } finally {
      setBindBusy(false)
    }
  }

  return (
    <CollapsibleActivityPanelShell
      variant={controlModeShellVariant(mode)}
      icon={
        <div
          className={
            inactive
              ? 'size-12 shrink-0 rounded-lg bg-slate-400/35 flex items-center justify-center text-slate-700'
              : 'size-12 shrink-0 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600'
          }
        >
          <span className="material-symbols-outlined text-[1.5rem]">bar_chart</span>
        </div>
      }
      titleBlock={
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Poll</p>
          <h4
            className={`font-semibold text-base leading-snug line-clamp-2 min-h-[2.75rem] ${
              inactive ? 'text-slate-700' : 'text-slate-900'
            }`}
            title={poll.question.trim() || undefined}
          >
            {poll.question.trim() || 'Untitled poll'}
          </h4>
          <div
            className={`flex items-center gap-3 text-sm mt-2 min-w-0 ${
              inactive ? 'text-slate-500' : 'text-slate-600'
            }`}
          >
            <span
              className={`shrink-0 whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium ${
                !closed
                  ? 'bg-emerald-100 text-emerald-700'
                  : mode === 'auto'
                    ? 'bg-sky-100 text-sky-700'
                    : 'bg-slate-200 text-slate-700'
              }`}
              title={
                !closed
                  ? 'Visible on the audience screen right now'
                  : mode === 'auto'
                    ? 'Waiting for its slide — goes live when the slideshow reaches it'
                    : 'Closed by the host'
              }
            >
              {!closed ? 'Live' : mode === 'auto' ? 'Off air' : 'Ended'}
            </span>
            <span className="inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap">
              <span
                className={`material-symbols-outlined text-[1.125rem] ${
                  inactive ? 'text-slate-400' : 'text-slate-500'
                }`}
                aria-hidden
              >
                group
              </span>
              <span>
                {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
              </span>
            </span>
            <LinkedSlidesBadge slides={linkedSlides} inactive={inactive} />
          </div>
        </div>
      }
    >
      {poll.options.length > 0 ? (
        <div className="p-5 space-y-4">
          {poll.options.map((opt) => {
            const pct =
              totalVotes > 0 ? Math.round(((opt.votes ?? 0) / totalVotes) * 100) : 0
            return (
              <div key={opt.id}>
                <div className="flex justify-between text-sm mb-1.5 gap-2">
                  <span
                    className={`font-medium truncate ${inactive ? 'text-slate-700' : 'text-slate-800'}`}
                  >
                    {opt.label}
                  </span>
                  <span
                    className={`font-bold tabular-nums shrink-0 ${
                      inactive ? 'text-slate-700' : 'text-primary'
                    }`}
                  >
                    {pct}%
                  </span>
                </div>
                <div className={`h-2 rounded-full overflow-hidden ${inactive ? 'bg-slate-300/60' : 'bg-slate-100'}`}>
                  <div
                    className={`h-full rounded-full transition-[width] duration-500 ${
                      inactive ? 'bg-slate-600/70' : 'bg-primary/80'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
          {!closed ? (
            <ActivityActionsGrid className="pt-2">
              {configureTile}
              {editTile}
              {stopTile}
              {followSlidesTile}
              {resetTile}
              {bindTile}
              {deleteTile}
            </ActivityActionsGrid>
          ) : (
            <ActivityActionsGrid className="pt-2">
              {configureTile}
              {editTile}
              {pinOpenTile}
              {mode === 'auto' && onStop ? stopTile : null}
              {followSlidesTile}
              {resetTile}
              {bindTile}
              {deleteTile}
            </ActivityActionsGrid>
          )}
          {onBindWidget && (bindMessage || bindError) ? (
            <div className="space-y-1 pt-1">
              {bindError ? <p className="text-xs text-red-600">{bindError}</p> : null}
              {bindMessage ? <p className="text-xs text-emerald-800">{bindMessage}</p> : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="p-5 pt-0">
          <p className={`text-sm ${inactive ? 'text-slate-600' : 'text-muted'}`}>
            This poll has no options.
          </p>
          {closed ? (
            <ActivityActionsGrid className="pt-4">
              {pinOpenTile}
              {mode === 'auto' && onStop ? stopTile : null}
              {bindTile}
              {deleteTile}
            </ActivityActionsGrid>
          ) : onDelete || onBindWidget ? (
            <ActivityActionsGrid className="pt-4">
              {bindTile}
              {deleteTile}
            </ActivityActionsGrid>
          ) : null}
          {onBindWidget && (bindMessage || bindError) ? (
            <div className="space-y-1 pt-2">
              {bindError ? <p className="text-xs text-red-600">{bindError}</p> : null}
              {bindMessage ? <p className="text-xs text-emerald-800">{bindMessage}</p> : null}
            </div>
          ) : null}
        </div>
      )}
    </CollapsibleActivityPanelShell>
  )
}
