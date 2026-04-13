import { useEffect, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'

import { api } from '../api/client'
import type { Session, SessionSessionStats } from '../api/types'
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
  /** Opens the existing “new session” modal (same as sidebar / header). */
  onOpenCreateSession?: () => void
  /** Tailwind classes for the scrollable session list max height (default fits ~6 rows before scroll). */
  listMaxHeightClass?: string
  /** Shown when the list finished loading and has no rows (e.g. Owner vs Co-Host filter). */
  emptyListMessage?: string
  /** Active / Host / Co-Host filter (all-sessions list). */
  sessionListFilter?: 'active' | 'host' | 'cohost'
  onSessionListFilterChange?: (id: 'active' | 'host' | 'cohost') => void
}

function formatDate(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
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
  onOpenCreateSession,
  listMaxHeightClass = 'max-h-[min(18.875rem,calc(100vh-14rem))]',
  emptyListMessage = 'Ops looks like you dont have any active sessions yet, click "Start a new session" to start one!',
  sessionListFilter,
  onSessionListFilterChange
}: SessionSetupProps) {
  void _isCompact
  void _onCreate
  void _onJoinByCode
  void _onRefresh
  const [isUpdatingHostAccess, setIsUpdatingHostAccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statsBySessionId, setStatsBySessionId] = useState<
    Partial<Record<string, SessionSessionStats | null>>
  >({})
  const [menuSessionId, setMenuSessionId] = useState<string | null>(null)

  const sessionIdsKey = recentSessions?.map((s) => s.id).join('|') ?? ''

  useEffect(() => {
    if (!recentSessions?.length) {
      setStatsBySessionId({})
      return
    }
    setStatsBySessionId({})
    let cancelled = false
    const sessionIds = recentSessions.map((s) => s.id)

    void (async () => {
      // Try batch endpoint first; fall back to individual calls if unavailable
      try {
        const batchResult = await api.batchSessionStats(sessionIds)
        if (cancelled) return
        const mapped: Partial<Record<string, SessionSessionStats | null>> = {}
        for (const id of sessionIds) {
          mapped[id] = batchResult[id] ?? null
        }
        setStatsBySessionId(mapped)
        return
      } catch {
        // batch endpoint not available — fall back to individual requests
      }
      if (cancelled) return
      const results = await Promise.all(
        sessionIds.map(async (id) => {
          try {
            const st = await api.getSessionSessionStats(id)
            return [id, st] as const
          } catch {
            return [id, null] as const
          }
        })
      )
      if (cancelled) return
      setStatsBySessionId(Object.fromEntries(results))
    })()

    return () => {
      cancelled = true
    }
  }, [sessionIdsKey])

  useEffect(() => {
    if (!menuSessionId) {
      return
    }
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (t?.closest?.('[data-session-card-menu]')) {
        return
      }
      setMenuSessionId(null)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [menuSessionId])

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
      <div className="space-y-6">
        {onOpenCreateSession ? (
          <button
            type="button"
            onClick={onOpenCreateSession}
            className="group w-full p-8 rounded-2xl border-2 border-dashed border-slate-300 hover:border-primary hover:bg-primary/5 transition-all flex flex-col items-center gap-3"
          >
            <div className="size-12 rounded-full bg-primary/10 group-hover:bg-primary/15 flex items-center justify-center transition-colors">
              <span className="material-symbols-outlined text-3xl text-primary">add</span>
            </div>
            <div className="text-center">
              <div className="font-semibold text-slate-900 mb-1">Create New Session</div>
              <div className="text-sm text-muted">
                Start building interactive activities for your next presentation
              </div>
            </div>
          </button>
        ) : null}

        {onSessionListFilterChange && sessionListFilter !== undefined ? (
          <div className="flex gap-8 border-b border-slate-100">
            {(
              [
                { id: 'active' as const, label: 'Active' },
                { id: 'host' as const, label: 'Host' },
                { id: 'cohost' as const, label: 'Co-Host' }
              ] as const
            ).map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => onSessionListFilterChange(id)}
                className={`!bg-transparent !border-0 !border-b-2 !rounded-none !shadow-none !pb-3 !px-0 !text-sm !font-bold !uppercase !tracking-widest !transition-colors ${
                  sessionListFilter === id
                    ? '!text-primary !border-primary'
                    : '!text-muted/50 hover:!text-slate-900 !border-transparent'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}

        {hasRecentSessions ? (
          <div
            className={`${listMaxHeightClass} overflow-y-auto overflow-x-hidden scroll-smooth session-list-scroll pr-1 -mr-0.5 w-full`}
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 pb-1">
              {recentSessions?.map((entry) => {
                const sessionTitle = entry.title?.trim() || 'Untitled session'
                const dateStr = formatDate(entry.created_at)
                const isLive = entry.status === 'active'
                const isCoHost = entry.is_original_host === false
                const stats = statsBySessionId[entry.id]
                const interactions =
                  stats === undefined ? undefined : stats === null ? null : (stats.active_activities ?? (stats as unknown as Record<string, number>).total_interactions ?? 0)
                const participants =
                  stats === undefined ? undefined : stats === null ? null : stats.unique_participants
                const showOwnerActions = !isCoHost && onDelete

                return (
                  <div
                    key={entry.id}
                    onClick={(e) => {
                      if (!(e.target as HTMLElement).closest('button, a, [role="menu"]')) {
                        onResume?.(entry)
                      }
                    }}
                    className="group relative cursor-pointer bg-white rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-lg transition-all p-6 text-left"
                  >
                    <div className="flex items-start justify-between gap-2 mb-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="font-semibold text-slate-900 truncate group-hover:text-primary transition-colors">
                            <button
                              type="button"
                              className="all-unset cursor-pointer text-inherit font-inherit"
                              onClick={(e) => {
                                e.stopPropagation()
                                onResume?.(entry)
                              }}
                            >
                              {sessionTitle}
                            </button>
                          </h3>
                          {isCoHost ? (
                            <span className="shrink-0 bg-orange-50 text-orange-800 border border-orange-200/90 px-2 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-widest">
                              Co-Host
                            </span>
                          ) : null}
                        </div>
                        {dateStr ? (
                          <div className="flex items-center gap-1.5 text-sm text-muted">
                            <span className="material-symbols-outlined text-base leading-none">
                              calendar_today
                            </span>
                            <span>{dateStr}</span>
                          </div>
                        ) : null}
                      </div>
                      {showOwnerActions ? (
                        <div className="relative shrink-0" data-session-card-menu>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setMenuSessionId((id) => (id === entry.id ? null : entry.id))
                            }}
                            className={`p-1.5 rounded-lg transition-all ${
                              menuSessionId === entry.id
                                ? 'bg-slate-100 opacity-100'
                                : 'opacity-0 group-hover:opacity-100 hover:bg-slate-100'
                            }`}
                            title="Session actions"
                            aria-haspopup="menu"
                          >
                            <span className="material-symbols-outlined text-lg text-slate-500">
                              more_vert
                            </span>
                          </button>
                          {menuSessionId === entry.id ? (
                            <div
                              className="absolute right-0 top-full z-20 mt-1 min-w-[10rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                              role="menu"
                            >
                              <button
                                type="button"
                                role="menuitem"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-red-50"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setMenuSessionId(null)
                                  onDelete(entry)
                                }}
                                disabled={deletingSessionId === entry.id}
                              >
                                <span className="material-symbols-outlined text-lg">delete</span>
                                {deletingSessionId === entry.id ? 'Deleting…' : 'Delete session'}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-4 mb-4 text-sm">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <span className="material-symbols-outlined text-lg leading-none">bolt</span>
                        <span>
                          {interactions === undefined
                            ? '…'
                            : interactions === null
                              ? '—'
                              : interactions}{' '}
                          activities
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <span className="material-symbols-outlined text-lg leading-none">group</span>
                        <span>
                          {participants === undefined ? '…' : participants === null ? '—' : participants}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-slate-100 gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          isLive
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {isLive ? 'Live' : 'Ended'}
                      </span>
                      {entry.status === 'ended' && onResume ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onResume(entry)
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/15 transition-colors text-sm font-medium shrink-0"
                        >
                          <span className="material-symbols-outlined text-base leading-none">
                            bar_chart
                          </span>
                          View Results
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5 text-sm font-medium text-muted min-w-0">
                          <span className="font-mono truncate">{entry.code}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              void navigator.clipboard.writeText(entry.code)
                            }}
                            className="p-1 hover:bg-slate-100 rounded transition-colors shrink-0"
                            title="Copy join code"
                          >
                            <span className="material-symbols-outlined text-base text-slate-500">
                              content_copy
                            </span>
                          </button>
                        </div>
                      )}
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
          <p className="text-muted text-sm py-4">{emptyListMessage}</p>
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
