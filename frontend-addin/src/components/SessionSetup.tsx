import { useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'

import type { Session } from '../api/types'
import { resolveJoinUrl } from '../utils/joinUrl'

interface SessionSetupProps {
  session: Session | null
  onCreate: (title: string) => Promise<void>
  onJoinByCode?: (code: string) => Promise<void>
  onSetHostJoinAccess?: (allowHostJoin: boolean) => Promise<void>
  recentSessions?: Session[]
  isLoading?: boolean
  loadError?: string | null
  onResume?: (session: Session) => void
  onDelete?: (session: Session) => void
  onRefresh?: () => void
  deletingSessionId?: string | null
  isCompact?: boolean
  /** Tailwind classes for the scrollable session list max height (default fits ~6 rows before scroll). */
  listMaxHeightClass?: string
}

const SESSION_ICONS = ['rocket_launch', 'palette', 'auto_graph', 'forum', 'interests', 'star']

function getSessionIcon(index: number) {
  return SESSION_ICONS[index % SESSION_ICONS.length]
}

function formatDate(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTime(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function SessionSetup({
  session,
  onCreate: _onCreate,
  onJoinByCode: _onJoinByCode,
  onSetHostJoinAccess,
  recentSessions,
  isLoading = false,
  loadError,
  onResume,
  onDelete,
  onRefresh: _onRefresh,
  deletingSessionId = null,
  isCompact: _isCompact = false,
  listMaxHeightClass = 'max-h-[min(18.875rem,calc(100vh-14rem))]'
}: SessionSetupProps) {
  void _isCompact; void _onCreate; void _onJoinByCode; void _onRefresh
  const [isUpdatingHostAccess, setIsUpdatingHostAccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleHostJoinAccessToggle = async () => {
    if (!session || !onSetHostJoinAccess || session.is_original_host !== true) return
    setError(null)
    setIsUpdatingHostAccess(true)
    try {
      await onSetHostJoinAccess(!session.allow_host_join)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update co-host access')
    } finally {
      setIsUpdatingHostAccess(false)
    }
  }

  const joinUrl = resolveJoinUrl(session)
  const hasRecentSessions = Boolean(recentSessions?.length)

  if (!session) {
    return (
      <div className="space-y-0">
        {hasRecentSessions ? (
          <div className="rounded-xl border border-slate-100 bg-surface-2/50 overflow-hidden shadow-sm">
            <div
              className={`${listMaxHeightClass} overflow-y-auto overflow-x-hidden scroll-smooth session-list-scroll pr-1.5 -mr-0.5 w-full`}
            >
              {recentSessions?.map((entry, index) => {
                const sessionTitle = entry.title?.trim() || 'Untitled session'
                const dateStr = formatDate(entry.created_at)
                const timeStr = formatTime(entry.created_at)
                const isActive = entry.status === 'active'
                return (
                  <div
                    key={entry.id}
                    className="group flex items-center justify-between py-5 px-4 hover:bg-white/80 transition-[background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer border-b border-slate-100/80 last:border-b-0"
                    onClick={() => onResume?.(entry)}
                  >
                    <div className="flex items-center gap-5 flex-1 min-w-0">
                      <div className={`w-11 h-11 ${isActive ? 'bg-primary/10' : 'bg-slate-100'} rounded-xl flex items-center justify-center ${isActive ? 'text-primary' : 'text-slate-400'} flex-shrink-0 transition-colors duration-300`}>
                        <span className="material-symbols-outlined text-xl">{getSessionIcon(index)}</span>
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-[15px] font-semibold text-slate-900 truncate">{sessionTitle}</h3>
                        <p className="text-sm text-muted truncate">
                          Code: <span className="font-mono font-semibold text-xs tracking-wider">{entry.code}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-8 text-right flex-shrink-0">
                      {dateStr ? (
                        <div className="hidden sm:block">
                          <p className="text-sm font-semibold text-slate-900">{dateStr}</p>
                          {timeStr ? <p className="text-xs text-muted uppercase tracking-tight">{timeStr}</p> : null}
                        </div>
                      ) : null}
                      <div className="w-20 flex justify-end">
                        {isActive ? (
                          <span className="bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-widest flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                            Active
                          </span>
                        ) : (
                          <span className="bg-slate-100 text-muted px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-widest">
                            Ended
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {onResume ? (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onResume(entry) }}
                            disabled={deletingSessionId === entry.id}
                            className="!bg-transparent !border-0 !p-2 !shadow-none text-muted hover:text-primary transition-colors duration-200 ease-out"
                            title="Resume session"
                          >
                            <span className="material-symbols-outlined text-xl">play_arrow</span>
                          </button>
                        ) : null}
                        {onDelete ? (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onDelete(entry) }}
                            disabled={deletingSessionId === entry.id}
                            className="!bg-transparent !border-0 !p-2 !shadow-none text-muted hover:text-danger transition-colors duration-200 ease-out"
                            title={deletingSessionId === entry.id ? 'Deleting...' : 'Delete session'}
                          >
                            <span className="material-symbols-outlined text-xl">
                              {deletingSessionId === entry.id ? 'hourglass_empty' : 'delete'}
                            </span>
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}

        {isLoading ? (
          <p className="text-muted text-sm py-4">Loading your recent sessions...</p>
        ) : null}
        {loadError ? <p className="text-danger text-sm py-2">{loadError}</p> : null}
        {!isLoading && !loadError && !hasRecentSessions ? (
          <p className="text-muted text-sm py-4">
            Ops looks like you dont have any active sessions yet! click &quot;Start a new session&quot; to start one!
          </p>
        ) : null}

        {error ? <p className="text-danger text-sm">{error}</p> : null}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-card">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-widest flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              Live
            </span>
            {session.title ? (
              <h2 className="text-lg font-bold text-slate-900">{session.title}</h2>
            ) : null}
          </div>
          <div className="mt-3">
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted mb-1">Join Code</p>
            <div className="font-mono text-2xl font-bold tracking-[0.15em] text-slate-900 bg-surface-2 inline-block px-4 py-2 rounded-xl border border-slate-200">
              {session.code}
            </div>
            <p className="text-sm text-muted mt-2">Share this code or the QR link with your audience.</p>
          </div>
        </div>
        {joinUrl ? (
          <div className="flex flex-col items-center gap-2 p-3 rounded-xl border border-slate-200 bg-white">
            <QRCodeCanvas value={joinUrl} size={100} fgColor="#0f172a" bgColor="#ffffff" />
            <a
              className="text-xs text-muted text-center max-w-[140px] break-all no-underline hover:text-primary transition-colors"
              href={joinUrl}
              target="_blank"
              rel="noreferrer"
            >
              {joinUrl}
            </a>
          </div>
        ) : null}
      </div>

      {onSetHostJoinAccess && session.is_original_host === true ? (
        <div className="mt-5 pt-5 border-t border-dashed border-slate-200">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Co-host access</p>
              <p className="text-sm text-muted">
                {session.allow_host_join
                  ? 'Enabled. Other hosts can join with this code.'
                  : 'Disabled. Only the original host has access.'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleHostJoinAccessToggle}
              disabled={isUpdatingHostAccess}
              className={`!px-4 !py-2 !rounded-lg !text-sm !font-semibold !transition-all ${
                session.allow_host_join
                  ? '!bg-transparent !border !border-slate-200 !text-slate-700 hover:!border-danger hover:!text-danger'
                  : '!bg-primary/10 !border-0 !text-primary hover:!bg-primary/20'
              }`}
            >
              {isUpdatingHostAccess ? 'Saving...' : session.allow_host_join ? 'Disable' : 'Enable'}
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-danger text-sm mt-3">{error}</p> : null}
    </div>
  )
}
