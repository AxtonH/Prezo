import { useState } from 'react'

import type { Poll } from '../../api/types'
import { CollapsibleActivityPanelShell } from './CollapsibleActivityPanelShell'

export interface ActivePollActivityCardProps {
  poll: Poll
  /** Stopped polls render at the bottom with inactive styling. */
  variant?: 'active' | 'inactive'
  onConfigure?: (pollId: string) => void
  onStop?: (pollId: string) => void
  /** Re-open a closed poll from the inactive panel. */
  onResume?: (pollId: string) => void
  /** Permanently remove this poll from the session. */
  onDelete?: () => void
  /**
   * PowerPoint only: link the poll widget on the selected slide to this poll (updates tags + text only).
   */
  onBindWidget?: (pollId: string) => Promise<void>
}

export function ActivePollActivityCard({
  poll,
  variant = 'active',
  onConfigure,
  onStop,
  onResume,
  onDelete,
  onBindWidget
}: ActivePollActivityCardProps) {
  const [bindBusy, setBindBusy] = useState(false)
  const [bindMessage, setBindMessage] = useState<string | null>(null)
  const [bindError, setBindError] = useState<string | null>(null)

  const totalVotes = poll.options.reduce((sum, o) => sum + (o.votes ?? 0), 0)
  const inactive = variant === 'inactive'

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
      setBindError(err instanceof Error ? err.message : 'Could not bind widget.')
    } finally {
      setBindBusy(false)
    }
  }

  return (
    <CollapsibleActivityPanelShell
      variant={inactive ? 'inactive' : 'active'}
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
            className={`font-semibold text-base leading-snug line-clamp-3 ${
              inactive ? 'text-slate-700' : 'text-slate-900'
            }`}
          >
            {poll.question.trim() || 'Untitled poll'}
          </h4>
          <div
            className={`flex flex-wrap items-center gap-4 text-sm mt-2 ${
              inactive ? 'text-slate-500' : 'text-slate-600'
            }`}
          >
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                inactive ? 'bg-slate-200 text-slate-700' : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {inactive ? 'Ended' : 'Live'}
            </span>
            <span className="inline-flex items-center gap-1.5">
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
          {!inactive ? (
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onConfigure?.(poll.id)
                }}
                title="Open Prezo editing station for this poll"
                className="!px-4 !py-2 !rounded-lg !text-sm !font-semibold !bg-slate-100 !text-slate-800 !border-0 hover:!bg-slate-200 !transition-colors"
              >
                Configure
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onStop?.(poll.id)
                }}
                className="!px-4 !py-2 !rounded-lg !text-sm !font-semibold !bg-rose-50 !text-rose-700 !border !border-rose-200 hover:!bg-rose-100 !transition-colors"
              >
                Stop poll
              </button>
              {onDelete ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete()
                  }}
                  className="!px-4 !py-2 !rounded-lg !text-sm !font-semibold !bg-red-600 !text-white !border-0 hover:!bg-red-700 !transition-colors"
                >
                  Delete
                </button>
              ) : null}
              {onBindWidget ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    void handleBindWidget()
                  }}
                  disabled={bindBusy}
                  title="Link the poll widget on the selected PowerPoint slide to this poll"
                  className="!px-4 !py-2 !rounded-lg !text-sm !font-semibold !bg-white !text-slate-800 !border !border-slate-200 hover:!bg-slate-50 !transition-colors disabled:!opacity-60"
                >
                  {bindBusy ? 'Binding…' : 'Bind widget'}
                </button>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onResume?.(poll.id)
                }}
                className="!px-4 !py-2 !rounded-lg !text-sm !font-semibold !bg-emerald-50 !text-emerald-800 !border !border-emerald-200 hover:!bg-emerald-100 !transition-colors"
              >
                Resume poll
              </button>
              {onDelete ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete()
                  }}
                  className="!px-4 !py-2 !rounded-lg !text-sm !font-semibold !bg-red-600 !text-white !border-0 hover:!bg-red-700 !transition-colors"
                >
                  Delete
                </button>
              ) : null}
              {onBindWidget ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    void handleBindWidget()
                  }}
                  disabled={bindBusy}
                  title="Link the poll widget on the selected PowerPoint slide to this poll"
                  className="!px-4 !py-2 !rounded-lg !text-sm !font-semibold !bg-white !text-slate-800 !border !border-slate-200 hover:!bg-slate-50 !transition-colors disabled:!opacity-60"
                >
                  {bindBusy ? 'Binding…' : 'Bind widget'}
                </button>
              ) : null}
            </div>
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
          {inactive ? (
            <div className="flex flex-wrap gap-2 pt-4">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onResume?.(poll.id)
                }}
                className="!px-4 !py-2 !rounded-lg !text-sm !font-semibold !bg-emerald-50 !text-emerald-800 !border !border-emerald-200 hover:!bg-emerald-100 !transition-colors"
              >
                Resume poll
              </button>
              {onDelete ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete()
                  }}
                  className="!px-4 !py-2 !rounded-lg !text-sm !font-semibold !bg-red-600 !text-white !border-0 hover:!bg-red-700 !transition-colors"
                >
                  Delete
                </button>
              ) : null}
              {onBindWidget ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    void handleBindWidget()
                  }}
                  disabled={bindBusy}
                  title="Link the poll widget on the selected PowerPoint slide to this poll"
                  className="!px-4 !py-2 !rounded-lg !text-sm !font-semibold !bg-white !text-slate-800 !border !border-slate-200 hover:!bg-slate-50 !transition-colors disabled:!opacity-60"
                >
                  {bindBusy ? 'Binding…' : 'Bind widget'}
                </button>
              ) : null}
            </div>
          ) : onDelete ? (
            <div className="flex flex-wrap gap-2 pt-4">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                }}
                className="!px-4 !py-2 !rounded-lg !text-sm !font-semibold !bg-red-600 !text-white !border-0 hover:!bg-red-700 !transition-colors"
              >
                Delete
              </button>
              {onBindWidget ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    void handleBindWidget()
                  }}
                  disabled={bindBusy}
                  title="Link the poll widget on the selected PowerPoint slide to this poll"
                  className="!px-4 !py-2 !rounded-lg !text-sm !font-semibold !bg-white !text-slate-800 !border !border-slate-200 hover:!bg-slate-50 !transition-colors disabled:!opacity-60"
                >
                  {bindBusy ? 'Binding…' : 'Bind widget'}
                </button>
              ) : null}
            </div>
          ) : onBindWidget ? (
            <div className="flex flex-wrap gap-2 pt-4">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  void handleBindWidget()
                }}
                disabled={bindBusy}
                title="Link the poll widget on the selected PowerPoint slide to this poll"
                className="!px-4 !py-2 !rounded-lg !text-sm !font-semibold !bg-white !text-slate-800 !border !border-slate-200 hover:!bg-slate-50 !transition-colors disabled:!opacity-60"
              >
                {bindBusy ? 'Binding…' : 'Bind widget'}
              </button>
            </div>
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
