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
  hasMore?: boolean
  onShowMore?: () => void
  hasLess?: boolean
  onShowLess?: () => void
  deletingSessionId?: string | null
  isCompact?: boolean
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
  onCreate,
  onJoinByCode,
  onSetHostJoinAccess,
  recentSessions,
  isLoading = false,
  loadError,
  onResume,
  onDelete,
  onRefresh,
  hasMore = false,
  onShowMore,
  hasLess = false,
  onShowLess,
  deletingSessionId = null,
  isCompact = false
}: SessionSetupProps) {
  const [title, setTitle] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [isStarting, setIsStarting] = useState(false)
  const [isUpdatingHostAccess, setIsUpdatingHostAccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isJoinMode = joinCode.trim().length > 0

  const handleStart = async () => {
    setError(null)
    setIsStarting(true)
    try {
      const normalizedCode = joinCode.trim().toUpperCase()
      if (normalizedCode) {
        if (!onJoinByCode) throw new Error('Host join is unavailable.')
        await onJoinByCode(normalizedCode)
        setJoinCode('')
      } else {
        await onCreate(title.trim())
        setTitle('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start session')
    } finally {
      setIsStarting(false)
    }
  }

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
  const showResumeSection = Boolean(onResume || onDelete)

  if (!session) {
    return (
      <div className="space-y-0">
        {hasRecentSessions ? (
          recentSessions?.map((entry, index) => {
            const sessionTitle = entry.title?.trim() || 'Untitled session'
            const dateStr = formatDate(entry.created_at)
            const timeStr = formatTime(entry.created_at)
            const isActive = entry.status === 'active'
            return (
              <div
                key={entry.id}
                className="group flex items-center justify-between py-5 px-4 -mx-4 hover:bg-surface-2 transition-colors rounded-xl cursor-pointer"
                onClick={() => onResume?.(entry)}
              >
                <div className="flex items-center gap-5 flex-1 min-w-0">
                  <div className={`w-11 h-11 ${isActive ? 'bg-primary/10' : 'bg-slate-100'} rounded-xl flex items-center justify-center ${isActive ? 'text-primary' : 'text-slate-400'} flex-shrink-0`}>
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
                        className="!bg-transparent !border-0 !p-2 !shadow-none text-muted hover:text-primary transition-colors"
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
                        className="!bg-transparent !border-0 !p-2 !shadow-none text-muted hover:text-danger transition-colors"
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
          })
        ) : null}

        {isLoading ? (
          <p className="text-muted text-sm py-4">Loading your recent sessions...</p>
        ) : null}
        {loadError ? <p className="text-danger text-sm py-2">{loadError}</p> : null}
        {!isLoading && !loadError && !hasRecentSessions ? (
          <p className="text-muted text-sm py-4">No recent sessions yet. Create your first one above.</p>
        ) : null}

        {showResumeSection && (hasMore || hasLess) ? (
          <div className="flex items-center gap-4 pt-2 pb-2">
            {hasMore && onShowMore ? (
              <button
                type="button"
                onClick={onShowMore}
                disabled={isLoading}
                className="!bg-transparent !border-0 !p-0 !shadow-none text-[0.7rem] font-bold uppercase tracking-widest text-primary flex items-center gap-1 hover:opacity-80 transition-opacity"
              >
                See more <span className="material-symbols-outlined text-xs">arrow_forward</span>
              </button>
            ) : null}
            {hasLess && onShowLess ? (
              <button
                type="button"
                onClick={onShowLess}
                disabled={isLoading}
                className="!bg-transparent !border-0 !p-0 !shadow-none text-[0.7rem] font-bold uppercase tracking-widest text-muted flex items-center gap-1 hover:opacity-80 transition-opacity"
              >
                Show less
              </button>
            ) : null}
            {onRefresh ? (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isLoading}
                className="!bg-transparent !border-0 !p-1 !shadow-none text-muted hover:text-primary transition-colors ml-auto"
                title="Refresh"
              >
                <span className="material-symbols-outlined text-lg">refresh</span>
              </button>
            ) : null}
          </div>
        ) : null}

        {error ? <p className="text-danger text-sm">{error}</p> : null}

        <div className="mt-12 flex flex-col items-center justify-center p-12 border-2 border-dashed border-slate-200/60 rounded-3xl bg-white">
          <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center mb-5">
            <span className="material-symbols-outlined text-primary text-2xl">add_circle</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Start a new session</h2>
          <p className="text-muted text-center max-w-sm mb-6 leading-relaxed text-sm">
            Create a live Prezo room for Q&A and polls, or join an existing session with a host code.
          </p>
          <div className="w-full max-w-sm space-y-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Session title (optional)"
              className="!w-full !rounded-lg !border-slate-200 !bg-surface-2 !px-4 !py-2.5 !text-sm focus:!border-primary focus:!ring-2 focus:!ring-primary/20"
            />
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Host join code (optional)"
              className="!w-full !rounded-lg !border-slate-200 !bg-surface-2 !px-4 !py-2.5 !text-sm focus:!border-primary focus:!ring-2 focus:!ring-primary/20"
            />
            <div className="flex gap-3 pt-1">
              <button
                onClick={handleStart}
                disabled={isStarting}
                className="!bg-primary !text-white !px-6 !py-2.5 !rounded-lg !text-sm !font-bold !uppercase !tracking-widest hover:!bg-primary-dark active:!scale-95 !transition-all !shadow-sm flex-1"
              >
                {isStarting ? (isJoinMode ? 'Joining...' : 'Creating...') : isJoinMode ? 'Join Session' : 'Create Session'}
              </button>
            </div>
          </div>
        </div>
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
